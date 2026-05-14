# Control Table Pattern & Framework v2.0 Design

**Document Type:** Engineering Design — Framework Breaking Change
**Version:** 1.0
**Date:** 2026-05-13
**Triggered by:** Real ADF pipeline with control-table-driven ForEach + stored procedures
**Impact:** framework/config/schema.json, framework/execution/engine.py, framework/config/resolver.py (new), framework/execution/steps.py (new), framework/execution/watermark.py (new)

---

## 1. What the Real Pipeline Revealed — Gap Summary

### Two parser bugs (already fixed in P2c)
| Bug | Root Cause | Fix |
|---|---|---|
| Inner ForEach activities missing | ADF exports them under `typeProperties.activities`, not at root level | Read `activity["typeProperties"]["activities"]` |
| IfCondition branches invisible | `ifTrueActivities` / `ifFalseActivities` need recursive traversal | Recursive `_walk_activities()` traversing all branch types |

### Real pipeline structure (ForEach → IfCondition → Copy)
```
PL_VS_Customer_Information
├── LookupMapping          (reads CONTROL_TABLE → list of table configs)
├── Loop_TableNames        (ForEach, batchCount=4)
│   ├── check_max_date     (Script → pre_sql per table)
│   └── IfCondition        (load_type == 'full'?)
│       ├── ifTrueActivities
│       │   └── Copying_VPF_Tables_Full    (Copy — full load)
│       └── ifFalseActivities
│           └── Copying_VPF_Tables_Incr   (Copy — incremental)
└── Send_mail              (StoredProcedure → post_step)
```

### Framework gaps exposed

| Gap | Current State | Required |
|---|---|---|
| Single source only | `schema.json` has one `source` | Multiple named sources |
| Single sink only | `schema.json` has one `sink` | Multiple named targets |
| No parameters | Hardcoded table names in YAML | `{{ parameters.* }}` template substitution |
| No pre/post steps | Engine has no concept of this | SQL, stored procedure, script steps |
| No watermark management | Not in engine or schema | Read/write watermark from control table |
| No control table iteration | Engine runs once | Read N rows, run N jobs (serial or parallel) |
| No conditional load | No branching in engine | `load_type: full|incremental` switching |
| No stored procedure support | No SP connector | `type: stored_procedure` step |
| No audit logging | Single log line | Structured audit to DB table |
| Schema v1 too rigid | `required: [job, source, sink]` | v2 flexible multi-source/target |

---

## 2. IR v2.0 — Additional Fields

The IR produced by the agent must capture ALL of the above. Add these fields to the IR schema:

```json
{
  "ir_version": "2.0",
  "source_origin": {"type": "adf", "artifact_id": "..."},
  "job": {"name": "...", "schedule": "...", "pipeline_tier": "P1"},

  "parameters": {
    "source_schema":  "@item().source_schema",
    "source_table":   "@item().source_table",
    "target_schema":  "@item().target_schema",
    "target_table":   "@item().target_table",
    "watermark_col":  "@item().watermark_column",
    "load_type":      "@item().load_type"
  },

  "control_table": {
    "connection":    "ls://sqlServer",
    "connector":     "sqlserver",
    "query":         "SELECT source_schema, source_table, target_schema, target_table, watermark_column, load_type FROM dbo.CONTROL_TABLE WHERE is_active = 1",
    "param_mapping": {
      "source_schema": "source_schema",
      "source_table":  "source_table",
      "target_schema": "target_schema",
      "target_table":  "target_table",
      "watermark_col": "watermark_column",
      "load_type":     "load_type"
    },
    "parallelism": 4
  },

  "watermark": {
    "param_name":   "last_run_dt",
    "column":       "{{ parameters.watermark_col }}",
    "connector":    "sqlserver",
    "connection":   "ls://sqlServer",
    "read_query":   "SELECT COALESCE(MAX(last_run_dt),'1900-01-01') FROM dbo.ETL_WATERMARK WHERE table_name='{{ parameters.source_table }}'",
    "write_query":  "MERGE dbo.ETL_WATERMARK AS t USING (SELECT '{{ parameters.source_table }}' AS n, GETDATE() AS d) AS s ON t.table_name=s.n WHEN MATCHED THEN UPDATE SET last_run_dt=s.d WHEN NOT MATCHED THEN INSERT VALUES(s.n,s.d);"
  },

  "pre_steps": [
    {
      "id":      "check_max_date",
      "type":    "sql",
      "connector": "sqlserver",
      "connection": "ls://sqlServer",
      "sql":     "SELECT MAX({{ parameters.watermark_col }}) FROM {{ parameters.source_schema }}.{{ parameters.source_table }}",
      "capture_output": "current_max_watermark",
      "on_failure": "warn"
    }
  ],

  "post_steps": [
    {
      "id":        "send_mail",
      "type":      "stored_procedure",
      "connector": "sqlserver",
      "connection": "ls://sqlServer",
      "procedure": "dbo.usp_SendNotification",
      "params": {
        "pipeline_name": "{{ job.name }}",
        "table_name":    "{{ parameters.source_table }}",
        "row_count":     "{{ job.metrics.target_row_count }}",
        "status":        "{{ job.metrics.status }}"
      },
      "on_failure": "warn"
    },
    {
      "id":   "audit_log",
      "type": "sql",
      "connector": "sqlserver",
      "connection": "ls://sqlServer",
      "sql":  "INSERT INTO dbo.ETL_AUDIT_LOG(pipeline,table_name,run_dt,rows,status,duration_s) VALUES('{{ job.name }}','{{ parameters.source_table }}',GETDATE(),{{ job.metrics.target_row_count }},'{{ job.metrics.status }}',{{ job.metrics.duration_s }})",
      "on_failure": "warn"
    }
  ],

  "conditional_load": {
    "parameter": "load_type",
    "branches": {
      "full": {
        "source_query_override": "SELECT * FROM {{ parameters.source_schema }}.{{ parameters.source_table }}"
      },
      "incremental": {
        "source_query_override": "SELECT * FROM {{ parameters.source_schema }}.{{ parameters.source_table }} WHERE {{ parameters.watermark_col }} > :last_run_dt"
      }
    }
  },

  "sources": [{"id": "src_table", "connector": "sqlserver", "connection": "ls://sqlServer", "parameterized": true}],
  "transforms": [{"id": "filter_active", "type": "row_filter", "inputs": ["src_table"], "properties": {"condition": "status == 'ACTIVE'"}}],
  "sinks":   [{"id": "tgt_table", "connector": "azure_sql", "connection": "msi://vqevdewmi", "parameterized": true, "load_strategy": "upsert"}],

  "metadata": {
    "auto_convertible": false,
    "foreach_pattern": true,
    "parallelism": 4,
    "conversion_strategy": "parameterized_job",
    "iteration_params": ["source_schema","source_table","target_schema","target_table","watermark_column","load_type"]
  }
}
```

---

## 3. Framework YAML v2.0

### Full schema for parameterized control-table-driven job

```yaml
version: "2.0"
job:
  name: PL_VS_Customer_Information
  description: "Control table driven parameterized load — one iteration per active table"
  pipeline_tier: P1
  owner: data-platform

# ── Runtime Parameters ────────────────────────────────────────────────────────
# Values supplied via: control_table rows | --param CLI | env vars
# Usage in any string field: {{ parameters.name }}
parameters:
  source_schema:  "dbo"
  source_table:   ""            # required — no default
  target_schema:  "dbo"
  target_table:   ""            # required — no default
  watermark_col:  "updated_dt"
  load_type:      "incremental" # full | incremental

# ── Control Table (optional) ─────────────────────────────────────────────────
# If present: engine reads this table and runs the full job once per row,
# substituting each row's values into parameters before executing.
control_table:
  connector:   sqlserver
  connection:  ls://sqlServer
  query: |
    SELECT source_schema, source_table, target_schema,
           target_table, watermark_column, load_type
    FROM   dbo.CONTROL_TABLE
    WHERE  is_active = 1
    ORDER  BY execution_order
  param_mapping:
    source_schema:  source_schema    # CONTROL_TABLE column → parameter name
    source_table:   source_table
    target_schema:  target_schema
    target_table:   target_table
    watermark_col:  watermark_column
    load_type:      load_type
  parallelism: 4                     # max concurrent iterations (default: 1)
  on_failure: continue               # continue | abort (what to do if one iteration fails)

# ── Watermark Management (optional) ──────────────────────────────────────────
# Engine reads last_run_dt BEFORE sources, injects as :last_run_dt bind parameter.
# Engine writes updated watermark AFTER all sinks complete successfully.
watermark:
  param_name:   last_run_dt         # name injected into source queries as :last_run_dt
  connector:    sqlserver
  connection:   ls://sqlServer
  read_query: |
    SELECT COALESCE(MAX(last_run_dt), '1900-01-01') AS last_run_dt
    FROM   dbo.ETL_WATERMARK
    WHERE  table_name = '{{ parameters.source_table }}'
  write_query: |
    MERGE dbo.ETL_WATERMARK AS target
    USING (SELECT '{{ parameters.source_table }}' AS table_name,
                  GETDATE() AS last_run_dt) AS src
    ON    target.table_name = src.table_name
    WHEN MATCHED     THEN UPDATE SET last_run_dt = src.last_run_dt
    WHEN NOT MATCHED THEN INSERT (table_name, last_run_dt)
                          VALUES (src.table_name, src.last_run_dt);
  on_failure: warn                  # warn | raise

# ── Pre-Steps ─────────────────────────────────────────────────────────────────
# Run BEFORE sources are read. Useful for: staging truncates, max-date checks,
# variable capture, pre-load stored procedures.
pre_steps:
  - id:         check_max_date
    type:       sql                 # sql | stored_procedure | python_script
    connector:  sqlserver
    connection: ls://sqlServer
    sql: |
      SELECT MAX({{ parameters.watermark_col }}) AS current_max
      FROM   {{ parameters.source_schema }}.{{ parameters.source_table }}
    capture_output: current_max_watermark   # store scalar result as parameter
    on_failure: warn

  - id:         truncate_staging
    type:       sql
    connector:  azure_sql
    connection: msi://vqevdewmi
    sql: "TRUNCATE TABLE {{ parameters.target_schema }}.{{ parameters.target_table }}_stg"
    on_failure: warn

# ── Conditional Load ──────────────────────────────────────────────────────────
# Switches source query based on a parameter value.
# Corresponds to IfCondition in ADF.
conditional_load:
  parameter: load_type
  branches:
    full:
      source_query_override: |
        SELECT *
        FROM   {{ parameters.source_schema }}.{{ parameters.source_table }}
    incremental:
      source_query_override: |
        SELECT *
        FROM   {{ parameters.source_schema }}.{{ parameters.source_table }}
        WHERE  {{ parameters.watermark_col }} > :last_run_dt

# ── Sources ───────────────────────────────────────────────────────────────────
sources:
  - id:         src_table
    connector:  sqlserver
    connection: ls://sqlServer
    query: |
      SELECT *
      FROM   {{ parameters.source_schema }}.{{ parameters.source_table }}
      WHERE  {{ parameters.watermark_col }} > :last_run_dt
    # Note: if conditional_load is defined, query is overridden per branch

# ── Transformations ───────────────────────────────────────────────────────────
transformations:
  - id:         filter_active
    type:       row_filter
    input:      src_table
    condition:  "status == 'ACTIVE'"

  - id:         derive_fields
    type:       column_derive
    input:      filter_active
    derivations:
      full_name:  "first_name + ' ' + last_name"
      load_dt:    "pd.Timestamp.now()"

# ── Targets ───────────────────────────────────────────────────────────────────
targets:
  - id:           tgt_table
    connector:    azure_sql
    connection:   msi://vqevdewmi
    schema:       "{{ parameters.target_schema }}"
    table:        "{{ parameters.target_table }}"
    input:        derive_fields
    load_strategy: upsert
    upsert_keys:  [customer_id]

# ── Post-Steps ────────────────────────────────────────────────────────────────
# Run AFTER all targets written successfully.
post_steps:
  - id:         send_notification
    type:       stored_procedure
    connector:  sqlserver
    connection: ls://sqlServer
    procedure:  dbo.usp_SendNotification
    params:
      pipeline_name: "{{ job.name }}"
      table_name:    "{{ parameters.source_table }}"
      row_count:     "{{ job.metrics.target_row_count }}"
      status:        "{{ job.metrics.status }}"
    on_failure: warn                # don't fail the job if notification fails

  - id:         write_audit_log
    type:       sql
    connector:  sqlserver
    connection: ls://sqlServer
    sql: |
      INSERT INTO dbo.ETL_AUDIT_LOG
        (pipeline_name, table_name, run_date, rows_loaded, status, duration_s)
      VALUES (
        '{{ job.name }}',
        '{{ parameters.source_table }}',
        GETDATE(),
        {{ job.metrics.target_row_count }},
        '{{ job.metrics.status }}',
        {{ job.metrics.duration_s }}
      )
    on_failure: warn
```

---

## 4. Schema v2.0 — Full JSON Schema

Replace `framework/config/schema.json` with this v2.0 definition:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "etl-framework/job-config/v2",
  "title": "ETL Job Configuration v2.0",
  "type": "object",
  "required": ["version", "job"],
  "additionalProperties": false,
  "properties": {

    "version": { "type": "string", "enum": ["1.0", "2.0"] },

    "job": {
      "type": "object",
      "required": ["name"],
      "additionalProperties": false,
      "properties": {
        "name":          { "type": "string" },
        "description":   { "type": "string" },
        "pipeline_tier": { "type": "string", "enum": ["P0","P1","P2","P3"] },
        "owner":         { "type": "string" },
        "domain":        { "type": "string" },
        "schedule":      { "type": "string" }
      }
    },

    "parameters": {
      "type": "object",
      "additionalProperties": { "type": ["string","number","boolean","null"] }
    },

    "control_table": {
      "type": "object",
      "required": ["connector","connection","query"],
      "additionalProperties": false,
      "properties": {
        "connector":     { "type": "string" },
        "connection":    { "type": "string" },
        "query":         { "type": "string" },
        "param_mapping": { "type": "object", "additionalProperties": { "type": "string" } },
        "parallelism":   { "type": "integer", "minimum": 1, "default": 1 },
        "on_failure":    { "type": "string", "enum": ["continue","abort"], "default": "abort" }
      }
    },

    "watermark": {
      "type": "object",
      "required": ["connector","connection","read_query","write_query"],
      "additionalProperties": false,
      "properties": {
        "param_name":   { "type": "string", "default": "last_run_dt" },
        "connector":    { "type": "string" },
        "connection":   { "type": "string" },
        "read_query":   { "type": "string" },
        "write_query":  { "type": "string" },
        "on_failure":   { "type": "string", "enum": ["warn","raise"], "default": "warn" }
      }
    },

    "pre_steps":  { "$ref": "#/$defs/steps_array" },
    "post_steps": { "$ref": "#/$defs/steps_array" },

    "conditional_load": {
      "type": "object",
      "required": ["parameter","branches"],
      "additionalProperties": false,
      "properties": {
        "parameter": { "type": "string" },
        "branches": {
          "type": "object",
          "additionalProperties": {
            "type": "object",
            "properties": {
              "source_query_override": { "type": "string" }
            }
          }
        }
      }
    },

    "sources": {
      "type": "array",
      "minItems": 1,
      "items": { "$ref": "#/$defs/source_def" }
    },

    "source": { "$ref": "#/$defs/source_def" },

    "transformations": {
      "type": "array",
      "items": { "$ref": "#/$defs/transformation_def" }
    },

    "targets": {
      "type": "array",
      "minItems": 1,
      "items": { "$ref": "#/$defs/target_def" }
    },

    "sink": { "$ref": "#/$defs/target_def" }
  },

  "$defs": {
    "steps_array": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id","type","connector","connection"],
        "additionalProperties": false,
        "properties": {
          "id":             { "type": "string" },
          "type":           { "type": "string", "enum": ["sql","stored_procedure","python_script"] },
          "connector":      { "type": "string" },
          "connection":     { "type": "string" },
          "sql":            { "type": "string" },
          "procedure":      { "type": "string" },
          "script_module":  { "type": "string" },
          "script_function":{ "type": "string" },
          "params":         { "type": "object", "additionalProperties": { "type": "string" } },
          "capture_output": { "type": "string" },
          "on_failure":     { "type": "string", "enum": ["raise","warn","ignore"], "default": "raise" }
        }
      }
    },

    "source_def": {
      "type": "object",
      "required": ["connector","connection"],
      "additionalProperties": false,
      "properties": {
        "id":          { "type": "string" },
        "connector":   { "type": "string" },
        "connection":  { "type": "string" },
        "query":       { "type": "string" },
        "table":       { "type": "string" },
        "schema":      { "type": "string" },
        "file_path":   { "type": "string" },
        "format":      { "type": "string", "enum": ["csv","parquet","json","excel","fixed_width"] },
        "options":     { "type": "object" },
        "params":      { "type": "object" }
      }
    },

    "transformation_def": {
      "type": "object",
      "required": ["id","type"],
      "additionalProperties": true,
      "properties": {
        "id":    { "type": "string" },
        "type":  {
          "type": "string",
          "enum": [
            "row_filter","column_derive","lookup_enrich","stream_join","aggregate",
            "column_select","union_all","row_sort","route_split","scd_type_1","scd_type_2",
            "row_deduplicate","data_convert","sequence_generate","rank","window_fn",
            "pivot","unpivot","flatten_json","mask_pii","data_validate","python_fn",
            "row_count","fuzzy_match"
          ]
        },
        "input":  { "type": "string" },
        "inputs": { "type": "array", "items": { "type": "string" } }
      }
    },

    "target_def": {
      "type": "object",
      "required": ["connector","connection"],
      "additionalProperties": false,
      "properties": {
        "id":            { "type": "string" },
        "connector":     { "type": "string" },
        "connection":    { "type": "string" },
        "table":         { "type": "string" },
        "schema":        { "type": "string" },
        "file_path":     { "type": "string" },
        "input":         { "type": "string" },
        "load_strategy": { "type": "string", "enum": ["append","overwrite","upsert","merge_on_key","scd_type_2_merge"] },
        "upsert_keys":   { "type": "array", "items": { "type": "string" } },
        "options":       { "type": "object" }
      }
    }
  }
}
```

---

## 5. Engine v2.0 — New Components

### 5.1 `framework/config/resolver.py` — Parameter Resolver

```python
"""
ParameterResolver — resolves {{ parameters.* }} and {{ job.metrics.* }} template
variables throughout the entire config dict before execution.
"""
import re
from typing import Any


class ParameterResolver:
    """Substitutes {{ parameters.name }} and {{ job.metrics.name }} in all string values."""

    _PATTERN = re.compile(r"\{\{\s*([\w.]+)\s*\}\}")

    def __init__(self, parameters: dict[str, Any], metrics: dict[str, Any] | None = None) -> None:
        self._params = parameters
        self._metrics = metrics or {}

    def resolve(self, value: Any) -> Any:
        """Recursively resolve template variables in any value type."""
        if isinstance(value, str):
            return self._resolve_str(value)
        if isinstance(value, dict):
            return {k: self.resolve(v) for k, v in value.items()}
        if isinstance(value, list):
            return [self.resolve(v) for v in value]
        return value

    def resolve_config(self, config: dict) -> dict:
        """Resolve all template variables in the full job config dict."""
        return self.resolve(config)

    def _resolve_str(self, s: str) -> str:
        def replace(match: re.Match) -> str:
            key_path = match.group(1)         # e.g. "parameters.source_table"
            parts = key_path.split(".", 1)
            if parts[0] == "parameters" and len(parts) == 2:
                return str(self._params.get(parts[1], match.group(0)))
            if parts[0] == "job" and len(parts) == 2:
                sub = parts[1]
                if sub.startswith("metrics."):
                    metric_key = sub[len("metrics."):]
                    return str(self._metrics.get(metric_key, ""))
            return match.group(0)   # unresolved — leave as-is
        return self._PATTERN.sub(replace, s)

    def update_metrics(self, metrics: dict[str, Any]) -> None:
        """Update metrics dict (called after each engine phase)."""
        self._metrics.update(metrics)
```

---

### 5.2 `framework/execution/steps.py` — Pre/Post Step Executor

```python
"""
StepExecutor — runs pre_steps and post_steps (SQL, stored procedures, Python scripts).
"""
import logging
from typing import Any

import pandas as pd

logger = logging.getLogger(__name__)


class StepExecutor:
    """Executes pre_steps and post_steps defined in the job config."""

    def __init__(self, resolver: "ParameterResolver") -> None:
        self._resolver = resolver

    def run_steps(self, steps: list[dict], label: str, parameters: dict) -> dict:
        """
        Run a list of steps. Returns captured_outputs dict.
        label: "pre" | "post" — for logging only.
        """
        captured: dict[str, Any] = {}
        for step in steps:
            step_id = step["id"]
            step_type = step["type"]
            on_failure = step.get("on_failure", "raise")
            try:
                result = self._run_one(step)
                if step.get("capture_output") and result is not None:
                    captured[step["capture_output"]] = result
                logger.info("[%s_step] %s ✅", label, step_id)
            except Exception as exc:
                if on_failure == "warn":
                    logger.warning("[%s_step] %s failed (on_failure=warn): %s", label, step_id, exc)
                elif on_failure == "ignore":
                    pass
                else:
                    raise RuntimeError(f"{label}_step '{step_id}' failed") from exc
        return captured

    def _run_one(self, step: dict) -> Any:
        """Dispatch to the correct step type."""
        step_resolved = self._resolver.resolve(step)
        step_type = step_resolved["type"]

        if step_type == "sql":
            return self._run_sql(step_resolved)
        elif step_type == "stored_procedure":
            return self._run_stored_procedure(step_resolved)
        elif step_type == "python_script":
            return self._run_python_script(step_resolved)
        else:
            raise ValueError(f"Unknown step type: {step_type}")

    def _run_sql(self, step: dict) -> Any:
        """Execute a SQL statement. Returns scalar result if SELECT."""
        from framework.connectors import get_connector
        connector = get_connector(step["connector"])
        conn_str = step["connection"]
        sql = step["sql"]

        is_select = sql.strip().upper().startswith("SELECT")
        if is_select:
            df = connector.read({"connection": conn_str, "query": sql})
            if len(df) == 1 and len(df.columns) == 1:
                return df.iloc[0, 0]   # scalar result
            return df
        else:
            connector.execute({"connection": conn_str, "sql": sql})
            return None

    def _run_stored_procedure(self, step: dict) -> Any:
        """Execute a stored procedure via the connector's execute_procedure method."""
        from framework.connectors import get_connector
        connector = get_connector(step["connector"])
        connector.execute_procedure({
            "connection": step["connection"],
            "procedure":  step["procedure"],
            "params":     step.get("params", {}),
        })
        return None

    def _run_python_script(self, step: dict) -> Any:
        """Call a Python function as a step."""
        import importlib
        mod = importlib.import_module(step["script_module"])
        fn = getattr(mod, step["script_function"])
        return fn(step.get("params", {}))
```

---

### 5.3 `framework/execution/watermark.py` — Watermark Manager

```python
"""
WatermarkManager — reads watermark before ETL, writes it back on success.
"""
import logging
from typing import Any

logger = logging.getLogger(__name__)


class WatermarkManager:
    """Manages last_run_dt watermark stored in a control/audit table."""

    def __init__(self, watermark_config: dict, resolver: "ParameterResolver") -> None:
        self._cfg = watermark_config
        self._resolver = resolver

    def read(self) -> Any:
        """Read current watermark value and inject into parameters."""
        from framework.connectors import get_connector
        cfg = self._resolver.resolve(self._cfg)
        connector = get_connector(cfg["connector"])
        try:
            df = connector.read({"connection": cfg["connection"], "query": cfg["read_query"]})
            value = df.iloc[0, 0] if len(df) and len(df.columns) else "1900-01-01"
            param_name = cfg.get("param_name", "last_run_dt")
            logger.info("watermark read: %s = %s", param_name, value)
            return value
        except Exception as exc:
            on_failure = cfg.get("on_failure", "warn")
            if on_failure == "warn":
                logger.warning("watermark read failed: %s — defaulting to 1900-01-01", exc)
                return "1900-01-01"
            raise

    def write(self) -> None:
        """Write updated watermark after successful ETL run."""
        from framework.connectors import get_connector
        cfg = self._resolver.resolve(self._cfg)
        connector = get_connector(cfg["connector"])
        try:
            connector.execute({"connection": cfg["connection"], "sql": cfg["write_query"]})
            logger.info("watermark updated successfully")
        except Exception as exc:
            on_failure = cfg.get("on_failure", "warn")
            if on_failure == "warn":
                logger.warning("watermark write failed: %s", exc)
            else:
                raise
```

---

### 5.4 `framework/execution/control_table.py` — Control Table Executor

```python
"""
ControlTableExecutor — reads control table rows and runs the ETL job per row,
either serially or in parallel up to parallelism limit.
"""
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Callable, Any

import pandas as pd

logger = logging.getLogger(__name__)


class ControlTableExecutor:
    """Reads a control table and drives one ETL job execution per row."""

    def __init__(self, control_cfg: dict, base_parameters: dict) -> None:
        self._cfg = control_cfg
        self._base_params = base_parameters

    def read_rows(self) -> pd.DataFrame:
        """Read all active rows from the control table."""
        from framework.connectors import get_connector
        connector = get_connector(self._cfg["connector"])
        return connector.read({
            "connection": self._cfg["connection"],
            "query":      self._cfg["query"],
        })

    def run_all(self, job_fn: Callable[[dict], dict]) -> list[dict]:
        """
        Run job_fn for each control table row.
        job_fn receives a parameters dict (merged base + row values).
        Returns list of result dicts {row_params, status, rows_loaded, error}.
        """
        rows_df = self.read_rows()
        param_mapping = self._cfg.get("param_mapping", {})
        parallelism = self._cfg.get("parallelism", 1)
        on_failure = self._cfg.get("on_failure", "abort")
        results = []

        def build_params(row: pd.Series) -> dict:
            params = dict(self._base_params)
            for param_name, col_name in param_mapping.items():
                if col_name in row.index:
                    params[param_name] = row[col_name]
            return params

        if parallelism == 1:
            # Serial execution
            for _, row in rows_df.iterrows():
                params = build_params(row)
                try:
                    result = job_fn(params)
                    results.append({"params": params, "status": "success", **result})
                except Exception as exc:
                    logger.error("row failed [%s]: %s", params.get("source_table"), exc)
                    results.append({"params": params, "status": "failed", "error": str(exc)})
                    if on_failure == "abort":
                        raise RuntimeError(f"Control table iteration aborted at {params}") from exc
        else:
            # Parallel execution
            with ThreadPoolExecutor(max_workers=parallelism) as pool:
                futures = {
                    pool.submit(job_fn, build_params(row)): build_params(row)
                    for _, row in rows_df.iterrows()
                }
                for future in as_completed(futures):
                    params = futures[future]
                    try:
                        result = future.result()
                        results.append({"params": params, "status": "success", **result})
                    except Exception as exc:
                        logger.error("parallel row failed [%s]: %s",
                                     params.get("source_table"), exc)
                        results.append({"params": params, "status": "failed", "error": str(exc)})

        return results
```

---

### 5.5 Updated `framework/execution/engine.py` — Engine v2.0

```python
"""
ExecutionEngine v2.0 — supports parameters, control tables, watermark,
pre/post steps, conditional load, multiple sources and targets.
"""
import logging
import time
import uuid
from typing import Any

import pandas as pd

logger = logging.getLogger(__name__)


class ExecutionEngine:
    """
    Orchestrates: pre_steps → watermark_read → [conditional] source →
    transforms → sink → watermark_write → post_steps.
    """

    def __init__(self, config: dict[str, Any], parameters: dict | None = None) -> None:
        self.config = config
        self.run_id = str(uuid.uuid4())
        self._runtime_params = {**config.get("parameters", {}), **(parameters or {})}
        self._metrics: dict[str, Any] = {"status": "running", "run_id": self.run_id}

    def run(self) -> dict:
        """Execute the full pipeline. Returns metrics dict."""
        from framework.config.resolver import ParameterResolver
        from framework.execution.steps import StepExecutor
        from framework.execution.watermark import WatermarkManager

        job_name = self.config["job"]["name"]
        logger.info({"event": "job_start", "run_id": self.run_id, "job": job_name})
        t_start = time.monotonic()

        resolver = ParameterResolver(self._runtime_params, self._metrics)
        step_exec = StepExecutor(resolver)

        try:
            # 1. Pre-steps
            pre_cfg = self.config.get("pre_steps", [])
            captured = step_exec.run_steps(pre_cfg, "pre", self._runtime_params)
            self._runtime_params.update(captured)
            resolver = ParameterResolver(self._runtime_params, self._metrics)  # refresh

            # 2. Watermark read
            watermark_value = None
            wm_cfg = self.config.get("watermark")
            if wm_cfg:
                wm_mgr = WatermarkManager(wm_cfg, resolver)
                watermark_value = wm_mgr.read()
                param_name = wm_cfg.get("param_name", "last_run_dt")
                self._runtime_params[param_name] = watermark_value
                resolver = ParameterResolver(self._runtime_params, self._metrics)

            # 3. Resolve full config with current parameters
            resolved_config = resolver.resolve_config(self.config)

            # 4. Apply conditional load (override source query by load_type)
            resolved_config = self._apply_conditional_load(resolved_config)

            # 5. Source(s)
            df = self._run_sources(resolved_config)
            self._metrics["source_row_count"] = len(df)

            # 6. Transformations
            df = self._run_transforms(df, resolved_config)

            # 7. Target(s)
            rows_written = self._run_targets(df, resolved_config)
            self._metrics["target_row_count"] = rows_written
            self._metrics["status"] = "success"

            # 8. Watermark write (only on success)
            if wm_cfg and watermark_value is not None:
                wm_mgr.write()

            # 9. Post-steps (run after success; metrics available)
            duration = time.monotonic() - t_start
            self._metrics["duration_s"] = round(duration, 2)
            resolver.update_metrics(self._metrics)
            post_cfg = self.config.get("post_steps", [])
            step_exec.run_steps(post_cfg, "post", self._runtime_params)

        except Exception as exc:
            self._metrics["status"] = "failed"
            self._metrics["error"] = str(exc)
            duration = time.monotonic() - t_start
            self._metrics["duration_s"] = round(duration, 2)
            # Still run post-steps so audit log captures failure
            try:
                resolver.update_metrics(self._metrics)
                post_cfg = self.config.get("post_steps", [])
                step_exec.run_steps(post_cfg, "post", self._runtime_params)
            except Exception:
                pass
            raise

        logger.info({"event": "job_complete", "run_id": self.run_id,
                     "job": job_name, **self._metrics})
        return self._metrics

    def _apply_conditional_load(self, config: dict) -> dict:
        """Override source query based on load_type parameter."""
        cond_cfg = config.get("conditional_load")
        if not cond_cfg:
            return config
        load_type = self._runtime_params.get(cond_cfg["parameter"], "incremental")
        branch = cond_cfg.get("branches", {}).get(load_type)
        if not branch:
            return config
        config = dict(config)
        sources = list(config.get("sources", [config.get("source")] if "source" in config else []))
        if sources and branch.get("source_query_override"):
            sources[0] = {**sources[0], "query": branch["source_query_override"]}
        config["sources"] = sources
        return config

    def _run_sources(self, config: dict) -> pd.DataFrame:
        from framework.connectors import get_connector
        sources = config.get("sources", [])
        if not sources and "source" in config:
            sources = [config["source"]]
        if not sources:
            raise ValueError("No sources defined in job config")
        # Single source for now (multi-source join handled by stream_join transform)
        src_cfg = sources[0]
        connector = get_connector(src_cfg["connector"])
        df = connector.read(src_cfg)
        logger.info({"event": "source_read", "run_id": self.run_id,
                     "connector": src_cfg["connector"], "rows": len(df)})
        return df

    def _run_transforms(self, df: pd.DataFrame, config: dict) -> pd.DataFrame:
        from framework.transformations import get_transformation
        results: dict[str, pd.DataFrame] = {}
        # Seed results with source id if defined
        sources = config.get("sources", [config.get("source")] if "source" in config else [])
        if sources and sources[0].get("id"):
            results[sources[0]["id"]] = df

        for step in config.get("transformations", []):
            t_start = time.monotonic()
            step_id = step["id"]
            step_type = step["type"]
            transform = get_transformation(step_type)

            # Resolve inputs
            if "inputs" in step:
                dfs_in = {inp: results[inp] for inp in step["inputs"] if inp in results}
                result = transform.apply(dfs_in, step)
            else:
                input_id = step.get("input", list(results.keys())[-1] if results else None)
                df_in = results.get(input_id, df)
                result = transform.apply(df_in, step)

            # Handle route_split multi-output
            if isinstance(result, dict):
                for branch, branch_df in result.items():
                    results[f"{step_id}.{branch}"] = branch_df
                df = next(iter(result.values()))  # continue with first branch
            else:
                results[step_id] = result
                df = result

            duration = time.monotonic() - t_start
            logger.info({"event": "transform", "run_id": self.run_id,
                         "step": step_id, "type": step_type,
                         "rows": len(df), "duration_s": round(duration, 3)})
        return df

    def _run_targets(self, df: pd.DataFrame, config: dict) -> int:
        from framework.connectors import get_connector
        targets = config.get("targets", [])
        if not targets and "sink" in config:
            targets = [config["sink"]]
        if not targets:
            raise ValueError("No targets defined in job config")
        total_written = 0
        for tgt_cfg in targets:
            connector = get_connector(tgt_cfg["connector"])
            connector.write(df, tgt_cfg)
            total_written += len(df)
            logger.info({"event": "target_write", "run_id": self.run_id,
                         "connector": tgt_cfg["connector"], "rows": len(df)})
        return total_written
```

---

### 5.6 Updated `framework/runner.py` — Control Table Mode

```python
# Add to the CLI run command in runner.py

def run_job(yaml_path: str, params: dict | None = None) -> None:
    """Load, validate, and execute a job config."""
    from framework.config.loader import load_config
    from framework.config.validator import validate_config
    from framework.execution.engine import ExecutionEngine
    from framework.execution.control_table import ControlTableExecutor

    config = load_config(yaml_path)
    validate_config(config)

    if "control_table" in config:
        # Control table mode — iterate and run once per row
        base_params = {**config.get("parameters", {}), **(params or {})}
        executor = ControlTableExecutor(config["control_table"], base_params)

        def run_one_iteration(row_params: dict) -> dict:
            engine = ExecutionEngine(config, parameters=row_params)
            return engine.run()

        results = executor.run_all(run_one_iteration)
        _log_batch_summary(results)
    else:
        # Standard single-run mode
        engine = ExecutionEngine(config, parameters=params)
        engine.run()


def _log_batch_summary(results: list[dict]) -> None:
    total = len(results)
    success = sum(1 for r in results if r["status"] == "success")
    failed = total - success
    logger.info({"event": "batch_complete", "total": total,
                 "success": success, "failed": failed})
    if failed:
        for r in results:
            if r["status"] == "failed":
                logger.error("failed: %s — %s", r["params"].get("source_table"), r.get("error"))
```

---

## 6. BaseConnector Update — `execute` and `execute_procedure`

Add two new abstract-optional methods to `framework/connectors/base.py`:

```python
class BaseConnector(ABC):

    @abstractmethod
    def read(self, config: dict) -> pd.DataFrame: ...

    @abstractmethod
    def write(self, df: pd.DataFrame, config: dict) -> None: ...

    def execute(self, config: dict) -> None:
        """Execute a non-SELECT SQL statement (DDL, DML, TRUNCATE, etc.)
        Default: raise NotImplementedError. DB connectors must override this."""
        raise NotImplementedError(
            f"{self.__class__.__name__} does not support execute(). "
            f"Override this method to enable pre/post SQL steps."
        )

    def execute_procedure(self, config: dict) -> None:
        """Execute a stored procedure.
        config keys: connection, procedure, params (dict of name→value)
        Default: raise NotImplementedError."""
        raise NotImplementedError(
            f"{self.__class__.__name__} does not support execute_procedure()."
        )
```

Then add `execute()` and `execute_procedure()` to each DB connector:

```python
# In SqlServerConnector, PostgresConnector, OracleConnector, AzureSqlConnector

def execute(self, config: dict) -> None:
    """Execute non-SELECT SQL — DDL, DML, TRUNCATE, etc."""
    conn_str = self._build_conn_str(config["connection"])
    with pyodbc.connect(conn_str) as conn:
        conn.execute(config["sql"])
        conn.commit()

def execute_procedure(self, config: dict) -> None:
    """Execute a stored procedure with named parameters."""
    conn_str = self._build_conn_str(config["connection"])
    proc = config["procedure"]
    params = config.get("params", {})
    # Build EXEC statement: EXEC dbo.usp_Notify @pipeline_name=?, @status=?
    param_clause = ", ".join(f"@{k}=?" for k in params)
    sql = f"EXEC {proc} {param_clause}" if param_clause else f"EXEC {proc}"
    with pyodbc.connect(conn_str) as conn:
        conn.execute(sql, list(params.values()))
        conn.commit()
```

---

## 7. YAML Generator Update — Parameterized Output

When `ir["metadata"]["foreach_pattern"] == True`, the YAML generator produces v2.0:

```python
# agent/agents/generation/yaml_generator.py — add parameterized rendering

def _render_v2_config(ir: dict) -> dict:
    """Render IR with foreach_pattern into v2.0 parameterized YAML config."""
    config = {
        "version": "2.0",
        "job": {
            "name": ir["job"]["name"],
            "description": ir["job"].get("description", ""),
            "schedule": ir["job"].get("schedule", ""),
        },
    }

    # Parameters block — replace @item().field with default placeholder
    params = {}
    for k, v in ir.get("parameters", {}).items():
        # @item().source_table → "" (required, no default)
        default = "" if str(v).startswith("@item()") else str(v)
        params[k] = default
    if params:
        config["parameters"] = params

    # Control table section
    if "control_table" in ir:
        config["control_table"] = {
            "connector":     ir["control_table"]["connector"],
            "connection":    ir["control_table"]["connection"],
            "query":         ir["control_table"]["query"],
            "param_mapping": ir["control_table"].get("param_mapping", {}),
            "parallelism":   ir["control_table"].get("parallelism", 1),
            "on_failure":    "continue",
        }

    # Watermark section
    if "watermark" in ir:
        config["watermark"] = ir["watermark"]

    # Pre-steps
    if ir.get("pre_sql"):
        config["pre_steps"] = [
            {"id": f"pre_{i}", "type": "sql",
             "connector": _infer_connector(ir),
             "connection": _infer_connection(ir),
             "sql": sql, "on_failure": "warn"}
            for i, sql in enumerate(ir["pre_sql"])
        ]

    # Conditional load
    if "conditional_load" in ir:
        config["conditional_load"] = ir["conditional_load"]

    # Sources — replace @item() refs with {{ parameters.* }}
    config["sources"] = [_render_parameterized_source(s, ir) for s in ir.get("sources", [])]

    # Transforms — expressions may still contain ADF syntax; mark as TODO
    config["transformations"] = _render_transforms(ir.get("transforms", []))

    # Targets — replace @item() refs with {{ parameters.* }}
    config["targets"] = [_render_parameterized_target(t, ir) for t in ir.get("sinks", [])]

    # Post-steps from IR metadata
    post_steps = _build_post_steps(ir)
    if post_steps:
        config["post_steps"] = post_steps

    return config


def _render_parameterized_source(src: dict, ir: dict) -> dict:
    """Replace @item().field references with {{ parameters.field }}."""
    rendered = {
        "id":        src.get("id", "src_table"),
        "connector": src["connector"],
        "connection": src["connection"],
    }
    # Table name from parameters
    if src.get("parameterized"):
        rendered["query"] = (
            "SELECT *\n"
            "FROM   {{ parameters.source_schema }}.{{ parameters.source_table }}\n"
            "WHERE  {{ parameters.watermark_col }} > :last_run_dt"
        )
    elif "table" in src:
        rendered["table"] = src["table"]
    if "schema" in src:
        rendered["schema"] = src["schema"]
    return rendered


def _render_parameterized_target(tgt: dict, ir: dict) -> dict:
    rendered = {
        "id":            tgt.get("id", "tgt_table"),
        "connector":     tgt["connector"],
        "connection":    tgt["connection"],
        "load_strategy": tgt.get("load_strategy", "append"),
        "input":         ir["transforms"][-1]["id"] if ir.get("transforms") else "src_table",
    }
    if tgt.get("parameterized"):
        rendered["schema"] = "{{ parameters.target_schema }}"
        rendered["table"]  = "{{ parameters.target_table }}"
    else:
        if "schema" in tgt:
            rendered["schema"] = tgt["schema"]
        if "table" in tgt:
            rendered["table"] = tgt["table"]
    if tgt.get("upsert_keys"):
        rendered["upsert_keys"] = tgt["upsert_keys"]
    return rendered


def _build_post_steps(ir: dict) -> list[dict]:
    """Build standard post_steps: audit log + any captured stored procedures."""
    steps = []
    # Stored procedure post-steps captured from pipeline activities
    for step in ir.get("post_steps", []):
        steps.append(step)
    # Always add audit log if not already there
    audit_ids = {s.get("id") for s in steps}
    if "audit_log" not in audit_ids:
        steps.append({
            "id":        "audit_log",
            "type":      "sql",
            "connector": _infer_connector(ir),
            "connection": _infer_connection(ir),
            "sql": (
                "INSERT INTO dbo.ETL_AUDIT_LOG"
                "(pipeline_name,table_name,run_date,rows_loaded,status,duration_s)"
                " VALUES('{{ job.name }}','{{ parameters.source_table }}',GETDATE(),"
                "{{ job.metrics.target_row_count }},'{{ job.metrics.status }}',"
                "{{ job.metrics.duration_s }})"
            ),
            "on_failure": "warn",
        })
    return steps
```

---

## 8. Implementation Sessions

### FW-V2a — `framework/config/schema.json` v2.0

**Duration:** 30 min | **Test:** `pytest tests/test_schema.py -v`

```
Replace framework/config/schema.json with the v2.0 schema from
#file:docs/brainstorming/control-table-and-framework-v2.md section 4.

The v2.0 schema must:
1. Support version: "1.0" and "2.0" (both valid)
2. Allow either "source" (v1) or "sources[]" (v2) — not require both
3. Allow either "sink" (v1) or "targets[]" (v2)
4. Add: parameters, control_table, watermark, pre_steps, post_steps, conditional_load
5. Remain backward compatible — existing v1 YAMLs must still validate

Write tests in tests/test_schema.py:
- test_v1_yaml_still_valid: existing single source/sink YAML passes
- test_v2_full_yaml_valid: parameterized YAML with control_table passes
- test_pre_step_types: sql/stored_procedure/python_script all valid
- test_load_strategy_enum: only allowed values pass
- test_watermark_required_fields: connection, read_query, write_query required
```

---

### FW-V2b — `framework/config/resolver.py`

**Duration:** 30 min | **Test:** `pytest tests/framework/test_resolver.py -v`

```
Implement framework/config/resolver.py — ParameterResolver class.
Read #file:docs/brainstorming/control-table-and-framework-v2.md section 5.1.

resolve(value) must recursively substitute {{ parameters.name }} and {{ job.metrics.key }}
in strings, dicts, and lists. Non-matching patterns are left as-is.

Write tests:
- test_resolve_string: "{{ parameters.source_table }}" → "customers"
- test_resolve_nested_dict: resolves inside nested config dicts
- test_resolve_list: resolves in list elements
- test_unresolved_passthrough: {{ unknown.key }} left unchanged
- test_metrics_resolved: {{ job.metrics.status }} → "success" after update_metrics()
- test_no_mutation: original config dict is not modified
```

---

### FW-V2c — `framework/execution/steps.py` + connector `execute()` methods

**Duration:** 45 min | **Test:** `pytest tests/framework/test_steps.py -v`

```
1. Implement framework/execution/steps.py — StepExecutor class.
   Read #file:docs/brainstorming/control-table-and-framework-v2.md section 5.2.

2. Add execute() and execute_procedure() to these connectors (section 6):
   - framework/connectors/sqlserver.py
   - framework/connectors/postgres.py
   - framework/connectors/azure_sql.py
   - framework/connectors/oracle.py

   execute(): run DML/DDL SQL and commit
   execute_procedure(): build EXEC statement, run with params, commit

Write tests (all mocked):
- test_sql_step_runs: type=sql → connector.execute() called
- test_sp_step_runs: type=stored_procedure → connector.execute_procedure() called
- test_capture_output: SELECT query result → stored in captured dict
- test_on_failure_warn: step raises → warning logged, execution continues
- test_on_failure_raise: step raises with on_failure=raise → exception propagated
- test_sqlserver_execute: execute() calls conn.execute + conn.commit
- test_sqlserver_execute_procedure: EXEC usp_Name @p1=?, @p2=? called correctly
```

---

### FW-V2d — `framework/execution/watermark.py`

**Duration:** 25 min | **Test:** `pytest tests/framework/test_watermark.py -v`

```
Implement framework/execution/watermark.py — WatermarkManager class.
Read #file:docs/brainstorming/control-table-and-framework-v2.md section 5.3.

read(): uses resolver to substitute {{ parameters.source_table }} in read_query,
        runs SELECT, returns scalar (first cell).
write(): uses resolver to build write_query, calls connector.execute().

Write tests (mocked connector):
- test_read_returns_scalar: DataFrame with one cell → scalar returned
- test_read_injects_param_name: returned value assigned to param_name key
- test_read_empty_result_defaults: empty result → "1900-01-01"
- test_write_calls_execute: write_query sent to connector.execute()
- test_on_failure_warn_read: connector raises, on_failure=warn → "1900-01-01" returned
```

---

### FW-V2e — `framework/execution/control_table.py`

**Duration:** 35 min | **Test:** `pytest tests/framework/test_control_table.py -v`

```
Implement framework/execution/control_table.py — ControlTableExecutor.
Read #file:docs/brainstorming/control-table-and-framework-v2.md section 5.4.

run_all(job_fn):
  - Serial path (parallelism=1): iterate rows, call job_fn per row
  - Parallel path (parallelism>1): ThreadPoolExecutor, max_workers=parallelism
  - on_failure=abort: first failure raises and stops all
  - on_failure=continue: collect failures, run all rows

Write tests:
- test_reads_control_table: connector.read() called with configured query
- test_param_mapping_applied: row column names mapped to param names correctly
- test_serial_runs_all_rows: 5 rows → job_fn called 5 times
- test_parallel_runs_concurrently: parallelism=3, 6 rows → max 3 concurrent threads
- test_on_failure_abort: job_fn raises on row 2 → stops, raises RuntimeError
- test_on_failure_continue: job_fn raises on row 2 → runs all 5, returns results with failed status
```

---

### FW-V2f — `framework/execution/engine.py` v2.0

**Duration:** 45 min | **Test:** `pytest tests/framework/test_engine_v2.py -v`

```
Rewrite framework/execution/engine.py to v2.0.
Read #file:docs/brainstorming/control-table-and-framework-v2.md section 5.5.

Key changes from v1:
1. Accept optional parameters dict in __init__
2. Run pre_steps before sources (StepExecutor)
3. Read watermark before sources (WatermarkManager), inject as :last_run_dt
4. Apply conditional_load (override source query by load_type parameter)
5. Support sources[] list (v2) and source (v1 backward compat)
6. Support targets[] list (v2) and sink (v1 backward compat)
7. Write watermark AFTER successful sinks (before post_steps)
8. Run post_steps even on failure (so audit log captures status)
9. All logging as structured JSON dicts

Also update framework/runner.py to:
- If config has control_table → use ControlTableExecutor
- If not → use single ExecutionEngine as before
- Accept --param key=value flags on CLI (parsed into dict, passed to engine)

Write tests:
- test_v1_config_still_works: old source/sink config runs without error
- test_v2_parameters_resolved: {{ parameters.source_table }} → actual value in query
- test_pre_steps_run_before_source: pre_step mock called before connector.read()
- test_watermark_injected: last_run_dt in source query params
- test_watermark_written_on_success: wm.write() called after sink
- test_watermark_not_written_on_failure: transform raises → wm.write() NOT called
- test_post_steps_run_on_failure: engine raises → post_steps still run
- test_conditional_load_full: load_type=full → overridden query used
- test_conditional_load_incremental: load_type=incremental → watermark query used
- test_control_table_mode: control_table in config → ControlTableExecutor used
```

---

### A-V2 — Agent YAML Generator v2.0

**Duration:** 40 min | **Test:** `pytest tests/agent/test_generator_v2.py -v`

```
Update agent/agents/generation/yaml_generator.py to emit v2.0 YAML when
ir["metadata"]["foreach_pattern"] is True.

Read #file:docs/brainstorming/control-table-and-framework-v2.md section 7.

The generator must call _render_v2_config(ir) when foreach_pattern=True,
and _render_v1_config(ir) for standard single-run pipelines.

_render_v2_config() must produce:
1. version: "2.0"
2. parameters block with @item() refs converted to empty-string defaults
3. control_table block from ir["control_table"]
4. watermark block from ir["watermark"] if present
5. pre_steps from ir["pre_sql"]
6. conditional_load from ir["conditional_load"] if present
7. sources with {{ parameters.source_schema }}.{{ parameters.source_table }}
8. transformations unchanged
9. targets with {{ parameters.target_schema }}.{{ parameters.target_table }}
10. post_steps: captured stored procedures + standard audit_log step

Write tests:
- test_foreach_ir_generates_v2: IR with foreach_pattern=True → version: "2.0"
- test_parameters_block_emitted: @item().source_table → parameters.source_table: ""
- test_control_table_in_yaml: ir.control_table → yaml.control_table with param_mapping
- test_pre_sql_becomes_pre_steps: ir.pre_sql → yaml.pre_steps with type=sql
- test_target_parameterized: parameterized=True sink → {{ parameters.target_table }}
- test_audit_log_always_added: post_steps always includes audit_log entry
- test_standard_ir_generates_v1: no foreach_pattern → version: "1.0", no parameters block
```

---

## 9. Updated Agent State for v2.0 IR

Add these fields to `agent/state.py`:

```python
class AgentState(TypedDict):
    # ... existing fields ...

    # v2.0 additions
    control_table:    Optional[dict]    # control table config from ForEach + Lookup
    watermark:        Optional[dict]    # watermark read/write config
    pre_steps:        list[dict]        # pre-ETL SQL/SP steps
    post_steps:       list[dict]        # post-ETL SQL/SP steps  
    conditional_load: Optional[dict]    # IfCondition branches (full vs incremental)
    yaml_version:     str               # "1.0" | "2.0"
```

---

## 10. Summary — What Must Change

| Component | Change Type | Session |
|---|---|---|
| `framework/config/schema.json` | **Rewrite to v2.0** | FW-V2a |
| `framework/config/resolver.py` | **New file** | FW-V2b |
| `framework/execution/steps.py` | **New file** | FW-V2c |
| `framework/connectors/base.py` | **Add execute() + execute_procedure()** | FW-V2c |
| All DB connectors | **Implement execute() + execute_procedure()** | FW-V2c |
| `framework/execution/watermark.py` | **New file** | FW-V2d |
| `framework/execution/control_table.py` | **New file** | FW-V2e |
| `framework/execution/engine.py` | **Rewrite to v2.0** | FW-V2f |
| `framework/runner.py` | **Add control table mode + --param CLI** | FW-V2f |
| `agent/state.py` | **Add v2.0 IR fields** | A-V2 |
| `agent/agents/generation/yaml_generator.py` | **Add v2.0 rendering** | A-V2 |
| `agent/agents/parser/adf_support.py` | **Already updated (P2c)** | Done ✅ |
