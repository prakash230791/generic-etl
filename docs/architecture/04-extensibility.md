# Extensibility Architecture & Plugin SDK

**Document:** 04 of 8
**Audience:** Senior Engineers, Third-Party Developers, Platform Team
**Version:** 1.0 | **Date:** 2026-05-14

---

## 1. Extensibility Design Goals

| Goal | Mechanism |
|---|---|
| New connectors with zero core changes | Entry-point plugin pattern (existing) |
| New transforms with zero core changes | Entry-point plugin pattern (existing) |
| Third-party pip-installable plugins | Published Plugin SDK (Phase 3) |
| New execution backends without connector rewrites | ExecutionBackend ABC (Phase 2) |
| New source parsers (Talend, SSIS) without agent changes | SourceParser ABC (Phase 2) |
| Custom expression rule packs | YAML rule files, hot-loaded by rules agent |

---

## 2. Plugin System (Current + Target)

### 2.1 Entry-Point Registration (pyproject.toml)

Every new connector or transformation is registered via Python entry-points.
No changes to core code. No imports to update.

```toml
# pyproject.toml — excerpt showing target state
[project.entry-points."etl.connectors"]
sqlite       = "framework.connectors.sqlite:SQLiteConnector"
csv          = "framework.connectors.csv:CsvConnector"
postgres     = "framework.connectors.postgres:PostgresConnector"
sqlserver    = "framework.connectors.sqlserver:SqlServerConnector"
oracle       = "framework.connectors.oracle:OracleConnector"
azure_sql    = "framework.connectors.azure_sql:AzureSqlConnector"
s3           = "framework.connectors.s3:S3Connector"
adls         = "framework.connectors.adls:AdlsConnector"
snowflake    = "framework.connectors.snowflake:SnowflakeConnector"
excel        = "framework.connectors.excel:ExcelConnector"
fixed_width  = "framework.connectors.fixed_width:FixedWidthConnector"
kafka        = "framework.connectors.kafka:KafkaConnector"
sftp         = "framework.connectors.sftp:SftpConnector"
http_api     = "framework.connectors.http_api:HttpApiConnector"
mysql        = "framework.connectors.mysql:MySqlConnector"

[project.entry-points."etl.transformations"]
row_filter        = "framework.transformations.row_filter:RowFilterTransformation"
column_derive     = "framework.transformations.column_derive:ColumnDeriveTransformation"
lookup_enrich     = "framework.transformations.lookup_enrich:LookupEnrichTransformation"
scd_type_2        = "framework.transformations.scd_type_2:ScdType2Transformation"
scd_type_1        = "framework.transformations.scd_type_1:ScdType1Transformation"
stream_join       = "framework.transformations.stream_join:StreamJoinTransformation"
aggregate         = "framework.transformations.aggregate:AggregateTransformation"
column_select     = "framework.transformations.column_select:ColumnSelectTransformation"
union_all         = "framework.transformations.union_all:UnionAllTransformation"
row_sort          = "framework.transformations.row_sort:RowSortTransformation"
route_split       = "framework.transformations.route_split:RouteSplitTransformation"
row_deduplicate   = "framework.transformations.row_deduplicate:RowDeduplicateTransformation"
data_convert      = "framework.transformations.data_convert:DataConvertTransformation"
sequence_generate = "framework.transformations.sequence_generate:SequenceGenerateTransformation"
rank              = "framework.transformations.rank:RankTransformation"
window_fn         = "framework.transformations.window_fn:WindowFnTransformation"
pivot             = "framework.transformations.pivot:PivotTransformation"
unpivot           = "framework.transformations.unpivot:UnpivotTransformation"
mask_pii          = "framework.transformations.mask_pii:MaskPiiTransformation"
data_validate     = "framework.transformations.data_validate:DataValidateTransformation"
python_fn         = "framework.transformations.python_fn:PythonFnTransformation"
flatten_json      = "framework.transformations.flatten_json:FlattenJsonTransformation"
```

### 2.2 Runtime Plugin Resolution (Target)

```python
# framework/connectors/__init__.py (production version)
import importlib.metadata

def get_connector(connector_type: str) -> type:
    """Resolve connector class by name via entry-points. Raises on unknown type."""
    _cache = {}
    if connector_type in _cache:
        return _cache[connector_type]

    # Load from entry-points (allows third-party pip packages)
    eps = importlib.metadata.entry_points(group="etl.connectors")
    for ep in eps:
        if ep.name == connector_type:
            cls = ep.load()
            _cache[connector_type] = cls
            return cls

    raise ValueError(
        f"Unknown connector type: '{connector_type}'. "
        f"Available: {[ep.name for ep in eps]}"
    )
```

---

## 3. Connector Plugin Contract

### 3.1 BaseConnector ABC (Production Version)

```python
# framework/connectors/base.py
from abc import ABC, abstractmethod
from typing import ClassVar
import pandas as pd

class BaseConnector(ABC):
    """
    Contract for all ETL connectors.

    Implementing a new connector:
    1. Subclass BaseConnector
    2. Set connector_type (must match entry-point key)
    3. Implement read() and write()
    4. Optionally implement execute() for DML/DDL
    5. Register in pyproject.toml entry-points
    6. pip install -e . to activate

    Never modify this class — it is the stable plugin contract.
    """
    connector_type: ClassVar[str]   # must match entry-point key exactly

    @abstractmethod
    def read(self, config: dict) -> pd.DataFrame:
        """
        Read data from the source and return as a pandas DataFrame.

        Required config keys (connector-specific):
          connection: str — resolved connection string (never a raw credential)
          table: str      — table name (OR)
          query: str      — SQL query

        Optional config keys:
          schema: str     — database schema
          options: dict   — connector-specific options (e.g. delimiter for CSV)
        """

    @abstractmethod
    def write(self, df: pd.DataFrame, config: dict) -> None:
        """
        Write a pandas DataFrame to the target.

        Required config keys:
          connection: str — resolved connection string
          table: str      — target table name
          load_strategy: str — append | replace | upsert | merge_on_key

        Optional config keys:
          upsert_keys: list[str] — key columns for upsert
          chunk_size: int        — batch size for bulk writes
        """

    def execute(self, config: dict) -> Any:
        """
        Execute a SQL statement (DML/DDL) and return result or None.
        Override for DB connectors. Default raises NotImplementedError.
        config keys: connection, sql (or query)
        """
        raise NotImplementedError(f"{self.connector_type} does not support execute()")

    def execute_procedure(self, config: dict) -> Any:
        """
        Execute a stored procedure with named parameters.
        Override for DB connectors. Default raises NotImplementedError.
        config keys: connection, procedure, parameters (dict)
        """
        raise NotImplementedError(f"{self.connector_type} does not support execute_procedure()")

    def close(self) -> None:
        """Release connection resources. Called after job completes. Optional."""
        pass
```

### 3.2 New Connector Scaffold (5-Minute Quickstart)

```python
# Example: Adding a new connector for Google BigQuery
# File: framework/connectors/bigquery.py

from typing import ClassVar
import pandas as pd
from framework.connectors.base import BaseConnector

class BigQueryConnector(BaseConnector):
    """Google BigQuery connector via google-cloud-bigquery."""

    connector_type: ClassVar[str] = "bigquery"

    def read(self, config: dict) -> pd.DataFrame:
        from google.cloud import bigquery
        client = bigquery.Client(project=config["project"])
        query = config.get("query") or f"SELECT * FROM `{config['table']}`"
        return client.query(query).to_dataframe()

    def write(self, df: pd.DataFrame, config: dict) -> None:
        from google.cloud import bigquery
        client = bigquery.Client(project=config["project"])
        job_config = bigquery.LoadJobConfig(
            write_disposition=(
                "WRITE_APPEND" if config.get("load_strategy") == "append"
                else "WRITE_TRUNCATE"
            )
        )
        client.load_table_from_dataframe(
            df, config["table"], job_config=job_config
        ).result()
```

Then add to `pyproject.toml`:
```toml
bigquery = "framework.connectors.bigquery:BigQueryConnector"
```

Then: `pip install -e . && make test` — done.

---

## 4. Transformation Plugin Contract

### 4.1 BaseTransformation ABC (Production Version)

```python
# framework/transformations/base.py
class BaseTransformation(ABC):
    """
    Contract for all ETL transformations.

    Key invariant: apply() must be pure.
    - Never modify the input DataFrame
    - Always return a new DataFrame
    - Always call reset_index(drop=True) on output
    - Never access network, filesystem, or external state in apply()

    For transforms with multiple inputs (stream_join, union_all):
    Override apply_multi(dfs: dict[str, pd.DataFrame], config: dict) instead.
    """
    transformation_type: ClassVar[str]  # must match entry-point key

    @abstractmethod
    def apply(self, df: pd.DataFrame, config: dict) -> pd.DataFrame:
        """Apply transformation to a single input DataFrame."""

    def apply_multi(
        self, dfs: dict[str, pd.DataFrame], config: dict
    ) -> pd.DataFrame:
        """
        Apply transformation to multiple input DataFrames.
        Override for joins, unions, etc.
        Default: passes first input to apply().
        """
        first_key = next(iter(dfs))
        return self.apply(dfs[first_key], config)

    @property
    def has_multi_input(self) -> bool:
        """Return True if this transform requires multiple inputs."""
        return False
```

### 4.2 New Transformation Scaffold

```python
# Example: Fuzzy string matching deduplication
# File: framework/transformations/fuzzy_match.py

from typing import ClassVar
import pandas as pd
from framework.transformations.base import BaseTransformation

class FuzzyMatchTransformation(BaseTransformation):
    """
    Deduplicate rows using fuzzy string similarity on a key column.
    Requires: rapidfuzz (pip install rapidfuzz)
    """
    transformation_type: ClassVar[str] = "fuzzy_match"

    def apply(self, df: pd.DataFrame, config: dict) -> pd.DataFrame:
        from rapidfuzz import process, fuzz
        result = df.copy()
        key_col = config["key_column"]
        threshold = config.get("threshold", 90)
        strategy = config.get("strategy", "keep_first")

        # Deduplicate: keep best match per fuzzy group
        seen = []
        keep = []
        for idx, value in enumerate(result[key_col].tolist()):
            match = process.extractOne(value, seen, scorer=fuzz.ratio)
            if match and match[1] >= threshold:
                if strategy == "keep_first":
                    pass   # skip this row (duplicate)
                else:
                    keep.append(idx)   # keep_best: handled separately
            else:
                seen.append(value)
                keep.append(idx)

        return result.iloc[keep].reset_index(drop=True)
```

---

## 5. Source Parser Plugin Contract (Agent)

### 5.1 SourceParser ABC

```python
# agent/agents/parser/base.py
class SourceParser(ABC):
    """
    Contract for migration agent source parsers.
    Each parser handles one ETL source format (Informatica, ADF, SSIS, Talend).
    """
    source_type: ClassVar[str]  # "informatica" | "adf" | "ssis" | "talend"

    @abstractmethod
    def can_parse(self, path: Path) -> bool:
        """Return True if this parser handles the given file/directory."""

    @abstractmethod
    def parse(self, path: Path, artifact_id: str | None = None) -> dict:
        """
        Parse the source artifact and return a canonical IR dict.

        Returns IR v2.0 dict with:
          ir_version, source_origin, job, parameters,
          sources, transforms, sinks, pre_steps, post_steps,
          complexity, metadata, warnings
        """
```

### 5.2 Adding a New Source Parser (Talend Example)

```python
# agent/agents/parser/talend.py
class TalendParser(SourceParser):
    """
    Parses Talend Open Studio job XML exports.
    Handles: tMap, tFilterRow, tAggregateRow, tJoin, tInputExcel, tOutputExcel
    """
    source_type = "talend"

    # Talend component → canonical transform map
    TALEND_COMPONENT_MAP = {
        "tFilterRow":    "row_filter",
        "tMap":          "column_derive",   # expression mappings
        "tAggregateRow": "aggregate",
        "tJoin":         "stream_join",
        "tSortRow":      "row_sort",
        "tUniqRow":      "row_deduplicate",
    }

    def can_parse(self, path: Path) -> bool:
        return path.suffix == ".item" or (path.is_dir() and (path / "*.item").exists())

    def parse(self, path: Path, artifact_id: str | None = None) -> dict:
        # ... parse Talend .item XML ...
        pass
```

Register in `pyproject.toml`:
```toml
[project.entry-points."etl.parsers"]
talend = "agent.agents.parser.talend:TalendParser"
```

---

## 6. Expression Rule Packs

### 6.1 Rule File Format

Expression rules are plain YAML — no Python required to add new rules:

```yaml
# agent/agents/translation/rules/informatica.yaml
version: "2.0"
source: informatica
rules:
  - id: R001
    name: IIF to Python ternary
    pattern: "IIF\\((.+?),\\s*(.+?),\\s*(.+?)\\)"
    replacement: "({1} if ({0}) else {2})"
    priority: 10
    tags: [conditional, common]
    examples:
      - input:  "IIF(ISNULL(status), 'UNKNOWN', status)"
        output: "('UNKNOWN' if (pd.isna(status)) else status)"

  - id: R002
    name: ISNULL to pandas isna
    pattern: "ISNULL\\((.+?)\\)"
    replacement: "pd.isna({0})"
    priority: 20
    tags: [null_handling, common]

  - id: R003
    name: SUBSTR to Python slice
    pattern: "SUBSTR\\((.+?),\\s*(\\d+),\\s*(\\d+)\\)"
    replacement: "{0}[{1}-1:{1}-1+{2}]"
    priority: 30
    tags: [string, common]
    notes: "Informatica SUBSTR is 1-indexed"

  - id: R004
    name: TO_DATE to pandas to_datetime
    pattern: "TO_DATE\\((.+?),\\s*'([^']+)'\\)"
    replacement: "pd.to_datetime({0}, format='{1}')"
    priority: 40
    tags: [datetime, common]

  - id: R050
    name: IN list membership
    pattern: "(.+?)\\s+IN\\s+\\((.+?)\\)"
    replacement: "{0} in [{1}]"
    priority: 50
    tags: [comparison]

# ... 55 more rules ...
```

### 6.2 Rule Engine (Hot-Loadable)

```python
# agent/agents/translation/rules_agent.py
class RulesAgent:
    def __init__(self, rules_dirs: list[Path] | None = None):
        # Load all YAML rule files from default + custom dirs
        self._rules = []
        for rules_dir in (rules_dirs or [_DEFAULT_RULES_DIR]):
            for rule_file in rules_dir.glob("*.yaml"):
                self._rules.extend(self._load_rules(rule_file))
        # Sort by priority (lower = higher priority)
        self._rules.sort(key=lambda r: r["priority"])

    def translate(self, expression: str, source_type: str) -> TranslationResult:
        applicable = [r for r in self._rules if source_type in r.get("source", source_type)]
        for rule in applicable:
            pattern = re.compile(rule["pattern"], re.IGNORECASE)
            match = pattern.search(expression)
            if match:
                result = re.sub(pattern, rule["replacement"], expression)
                return TranslationResult(
                    translated=result,
                    confidence=0.95,
                    rule_id=rule["id"],
                    method="deterministic"
                )
        return TranslationResult(translated=None, confidence=0.0, method="unmatched")
```

Custom rule packs can be added as pip packages:
```bash
pip install etl-rules-sap    # SAP BODS expression rules
pip install etl-rules-oracle # Oracle PL/SQL expression rules
```

---

## 7. Plugin SDK (Phase 3)

### 7.1 Cookiecutter Template

```bash
# Scaffold a new connector plugin project
cookiecutter gh:generic-etl/plugin-template --no-input \
  plugin_name="BigQuery" \
  plugin_type="connector" \
  canonical_name="bigquery" \
  author="Data Team"

# Generated structure:
etl-connector-bigquery/
├── pyproject.toml
├── README.md
├── etl_connector_bigquery/
│   ├── __init__.py
│   └── connector.py      ← implement BaseConnector here
└── tests/
    ├── conftest.py        ← standard fixtures
    └── test_connector.py  ← standard connector contract tests
```

### 7.2 Standard Contract Tests (included in SDK)

Every third-party connector must pass the SDK contract tests:

```python
# Included in the SDK: tests/test_connector_contract.py
class ConnectorContractTests:
    """Run these against any new connector to verify it meets the contract."""

    def test_connector_type_defined(self, connector_class):
        assert hasattr(connector_class, "connector_type")
        assert isinstance(connector_class.connector_type, str)

    def test_read_returns_dataframe(self, connector, read_config):
        result = connector.read(read_config)
        assert isinstance(result, pd.DataFrame)
        assert not result.empty or True   # empty is ok
        assert result.index.is_unique

    def test_write_is_idempotent(self, connector, write_config, sample_df):
        connector.write(sample_df, {**write_config, "load_strategy": "replace"})
        connector.write(sample_df, {**write_config, "load_strategy": "replace"})
        result = connector.read(write_config)
        assert len(result) == len(sample_df)   # no duplicates from double write

    def test_read_never_modifies_source(self, connector, read_config):
        df1 = connector.read(read_config)
        df2 = connector.read(read_config)
        pd.testing.assert_frame_equal(df1, df2)   # idempotent

    def test_no_credentials_in_config(self, read_config):
        config_str = json.dumps(read_config)
        for pattern in ["password=", "pwd=", "PWD=", "Password="]:
            assert pattern.lower() not in config_str.lower()
```

### 7.3 Plugin Marketplace (Phase 3)

```
https://plugins.generic-etl.io

Categories:
  Connectors:
    - etl-connector-bigquery (Google BigQuery)
    - etl-connector-redshift (Amazon Redshift)
    - etl-connector-databricks (Databricks Delta)
    - etl-connector-sap-hana (SAP HANA)
    - etl-connector-mongodb (MongoDB Atlas)
    - etl-connector-salesforce (Salesforce CRM)

  Transformations:
    - etl-transform-ml-score (call SageMaker/AzureML endpoint)
    - etl-transform-currency-convert (live FX rates)
    - etl-transform-address-validate (USPS/Loqate API)

  Rule Packs:
    - etl-rules-sap (SAP Business Warehouse expressions)
    - etl-rules-oracle-odiex (Oracle ODI expressions)
    - etl-rules-datastage (IBM DataStage expressions)
```

---

## 8. Schema Evolution & Backward Compatibility

### 8.1 Version Detection

```python
# framework/config/loader.py
def load_config(path: Path) -> dict:
    config = yaml.safe_load(path.read_text())
    version = config.get("version", "1.0")

    if version == "1.0":
        return _migrate_v1_to_v2(config)   # auto-upgrade
    elif version == "2.0":
        return config
    else:
        raise ValueError(f"Unsupported config version: {version}")

def _migrate_v1_to_v2(config: dict) -> dict:
    """Upgrade v1 config (source/sink) to v2 (sources[]/targets[])."""
    if "source" in config and "sources" not in config:
        config["sources"] = [{"id": "src", **config.pop("source")}]
    if "sink" in config and "targets" not in config:
        config["targets"] = [{"id": "tgt", **config.pop("sink"), "input": config["transformations"][-1]["id"] if config.get("transformations") else "src"}]
    config["version"] = "2.0"
    return config
```

### 8.2 Deprecation Policy

```
Version bump policy:
  Patch (1.0.x): Bug fixes; no config changes
  Minor (1.x.0): New optional config keys; backward compatible
  Major (x.0.0): Removed/renamed required keys; migration guide provided

Deprecation timeline:
  Deprecated in v2.0 → Warning in v2.1 → Removed in v3.0 (minimum 6 months)

Currently deprecated (v2.0):
  - "source" key (use "sources": [])    ← warn, auto-migrate
  - "sink" key (use "targets": [])      ← warn, auto-migrate
  - POC connector names: "csv_file"     ← warn, redirect to "csv"
```

---

## 9. Canonical Transform Taxonomy (Complete)

Full canonical naming reference:

| Canonical Name | Informatica Equivalent | ADF Equivalent | SSIS Equivalent |
|---|---|---|---|
| `row_filter` | Filter | Filter | Conditional Split |
| `column_derive` | Expression | DerivedColumn | Derived Column |
| `lookup_enrich` | Lookup, Lookup Procedure | Lookup | Lookup |
| `stream_join` | Joiner | Join | Merge Join |
| `aggregate` | Aggregator | Aggregate | Aggregate |
| `row_sort` | Sorter | Sort | Sort |
| `union_all` | Union | Union | Union All |
| `route_split` | Router | ConditionalSplit | Conditional Split |
| `column_select` | — | Select | — |
| `scd_type_1` | UpdateStrategy(UPDATEOVERRIDE) | AlterRow | Slowly Changing Dimension (Type 1) |
| `scd_type_2` | UpdateStrategy(SCD2) | — | Slowly Changing Dimension (Type 2) |
| `row_deduplicate` | — | — | — |
| `data_convert` | — | cast() | Data Conversion |
| `sequence_generate` | Sequence Generator | — | — |
| `rank` | Rank | rank() | — |
| `window_fn` | — | window() | — |
| `pivot` | — | Pivot | Pivot |
| `unpivot` | Normalizer | Unpivot | Unpivot |
| `mask_pii` | — | — | — |
| `data_validate` | — | — | — |
| `python_fn` | Java Transformation | Script | Script Component |
| `flatten_json` | — | Flatten | — |
