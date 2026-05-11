"""Unit and integration tests for the ETL framework."""

import json
import sqlite3
from pathlib import Path

import pandas as pd
import pytest
import yaml

from framework.connectors.base import BaseConnector
from framework.connectors.sqlite import SQLiteConnector
from framework.execution.engine import ExecutionEngine
from framework.transformations.expression import ExpressionTransformation
from framework.transformations.filter import FilterTransformation
from framework.transformations.lookup import LookupTransformation


# ── Helpers ────────────────────────────────────────────────────────────────────

def _write_sqlite(db_path: Path, table: str, df: pd.DataFrame) -> None:
    with sqlite3.connect(db_path) as conn:
        df.to_sql(table, conn, if_exists="replace", index=False)


def _read_sqlite(db_path: Path, table: str) -> pd.DataFrame:
    with sqlite3.connect(db_path) as conn:
        return pd.read_sql(f'SELECT * FROM "{table}"', conn)


@pytest.fixture
def sample_df() -> pd.DataFrame:
    return pd.DataFrame({
        "id":   [1, 2, 3],
        "name": ["Alice", "Bob", "Carol"],
        "val":  [10.0, 20.0, 30.0],
    })


@pytest.fixture
def source_db(tmp_path: Path, sample_df: pd.DataFrame) -> Path:
    db = tmp_path / "source.db"
    _write_sqlite(db, "customers", sample_df)
    return db


# ── BaseConnector contract ─────────────────────────────────────────────────────

class TestBaseConnector:
    def test_cannot_instantiate_directly(self):
        with pytest.raises(TypeError):
            BaseConnector({})  # type: ignore[abstract]

    def test_config_stored_on_concrete_subclass(self):
        class _Stub(BaseConnector):
            connector_type = "stub"
            def read(self) -> pd.DataFrame: return pd.DataFrame()
            def write(self, df: pd.DataFrame) -> None: pass

        cfg = {"db_path": "x.db", "table": "t"}
        assert _Stub(cfg).config is cfg

    def test_connector_type_present_on_sqlite(self):
        assert SQLiteConnector.connector_type == "sqlite"


# ── SQLiteConnector ────────────────────────────────────────────────────────────

class TestSQLiteConnector:
    def test_read_returns_dataframe(self, source_db: Path):
        assert isinstance(SQLiteConnector({"db_path": str(source_db), "table": "customers"}).read(), pd.DataFrame)

    def test_read_correct_row_count(self, source_db: Path, sample_df: pd.DataFrame):
        assert len(SQLiteConnector({"db_path": str(source_db), "table": "customers"}).read()) == len(sample_df)

    def test_read_correct_columns(self, source_db: Path, sample_df: pd.DataFrame):
        assert list(SQLiteConnector({"db_path": str(source_db), "table": "customers"}).read().columns) == list(sample_df.columns)

    def test_read_correct_values(self, source_db: Path, sample_df: pd.DataFrame):
        pd.testing.assert_frame_equal(
            SQLiteConnector({"db_path": str(source_db), "table": "customers"}).read(), sample_df
        )

    def test_read_empty_table(self, tmp_path: Path):
        db = tmp_path / "e.db"
        _write_sqlite(db, "t", pd.DataFrame({"x": pd.Series([], dtype=int)}))
        result = SQLiteConnector({"db_path": str(db), "table": "t"}).read()
        assert len(result) == 0 and "x" in result.columns

    def test_write_creates_db_when_missing(self, tmp_path: Path, sample_df: pd.DataFrame):
        db = tmp_path / "new.db"
        SQLiteConnector({"db_path": str(db), "table": "t"}).write(sample_df)
        assert db.exists()

    def test_write_persists_all_rows(self, tmp_path: Path, sample_df: pd.DataFrame):
        db = tmp_path / "out.db"
        SQLiteConnector({"db_path": str(db), "table": "t"}).write(sample_df)
        pd.testing.assert_frame_equal(_read_sqlite(db, "t"), sample_df)

    def test_write_default_replaces_table(self, tmp_path: Path, sample_df: pd.DataFrame):
        db = tmp_path / "out.db"
        _write_sqlite(db, "t", pd.DataFrame({"id": [99], "name": ["Old"], "val": [0.0]}))
        SQLiteConnector({"db_path": str(db), "table": "t"}).write(sample_df)
        assert _read_sqlite(db, "t")["id"].tolist() == [1, 2, 3]

    def test_write_append_mode_accumulates_rows(self, tmp_path: Path, sample_df: pd.DataFrame):
        db = tmp_path / "out.db"
        cfg = {"db_path": str(db), "table": "t", "if_exists": "append"}
        SQLiteConnector(cfg).write(sample_df)
        SQLiteConnector(cfg).write(sample_df)
        assert len(_read_sqlite(db, "t")) == len(sample_df) * 2

    def test_write_fail_mode_raises_on_existing(self, tmp_path: Path, sample_df: pd.DataFrame):
        db = tmp_path / "out.db"
        _write_sqlite(db, "t", sample_df)
        with pytest.raises(ValueError):
            SQLiteConnector({"db_path": str(db), "table": "t", "if_exists": "fail"}).write(sample_df)


# ── get_connector registry ─────────────────────────────────────────────────────

class TestGetConnector:
    def test_returns_sqlite_connector(self):
        from framework.connectors import get_connector
        assert isinstance(get_connector("sqlite", {"db_path": "x.db", "table": "t"}), SQLiteConnector)

    def test_config_forwarded_to_instance(self):
        from framework.connectors import get_connector
        cfg = {"db_path": "x.db", "table": "my_table"}
        assert get_connector("sqlite", cfg).config is cfg

    def test_raises_on_unknown_type(self):
        from framework.connectors import get_connector
        with pytest.raises(ValueError, match="Unknown connector type"):
            get_connector("oracle", {})


# ── FilterTransformation ───────────────────────────────────────────────────────

@pytest.fixture
def customers_df() -> pd.DataFrame:
    return pd.DataFrame({
        "customer_id": [1, 2, 3, 4, 5],
        "name":        ["Alice", "Bob", "Carol", "Dave", "Eve"],
        "status":      ["ACTIVE", "INACTIVE", "ACTIVE", "ACTIVE", "INACTIVE"],
        "score":       [90, 40, 75, 85, 30],
    })


class TestFilterTransformation:
    def test_keeps_matching_rows(self, customers_df: pd.DataFrame):
        result = FilterTransformation({"condition": "status == 'ACTIVE'"}).apply(customers_df)
        assert set(result["name"]) == {"Alice", "Carol", "Dave"}

    def test_drops_non_matching_rows(self, customers_df: pd.DataFrame):
        result = FilterTransformation({"condition": "status == 'ACTIVE'"}).apply(customers_df)
        assert "Bob" not in result["name"].values
        assert "Eve" not in result["name"].values

    def test_filter_on_numeric(self, customers_df: pd.DataFrame):
        result = FilterTransformation({"condition": "score >= 80"}).apply(customers_df)
        assert set(result["name"]) == {"Alice", "Dave"}

    def test_filter_all_match_returns_all_rows(self, customers_df: pd.DataFrame):
        result = FilterTransformation({"condition": "score > 0"}).apply(customers_df)
        assert len(result) == len(customers_df)

    def test_filter_none_match_returns_empty(self, customers_df: pd.DataFrame):
        result = FilterTransformation({"condition": "score > 999"}).apply(customers_df)
        assert len(result) == 0
        assert list(result.columns) == list(customers_df.columns)

    def test_output_index_is_reset(self, customers_df: pd.DataFrame):
        result = FilterTransformation({"condition": "status == 'ACTIVE'"}).apply(customers_df)
        assert list(result.index) == list(range(len(result)))

    def test_transformation_type_key(self):
        assert FilterTransformation.transformation_type == "filter"


# ── LookupTransformation ───────────────────────────────────────────────────────

@pytest.fixture
def lookup_db(tmp_path: Path) -> Path:
    db = tmp_path / "lookup.db"
    segments = pd.DataFrame({
        "segment_code": ["C001", "C002", "C003"],
        "segment_name": ["Premium", "Standard", "Trial"],
        "discount_pct": [20, 10, 5],
    })
    _write_sqlite(db, "segments", segments)
    return db


@pytest.fixture
def pipeline_df() -> pd.DataFrame:
    return pd.DataFrame({
        "customer_id":  [1, 2, 3, 4],
        "name":         ["Alice", "Bob", "Carol", "Dave"],
        "segment_code": ["C001", "C002", "UNKNOWN", "C003"],
    })


class TestLookupTransformation:
    def _cfg(self, lookup_db: Path, columns: list[str] | None = None) -> dict:
        cfg: dict = {
            "lookup_source": {"type": "sqlite", "config": {"db_path": str(lookup_db), "table": "segments"}},
            "join_on": ["segment_code"],
        }
        if columns is not None:
            cfg["columns"] = columns
        return cfg

    def test_enriches_with_specified_columns(self, pipeline_df: pd.DataFrame, lookup_db: Path):
        result = LookupTransformation(self._cfg(lookup_db, ["segment_name"])).apply(pipeline_df)
        assert "segment_name" in result.columns

    def test_correct_values_joined(self, pipeline_df: pd.DataFrame, lookup_db: Path):
        result = LookupTransformation(self._cfg(lookup_db, ["segment_name"])).apply(pipeline_df)
        alice_row = result[result["name"] == "Alice"].iloc[0]
        assert alice_row["segment_name"] == "Premium"

    def test_unmatched_rows_get_nan(self, pipeline_df: pd.DataFrame, lookup_db: Path):
        result = LookupTransformation(self._cfg(lookup_db, ["segment_name"])).apply(pipeline_df)
        dave_row = result[result["name"] == "Dave"]  # segment_code "UNKNOWN" → no match... wait Dave is C003
        unknown_row = result[result["segment_code"] == "UNKNOWN"].iloc[0]
        assert pd.isna(unknown_row["segment_name"])

    def test_row_count_unchanged_on_left_join(self, pipeline_df: pd.DataFrame, lookup_db: Path):
        result = LookupTransformation(self._cfg(lookup_db, ["segment_name"])).apply(pipeline_df)
        assert len(result) == len(pipeline_df)

    def test_column_selection_excludes_unspecified_columns(self, pipeline_df: pd.DataFrame, lookup_db: Path):
        result = LookupTransformation(self._cfg(lookup_db, ["segment_name"])).apply(pipeline_df)
        assert "discount_pct" not in result.columns

    def test_no_column_selection_brings_all_lookup_columns(self, pipeline_df: pd.DataFrame, lookup_db: Path):
        result = LookupTransformation(self._cfg(lookup_db)).apply(pipeline_df)
        assert "segment_name" in result.columns
        assert "discount_pct" in result.columns

    def test_transformation_type_key(self):
        assert LookupTransformation.transformation_type == "lookup"


# ── ExpressionTransformation ───────────────────────────────────────────────────

@pytest.fixture
def names_df() -> pd.DataFrame:
    return pd.DataFrame({
        "first_name": ["Alice", "Bob", "Carol"],
        "last_name":  ["Smith", "Jones", "White"],
        "price":      [10.0, 20.0, 30.0],
        "quantity":   [2, 3, 1],
    })


class TestExpressionTransformation:
    def test_string_concatenation(self, names_df: pd.DataFrame):
        result = ExpressionTransformation({
            "expressions": [{"target": "full_name", "expr": "first_name + ' ' + last_name"}]
        }).apply(names_df)
        assert result["full_name"].tolist() == ["Alice Smith", "Bob Jones", "Carol White"]

    def test_arithmetic_expression(self, names_df: pd.DataFrame):
        result = ExpressionTransformation({
            "expressions": [{"target": "revenue", "expr": "price * quantity"}]
        }).apply(names_df)
        assert result["revenue"].tolist() == [20.0, 60.0, 30.0]

    def test_multiple_expressions_applied_in_order(self, names_df: pd.DataFrame):
        result = ExpressionTransformation({
            "expressions": [
                {"target": "full_name", "expr": "first_name + ' ' + last_name"},
                {"target": "revenue",   "expr": "price * quantity"},
            ]
        }).apply(names_df)
        assert "full_name" in result.columns and "revenue" in result.columns

    def test_later_expression_can_reference_earlier_column(self, names_df: pd.DataFrame):
        result = ExpressionTransformation({
            "expressions": [
                {"target": "revenue",       "expr": "price * quantity"},
                {"target": "revenue_upper", "expr": "revenue * 1.1"},
            ]
        }).apply(names_df)
        assert result["revenue_upper"].tolist() == pytest.approx([22.0, 66.0, 33.0])

    def test_expression_can_overwrite_existing_column(self, names_df: pd.DataFrame):
        result = ExpressionTransformation({
            "expressions": [{"target": "price", "expr": "price * 2"}]
        }).apply(names_df)
        assert result["price"].tolist() == [20.0, 40.0, 60.0]

    def test_original_df_not_mutated(self, names_df: pd.DataFrame):
        original_price = names_df["price"].tolist()
        ExpressionTransformation({
            "expressions": [{"target": "price", "expr": "price * 2"}]
        }).apply(names_df)
        assert names_df["price"].tolist() == original_price

    def test_transformation_type_key(self):
        assert ExpressionTransformation.transformation_type == "expression"


# ── get_transformation registry ───────────────────────────────────────────────

class TestGetTransformation:
    def test_returns_filter_transformation(self):
        from framework.transformations import get_transformation
        t = get_transformation("filter", {"condition": "x > 0"})
        assert isinstance(t, FilterTransformation)

    def test_returns_lookup_transformation(self):
        from framework.transformations import get_transformation
        cfg = {"lookup_source": {"type": "sqlite", "config": {}}, "join_on": ["id"]}
        assert isinstance(get_transformation("lookup", cfg), LookupTransformation)

    def test_returns_expression_transformation(self):
        from framework.transformations import get_transformation
        t = get_transformation("expression", {"expressions": []})
        assert isinstance(t, ExpressionTransformation)

    def test_raises_on_unknown_type(self):
        from framework.transformations import get_transformation
        with pytest.raises(ValueError, match="Unknown transformation type"):
            get_transformation("pivot", {})


# ── Config: loader + validator ────────────────────────────────────────────────

@pytest.fixture
def minimal_config() -> dict:
    return {
        "job":    {"name": "test", "version": "1.0"},
        "source": {"type": "sqlite", "config": {"db_path": "s.db", "table": "t"}},
        "sink":   {"type": "sqlite", "config": {"db_path": "t.db", "table": "out"}},
    }


@pytest.fixture
def config_yaml(tmp_path: Path, minimal_config: dict) -> Path:
    path = tmp_path / "job.yaml"
    path.write_text(yaml.dump(minimal_config), encoding="utf-8")
    return path


class TestConfigLoader:
    def test_load_returns_dict(self, config_yaml: Path, minimal_config: dict):
        from framework.config.loader import load_config
        result = load_config(config_yaml)
        assert result == minimal_config

    def test_load_missing_file_raises(self, tmp_path: Path):
        from framework.config.loader import load_config
        with pytest.raises(FileNotFoundError):
            load_config(tmp_path / "nonexistent.yaml")


class TestConfigValidator:
    def test_valid_config_passes(self, minimal_config: dict):
        from framework.config.validator import validate_config
        validate_config(minimal_config)  # must not raise

    def test_missing_job_raises(self, minimal_config: dict):
        import jsonschema
        from framework.config.validator import validate_config
        del minimal_config["job"]
        with pytest.raises(jsonschema.ValidationError):
            validate_config(minimal_config)

    def test_missing_source_raises(self, minimal_config: dict):
        import jsonschema
        from framework.config.validator import validate_config
        del minimal_config["source"]
        with pytest.raises(jsonschema.ValidationError):
            validate_config(minimal_config)

    def test_extra_top_level_key_raises(self, minimal_config: dict):
        import jsonschema
        from framework.config.validator import validate_config
        minimal_config["extra_key"] = "bad"
        with pytest.raises(jsonschema.ValidationError):
            validate_config(minimal_config)


# ── ExecutionEngine — integration ─────────────────────────────────────────────

@pytest.fixture
def full_source_db(tmp_path: Path) -> Path:
    db = tmp_path / "source.db"
    customers = pd.DataFrame({
        "customer_id": [1, 2, 3, 4],
        "first_name":  ["Alice", "Bob", "Carol", "Dave"],
        "last_name":   ["Smith", "Jones", "White", "Brown"],
        "email":       ["a@x.com", "b@x.com", "c@x.com", "d@x.com"],
        "status":      ["ACTIVE", "INACTIVE", "ACTIVE", "ACTIVE"],
        "segment_code":["C001", "C002", "C003", "C001"],
    })
    segments = pd.DataFrame({
        "segment_code": ["C001", "C002", "C003"],
        "segment_name": ["Premium", "Standard", "Trial"],
    })
    _write_sqlite(db, "customers", customers)
    _write_sqlite(db, "segments", segments)
    return db


@pytest.fixture
def engine_config(tmp_path: Path, full_source_db: Path) -> dict:
    target_db = tmp_path / "target.db"
    return {
        "job":    {"name": "test_pipeline", "version": "1.0"},
        "source": {"type": "sqlite", "config": {"db_path": str(full_source_db), "table": "customers"}},
        "transformations": [
            {
                "name": "filter_active",
                "type": "filter",
                "config": {"condition": "status == 'ACTIVE'"},
            },
            {
                "name": "enrich_segment",
                "type": "lookup",
                "config": {
                    "lookup_source": {
                        "type": "sqlite",
                        "config": {"db_path": str(full_source_db), "table": "segments"},
                    },
                    "join_on": ["segment_code"],
                    "columns": ["segment_name"],
                },
            },
            {
                "name": "derive_full_name",
                "type": "expression",
                "config": {
                    "expressions": [
                        {"target": "full_name", "expr": "first_name + ' ' + last_name"},
                    ]
                },
            },
        ],
        "sink": {
            "type": "sqlite",
            "config": {"db_path": str(target_db), "table": "dim_customer", "if_exists": "replace"},
        },
    }


class TestExecutionEngine:
    def _run(self, config: dict) -> pd.DataFrame:
        from framework.config.validator import validate_config
        validate_config(config)
        ExecutionEngine(config).run()
        sink_path = Path(config["sink"]["config"]["db_path"])
        sink_table = config["sink"]["config"]["table"]
        return _read_sqlite(sink_path, sink_table)

    def test_run_produces_output_table(self, engine_config: dict):
        result = self._run(engine_config)
        assert len(result) > 0

    def test_filter_excludes_inactive_customers(self, engine_config: dict):
        result = self._run(engine_config)
        # Bob (INACTIVE) must not appear
        assert "Bob" not in result["first_name"].values

    def test_only_active_customers_in_output(self, engine_config: dict):
        result = self._run(engine_config)
        assert len(result) == 3  # Alice, Carol, Dave

    def test_lookup_enriches_with_segment_name(self, engine_config: dict):
        result = self._run(engine_config)
        assert "segment_name" in result.columns

    def test_lookup_correct_segment_value(self, engine_config: dict):
        result = self._run(engine_config)
        alice = result[result["first_name"] == "Alice"].iloc[0]
        assert alice["segment_name"] == "Premium"

    def test_expression_derives_full_name(self, engine_config: dict):
        result = self._run(engine_config)
        assert "full_name" in result.columns

    def test_expression_correct_full_name(self, engine_config: dict):
        result = self._run(engine_config)
        alice = result[result["first_name"] == "Alice"].iloc[0]
        assert alice["full_name"] == "Alice Smith"

    def test_no_transformations_passes_through(self, tmp_path: Path, full_source_db: Path):
        target_db = tmp_path / "t.db"
        config = {
            "job":    {"name": "passthrough", "version": "1.0"},
            "source": {"type": "sqlite", "config": {"db_path": str(full_source_db), "table": "customers"}},
            "sink":   {"type": "sqlite", "config": {"db_path": str(target_db), "table": "out", "if_exists": "replace"}},
        }
        result = self._run(config)
        assert len(result) == 4  # all customers, no filter

    def test_run_via_yaml_file(self, tmp_path: Path, engine_config: dict):
        yaml_path = tmp_path / "job.yaml"
        yaml_path.write_text(yaml.dump(engine_config), encoding="utf-8")

        from framework.config.loader import load_config
        from framework.config.validator import validate_config
        loaded = load_config(yaml_path)
        validate_config(loaded)
        ExecutionEngine(loaded).run()

        result = _read_sqlite(Path(engine_config["sink"]["config"]["db_path"]), "dim_customer")
        assert len(result) == 3


# ── CSV connector stub (next session) ──────────────────────────────────────────

class TestCSVFileConnector:
    def test_read_parses_csv(self, tmp_path):
        pytest.skip("Not yet implemented")

    def test_write_creates_csv(self, tmp_path):
        pytest.skip("Not yet implemented")


# ── SCD Type 2 stub (next session) ────────────────────────────────────────────

class TestSCDType2Transformation:
    def test_new_rows_inserted(self):
        pytest.skip("Not yet implemented")

    def test_changed_rows_expire_old_version(self):
        pytest.skip("Not yet implemented")
