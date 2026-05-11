# Enterprise ETL Modernization — Low-Level Design

**Document Type:** Low-Level Design (LLD)
**Version:** 1.0
**Date:** 2026-05-11
**Status:** Draft — Engineering Review
**Audience:** Senior Engineers, Platform Team, Data Engineers

---

## 1. Purpose

This document describes the internal implementation design for the Generic ETL platform components: module structures, class hierarchies, data schemas, algorithm designs, error handling contracts, and integration patterns. It serves as the engineering reference during implementation.

---

## 2. Framework — Internal Module Structure

```
framework/
├── __init__.py
├── runner.py                    # CLI entry point (argparse → lifecycle)
│
├── config/
│   ├── __init__.py
│   ├── loader.py                # ConfigLoader: loads YAML from any backend
│   ├── validator.py             # ConfigValidator: JSON Schema validation
│   ├── resolver.py              # ParameterResolver: watermarks, secrets, vars
│   ├── policy.py                # PolicyEnforcer: tier rules, PII, governance
│   └── schema.json              # Versioned JSON Schema (draft-7)
│
├── connectors/
│   ├── __init__.py
│   ├── base.py                  # BaseConnector ABC + ConnectorRegistry
│   ├── sqlite.py                # SQLiteConnector (dev / POC)
│   ├── csv_file.py              # CsvFileConnector
│   ├── postgres.py              # PostgresConnector
│   ├── sqlserver.py             # SqlServerConnector (pyodbc)
│   ├── oracle.py                # OracleConnector (cx_Oracle)
│   ├── s3.py                    # S3Connector (fsspec + s3fs)
│   └── (future: azure_blob, mainframe_sftp, kafka, ...)
│
├── transformations/
│   ├── __init__.py
│   ├── base.py                  # BaseTransformation ABC + TransformRegistry
│   ├── filter.py                # FilterTransformation
│   ├── expression.py            # ExpressionTransformation
│   ├── lookup.py                # LookupTransformation (with LookupCache)
│   ├── joiner.py                # JoinerTransformation
│   ├── aggregator.py            # AggregatorTransformation
│   ├── scd_type_2.py            # ScdType2Transformation
│   ├── update_strategy.py       # UpdateStrategyTransformation
│   └── (future: router, union, mask_pii, ...)
│
└── execution/
    ├── __init__.py
    ├── engine.py                # ExecutionEngine: plan build + execute
    ├── plan.py                  # ExecutionPlan: DAG of nodes
    ├── backends/
    │   ├── pandas_backend.py    # PandasExecutor
    │   ├── spark_backend.py     # SparkExecutor
    │   └── dbt_backend.py       # DbtExecutor
    ├── watermark.py             # WatermarkManager
    ├── validation.py            # ValidationEngine
    └── observability.py         # Logging, metrics, tracing, lineage
```

---

## 3. Framework — Class Designs

### 3.1 BaseConnector

```python
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional
import pandas as pd

@dataclass
class ConnectorConfig:
    connector_type: str
    connection_ref: str          # Reference to secrets backend key
    extra: dict                  # Connector-specific config (table, query, etc.)

@dataclass
class WriteResult:
    rows_written: int
    rows_rejected: int
    duration_ms: int

@dataclass
class Schema:
    columns: list[ColumnDef]     # name, type, nullable, pii_flag

class BaseConnector(ABC):
    """
    Abstract base for all source and target connectors.
    Implementations must be stateless (instantiated fresh per job run).
    """

    @abstractmethod
    def read(self, config: ConnectorConfig, params: dict) -> pd.DataFrame:
        """Execute read operation; params contains resolved watermarks and variables."""

    @abstractmethod
    def write(self, df: pd.DataFrame, config: ConnectorConfig,
              strategy: str) -> WriteResult:
        """Write DataFrame to target using specified load strategy."""

    @abstractmethod
    def test_connection(self, config: ConnectorConfig) -> bool:
        """Validate connectivity; used in dry-run mode."""

    @abstractmethod
    def schema(self, config: ConnectorConfig) -> Schema:
        """Return column schema; used for lineage and validation."""

    def supported_load_strategies(self) -> list[str]:
        """Override to declare supported strategies; default: append, overwrite."""
        return ["append", "overwrite"]

    def retry_policy(self) -> dict:
        """Override to customize retry behavior."""
        return {"max_attempts": 3, "backoff_seconds": [2, 4, 8]}
```

### 3.2 BaseTransformation

```python
from abc import ABC, abstractmethod
from dataclasses import dataclass
import pandas as pd

@dataclass
class TransformConfig:
    transform_id: str
    transform_type: str
    input_id: str
    extra: dict                  # Type-specific config

@dataclass
class ValidationError:
    field: str
    message: str
    severity: str                # error | warning

class BaseTransformation(ABC):
    """
    Abstract base for all transformation plugins.
    apply() must be pure (no side effects; same input → same output).
    """

    @abstractmethod
    def apply(self, df: pd.DataFrame, config: TransformConfig) -> pd.DataFrame:
        """Apply transformation; must not modify input DataFrame."""

    @abstractmethod
    def validate_config(self, config: TransformConfig) -> list[ValidationError]:
        """Validate config at plan-build time; return errors before execution starts."""

    def schema_out(self, schema_in: Schema,
                   config: TransformConfig) -> Schema:
        """
        Return output schema given input schema and config.
        Default: pass-through (same schema as input).
        Override for transformations that add or remove columns.
        """
        return schema_in
```

### 3.3 ExecutionEngine

```python
class ExecutionEngine:
    """
    Orchestrates a single job run: load config, build plan, execute, validate.
    One instance per job invocation. Not reusable across jobs.
    """

    def __init__(self, config: JobConfig, run_id: str):
        self.config = config
        self.run_id = run_id
        self.logger = StructuredLogger(job=config.job.name, run_id=run_id)
        self.metrics = MetricsEmitter(job=config.job.name)
        self.lineage = LineageEmitter(job=config.job.name, run_id=run_id)

    def run(self) -> RunResult:
        """
        Full job lifecycle:
        1. Resolve parameters (watermarks, secrets)
        2. Build execution plan (DAG of nodes)
        3. Select backend
        4. Execute plan
        5. Run post-execution validations
        6. Update watermarks (on success only)
        7. Emit lineage events
        """
        try:
            params = self._resolve_parameters()
            plan = self._build_plan(params)
            backend = self._select_backend(plan)
            result_df = backend.execute(plan)
            self._validate(result_df)
            self._update_watermarks()
            self._emit_lineage()
            return RunResult(status="success", rows_out=len(result_df))
        except ValidationError as e:
            self._emit_failure("validation", e)
            raise
        except ConnectorError as e:
            self._emit_failure("connector", e)
            raise
        except Exception as e:
            self._emit_failure("unexpected", e)
            raise

    def _build_plan(self, params: dict) -> ExecutionPlan:
        """
        Build DAG of ExecutionNode objects from config.
        Validates: no cycles, all input references resolve, all plugin types known.
        """
        ...

    def _select_backend(self, plan: ExecutionPlan) -> BaseBackend:
        """
        Select execution backend:
        - explicit config.execution_backend != "auto" → use as specified
        - auto: estimate source rows; use Spark if > SPARK_THRESHOLD (default 10M)
        """
        ...
```

### 3.4 ParameterResolver

```python
class ParameterResolver:
    """
    Resolves all parameters in a job config before execution.
    Resolution order: explicit value > environment variable > watermark > default.
    """

    def resolve(self, config: JobConfig) -> dict:
        """
        Returns a flat dict of {param_name: resolved_value}.
        Raises ParameterResolutionError if a required parameter cannot be resolved.
        """
        resolved = {}
        for name, spec in config.job.parameters.items():
            if spec.source == "watermark":
                value = self._resolve_watermark(spec.watermark_key, spec.default)
            elif spec.source == "secret":
                value = self._resolve_secret(spec.secret_path)
            elif spec.source == "env":
                value = os.environ.get(spec.env_var, spec.default)
            else:
                value = spec.value
            resolved[name] = self._cast(value, spec.type)
        return resolved

    def _resolve_watermark(self, key: str, default: Any) -> Any:
        """Query etl_watermarks table; return default if key not found."""
        ...

    def _resolve_secret(self, path: str) -> str:
        """
        Delegate to SecretsBackend implementation.
        AWS: boto3 SecretsManager.get_secret_value()
        GCP: google.cloud.secretmanager_v1.SecretManagerServiceClient
        Vault: hvac.Client.secrets.kv.read_secret_version()
        """
        return self.secrets_backend.get(path)
```

---

## 4. Framework — YAML Schema (v1.0 — Full Specification)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://etl.internal/schema/job/v1",
  "title": "Generic ETL Job Configuration",
  "type": "object",
  "required": ["version", "job", "sources", "targets"],
  "additionalProperties": false,

  "properties": {
    "version": {
      "type": "string",
      "enum": ["1.0"],
      "description": "Schema version; increment major for breaking changes"
    },

    "job": {
      "type": "object",
      "required": ["name", "domain", "owner", "pipeline_tier"],
      "properties": {
        "name":                  { "type": "string", "pattern": "^[a-z][a-z0-9_]*$" },
        "domain":                { "type": "string" },
        "owner":                 { "type": "string" },
        "description":           { "type": "string" },
        "data_classification":   { "type": "string", "enum": ["public", "internal", "confidential", "restricted"] },
        "pipeline_tier":         { "type": "string", "enum": ["P0", "P1", "P2", "P3"] },
        "contains_pii":          { "type": "boolean", "default": false },
        "retention_class":       { "type": "string" },
        "execution_backend":     { "type": "string", "enum": ["auto", "pandas", "spark", "dbt"], "default": "auto" },
        "resource_profile":      { "type": "string", "enum": ["small", "medium", "large", "xlarge"], "default": "medium" },
        "timeout_minutes":       { "type": "integer", "minimum": 1, "maximum": 1440 },
        "max_retries":           { "type": "integer", "minimum": 0, "maximum": 5 },
        "parameters":            { "type": "object", "additionalProperties": { "$ref": "#/$defs/parameter" } }
      }
    },

    "sources": {
      "type": "array",
      "minItems": 1,
      "items": { "$ref": "#/$defs/source" }
    },

    "transformations": {
      "type": "array",
      "items": { "$ref": "#/$defs/transformation" }
    },

    "targets": {
      "type": "array",
      "minItems": 1,
      "items": { "$ref": "#/$defs/target" }
    },

    "validations": {
      "type": "array",
      "items": { "$ref": "#/$defs/validation_rule" }
    },

    "watermark": {
      "type": "object",
      "properties": {
        "key":         { "type": "string" },
        "update_expr": { "type": "string" }
      }
    },

    "error_handling": {
      "type": "object",
      "properties": {
        "on_transform_failure": { "type": "string", "enum": ["fail", "skip", "dead_letter"] },
        "dead_letter_target":   { "type": "string" }
      }
    }
  },

  "$defs": {
    "parameter": {
      "type": "object",
      "required": ["type", "source"],
      "properties": {
        "type":          { "type": "string", "enum": ["string", "integer", "float", "timestamp", "boolean"] },
        "source":        { "type": "string", "enum": ["static", "env", "watermark", "secret", "airflow_variable"] },
        "value":         {},
        "env_var":       { "type": "string" },
        "watermark_key": { "type": "string" },
        "secret_path":   { "type": "string" },
        "default":       {}
      }
    },

    "source": {
      "type": "object",
      "required": ["id", "connector", "connection"],
      "properties": {
        "id":          { "type": "string" },
        "connector":   { "type": "string" },
        "connection":  { "type": "string", "description": "Secrets backend reference; never raw credentials" },
        "query":       { "type": "string" },
        "table":       { "type": "string" },
        "file_path":   { "type": "string" },
        "format":      { "type": "string", "enum": ["csv", "parquet", "json", "fixed_width", "ebcdic"] },
        "cache":       { "type": "boolean", "default": false }
      }
    },

    "transformation": {
      "type": "object",
      "required": ["id", "type", "input"],
      "properties": {
        "id":    { "type": "string" },
        "type":  { "type": "string" },
        "input": { "oneOf": [{ "type": "string" }, { "type": "array", "items": { "type": "string" } }] }
      },
      "allOf": [
        { "if": { "properties": { "type": { "const": "filter" } } },
          "then": { "required": ["condition"], "properties": { "condition": { "type": "string" } } } },
        { "if": { "properties": { "type": { "const": "expression" } } },
          "then": { "required": ["derivations"], "properties": {
            "derivations": { "type": "object", "additionalProperties": { "type": "string" } } } } },
        { "if": { "properties": { "type": { "const": "lookup" } } },
          "then": { "required": ["lookup", "join_keys"],
            "properties": {
              "lookup": { "type": "object", "required": ["connector", "connection", "table"],
                "properties": { "cache": { "type": "string", "enum": ["none", "static", "ttl"] } } },
              "join_keys": { "type": "array", "items": { "type": "object",
                "required": ["left", "right"], "properties": {
                  "left": { "type": "string" }, "right": { "type": "string" } } } },
              "return_columns": { "type": "array", "items": { "type": "string" } },
              "lookup_not_found": { "type": "string", "enum": ["null", "reject", "default"] }
            } } },
        { "if": { "properties": { "type": { "const": "scd_type_2" } } },
          "then": { "required": ["natural_key", "tracked_columns"],
            "properties": {
              "natural_key":          { "type": "array", "items": { "type": "string" } },
              "tracked_columns":      { "type": "array", "items": { "type": "string" } },
              "effective_from":       { "type": "string" },
              "effective_to":         { "type": "string" },
              "current_flag_column":  { "type": "string" },
              "surrogate_key":        { "type": "string" }
            } } }
      ]
    },

    "target": {
      "type": "object",
      "required": ["id", "connector", "connection", "input"],
      "properties": {
        "id":              { "type": "string" },
        "connector":       { "type": "string" },
        "connection":      { "type": "string" },
        "table":           { "type": "string" },
        "file_path":       { "type": "string" },
        "input":           { "type": "string" },
        "load_strategy":   { "type": "string",
          "enum": ["append", "overwrite", "upsert", "scd_type_2_merge", "merge_on_key"] },
        "upsert_keys":     { "type": "array", "items": { "type": "string" } },
        "commit_interval": { "type": "integer", "minimum": 100, "maximum": 1000000 }
      }
    },

    "validation_rule": {
      "type": "object",
      "required": ["type", "severity"],
      "properties": {
        "type":      { "type": "string",
          "enum": ["row_count_min", "row_count_max", "no_nulls", "unique",
                   "unique_current_records", "referential_integrity", "regex_match",
                   "value_range", "custom_sql"] },
        "severity":  { "type": "string", "enum": ["error", "warning"] },
        "threshold": { "type": "number" },
        "columns":   { "type": "array", "items": { "type": "string" } },
        "filter":    { "type": "string" },
        "key":       { "type": "string" },
        "sql":       { "type": "string" }
      }
    }
  }
}
```

---

## 5. Framework — SCD Type 2 Algorithm

The `ScdType2Transformation` implements slowly changing dimension logic. This is the most complex transformation — detailed here for engineering clarity.

```
INPUTS:
  df_incoming:    DataFrame of incoming records (after all prior transforms)
  df_current:     DataFrame of current dimension records (loaded from target)
  natural_key:    List of column names forming the business key
  tracked_cols:   List of column names that trigger a new version when changed
  effective_from: Column name for version start timestamp (from incoming df)
  effective_to:   Column name for version end timestamp (written as NULL for current)
  current_flag:   Column name for current record indicator ('Y' / 'N')
  surrogate_key:  Column name for generated surrogate key (UUID or sequence)

ALGORITHM:
  1. MERGE DETECTION
     For each incoming record:
     a. Match against df_current on natural_key WHERE current_flag = 'Y'
     b. Case: No match found → NEW RECORD (insert)
     c. Case: Match found, tracked_cols unchanged → NO CHANGE (skip)
     d. Case: Match found, tracked_cols changed → VERSION CHANGE (expire + insert)

  2. BUILD OUTPUT DATAFRAME
     df_expire:  Current records that need to be expired
                 SET effective_to = incoming.effective_from
                 SET current_flag = 'N'

     df_insert:  New records to insert (new + version changes)
                 SET effective_from = incoming.effective_from
                 SET effective_to = NULL (open-ended)
                 SET current_flag = 'Y'
                 SET surrogate_key = generate_surrogate()

     df_out = CONCAT(df_expire, df_insert)

  3. LOAD STRATEGY: scd_type_2_merge
     Target connector handles df_out:
     - Rows with current_flag = 'N': UPDATE existing records (expire them)
     - Rows with current_flag = 'Y': INSERT new records

EXAMPLE:
  dim_customer current state:
    customer_key  customer_id  full_name     current_flg  effective_from
    1001          C001         "John Smith"  Y            2024-01-01

  Incoming record:
    customer_id   full_name
    C001          "John Doe"   ← name changed

  Output df:
    customer_key  customer_id  full_name    current_flg  effective_from  effective_to
    1001          C001         "John Smith"  N           2024-01-01      2026-05-11    ← expire
    1002          C001         "John Doe"    Y           2026-05-11      NULL          ← new ver
```

---

## 6. Framework — Error Handling Contract

```
EXCEPTION HIERARCHY:
  EtlError (base)
  ├── ConfigError
  │   ├── SchemaValidationError  → user error; report config file + line number
  │   └── ParameterResolutionError → config error; report missing param name
  ├── ConnectorError
  │   ├── ConnectionError        → retryable; apply retry policy
  │   ├── QueryError             → not retryable; report query + error
  │   └── WriteError             → may be retryable; dead-letter on final fail
  ├── TransformationError
  │   ├── ExpressionError        → not retryable; report expression + row
  │   └── SchemaError            → config bug; report column names
  └── ValidationError
      ├── RowCountError          → terminal; job fails clean
      └── DataQualityError       → configurable: fail or warn

ERROR HANDLING PER TIER:
  on_transform_failure: "fail"         → default; job exits non-zero on first error
  on_transform_failure: "skip"         → skip offending row; log + metric
  on_transform_failure: "dead_letter"  → route offending row to dead_letter_target

RETRY POLICY (per connector):
  Default: 3 attempts; backoff 2s → 4s → 8s
  ConnectorError: retryable
  QueryError:     not retryable
  WriteError:     retryable for network errors; not for constraint violations

CIRCUIT BREAKER:
  State: CLOSED (normal) → OPEN (failing) → HALF_OPEN (testing recovery)
  Opens: 5 consecutive ConnectorErrors in < 60 seconds
  Half-opens: after 30 seconds
  Closes: on successful request in HALF_OPEN state

DEAD LETTER:
  Schema: (job_name, run_id, stage, row_json, error_message, error_type, ts)
  Target: configured dead_letter_target connector (any valid connector type)
  Guarantee: dead-letter write attempted before job failure; best-effort
```

---

## 7. Framework — Watermark Manager

```python
class WatermarkManager:
    """
    Manages incremental load bookmarks.
    All reads/writes are transactional; updates committed only on job success.
    """

    # DDL (executed on first use):
    CREATE_TABLE = """
    CREATE TABLE IF NOT EXISTS etl_watermarks (
        key         VARCHAR(255) PRIMARY KEY,
        last_value  JSONB        NOT NULL,
        updated_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
        updated_by  VARCHAR(255) NOT NULL,
        run_id      VARCHAR(64)
    )
    """

    def read(self, key: str, default: Any) -> Any:
        """
        Returns current watermark value or default if not set.
        Uses advisory lock (pg_advisory_lock) to prevent concurrent reads
        during a write — ensures exactly-once on P0 pipelines.
        """
        ...

    def write(self, key: str, value: Any, run_id: str) -> None:
        """
        Updates watermark.
        MUST be called only after all validations pass.
        MUST be called within the same transaction as the target write
        for ACID connectors; or in a separate atomic step for others.
        """
        ...

    def rollback(self, key: str) -> None:
        """
        Used in error handler: reverts watermark to pre-job value.
        Prevents orphaned watermarks after job failure.
        """
        ...
```

---

## 8. Migration Agent — IR Schema (Full)

```python
from dataclasses import dataclass, field
from typing import Optional, Any
from enum import Enum

class SourceType(str, Enum):
    SQLSERVER = "sqlserver"; POSTGRES = "postgres"; ORACLE = "oracle"
    S3 = "s3"; MAINFRAME = "mainframe_sftp"; AZURE_SQL = "azure_sql"
    CSV = "csv_file"; SQLITE = "sqlite"

class TransformType(str, Enum):
    FILTER = "filter"; LOOKUP = "lookup"; EXPRESSION = "expression"
    JOINER = "joiner"; AGGREGATOR = "aggregator"; SCD_TYPE_2 = "scd_type_2"
    UPDATE_STRATEGY = "update_strategy"; ROUTER = "router"

class LoadStrategy(str, Enum):
    APPEND = "append"; OVERWRITE = "overwrite"
    UPSERT = "upsert"; SCD_TYPE_2_MERGE = "scd_type_2_merge"

@dataclass
class ExpressionTranslation:
    source_dialect: str          # "informatica" | "adf" | ...
    source_expression: str       # Original expression verbatim
    ast: dict                    # Parsed expression tree (language-neutral)
    sql_output: Optional[str]    # SQL translation
    python_output: Optional[str] # Python/pandas translation
    confidence: float            # 0.0 - 1.0
    translation_method: str      # "deterministic" | "llm" | "manual"
    llm_model: Optional[str]     # Model used if translation_method == "llm"
    review_required: bool        # True if confidence < threshold

@dataclass
class IRPort:
    name: str
    expression: Optional[ExpressionTranslation]
    data_type: Optional[str]

@dataclass
class IRSource:
    id: str
    system_type: SourceType
    connection_ref: str          # No credentials; reference only
    extraction_type: str         # "table" | "query" | "file" | "api"
    table: Optional[str]
    query: Optional[str]
    file_path: Optional[str]
    columns: list[IRPort]
    incremental: bool
    watermark_column: Optional[str]
    watermark_ref: Optional[str]

@dataclass
class IRTransformation:
    id: str
    original_name: str           # Name in source system
    type: TransformType
    inputs: list[str]            # IDs of upstream nodes
    ports: list[IRPort]          # Columns / expressions
    properties: dict             # Type-specific properties
    complexity_contribution: int # 1-3; summed for total job score

@dataclass
class IRTarget:
    id: str
    system_type: SourceType
    connection_ref: str
    table: Optional[str]
    file_path: Optional[str]
    load_strategy: LoadStrategy
    upsert_keys: list[str]
    input: str                   # ID of upstream transformation or source

@dataclass
class ComplexityAssessment:
    score: int                   # 1 (trivial) to 5 (highly complex)
    pattern: str                 # Recognized pattern name
    factors: list[str]           # e.g., ["nested_iif", "composite_scd2_key"]
    conversion_strategy: str     # "auto_convert" | "auto_with_review" | "manual"
    estimated_effort_hours: float
    risk_flags: list[str]

@dataclass
class IR:
    ir_version: str              # "1.0"
    source_origin: dict          # {type, artifact_id, exported_at}
    job: dict                    # {id, name, description, domain}
    sources: list[IRSource]
    transformations: list[IRTransformation]
    targets: list[IRTarget]
    parameters: list[dict]
    dependencies: dict           # {upstream_jobs, downstream_jobs}
    complexity: ComplexityAssessment
    warnings: list[str]
    ai_notes: list[str]
```

---

## 9. Migration Agent — Expression Translator Algorithm

```
INPUT:  source_expression: str  (e.g., "IIF(STATUS='A', 'ACTIVE', 'INACTIVE')")
        source_dialect: str      (e.g., "informatica")
        output_dialect: str      (e.g., "sql")

STEP 1: LEXER
  Tokenize expression into: IDENT, LITERAL, OPERATOR, LPAREN, RPAREN, COMMA, PARAM
  Handle dialect-specific quoting, date literals, port references

STEP 2: PARSER (recursive descent)
  Build AST:
  FunctionCall(name="IIF", args=[
    BinaryOp(op="=", left=Column("STATUS"), right=Literal("A")),
    Literal("ACTIVE"),
    Literal("INACTIVE")
  ])

STEP 3: RULE MATCHER (deterministic patterns)
  Pattern registry (ordered; first match wins):

  INFORMATICA PATTERNS:
  ┌──────────────────────────────────────────┬─────────────────────────────────────────┐
  │  Pattern                                 │  SQL Output                             │
  ├──────────────────────────────────────────┼─────────────────────────────────────────┤
  │  IIF(cond, true_val, false_val)          │  CASE WHEN cond THEN true_val           │
  │                                          │       ELSE false_val END                │
  │  ISNULL(x)                               │  x IS NULL                              │
  │  NVL(x, default)                         │  COALESCE(x, default)                   │
  │  CONCAT(a, b, ...)                       │  CONCAT(a, b, ...)  or a || b           │
  │  LTRIM(x) / RTRIM(x) / LTRIM(RTRIM(x))  │  LTRIM(x) / RTRIM(x) / TRIM(x)         │
  │  TO_DATE(str, fmt)                       │  TO_DATE(str, fmt)  (dialect-aware)     │
  │  TO_INTEGER(x)                           │  CAST(x AS INTEGER)                     │
  │  TO_DECIMAL(x, p, s)                     │  CAST(x AS DECIMAL(p,s))               │
  │  ADD_TO_DATE(date, interval, n)          │  date + INTERVAL 'n' interval           │
  │  TRUNC(x)                                │  TRUNC(x) / FLOOR(x)                    │
  │  IN(val, list...)                        │  val IN (list)                          │
  │  SUBSTR(str, start, len)                 │  SUBSTRING(str FROM start FOR len)      │
  │  LENGTH(str)                             │  LENGTH(str) / LEN(str)                 │
  │  UPPER/LOWER(str)                        │  UPPER/LOWER(str)                       │
  │  Operator =  → ==                        │  =                                      │
  │  Operator <> → !=                        │  <>  or  !=                             │
  └──────────────────────────────────────────┴─────────────────────────────────────────┘

  If ALL nodes matched: return translated expression, confidence = 0.95–0.99

STEP 4: LLM FALLBACK (for unmatched nodes)
  a. RAG retrieval: embed expression features → query vector store for top-5 similar
  b. Build prompt:
     System: "You are an ETL expression translator. Convert Informatica expressions
              to standard SQL. Return ONLY the SQL expression, no explanation."
     Few-shot: [retrieved examples from vector store]
     User: "Translate: {unmatched_expression}"
  c. Parse LLM response; validate as syntactically valid SQL
  d. Run expression against 10 sample input rows; compare to legacy result
  e. Assign confidence: 0.75 (base) + 0.10 (if sample test passes)
  f. Set review_required = True if confidence < 0.85

STEP 5: OUTPUT
  ExpressionTranslation {
    source_expression: original
    ast: parsed tree
    sql_output: translated expression
    confidence: 0.0-1.0
    translation_method: "deterministic" | "llm"
    review_required: True if confidence < 0.85
  }
```

---

## 10. Migration Agent — State Machine (LangGraph)

```python
# State machine nodes (each is a LangGraph node)

class ConversionState(TypedDict):
    artifact_id: str
    source_type: str
    raw_artifact_path: str
    ir: Optional[dict]
    translations: Optional[dict]
    generated_artifacts: Optional[dict]
    validation_results: Optional[dict]
    pr_url: Optional[str]
    confidence: Optional[float]
    status: str
    errors: list[str]
    human_approvals: dict         # gate_name → {approved_by, approved_at}

# Graph definition
workflow = StateGraph(ConversionState)

# Add nodes
workflow.add_node("ingest",      ingest_artifact)
workflow.add_node("parse",       parse_to_ir)
workflow.add_node("analyze",     analyze_ir)
workflow.add_node("translate",   translate_expressions)
workflow.add_node("generate",    generate_artifacts)
workflow.add_node("validate",    validate_artifacts)
workflow.add_node("review",      create_review_pr)
workflow.add_node("await_gate",  await_human_gate)   # HITL interrupt node
workflow.add_node("shadow_run",  run_shadow_comparison)

# Add edges with conditional routing
workflow.add_edge(START, "ingest")
workflow.add_edge("ingest", "parse")
workflow.add_conditional_edges("parse", route_after_parse, {
    "success":     "analyze",
    "parse_error": "manual_queue"
})
workflow.add_conditional_edges("analyze", route_after_analyze, {
    "auto_convert":        "translate",
    "manual_required":     "manual_queue",
    "gate_1_required":     "await_gate"       # First 10% of batch: calibration gate
})
workflow.add_edge("translate", "generate")
workflow.add_edge("generate", "validate")
workflow.add_conditional_edges("validate", route_after_validate, {
    "pass":         "review",
    "warn":         "review",                  # warnings: proceed with flag
    "fail":         "manual_queue"
})
workflow.add_edge("review", "await_gate")     # Gate 2: engineering review
workflow.add_conditional_edges("await_gate", route_after_gate, {
    "approved":     "shadow_run",
    "rejected":     "translate"               # Back to translation with feedback
})
workflow.add_edge("shadow_run", "await_gate") # Gate 4: reconciliation sign-off

# Compile with PostgreSQL checkpointing for durable state
app = workflow.compile(checkpointer=PostgresSaver(conn=audit_db_conn))
```

---

## 11. Database Schemas

### 11.1 Watermark Registry

```sql
CREATE TABLE etl_watermarks (
    key         VARCHAR(255) PRIMARY KEY,
    last_value  JSONB        NOT NULL,
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_by  VARCHAR(255) NOT NULL,   -- job_name that last updated
    run_id      VARCHAR(64)              -- run_id that last updated
);

CREATE INDEX idx_watermarks_updated_at ON etl_watermarks(updated_at);
```

### 11.2 Agent Audit Database

```sql
-- Tracks every conversion job through its lifecycle
CREATE TABLE agent_conversions (
    conversion_id   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    artifact_id     VARCHAR(255) NOT NULL,
    source_type     VARCHAR(50)  NOT NULL,
    wave            VARCHAR(50),
    status          VARCHAR(50)  NOT NULL,
    confidence      FLOAT,
    complexity_score INT,
    pattern         VARCHAR(100),
    pr_url          TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Immutable audit log of all LLM calls
CREATE TABLE agent_llm_audit (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    conversion_id   UUID         REFERENCES agent_conversions(conversion_id),
    stage           VARCHAR(50)  NOT NULL,
    model           VARCHAR(100) NOT NULL,
    prompt_hash     VARCHAR(64)  NOT NULL,   -- SHA-256; full prompt in S3
    response_hash   VARCHAR(64)  NOT NULL,   -- SHA-256; full response in S3
    tokens_in       INT          NOT NULL,
    tokens_out      INT          NOT NULL,
    cost_usd        FLOAT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Human gate decisions
CREATE TABLE agent_gate_decisions (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    conversion_id   UUID         REFERENCES agent_conversions(conversion_id),
    gate_number     INT          NOT NULL,
    decision        VARCHAR(20)  NOT NULL,   -- approved | rejected
    reviewer        VARCHAR(100) NOT NULL,
    notes           TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- LLM prompts and responses stored in S3 (audit trail)
-- Path: s3://etl-agent-audit/llm/{conversion_id}/{stage}/{timestamp}/prompt.txt
--        s3://etl-agent-audit/llm/{conversion_id}/{stage}/{timestamp}/response.txt
```

### 11.3 Pipeline Metrics (Prometheus long-term storage)

All Prometheus metrics written to Amazon Managed Prometheus (AMP) with 15-month retention. Key recording rules pre-computed for dashboard performance:

```yaml
# recording_rules.yaml
groups:
  - name: etl_job_sla
    interval: 5m
    rules:
      - record: etl:job:success_rate_1h
        expr: rate(etl_job_success_total[1h]) / rate(etl_job_total[1h])

      - record: etl:job:p99_duration_1h
        expr: histogram_quantile(0.99, rate(etl_job_duration_seconds_bucket[1h]))

      - record: etl:tier:availability_30d
        expr: >
          avg_over_time(
            (sum by (tier) (rate(etl_job_success_total[5m]))
            / sum by (tier) (rate(etl_job_total[5m])))[30d:5m]
          )
```

---

## 12. CI/CD Pipeline Design

```
On PR:
  ├── lint (ruff, black --check)
  ├── type-check (mypy --strict)
  ├── unit tests (pytest tests/unit/ --cov=framework --cov=agent --cov-fail-under=80)
  ├── integration tests (pytest tests/integration/ — requires Docker Compose services)
  ├── SAST (bandit -r framework/ agent/)
  ├── dependency scan (pip-audit)
  ├── YAML schema validation (validate all configs in jobs/ against schema.json)
  └── image build (docker build --no-cache — builds but does not push on PR)

On merge to main:
  ├── all PR checks (above)
  ├── image build + push to ECR (dev tag)
  ├── image sign (cosign sign)
  ├── integration smoke test against dev EKS
  └── update S3 configs (sync jobs/ to s3://etl-configs-dev/)

On release tag (vX.Y.Z):
  ├── all above
  ├── push to ECR (versioned tag + latest-stable)
  ├── update S3 configs (sync to s3://etl-configs-prod/)
  ├── Helm chart update (bump image tag in values.yaml)
  ├── ArgoCD sync (GitOps → deploys to EKS prod)
  └── release notes generated (from conventional commits)

Branch protection rules:
  main:    2 reviewers required; linear history; status checks required
  release: tag-only; no direct pushes
```

---

## 13. Plugin Registration Pattern

New connectors and transformations register themselves via Python entry-points in `pyproject.toml`:

```toml
[project.entry-points."etl.connectors"]
sqlite      = "framework.connectors.sqlite:SqliteConnector"
csv_file    = "framework.connectors.csv_file:CsvFileConnector"
postgres    = "framework.connectors.postgres:PostgresConnector"
sqlserver   = "framework.connectors.sqlserver:SqlServerConnector"

[project.entry-points."etl.transformations"]
filter      = "framework.transformations.filter:FilterTransformation"
expression  = "framework.transformations.expression:ExpressionTransformation"
lookup      = "framework.transformations.lookup:LookupTransformation"
scd_type_2  = "framework.transformations.scd_type_2:ScdType2Transformation"
```

Registry loading (at framework startup, once per process):

```python
class ConnectorRegistry:
    _registry: dict[str, type[BaseConnector]] = {}

    @classmethod
    def load_plugins(cls) -> None:
        """Discover and register all installed connector plugins."""
        for ep in importlib.metadata.entry_points(group="etl.connectors"):
            cls._registry[ep.name] = ep.load()

    @classmethod
    def get(cls, connector_type: str) -> type[BaseConnector]:
        if connector_type not in cls._registry:
            raise PluginNotFoundError(f"Unknown connector type: {connector_type!r}")
        return cls._registry[connector_type]
```

**Result:** A third-party package can add a new connector by declaring the entry-point in its own `pyproject.toml` and installing into the same Python environment. Zero changes to framework core code required.

---

## 14. Configuration Loading Sequence

```
etl-runner --config s3://etl-configs/jobs/load_dim_customer.yaml --run-id abc123

1. CLI parses args → {config_path, run_id, dry_run, validate_only}

2. ConfigLoader.load(config_path):
   a. Detect storage backend from prefix: s3:// → S3Backend; gs:// → GCSBackend; file:// → LocalBackend
   b. Download raw YAML bytes
   c. Parse YAML → dict

3. ConfigValidator.validate(config_dict):
   a. Resolve schema version from config["version"]
   b. Load schema from embedded schema.json (version-pinned; never from network)
   c. jsonschema.validate(config_dict, schema)
   d. On error: raise SchemaValidationError with file, line, field, message

4. ParameterResolver.resolve(config):
   a. For each parameter in config.job.parameters:
      - watermark → WatermarkManager.read(key, default)
      - secret → SecretsBackend.get(path)
      - env → os.environ[var]
      - static → param.value
   b. Substitute :param_name placeholders in source queries

5. PolicyEnforcer.check(config):
   a. Tier P0/P1: require data_classification set; require contains_pii declared
   b. PII pipeline: verify mask_pii or data_classification=restricted on target
   c. Dry-run mode: skip execution; return validated plan

6. Return resolved JobConfig → ExecutionEngine
```

---

*Companion documents: Enterprise Architecture Diagrams, High-Level Design, How to Proceed.*
