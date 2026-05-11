"""Generates framework YAML job configs from the agent's intermediate representation."""

from __future__ import annotations

import dataclasses
import json
import logging
from pathlib import Path

import yaml

from agent.ir.schema import IRMapping, IRTransformation

logger = logging.getLogger(__name__)

# Maps IR kind → framework transformation type key
_KIND_TO_TYPE: dict[str, str] = {
    "filter":     "filter",
    "lookup":     "lookup",
    "expression": "expression",
    "scd_type_2": "scd_type_2",
}


class YAMLGenerator:
    """Converts an :class:`IRMapping` into a validated framework YAML job config.

    The generator maps each IR transformation kind to the corresponding
    framework transformation type and emits a complete job config file
    ready for ``etl-run``.
    """

    def generate(
        self,
        ir: IRMapping,
        output_dir: Path,
        db_dir: Path | None = None,
    ) -> Path:
        """Render *ir* as a YAML file inside *output_dir*.

        Also writes ``ir.json`` to *output_dir* for debugging.

        Args:
            ir:         Fully populated intermediate representation.
            output_dir: Directory where output files are written (created if absent).
            db_dir:     Directory that contains the ``.db`` files referenced in *ir*.
                        Defaults to ``sample_data/`` relative to the current working
                        directory if not supplied.

        Returns:
            Path to the generated ``job_config.yaml``.

        Raises:
            jsonschema.ValidationError: If the generated config fails schema validation.
        """
        output_dir.mkdir(parents=True, exist_ok=True)
        if db_dir is None:
            db_dir = Path("sample_data")

        # ── Write ir.json for debugging ────────────────────────────────────────
        ir_dict = dataclasses.asdict(ir)
        ir_json_path = output_dir / "ir.json"
        with ir_json_path.open("w", encoding="utf-8") as fh:
            json.dump(ir_dict, fh, indent=2)
        logger.info("wrote IR: %s", ir_json_path)

        # ── Build job config dict ──────────────────────────────────────────────
        config = self._build_config(ir, db_dir)

        # ── Validate against schema before writing ─────────────────────────────
        from framework.config.validator import validate_config
        validate_config(config)

        # ── Write job_config.yaml ──────────────────────────────────────────────
        yaml_path = output_dir / "job_config.yaml"
        with yaml_path.open("w", encoding="utf-8") as fh:
            yaml.dump(config, fh, default_flow_style=False, sort_keys=False, allow_unicode=True)
        logger.info("wrote job config: %s", yaml_path)

        return yaml_path

    # ── Config builder ─────────────────────────────────────────────────────────

    def _build_config(self, ir: IRMapping, db_dir: Path) -> dict:
        source_db = str(db_dir / ir.source.db_path) if ir.source.db_path else str(db_dir / "source.db")
        target_db = str(db_dir / ir.target.db_path) if ir.target.db_path else str(db_dir / "target.db")

        config: dict = {
            "job": {
                "name":    ir.mapping_name,
                "version": "1.0",
            },
            "source": {
                "type":   "sqlite",
                "config": {
                    "db_path": source_db,
                    "table":   ir.source.table,
                },
            },
            "transformations": [
                self._build_transformation(t, db_dir)
                for t in ir.transformations
            ],
            "sink": {
                "type":   "sqlite",
                "config": {
                    "db_path":   target_db,
                    "table":     ir.target.table,
                    "if_exists": "replace",
                },
            },
        }
        return config

    def _build_transformation(self, t: IRTransformation, db_dir: Path) -> dict:
        kind = t.kind
        if kind not in _KIND_TO_TYPE:
            raise ValueError(f"Unsupported transformation kind: {kind!r}")

        if kind == "filter":
            return {
                "name":   t.name,
                "type":   "filter",
                "config": {"condition": t.properties["condition"]},
            }

        if kind == "lookup":
            lkp_db = str(db_dir / t.properties.get("db_name", "source.db"))
            return {
                "name": t.name,
                "type": "lookup",
                "config": {
                    "lookup_source": {
                        "type":   "sqlite",
                        "config": {
                            "db_path": lkp_db,
                            "table":   t.properties["table"],
                        },
                    },
                    "join_on": t.properties["join_on"],
                    "columns": t.properties["columns"],
                },
            }

        if kind == "expression":
            expressions = [
                {"target": p.name, "expr": p.expression}
                for p in t.ports
                if p.expression is not None
            ]
            return {
                "name":   t.name,
                "type":   "expression",
                "config": {"expressions": expressions},
            }

        # scd_type_2 and others — emit a placeholder that passes schema validation
        return {
            "name":   t.name,
            "type":   _KIND_TO_TYPE[kind],
            "config": dict(t.properties),
        }
