"""Parses Informatica PowerCenter XML export files into an IR dict."""

from __future__ import annotations

import logging
import re
import xml.etree.ElementTree as ET
from pathlib import Path

from agent.ir.schema import IRMapping, IRPort, IRSource, IRTarget, IRTransformation
from agent.translator.expressions import translate_expression, translate_filter_condition

logger = logging.getLogger(__name__)

# Mapping from Informatica TYPE attribute → IR kind string
_TYPE_MAP: dict[str, str] = {
    "Filter":            "filter",
    "Lookup Procedure":  "lookup",
    "Expression":        "expression",
}


class InformaticaXMLParser:
    """Reads an Informatica PowerCenter ``.xml`` export and extracts mapping metadata.

    The parser:
    1. Locates the ``<SOURCE>`` and ``<TARGET>`` elements → :class:`IRSource` / :class:`IRTarget`.
    2. Follows ``<CONNECTOR>`` edges inside the ``<MAPPING>`` to determine
       transformation order (topological walk from Source Qualifier to Target).
    3. Parses each ``<TRANSFORMATION>`` node into an :class:`IRTransformation`.
    """

    def parse(self, path: Path) -> IRMapping:
        """Parse the Informatica XML file at *path* and return an :class:`IRMapping`.

        Args:
            path: Path to the Informatica ``.xml`` export.

        Returns:
            Fully populated intermediate representation.
        """
        tree = ET.parse(path)
        root = tree.getroot()

        source = self._parse_source(root)
        target = self._parse_target(root)
        mapping_elem = root.find(".//MAPPING")
        if mapping_elem is None:
            raise ValueError(f"No <MAPPING> element found in {path}")

        mapping_name: str = mapping_elem.get("NAME", path.stem)
        transformations = self._parse_transformations(mapping_elem)

        logger.info(
            "parsed mapping '%s': %d transformations", mapping_name, len(transformations)
        )
        return IRMapping(
            mapping_name=mapping_name,
            source=source,
            target=target,
            transformations=transformations,
        )

    # ── Source / Target ────────────────────────────────────────────────────────

    def _parse_source(self, root: ET.Element) -> IRSource:
        src = root.find(".//SOURCE")
        if src is None:
            raise ValueError("No <SOURCE> element found")
        columns = [f.get("NAME", "") for f in src.findall("SOURCEFIELD")]
        return IRSource(
            name=src.get("NAME", ""),
            table=src.get("NAME", ""),
            columns=columns,
            db_path=src.get("DBDNAME", ""),
        )

    def _parse_target(self, root: ET.Element) -> IRTarget:
        tgt = root.find(".//TARGET")
        if tgt is None:
            raise ValueError("No <TARGET> element found")
        return IRTarget(
            name=tgt.get("NAME", ""),
            table=tgt.get("NAME", ""),
            db_path=tgt.get("DBDNAME", ""),
        )

    # ── Transformation ordering ────────────────────────────────────────────────

    def _parse_transformations(self, mapping: ET.Element) -> list[IRTransformation]:
        # Build from→to adjacency (multiple connectors from the same source
        # always point to the same destination in a linear pipeline).
        edges: dict[str, str] = {}
        for conn in mapping.findall("CONNECTOR"):
            edges[conn.get("FROMINSTANCE", "")] = conn.get("TOINSTANCE", "")

        # Index instances by name so we can check TYPE quickly
        instances = {i.get("NAME", ""): i for i in mapping.findall("INSTANCE")}

        # Find the Source Qualifier entry point
        sq_name = next(
            (
                name
                for name, inst in instances.items()
                if inst.get("TRANSFORMATION_TYPE") == "Source Qualifier"
            ),
            None,
        )
        if sq_name is None:
            raise ValueError("No Source Qualifier instance found in mapping")

        # Walk the connector chain, collecting non-source, non-target nodes
        t_by_name = {t.get("NAME", ""): t for t in mapping.findall("TRANSFORMATION")}
        ordered: list[IRTransformation] = []
        current = edges.get(sq_name)

        while current:
            inst = instances.get(current)
            if inst is not None and inst.get("TYPE") == "TARGET":
                break
            t_elem = t_by_name.get(current)
            if t_elem is not None:
                ir_t = self._parse_one(current, t_elem)
                if ir_t is not None:
                    ordered.append(ir_t)
            current = edges.get(current)

        return ordered

    # ── Individual transformation parsers ──────────────────────────────────────

    def _parse_one(self, name: str, elem: ET.Element) -> IRTransformation | None:
        t_type = elem.get("TYPE", "")
        kind = _TYPE_MAP.get(t_type)
        if kind is None:
            logger.debug("skipping unsupported transformation type: %s", t_type)
            return None

        if kind == "filter":
            return self._parse_filter(name, elem)
        if kind == "lookup":
            return self._parse_lookup(name, elem)
        if kind == "expression":
            return self._parse_expression(name, elem)
        return None

    def _parse_filter(self, name: str, elem: ET.Element) -> IRTransformation:
        raw_cond = self._attr_value(elem, "Filter Condition")
        condition = translate_filter_condition(raw_cond)
        return IRTransformation(
            name=name,
            kind="filter",
            properties={"condition": condition},
        )

    def _parse_lookup(self, name: str, elem: ET.Element) -> IRTransformation:
        table  = self._attr_value(elem, "Lookup table name")
        db_name = self._attr_value(elem, "Lookup DB Path")
        raw_cond = self._attr_value(elem, "Lookup condition")
        join_on = self._parse_join_keys(raw_cond, table)

        # OUTPUT-only ports are the new columns introduced by the lookup
        new_cols = [
            f.get("NAME", "")
            for f in elem.findall("TRANSFORMFIELD")
            if f.get("PORTTYPE") == "OUTPUT"
        ]
        return IRTransformation(
            name=name,
            kind="lookup",
            properties={
                "table":   table,
                "db_name": db_name,
                "join_on": join_on,
                "columns": new_cols,
            },
        )

    def _parse_expression(self, name: str, elem: ET.Element) -> IRTransformation:
        ports: list[IRPort] = []
        for field in elem.findall("TRANSFORMFIELD"):
            raw_expr = field.get("EXPRESSION")
            if raw_expr and field.get("PORTTYPE") == "OUTPUT":
                ports.append(
                    IRPort(
                        name=field.get("NAME", ""),
                        datatype=field.get("DATATYPE", "varchar"),
                        expression=translate_expression(raw_expr),
                    )
                )
        return IRTransformation(name=name, kind="expression", ports=ports)

    # ── Helpers ────────────────────────────────────────────────────────────────

    @staticmethod
    def _attr_value(elem: ET.Element, attr_name: str) -> str:
        """Return the VALUE of the TABLEATTRIBUTE with the given NAME."""
        for attr in elem.findall("TABLEATTRIBUTE"):
            if attr.get("NAME") == attr_name:
                return attr.get("VALUE", "")
        return ""

    @staticmethod
    def _parse_join_keys(condition: str, lookup_table: str) -> list[str]:
        """Extract join column name(s) from an Informatica lookup condition.

        Pattern: ``lookup_table.col = other.col``  or  ``col = other.col``
        """
        # Match: word.word = word.word  — grab the column from the lookup-table side
        matches = re.findall(
            rf"{re.escape(lookup_table)}\.(\w+)\s*=",
            condition,
            flags=re.IGNORECASE,
        )
        if matches:
            return list(dict.fromkeys(matches))

        # Fallback: grab any first word.column on the left of an = sign
        matches = re.findall(r"(\w+)\.(\w+)\s*=", condition)
        if matches:
            return [matches[0][1]]

        return []
