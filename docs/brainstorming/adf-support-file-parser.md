# ADF Support File Parser — Design & Implementation Guide

**Document Type:** Engineering Deep-Dive
**Version:** 1.0
**Date:** 2026-05-13
**Trigger:** Real ADF pipeline export via "Download support file" button in Azure Portal
**Companion:** `implementation-plan.md` session P2, `enterprise-hardening-plan.md` section 7.3

---

## 1. What the Support File ZIP Contains

When you click **Pipeline → Download support file** in ADF, you get a ZIP structured as:

```
support_file_PL_LoadDimCustomer.zip
│
├── pipeline/
│   └── PL_LoadDimCustomer.json         ← Entry point: activities list
│
├── dataflow/
│   └── DF_CustomerTransform.json       ← ETL logic (referenced by ExecuteDataFlow)
│
├── dataset/
│   ├── DS_SQLServer_Customers.json     ← Source schema + table name
│   ├── DS_Postgres_DimCustomer.json    ← Sink schema + table name
│   └── DS_ADLS_Staging.json           ← Staging area (if used)
│
├── linkedService/
│   ├── LS_SQLServer_CRM.json          ← Connection to SQL Server
│   ├── LS_Postgres_DW.json            ← Connection to data warehouse
│   ├── LS_ADLS_Gen2.json              ← Azure Data Lake staging
│   └── LS_KeyVault.json               ← Key Vault for secrets
│
├── integrationRuntime/
│   └── SHIR_OnPrem.json               ← Self-hosted IR (on-prem networks)
│
└── trigger/
    └── TR_Daily_2AM.json              ← Schedule (cron expression)
```

---

## 2. Reference Resolution Chain

Everything is resolved by NAME, not by path. The chain is:

```
Pipeline activity
    │ references by name
    ▼
Dataset (DS_*)
    │ schema + table name
    │ references linkedServiceName
    ▼
Linked Service (LS_*)
    │ connector type + connection string
    │ password may reference
    ▼
Key Vault Linked Service
    │ secretName
    ▼
Connection reference string
    (stored as "kv://<ls_name>/<secret_name>" — never the actual value)
```

The parser must build a **catalog** from all JSON files before resolving any reference.

---

## 3. JSON Structure for Each File Type

### 3.1 Pipeline JSON

```json
{
  "name": "PL_LoadDimCustomer",
  "properties": {
    "activities": [
      {
        "name": "DF_TransformCustomers",
        "type": "ExecuteDataFlow",
        "typeProperties": {
          "dataflow": {
            "referenceName": "DF_CustomerTransform",
            "type": "DataFlowReference"
          },
          "compute": { "coreCount": 8, "computeType": "General" }
        },
        "dependsOn": []
      },
      {
        "name": "CopyStagingToTarget",
        "type": "Copy",
        "dependsOn": [{"activity": "DF_TransformCustomers", "dependencyConditions": ["Succeeded"]}],
        "inputs": [{"referenceName": "DS_ADLS_Staging", "type": "DatasetReference"}],
        "outputs": [{"referenceName": "DS_Postgres_DimCustomer", "type": "DatasetReference"}],
        "typeProperties": {
          "source": {"type": "ParquetSource"},
          "sink": {
            "type": "AzurePostgreSqlSink",
            "writeBehavior": "upsert",
            "upsertSettings": {"keys": ["customer_id"]}
          }
        }
      }
    ],
    "parameters": {
      "RunDate": {"type": "String", "defaultValue": "@utcnow()"},
      "SourceSchema": {"type": "String", "defaultValue": "dbo"}
    }
  }
}
```

**Key fields:**
- `activities[]` — each activity maps to a transform, source, or sink
- `dependsOn` — defines execution order (DAG edges)
- `parameters` — pipeline parameters → ir["parameters"]

---

### 3.2 Data Flow JSON

```json
{
  "name": "DF_CustomerTransform",
  "properties": {
    "type": "MappingDataFlow",
    "typeProperties": {
      "sources": [
        {
          "name": "srcCustomers",
          "dataset": {"referenceName": "DS_SQLServer_Customers", "type": "DatasetReference"}
        }
      ],
      "transformations": [
        {"name": "filterActive"},
        {"name": "deriveFullName"},
        {"name": "lookupSegment"},
        {"name": "aggregateByRegion"}
      ],
      "sinks": [
        {
          "name": "sinkStaging",
          "dataset": {"referenceName": "DS_ADLS_Staging", "type": "DatasetReference"}
        }
      ],
      "script": "source(output(\n  customer_id as integer,\n  first_name as string,\n  ...\n),\nallowSchemaDrift: true) ~> srcCustomers\nsrcCustomers filter(status == 'ACTIVE') ~> filterActive\nfilterActive derive(full_name = first_name + ' ' + last_name) ~> deriveFullName\nderiveFullName, dimSegment lookup(segment_code == code,\n  multiple: false,\n  pickup: 'any') ~> lookupSegment\nlookupSegment aggregate(groupBy(region),\n  total_sales = sum(amount)) ~> aggregateByRegion\naggregateByRegion sink(allowSchemaDrift: true) ~> sinkStaging"
    }
  }
}
```

**Key fields:**
- `script` — ADF Data Flow DSL (single string, newline-separated)
- `sources[].dataset.referenceName` — links to Dataset catalog
- `transformations[].name` — step names (types come from the `script`)
- Parse the `script` to extract transformation types and expressions

---

### 3.3 Dataset JSON

```json
{
  "name": "DS_SQLServer_Customers",
  "properties": {
    "linkedServiceName": {
      "referenceName": "LS_SQLServer_CRM",
      "type": "LinkedServiceReference"
    },
    "type": "SqlServerTable",
    "typeProperties": {
      "schema": "dbo",
      "table": "customers"
    },
    "schema": [
      {"name": "customer_id",  "type": "int",      "precision": 10},
      {"name": "first_name",   "type": "varchar",  "precision": 50},
      {"name": "last_name",    "type": "varchar",  "precision": 50},
      {"name": "status",       "type": "char",     "precision": 1},
      {"name": "segment_code", "type": "varchar",  "precision": 10},
      {"name": "updated_dt",   "type": "datetime2","precision": 7}
    ]
  }
}
```

**Key fields:**
- `linkedServiceName.referenceName` → resolve to Linked Service
- `typeProperties.schema` + `typeProperties.table` → table location
- `schema[]` → column names and types → add to IR source schema

---

### 3.4 Linked Service JSON

```json
{
  "name": "LS_SQLServer_CRM",
  "properties": {
    "type": "SqlServer",
    "typeProperties": {
      "connectionString": "integrated security=False;data source=crm-server.corp.internal;initial catalog=CRM;user id=etl_svc;",
      "password": {
        "type": "AzureKeyVaultSecret",
        "store": {
          "referenceName": "LS_KeyVault",
          "type": "LinkedServiceReference"
        },
        "secretName": "sqlserver-crm-password"
      }
    },
    "connectVia": {
      "referenceName": "SHIR_OnPrem",
      "type": "IntegrationRuntimeReference"
    }
  }
}
```

**Key fields:**
- `type` → map via `ADF_LINKED_SERVICE_MAP` → canonical connector name
- `typeProperties.connectionString` → extract server/database (NOT credentials)
- `password.secretName` → Key Vault secret name → connection reference
- `connectVia.referenceName` → Integration Runtime (determines on-prem vs cloud)

**Connection reference built from linked service:**
```
"kv://LS_KeyVault/sqlserver-crm-password"
→ at runtime: ETL_CONN_<uppercase_ref> env var → secrets resolver fetches from Key Vault
```

---

### 3.5 Integration Runtime JSON

```json
{
  "name": "SHIR_OnPrem",
  "properties": {
    "type": "SelfHosted",
    "description": "Self-hosted IR for on-premises SQL Server and Oracle"
  }
}
```

**Types:**
- `SelfHosted` → on-premises source — add `network: on_prem` to IR source
- `Managed` (AutoResolve) → Azure cloud-to-cloud — default, no special handling
- `AzureSSIS` → SSIS package execution → route to SSIS parser, not ADF parser

---

### 3.6 Trigger JSON

```json
{
  "name": "TR_Daily_2AM",
  "properties": {
    "type": "ScheduleTrigger",
    "typeProperties": {
      "recurrence": {
        "frequency": "Day",
        "interval": 1,
        "startTime": "2024-01-01T02:00:00Z",
        "timeZone": "UTC",
        "schedule": {"hours": [2], "minutes": [0]}
      }
    },
    "pipelines": [
      {"pipelineReference": {"referenceName": "PL_LoadDimCustomer"}}
    ]
  }
}
```

**Trigger type → cron expression mapping:**

| ADF Trigger Type | Conversion |
|---|---|
| `ScheduleTrigger` | Convert `recurrence` → cron string |
| `TumblingWindowTrigger` | Convert window size → cron + watermark |
| `BlobEventsTrigger` | `on_file_arrival` event config |
| `CustomEventsTrigger` | `on_event` config (Event Grid) |

---

## 4. Activity Type Handling

Not all pipeline activities are ETL transforms. The parser must classify each:

```python
ADF_ACTIVITY_CLASSIFICATION = {
    # ETL activities → produce IR transforms
    "ExecuteDataFlow":  "dataflow",     # load referenced DataFlow JSON
    "Copy":             "copy",         # direct source-to-sink, no transforms

    # Orchestration activities → affect complexity score, not IR transforms
    "ForEach":          "loop",         # complexity +2; expand into multiple jobs
    "IfCondition":      "conditional",  # complexity +1
    "Until":            "loop",         # complexity +2
    "ExecutePipeline":  "child_pipeline", # complexity +3; manual review

    # Utility activities → extract as pre/post steps
    "Lookup":           "pre_step",     # control-flow lookup, not data transform
    "GetMetadata":      "pre_step",
    "SetVariable":      "pre_step",

    # Ignorable for ETL purposes
    "Wait":             "ignore",
    "Validation":       "ignore",
    "WebActivity":      "http_call",    # note in IR but not a transform
    "SqlServerStoredProcedure": "pre_sql",  # → ir["pre_sql"]
    "Script":           "pre_sql",
}
```

---

## 5. ADF Data Flow Script DSL Parser

The `script` field in DataFlow JSON is ADF's own DSL. It must be parsed to extract transformation types and expressions.

```
# ADF Script DSL format:
source(output(...), allowSchemaDrift: true) ~> srcCustomers
srcCustomers filter(status == 'ACTIVE') ~> filterActive
filterActive derive(full_name = first_name + ' ' + last_name,
                    age_bucket = iif(age < 18, 'minor', 'adult')) ~> deriveFullName
deriveFullName, dimSegment lookup(segment_code == code,
    multiple: false, pickup: 'any',
    broadcast: 'auto') ~> lookupSegment
lookupSegment aggregate(groupBy(region),
    total_sales = sum(amount),
    order_count = count(order_id)) ~> aggregateByRegion
aggregateByRegion sink(allowSchemaDrift: true, ...) ~> sinkStaging
```

**Script parsing rules:**
```
Each line (or multi-line block) follows the pattern:
  [input1, input2, ...] <transformation_keyword>(<params>) ~> <output_name>

Keywords → canonical types:
  source(...)    → connector source (not a transform)
  filter(...)    → row_filter;    extract condition expression
  derive(...)    → column_derive; extract {col: expression} dict
  lookup(...)    → lookup_enrich; extract join keys
  aggregate(...) → aggregate;     extract group_by + measures
  join(...)      → stream_join;   extract join type + keys
  sort(...)      → row_sort;      extract column + direction
  select(...)    → column_select; extract column mappings
  pivot(...)     → pivot
  unpivot(...)   → unpivot
  window(...)    → window_fn
  union(...)     → union_all      (multiple inputs before union)
  conditional(...)→ route_split
  sink(...)      → connector sink (not a transform)
  exists(...)    → lookup_enrich  (semi-join)
  cast(...)      → data_convert
  flatten(...)   → flatten_json
```

---

## 6. Complete Parser Design

### 6.1 `agent/agents/parser/adf_support.py` — New file

```python
"""
ADF Support File Parser.

Handles the ZIP downloaded from ADF portal (Pipeline → Download support file).
Resolves the full reference chain: Pipeline → DataFlow → Dataset → LinkedService → IR.
"""

import json
import re
import zipfile
from pathlib import Path
from typing import Any

from agent.state import AgentState

# Canonical mappings (same as in agent/CLAUDE.md)
ADF_LINKED_SERVICE_MAP: dict[str, str | None] = {
    "SqlServer":          "sqlserver",
    "AzureSqlMI":         "azure_sql",
    "AzureSqlDatabase":   "azure_sql",
    "AzurePostgreSql":    "postgres",
    "AzureMySql":         "mysql",
    "Oracle":             "oracle",
    "AmazonS3":           "s3",
    "AzureBlobStorage":   "adls",
    "AzureDataLakeStore": "adls",
    "AzureDataLakeStorage": "adls",
    "Snowflake":          "snowflake",
    "AzureEventHub":      "kafka",
    "HttpServer":         "http_api",
    "Sftp":               "sftp",
    "RestService":        "http_api",
    "AzureKeyVault":      None,   # Not a data connector — used for secrets
    "AzureFileStorage":   "adls",
}

ADF_DATASET_TYPE_MAP: dict[str, str] = {
    # Dataset type → default file format / hint
    "SqlServerTable":        "table",
    "AzureSqlMITable":       "table",
    "AzureSqlTable":         "table",
    "AzurePostgreSqlTable":  "table",
    "OracleTable":           "table",
    "DelimitedText":         "csv",
    "Parquet":               "parquet",
    "Json":                  "json",
    "Excel":                 "excel",
    "Binary":                "binary",
    "AzureBlob":             "adls",
    "AzureDataLakeStoreFile":"adls",
    "AzureDataLakeStorageGen2File": "adls",
    "SnowflakeTable":        "table",
    "AmazonS3Object":        "s3",
}

ADF_SCRIPT_TRANSFORM_MAP: dict[str, str | None] = {
    "filter":      "row_filter",
    "derive":      "column_derive",
    "lookup":      "lookup_enrich",
    "join":        "stream_join",
    "aggregate":   "aggregate",
    "sort":        "row_sort",
    "select":      "column_select",
    "pivot":       "pivot",
    "unpivot":     "unpivot",
    "window":      "window_fn",
    "union":       "union_all",
    "conditional": "route_split",
    "cast":        "data_convert",
    "flatten":     "flatten_json",
    "exists":      "lookup_enrich",   # semi-join pattern
    "rank":        "rank",
    "alterRow":    "scd_type_1",
    "script":      "python_fn",       # manual review
    "source":      None,              # handled as connector source
    "sink":        None,              # handled as connector sink
}

ADF_TRIGGER_FREQ_TO_CRON: dict[str, str] = {
    # frequency + interval + hours/minutes → cron
    # Handled in _trigger_to_cron() function
}


class AdfCatalog:
    """In-memory catalog of all ADF artifact JSONs indexed by name."""

    def __init__(self) -> None:
        self.pipelines:          dict[str, dict] = {}
        self.dataflows:          dict[str, dict] = {}
        self.datasets:           dict[str, dict] = {}
        self.linked_services:    dict[str, dict] = {}
        self.integration_runtimes: dict[str, dict] = {}
        self.triggers:           dict[str, dict] = {}

    def load_from_zip(self, zip_path: Path) -> None:
        """Extract ZIP and load all JSON files into catalog."""
        with zipfile.ZipFile(zip_path) as zf:
            for entry in zf.namelist():
                if not entry.endswith(".json"):
                    continue
                parts = entry.split("/")
                if len(parts) < 2:
                    continue
                folder, filename = parts[0].lower(), parts[-1]
                name = filename.replace(".json", "")
                data = json.loads(zf.read(entry))
                self._store(folder, name, data)

    def load_from_dir(self, dir_path: Path) -> None:
        """Load from an already-extracted directory."""
        for json_file in dir_path.rglob("*.json"):
            folder = json_file.parent.name.lower()
            name = json_file.stem
            data = json.loads(json_file.read_text(encoding="utf-8"))
            self._store(folder, name, data)

    def _store(self, folder: str, name: str, data: dict) -> None:
        target = {
            "pipeline":           self.pipelines,
            "pipelines":          self.pipelines,
            "dataflow":           self.dataflows,
            "dataflows":          self.dataflows,
            "dataset":            self.datasets,
            "datasets":           self.datasets,
            "linkedservice":      self.linked_services,
            "linkedservices":     self.linked_services,
            "integrationruntime": self.integration_runtimes,
            "integrationruntimes":self.integration_runtimes,
            "trigger":            self.triggers,
            "triggers":           self.triggers,
        }.get(folder)
        if target is not None:
            target[name] = data


def run(state: AgentState) -> dict:
    """Parse ADF support file (ZIP or directory) into canonical IR."""
    path = Path(state["raw_artifact_path"])
    catalog = AdfCatalog()

    if path.suffix.lower() == ".zip":
        catalog.load_from_zip(path)
    elif path.is_dir():
        catalog.load_from_dir(path)
    else:
        # Single pipeline JSON — fall back to simple parser
        catalog.pipelines[path.stem] = json.loads(path.read_text())

    # Select which pipeline to parse (first one, or match artifact_id)
    pipeline_name = state.get("artifact_id") or next(iter(catalog.pipelines), None)
    if not pipeline_name or pipeline_name not in catalog.pipelines:
        return {"error_log": state.get("error_log", []) + [
            f"Pipeline '{pipeline_name}' not found in support file"
        ]}

    ir = _make_empty_ir()
    ir["source_origin"] = {"type": "adf", "artifact_id": pipeline_name}

    pipeline_data = catalog.pipelines[pipeline_name]
    props = pipeline_data.get("properties", {})

    ir["job"]["name"] = pipeline_name

    # 1. Extract pipeline parameters
    for param_name, param_def in props.get("parameters", {}).items():
        ir["parameters"][param_name] = param_def.get("defaultValue", "")

    # 2. Extract schedule from trigger
    for trigger in catalog.triggers.values():
        linked_pipelines = [
            p["pipelineReference"]["referenceName"]
            for p in trigger.get("properties", {}).get("pipelines", [])
        ]
        if pipeline_name in linked_pipelines:
            ir["job"]["schedule"] = _trigger_to_cron(trigger)
            break

    # 3. Process activities
    activities = props.get("activities", [])
    activity_order = _topological_sort(activities)

    for activity in activity_order:
        act_type = activity.get("type", "")
        act_name = activity.get("name", "")

        if act_type == "ExecuteDataFlow":
            df_ref = activity["typeProperties"]["dataflow"]["referenceName"]
            if df_ref in catalog.dataflows:
                _parse_dataflow(catalog.dataflows[df_ref], catalog, ir)
            else:
                ir["warnings"].append(f"DataFlow '{df_ref}' not found in support file")

        elif act_type == "Copy":
            _parse_copy_activity(activity, catalog, ir)

        elif act_type in ("SqlServerStoredProcedure", "Script"):
            sql = activity.get("typeProperties", {}).get("storedProcedureName") or \
                  activity.get("typeProperties", {}).get("scripts", [{}])[0].get("text", "")
            ir["pre_sql"].append(sql)

        elif act_type in ("ForEach", "Until"):
            ir["warnings"].append(
                f"Loop activity '{act_name}' (type={act_type}) — manually review loop logic"
            )
            ir["metadata"]["auto_convertible"] = False

        elif act_type == "ExecutePipeline":
            child = activity["typeProperties"]["pipeline"]["referenceName"]
            ir["warnings"].append(
                f"ExecutePipeline '{act_name}' calls child pipeline '{child}' — "
                f"convert child separately and chain via orchestrator"
            )
            ir["metadata"]["auto_convertible"] = False

    return {"ir": ir}


def _parse_dataflow(df_data: dict, catalog: AdfCatalog, ir: dict) -> None:
    """Parse a MappingDataFlow JSON and populate ir sources/transforms/sinks."""
    df_props = df_data.get("properties", {}).get("typeProperties", {})

    # Resolve source datasets
    for src in df_props.get("sources", []):
        ds_name = src.get("dataset", {}).get("referenceName")
        if ds_name and ds_name in catalog.datasets:
            source_entry = _resolve_dataset(ds_name, catalog, role="source")
            source_entry["id"] = src["name"]
            ir["sources"].append(source_entry)

    # Resolve sink datasets
    for snk in df_props.get("sinks", []):
        ds_name = snk.get("dataset", {}).get("referenceName")
        if ds_name and ds_name in catalog.datasets:
            sink_entry = _resolve_dataset(ds_name, catalog, role="sink")
            sink_entry["id"] = snk["name"]
            ir["sinks"].append(sink_entry)

    # Parse the script DSL for transformation steps
    script = df_props.get("script", "")
    if script:
        transforms = _parse_dataflow_script(script)
        ir["transforms"].extend(transforms)
    else:
        # Fall back to transformations array (older ADF format)
        for t in df_props.get("transformations", []):
            ir["transforms"].append({
                "id": t["name"],
                "type": "unknown",
                "inputs": [],
                "properties": {},
            })
            ir["warnings"].append(f"Transform '{t['name']}' has no script — type unknown")


def _parse_copy_activity(activity: dict, catalog: AdfCatalog, ir: dict) -> None:
    """Parse a Copy activity (simple source → sink, no DataFlow transforms)."""
    act_name = activity["name"]
    type_props = activity.get("typeProperties", {})

    # Source
    for inp in activity.get("inputs", []):
        ds_name = inp["referenceName"]
        if ds_name in catalog.datasets:
            src = _resolve_dataset(ds_name, catalog, role="source")
            src["id"] = f"src_{act_name}"
            # Copy activity may have inline SQL query
            src_props = type_props.get("source", {})
            if "sqlReaderQuery" in src_props:
                src["query"] = src_props["sqlReaderQuery"]
            ir["sources"].append(src)

    # Sink
    for out in activity.get("outputs", []):
        ds_name = out["referenceName"]
        if ds_name in catalog.datasets:
            snk = _resolve_dataset(ds_name, catalog, role="sink")
            snk["id"] = f"snk_{act_name}"
            sink_props = type_props.get("sink", {})
            snk["load_strategy"] = _map_write_behavior(sink_props.get("writeBehavior", "insert"))
            if "upsertSettings" in sink_props:
                snk["upsert_keys"] = sink_props["upsertSettings"].get("keys", [])
            ir["sinks"].append(snk)

    # Copy with no DataFlow = direct copy, no transforms
    # Represent as a pass-through (no transform node)


def _resolve_dataset(ds_name: str, catalog: AdfCatalog, role: str) -> dict:
    """Resolve dataset → linked service → canonical connector + connection ref."""
    ds_data = catalog.datasets[ds_name]
    ds_props = ds_data.get("properties", {})

    ls_name = ds_props.get("linkedServiceName", {}).get("referenceName", "")
    connector, connection, network = _resolve_linked_service(ls_name, catalog)

    ds_type = ds_props.get("type", "")
    type_props = ds_props.get("typeProperties", {})

    entry: dict[str, Any] = {
        "connector":  connector or "unknown",
        "connection": connection,
        "dataset_name": ds_name,
    }

    if network:
        entry["network"] = network   # "on_prem" for self-hosted IR

    # Table location
    if "table" in type_props:
        entry["table"] = type_props["table"]
    if "schema" in type_props and isinstance(type_props["schema"], str):
        entry["schema"] = type_props["schema"]
    if "fileName" in type_props:
        entry["file_path"] = type_props.get("folderPath", "") + "/" + type_props["fileName"]
    if "location" in type_props:
        loc = type_props["location"]
        entry["file_path"] = loc.get("folderPath", "") + "/" + loc.get("fileName", "")

    # Schema (column definitions)
    schema_cols = ds_props.get("schema", [])
    if schema_cols:
        entry["schema_columns"] = [
            {"name": c["name"], "type": _map_adf_type(c.get("type", "string"))}
            for c in schema_cols
        ]

    # File format hint
    fmt = ADF_DATASET_TYPE_MAP.get(ds_type)
    if fmt and fmt not in ("table",):
        entry["format"] = fmt

    return entry


def _resolve_linked_service(ls_name: str, catalog: AdfCatalog) -> tuple[str | None, str, str | None]:
    """
    Returns (canonical_connector, connection_reference, network_type).
    connection_reference is never a raw credential — always a secrets reference.
    """
    if ls_name not in catalog.linked_services:
        return None, ls_name, None

    ls_data = catalog.linked_services[ls_name]
    ls_props = ls_data.get("properties", {})
    ls_type = ls_props.get("type", "")

    canonical = ADF_LINKED_SERVICE_MAP.get(ls_type)

    type_props = ls_props.get("typeProperties", {})

    # Build connection reference (never include actual credentials)
    conn_ref = _build_connection_ref(ls_name, type_props, catalog)

    # Integration Runtime → network type
    network = None
    connect_via = ls_props.get("connectVia", {}).get("referenceName")
    if connect_via and connect_via in catalog.integration_runtimes:
        ir_type = catalog.integration_runtimes[connect_via].get(
            "properties", {}).get("type", "")
        if ir_type == "SelfHosted":
            network = "on_prem"
        elif ir_type == "AzureSSIS":
            network = "azure_ssis"   # flag for SSIS parser routing

    return canonical, conn_ref, network


def _build_connection_ref(ls_name: str, type_props: dict, catalog: AdfCatalog) -> str:
    """
    Build a secrets-safe connection reference string.
    Never includes raw passwords — captures Key Vault secret name instead.

    Output format:
      For Key Vault passwords: "kv://<kv_ls_name>/<secret_name>"
      For connection strings (no KV): use linked service name as opaque reference
        (actual connection string injected via env var at runtime)
    """
    password = type_props.get("password", {})

    if isinstance(password, dict) and password.get("type") == "AzureKeyVaultSecret":
        kv_ls = password.get("store", {}).get("referenceName", "LS_KeyVault")
        secret = password.get("secretName", "")
        return f"kv://{kv_ls}/{secret}"

    # SecureString inline — should not happen in production but handle gracefully
    if isinstance(password, dict) and password.get("type") == "SecureString":
        # Never capture the value — use the linked service name as reference
        return f"ls://{ls_name}"

    # No explicit password — connection string handles auth (e.g. MSI, Windows auth)
    return f"ls://{ls_name}"


def _parse_dataflow_script(script: str) -> list[dict]:
    """
    Parse the ADF Data Flow DSL script into canonical IR transforms.

    Each statement: [inputs] transformation_keyword(params) ~> output_name
    """
    transforms = []

    # Normalize: join continuation lines (lines ending without ~>)
    normalized = re.sub(r"\n\s+", " ", script.strip())
    statements = re.split(r"\n", normalized)

    for stmt in statements:
        stmt = stmt.strip()
        if not stmt or "~>" not in stmt:
            continue

        # Split at ~> to get "input expressions(params)" and "output_name"
        lhs, output_name = stmt.rsplit("~>", 1)
        output_name = output_name.strip()
        lhs = lhs.strip()

        # Extract keyword and params: "inputs keyword(params)"
        # Inputs are comma-separated names before the keyword
        kw_match = re.match(r"^([\w, ]+?)\s+(\w+)\s*\((.*)$", lhs, re.DOTALL)
        if not kw_match:
            # No explicit inputs — just keyword(params)
            kw_match2 = re.match(r"^(\w+)\s*\((.*)$", lhs, re.DOTALL)
            if not kw_match2:
                continue
            inputs_str, keyword, raw_params = "", kw_match2.group(1), kw_match2.group(2)
        else:
            inputs_str, keyword, raw_params = (
                kw_match.group(1), kw_match.group(2), kw_match.group(3)
            )

        canonical_type = ADF_SCRIPT_TRANSFORM_MAP.get(keyword.lower())
        if canonical_type is None:
            continue   # source/sink handled elsewhere

        inputs = [i.strip() for i in inputs_str.split(",") if i.strip()]

        # Strip trailing closing paren from params
        raw_params = raw_params.rstrip(") \t")

        properties = _extract_script_properties(keyword.lower(), raw_params)
        properties["_raw_script_params"] = raw_params   # keep for LLM translator if needed

        transforms.append({
            "id": output_name,
            "type": canonical_type,
            "inputs": inputs,
            "properties": properties,
        })

    return transforms


def _extract_script_properties(keyword: str, raw_params: str) -> dict:
    """Extract typed properties from script params based on keyword."""
    props: dict = {}

    if keyword == "filter":
        props["condition"] = raw_params.strip()

    elif keyword == "derive":
        # "col1 = expr1, col2 = expr2"  — may span lines
        derivations = {}
        for part in re.split(r",\s*(?=\w+\s*=)", raw_params):
            if "=" in part:
                col, expr = part.split("=", 1)
                derivations[col.strip()] = expr.strip()
        props["derivations"] = derivations

    elif keyword in ("join", "lookup", "exists"):
        # Extract join condition and join type
        condition_match = re.search(r"^(.+?),\s*multiple:", raw_params)
        if condition_match:
            props["join_condition_raw"] = condition_match.group(1).strip()
        join_type_match = re.search(r"joinType:\s*'(\w+)'", raw_params)
        if join_type_match:
            props["join_type"] = join_type_match.group(1).lower()

    elif keyword == "aggregate":
        # "groupBy(col1, col2), measure1 = agg_fn(col)"
        group_match = re.search(r"groupBy\(([^)]+)\)", raw_params)
        if group_match:
            props["group_by"] = [c.strip() for c in group_match.group(1).split(",")]
        # Extract measures from remaining content
        measures_raw = re.sub(r"groupBy\([^)]+\),?\s*", "", raw_params)
        measures = {}
        for part in re.split(r",\s*(?=\w+\s*=)", measures_raw):
            if "=" in part:
                col, expr = part.split("=", 1)
                measures[col.strip()] = expr.strip()
        props["measures"] = measures

    elif keyword == "sort":
        # "asc(col1), desc(col2)"
        keys = []
        for m in re.finditer(r"(asc|desc)\((\w+)\)", raw_params, re.IGNORECASE):
            keys.append({"column": m.group(2), "direction": m.group(1).lower()})
        props["keys"] = keys

    elif keyword == "select":
        # "mapColumn(col1, col2 = old_name, ...)"
        map_match = re.search(r"mapColumn\((.+)\)", raw_params, re.DOTALL)
        if map_match:
            cols = {}
            for part in map_match.group(1).split(","):
                part = part.strip()
                if "=" in part:
                    new, old = part.split("=", 1)
                    cols[new.strip()] = old.strip()
                else:
                    cols[part] = part
            props["columns"] = cols

    elif keyword == "conditional":
        # Extract branch conditions
        routes = {}
        for m in re.finditer(r"case\((.+?),\s*'(\w+)'\)", raw_params):
            routes[m.group(2)] = m.group(1).strip()
        props["routes"] = routes

    return props


def _topological_sort(activities: list[dict]) -> list[dict]:
    """Sort activities by dependsOn relationships."""
    name_map = {a["name"]: a for a in activities}
    visited: set[str] = set()
    result: list[dict] = []

    def visit(name: str) -> None:
        if name in visited:
            return
        visited.add(name)
        for dep in name_map.get(name, {}).get("dependsOn", []):
            visit(dep["activity"])
        if name in name_map:
            result.append(name_map[name])

    for a in activities:
        visit(a["name"])
    return result


def _trigger_to_cron(trigger: dict) -> str:
    """Convert ADF trigger to cron expression string."""
    t_type = trigger.get("properties", {}).get("type", "")
    recurrence = trigger.get("properties", {}).get("typeProperties", {}).get("recurrence", {})

    if t_type == "ScheduleTrigger":
        freq = recurrence.get("frequency", "Day").lower()
        interval = recurrence.get("interval", 1)
        schedule = recurrence.get("schedule", {})
        hours = schedule.get("hours", [0])
        minutes = schedule.get("minutes", [0])
        h = hours[0] if hours else 0
        m = minutes[0] if minutes else 0

        if freq == "minute":
            return f"*/{interval} * * * *"
        elif freq == "hour":
            return f"0 */{interval} * * *"
        elif freq == "day":
            return f"{m} {h} */{interval} * *"
        elif freq == "week":
            days = schedule.get("weekDays", ["Monday"])
            day_nums = {"Monday":1,"Tuesday":2,"Wednesday":3,"Thursday":4,
                        "Friday":5,"Saturday":6,"Sunday":0}
            day_str = ",".join(str(day_nums.get(d, 1)) for d in days)
            return f"{m} {h} * * {day_str}"
        elif freq == "month":
            month_days = schedule.get("monthDays", [1])
            return f"{m} {h} {month_days[0]} * *"

    elif t_type == "TumblingWindowTrigger":
        # Convert window size to cron (approximate)
        freq = recurrence.get("frequency", "Hour").lower()
        interval = recurrence.get("interval", 1)
        if freq == "minute":
            return f"*/{interval} * * * *"
        elif freq == "hour":
            return f"0 */{interval} * * *"

    return ""   # Unknown trigger type → leave empty, note in IR


def _map_write_behavior(behavior: str) -> str:
    """Map ADF sink writeBehavior → framework load_strategy."""
    return {
        "insert":       "append",
        "upsert":       "upsert",
        "overwrite":    "overwrite",
        "merge":        "merge_on_key",
    }.get(behavior.lower(), "append")


def _map_adf_type(adf_type: str) -> str:
    """Map ADF column type to pandas/Python type hint."""
    return {
        "int": "int", "integer": "int", "bigint": "int",
        "smallint": "int", "tinyint": "int",
        "float": "float", "double": "float", "decimal": "float", "numeric": "float",
        "string": "str", "varchar": "str", "nvarchar": "str", "char": "str", "text": "str",
        "boolean": "bool", "bit": "bool",
        "date": "date", "datetime": "datetime", "datetime2": "datetime",
        "timestamp": "datetime",
        "binary": "bytes", "varbinary": "bytes",
    }.get(adf_type.lower(), "str")


def _make_empty_ir() -> dict:
    return {
        "ir_version": "1.0",
        "source_origin": {},
        "job": {"name": "", "schedule": "", "integration_runtime": "azure"},
        "parameters": {},
        "sources": [],
        "transforms": [],
        "sinks": [],
        "pre_sql": [],
        "post_sql": [],
        "complexity": {"score": None, "auto_convertible": None},
        "metadata": {"auto_convertible": True},
        "warnings": [],
    }
```

---

## 7. Connection Reference → Runtime Resolution

The parser never stores raw credentials. All connections become opaque references that the **Secrets Resolver** handles at runtime.

### Connection Reference Formats

| What the parser stores | What the secrets resolver does |
|---|---|
| `kv://LS_KeyVault/sqlserver-crm-password` | Fetch `sqlserver-crm-password` from Azure Key Vault linked service |
| `ls://LS_SQLServer_CRM` | Read `ETL_CONN_LS_SQLSERVER_CRM` from environment |
| `LS_Postgres_DW` (bare name) | Read `ETL_CONN_LS_POSTGRES_DW` from environment |

### Environment Variable Convention

```bash
# For each linked service, the ops team sets one env var:
# ETL_CONN_<UPPERCASE_LS_NAME> = connection string

export ETL_CONN_LS_SQLSERVER_CRM="Server=crm-server;Database=CRM;UID=etl_svc;PWD=xxx"
export ETL_CONN_LS_POSTGRES_DW="postgresql://etl:pass@pg-dw.internal:5432/dw"
export ETL_CONN_LS_ADLS_GEN2="AccountName=datalake;AccountKey=xxx"
```

### Key Vault Resolution at Runtime

```python
# framework/config/resolver.py — add this method
def _resolve_kv_ref(self, ref: str) -> str:
    """
    ref format: kv://<linked_service_name>/<secret_name>
    Resolves via Azure SDK or env var fallback.
    """
    _, ls_name, secret_name = ref.split("/", 2)
    # In Azure runtime: use DefaultAzureCredential
    try:
        from azure.keyvault.secrets import SecretClient
        from azure.identity import DefaultAzureCredential
        vault_url = os.environ[f"ETL_KV_URL_{ls_name.upper().replace('-','_')}"]
        client = SecretClient(vault_url=vault_url, credential=DefaultAzureCredential())
        return client.get_secret(secret_name).value
    except Exception:
        # Local dev fallback: ETL_SECRET_<SECRET_NAME>
        env_key = f"ETL_SECRET_{secret_name.upper().replace('-','_')}"
        return os.environ[env_key]
```

---

## 8. Dispatcher Update for ZIP Files

Update `agent/agents/parser/dispatcher.py` to handle `.zip` input:

```python
def run(state: AgentState) -> dict:
    path = Path(state["raw_artifact_path"])
    source_type = state.get("source_type", "")

    # ZIP always routes to ADF support file parser
    if path.suffix.lower() == ".zip":
        from agent.agents.parser.adf_support import run as adf_support_run
        return adf_support_run(state)

    # Directory with JSON files → ADF support file (extracted)
    if path.is_dir() and any(path.glob("pipeline/*.json")):
        from agent.agents.parser.adf_support import run as adf_support_run
        return adf_support_run(state)

    # Single JSON → simple ADF parser
    if path.suffix.lower() == ".json" or source_type == "adf":
        from agent.agents.parser.adf import run as adf_run
        return adf_run(state)

    if path.suffix.lower() == ".dtsx" or source_type == "ssis":
        from agent.agents.parser.ssis import run as ssis_run
        return ssis_run(state)

    if path.suffix.lower() == ".xml" or source_type == "informatica":
        from agent.agents.parser.informatica import run as informatica_run
        return informatica_run(state)

    return {"error_log": state.get("error_log", []) + [
        f"Cannot determine source type for: {path}"
    ]}
```

---

## 9. CLI Usage

```bash
# Convert a single ADF support file ZIP
etl-agent convert \
  downloads/support_file_PL_LoadDimCustomer.zip \
  --output-dir output/

# Specify which pipeline to convert (if ZIP has multiple)
etl-agent convert \
  downloads/support_file_PL_LoadDimCustomer.zip \
  --artifact-id PL_LoadDimCustomer \
  --output-dir output/

# Convert an extracted directory
etl-agent convert \
  downloads/PL_LoadDimCustomer_extracted/ \
  --output-dir output/

# Batch: process a folder of ZIPs
etl-batch \
  --input-dir downloads/adf_exports/ \
  --output-dir output/yaml/ \
  --source-type adf
```

---

## 10. Implementation Session Prompt — P2b

**Session:** P2b — `agent/agents/parser/adf_support.py`
**Sprint:** 5 | **Duration:** 90 min
**Test:** `pytest tests/agent/test_adf_support_parser.py -v`

```
Implement `agent/agents/parser/adf_support.py`.

Read these files FIRST:
- #file:docs/brainstorming/adf-support-file-parser.md  (full design — this is your spec)
- #file:agent/agents/parser/adf.py  (existing simple parser — use as style reference)
- #file:agent/CLAUDE.md section "Vendor → Canonical Mapping Tables"

The parser must handle the ZIP file downloaded from ADF portal (Pipeline → Download support file).

Implement these classes and functions exactly as designed in the doc:
1. AdfCatalog class — load_from_zip(), load_from_dir(), _store()
2. run(state) → dict — entry point, uses AdfCatalog then calls _parse_dataflow or _parse_copy_activity
3. _resolve_dataset() — Dataset → LinkedService → canonical connector + connection ref
4. _resolve_linked_service() — LinkedService → ADF_LINKED_SERVICE_MAP + _build_connection_ref()
5. _build_connection_ref() — Key Vault ref → "kv://ls_name/secret_name"; never raw credential
6. _parse_dataflow_script() — ADF DSL script → list of IR transform dicts
7. _extract_script_properties() — per-keyword property extraction (filter/derive/lookup/aggregate/sort/select)
8. _topological_sort() — sort activities by dependsOn graph
9. _trigger_to_cron() — ScheduleTrigger/TumblingWindowTrigger → cron string
10. _map_write_behavior() — ADF writeBehavior → framework load_strategy

Update agent/agents/parser/dispatcher.py to route .zip files to adf_support.run.

Create test fixtures in tests/fixtures/adf_support/:
  minimal_pipeline.zip containing:
    pipeline/PL_Test.json — one ExecuteDataFlow + one Copy activity
    dataflow/DF_Test.json — filter + derive + aggregate in script DSL
    dataset/DS_Src.json  — SqlServerTable linked to LS_SQL
    dataset/DS_Snk.json  — AzurePostgreSqlTable linked to LS_PG
    linkedService/LS_SQL.json — SqlServer type with KV password ref
    linkedService/LS_PG.json  — AzurePostgreSql type
    trigger/TR_Daily.json — ScheduleTrigger daily at 02:00

Write tests in tests/agent/test_adf_support_parser.py:
- test_load_from_zip: catalog contains correct counts per folder
- test_execute_dataflow_parsed: DF transforms appear in ir["transforms"]
- test_copy_activity_parsed: Copy activity → source and sink in ir
- test_linked_service_resolved: LS_SQL → connector="sqlserver"
- test_kv_password_captured: password.type=AzureKeyVaultSecret → connection="kv://..."
- test_no_raw_credential: assert "PWD=" not in any ir["sources"][*]["connection"]
- test_script_filter_parsed: filter(status == 'ACTIVE') → row_filter, condition extracted
- test_script_derive_parsed: derive(full_name = first_name + ' ' + last_name) → column_derive
- test_script_aggregate_parsed: aggregate(groupBy(region), total=sum(amt)) → aggregate
- test_trigger_daily_cron: TR_Daily → schedule="0 2 * * *"
- test_self_hosted_ir_flagged: SelfHosted IR → source has network="on_prem"
- test_foreach_loop_emits_warning: ForEach activity → warnings non-empty, auto_convertible=False
- test_dispatcher_routes_zip: .zip extension → adf_support.run called
```

---

## 11. Expected IR Output

For the minimal fixture above, the IR should look like:

```json
{
  "ir_version": "1.0",
  "source_origin": {"type": "adf", "artifact_id": "PL_LoadDimCustomer"},
  "job": {
    "name": "PL_LoadDimCustomer",
    "schedule": "0 2 * * *",
    "integration_runtime": "azure"
  },
  "parameters": {
    "RunDate": "@utcnow()",
    "SourceSchema": "dbo"
  },
  "sources": [{
    "id": "srcCustomers",
    "connector": "sqlserver",
    "connection": "kv://LS_KeyVault/sqlserver-crm-password",
    "table": "customers",
    "schema": "dbo",
    "schema_columns": [
      {"name": "customer_id", "type": "int"},
      {"name": "first_name",  "type": "str"},
      {"name": "status",      "type": "str"}
    ]
  }],
  "transforms": [
    {"id": "filterActive",   "type": "row_filter",    "inputs": ["srcCustomers"], "properties": {"condition": "status == 'ACTIVE'"}},
    {"id": "deriveFullName", "type": "column_derive",  "inputs": ["filterActive"], "properties": {"derivations": {"full_name": "first_name + ' ' + last_name"}}},
    {"id": "aggByRegion",    "type": "aggregate",      "inputs": ["deriveFullName"], "properties": {"group_by": ["region"], "measures": {"total_sales": "sum(amount)"}}}
  ],
  "sinks": [{
    "id": "sinkDimCustomer",
    "connector": "postgres",
    "connection": "ls://LS_Postgres_DW",
    "table": "dim_customer",
    "schema": "public",
    "load_strategy": "upsert",
    "upsert_keys": ["customer_id"]
  }],
  "pre_sql": [],
  "parameters": {"RunDate": "@utcnow()"},
  "warnings": [],
  "metadata": {"auto_convertible": true}
}
```
