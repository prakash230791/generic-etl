"""Unit tests for the migration agent (parser, translator, generator)."""

import json
import sqlite3
from pathlib import Path

import pandas as pd
import pytest
import yaml

from agent.generator.yaml_generator import YAMLGenerator
from agent.ir.schema import IRMapping, IRPort, IRSource, IRTarget, IRTransformation
from agent.parser.informatica_xml import InformaticaXMLParser
from agent.translator.expressions import translate_expression, translate_filter_condition

# Path to the real sample XML inside the repo
_XML_PATH = Path(__file__).parent.parent / "sample_informatica" / "m_LOAD_CUSTOMERS.xml"


# ── Expression translator ──────────────────────────────────────────────────────

class TestExpressionTranslator:
    def test_concat_two_columns(self):
        assert translate_expression("CONCAT(first_name, last_name)") == "first_name + last_name"

    def test_concat_with_string_literal(self):
        result = translate_expression("CONCAT(first_name, ' ', last_name)")
        assert result == "first_name + ' ' + last_name"

    def test_trim(self):
        assert translate_expression("TRIM(email)") == "email.str.strip()"

    def test_upper(self):
        assert translate_expression("UPPER(status)") == "status.str.upper()"

    def test_lower(self):
        assert translate_expression("LOWER(status)") == "status.str.lower()"

    def test_plain_column_name_unchanged(self):
        assert translate_expression("customer_id") == "customer_id"


class TestFilterConditionTranslator:
    def test_single_equals_becomes_double(self):
        assert translate_filter_condition("status = 'ACTIVE'") == "status == 'ACTIVE'"

    def test_not_equal_unchanged(self):
        assert translate_filter_condition("status != 'ACTIVE'") == "status != 'ACTIVE'"

    def test_greater_equal_unchanged(self):
        assert translate_filter_condition("score >= 80") == "score >= 80"

    def test_less_equal_unchanged(self):
        assert translate_filter_condition("score <= 50") == "score <= 50"

    def test_informatica_not_equal_rewritten(self):
        assert translate_filter_condition("status <> 'ACTIVE'") == "status != 'ACTIVE'"

    def test_already_double_equals_unchanged(self):
        assert translate_filter_condition("score == 100") == "score == 100"


# ── XML Parser ─────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def parsed_ir() -> IRMapping:
    return InformaticaXMLParser().parse(_XML_PATH)


class TestInformaticaXMLParser:
    def test_parse_returns_ir_mapping(self, parsed_ir: IRMapping):
        assert isinstance(parsed_ir, IRMapping)

    def test_mapping_name(self, parsed_ir: IRMapping):
        assert parsed_ir.mapping_name == "m_LOAD_CUSTOMERS"

    def test_source_table(self, parsed_ir: IRMapping):
        assert parsed_ir.source.table == "customers"

    def test_source_db_name(self, parsed_ir: IRMapping):
        assert parsed_ir.source.db_path == "source.db"

    def test_target_table(self, parsed_ir: IRMapping):
        assert parsed_ir.target.table == "dim_customer"

    def test_target_db_name(self, parsed_ir: IRMapping):
        assert parsed_ir.target.db_path == "target.db"

    def test_three_transformations_extracted(self, parsed_ir: IRMapping):
        assert len(parsed_ir.transformations) == 3

    def test_transformation_order(self, parsed_ir: IRMapping):
        kinds = [t.kind for t in parsed_ir.transformations]
        assert kinds == ["filter", "lookup", "expression"]

    def test_filter_condition_extracted(self, parsed_ir: IRMapping):
        fil = next(t for t in parsed_ir.transformations if t.kind == "filter")
        assert fil.properties["condition"] == "status == 'ACTIVE'"

    def test_lookup_table_extracted(self, parsed_ir: IRMapping):
        lkp = next(t for t in parsed_ir.transformations if t.kind == "lookup")
        assert lkp.properties["table"] == "segments"

    def test_lookup_join_key_extracted(self, parsed_ir: IRMapping):
        lkp = next(t for t in parsed_ir.transformations if t.kind == "lookup")
        assert "segment_code" in lkp.properties["join_on"]

    def test_lookup_new_column_extracted(self, parsed_ir: IRMapping):
        lkp = next(t for t in parsed_ir.transformations if t.kind == "lookup")
        assert "segment_name" in lkp.properties["columns"]

    def test_expression_port_name(self, parsed_ir: IRMapping):
        expr = next(t for t in parsed_ir.transformations if t.kind == "expression")
        output_ports = [p for p in expr.ports if p.expression]
        assert any(p.name == "full_name" for p in output_ports)

    def test_expression_translated(self, parsed_ir: IRMapping):
        expr = next(t for t in parsed_ir.transformations if t.kind == "expression")
        full_name_port = next(p for p in expr.ports if p.name == "full_name")
        assert "first_name" in full_name_port.expression
        assert "last_name"  in full_name_port.expression


# ── YAML Generator ─────────────────────────────────────────────────────────────

@pytest.fixture
def minimal_ir(tmp_path: Path) -> IRMapping:
    return IRMapping(
        mapping_name="test_mapping",
        source=IRSource(name="customers", table="customers", db_path="source.db"),
        target=IRTarget(name="dim_customer", table="dim_customer", db_path="target.db"),
        transformations=[
            IRTransformation(
                name="FIL_ACTIVE",
                kind="filter",
                properties={"condition": "status == 'ACTIVE'"},
            ),
            IRTransformation(
                name="EXP_NAME",
                kind="expression",
                ports=[
                    IRPort(
                        name="full_name",
                        datatype="varchar",
                        expression="first_name + ' ' + last_name",
                    )
                ],
            ),
        ],
    )


class TestYAMLGenerator:
    def test_generates_yaml_file(self, minimal_ir: IRMapping, tmp_path: Path):
        path = YAMLGenerator().generate(minimal_ir, tmp_path / "out", db_dir=tmp_path)
        assert path.exists()
        assert path.suffix == ".yaml"

    def test_ir_json_also_written(self, minimal_ir: IRMapping, tmp_path: Path):
        out = tmp_path / "out"
        YAMLGenerator().generate(minimal_ir, out, db_dir=tmp_path)
        assert (out / "ir.json").exists()

    def test_ir_json_is_valid_json(self, minimal_ir: IRMapping, tmp_path: Path):
        out = tmp_path / "out"
        YAMLGenerator().generate(minimal_ir, out, db_dir=tmp_path)
        data = json.loads((out / "ir.json").read_text())
        assert data["mapping_name"] == "test_mapping"

    def test_generated_yaml_passes_schema_validation(self, minimal_ir: IRMapping, tmp_path: Path):
        import jsonschema
        from framework.config.loader import load_config
        from framework.config.validator import validate_config

        out = tmp_path / "out"
        yaml_path = YAMLGenerator().generate(minimal_ir, out, db_dir=tmp_path)
        config = load_config(yaml_path)
        validate_config(config)  # must not raise

    def test_job_name_matches_mapping_name(self, minimal_ir: IRMapping, tmp_path: Path):
        from framework.config.loader import load_config

        out = tmp_path / "out"
        yaml_path = YAMLGenerator().generate(minimal_ir, out, db_dir=tmp_path)
        config = load_config(yaml_path)
        assert config["job"]["name"] == "test_mapping"

    def test_source_type_is_sqlite(self, minimal_ir: IRMapping, tmp_path: Path):
        from framework.config.loader import load_config

        out = tmp_path / "out"
        yaml_path = YAMLGenerator().generate(minimal_ir, out, db_dir=tmp_path)
        config = load_config(yaml_path)
        assert config["source"]["type"] == "sqlite"

    def test_db_dir_used_for_source_path(self, minimal_ir: IRMapping, tmp_path: Path):
        from framework.config.loader import load_config

        out = tmp_path / "out"
        yaml_path = YAMLGenerator().generate(minimal_ir, out, db_dir=tmp_path)
        config = load_config(yaml_path)
        assert str(tmp_path) in config["source"]["config"]["db_path"]

    def test_transformations_in_yaml(self, minimal_ir: IRMapping, tmp_path: Path):
        from framework.config.loader import load_config

        out = tmp_path / "out"
        yaml_path = YAMLGenerator().generate(minimal_ir, out, db_dir=tmp_path)
        config = load_config(yaml_path)
        types = [t["type"] for t in config.get("transformations", [])]
        assert "filter" in types
        assert "expression" in types

    def test_generate_from_real_xml(self, tmp_path: Path):
        """Parse the actual sample XML and generate YAML — smoke test."""
        ir = InformaticaXMLParser().parse(_XML_PATH)
        yaml_path = YAMLGenerator().generate(ir, tmp_path / "out", db_dir=tmp_path)
        assert yaml_path.exists()
