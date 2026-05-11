"""End-to-end test: Informatica XML → YAML → framework execution → output rows."""

import sqlite3
from pathlib import Path

import pandas as pd
import pytest

from agent.generator.yaml_generator import YAMLGenerator
from agent.parser.informatica_xml import InformaticaXMLParser
from framework.config.loader import load_config
from framework.config.validator import validate_config
from framework.execution.engine import ExecutionEngine

_XML_PATH = Path(__file__).parent.parent / "sample_informatica" / "m_LOAD_CUSTOMERS.xml"

# ── Shared sample data (mirrors sample_data/load_sample_data.py) ───────────────

_CUSTOMERS = [
    (1, "Alice",  "Smith",  "alice@example.com",  "ACTIVE",   "C001"),
    (2, "Bob",    "Jones",  "bob@example.com",    "INACTIVE", "C002"),
    (3, "Carol",  "White",  "carol@example.com",  "ACTIVE",   "C003"),
    (4, "David",  "Brown",  "david@example.com",  "ACTIVE",   "C004"),
    (5, "Eve",    "Davis",  "eve@example.com",    "INACTIVE", "C005"),
    (6, "Frank",  "Miller", "frank@example.com",  "ACTIVE",   "C001"),
    (7, "Grace",  "Wilson", "grace@example.com",  "ACTIVE",   "C003"),
    (8, "Hank",   "Moore",  "hank@example.com",   "ACTIVE",   "C002"),
]

_SEGMENTS = [
    ("C001", "Premium"),
    ("C002", "Standard"),
    ("C003", "Premium"),
    ("C004", "Trial"),
]

_ACTIVE_IDS = {row[0] for row in _CUSTOMERS if row[4] == "ACTIVE"}  # {1,3,4,6,7,8}


# ── Fixtures ───────────────────────────────────────────────────────────────────

@pytest.fixture
def source_db(tmp_path: Path) -> Path:
    """SQLite db with customers + segments tables populated with sample data."""
    db = tmp_path / "source.db"
    customers_df = pd.DataFrame(
        _CUSTOMERS,
        columns=["customer_id", "first_name", "last_name", "email", "status", "segment_code"],
    )
    segments_df = pd.DataFrame(_SEGMENTS, columns=["segment_code", "segment_name"])
    with sqlite3.connect(db) as conn:
        customers_df.to_sql("customers", conn, if_exists="replace", index=False)
        segments_df.to_sql("segments", conn, if_exists="replace", index=False)
    return db


@pytest.fixture
def e2e_output(tmp_path: Path, source_db: Path) -> pd.DataFrame:
    """Run the full agent → framework pipeline; return the output DataFrame."""
    # Step 1: parse XML
    ir = InformaticaXMLParser().parse(_XML_PATH)

    # Step 2: generate YAML pointing at tmp_path dbs
    output_dir = tmp_path / "output"
    yaml_path = YAMLGenerator().generate(ir, output_dir, db_dir=tmp_path)

    # Step 3: execute via framework engine
    config = load_config(yaml_path)
    validate_config(config)
    ExecutionEngine(config).run()

    # Step 4: read output
    target_db = tmp_path / "target.db"
    with sqlite3.connect(target_db) as conn:
        return pd.read_sql("SELECT * FROM dim_customer", conn)


# ── End-to-end assertions ──────────────────────────────────────────────────────

class TestEndToEnd:
    def test_demo_flow_produces_expected_rows(self, e2e_output: pd.DataFrame):
        """Output row count matches expected_output.csv."""
        expected = pd.read_csv(
            Path(__file__).parent.parent / "sample_data" / "expected_output.csv"
        )
        assert len(e2e_output) == len(expected)

    def test_only_active_customers_in_output(self, e2e_output: pd.DataFrame):
        """No INACTIVE customers appear in the output."""
        inactive_ids = {row[0] for row in _CUSTOMERS if row[4] == "INACTIVE"}
        output_ids = set(e2e_output["customer_id"].tolist())
        assert not inactive_ids.intersection(output_ids)

    def test_active_customer_count(self, e2e_output: pd.DataFrame):
        assert len(e2e_output) == len(_ACTIVE_IDS)

    def test_full_name_column_present(self, e2e_output: pd.DataFrame):
        assert "full_name" in e2e_output.columns

    def test_full_name_derived_correctly(self, e2e_output: pd.DataFrame):
        """full_name == first_name + ' ' + last_name for every row."""
        for _, row in e2e_output.iterrows():
            expected_name = f"{row['first_name']} {row['last_name']}"
            assert row["full_name"] == expected_name, (
                f"customer_id {row['customer_id']}: expected '{expected_name}' "
                f"but got '{row['full_name']}'"
            )

    def test_segment_name_column_present(self, e2e_output: pd.DataFrame):
        assert "segment_name" in e2e_output.columns

    def test_segment_name_joined_correctly(self, e2e_output: pd.DataFrame):
        seg_map = dict(_SEGMENTS)
        for _, row in e2e_output.iterrows():
            code = row["segment_code"]
            if code in seg_map:
                assert row["segment_name"] == seg_map[code], (
                    f"customer_id {row['customer_id']}: expected segment "
                    f"'{seg_map[code]}' for code '{code}', got '{row['segment_name']}'"
                )

    def test_alice_smith_in_output(self, e2e_output: pd.DataFrame):
        assert "Alice Smith" in e2e_output["full_name"].values

    def test_bob_jones_not_in_output(self, e2e_output: pd.DataFrame):
        """Bob is INACTIVE — must not appear."""
        assert "Bob Jones" not in e2e_output["full_name"].values

    def test_yaml_file_written_to_output_dir(self, tmp_path: Path, source_db: Path):
        ir = InformaticaXMLParser().parse(_XML_PATH)
        output_dir = tmp_path / "output"
        YAMLGenerator().generate(ir, output_dir, db_dir=tmp_path)
        assert (output_dir / "job_config.yaml").exists()

    def test_ir_json_written_to_output_dir(self, tmp_path: Path, source_db: Path):
        ir = InformaticaXMLParser().parse(_XML_PATH)
        output_dir = tmp_path / "output"
        YAMLGenerator().generate(ir, output_dir, db_dir=tmp_path)
        assert (output_dir / "ir.json").exists()
