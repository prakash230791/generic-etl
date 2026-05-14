# ADF Real-World Parser Fixes & ForEach Pattern Guide

**Document Type:** Engineering Fix & Pattern Reference
**Version:** 1.0
**Date:** 2026-05-13
**Triggered by:** Real ADF support file export test revealing 4 gaps
**Companion:** `adf-support-file-parser.md`, `implementation-plan.md` session P2b/P2c

---

## 1. What the Real Export Revealed

Testing against a real ADF support file ZIP showed a pipeline with this structure:

```
PL_VS_Customer_Information (orchestration-only)
│
├── LookupMapping          (Lookup — reads control table: list of tables to process)
│
├── Loop_TableNames        (ForEach ⚠️ — iterates over LookupMapping output)
│   └── [inner activities]
│       ├── check_max_date (Script  → captured as pre_sql ✅)
│       └── [inner Copy or DataFlow per table — THIS is where the ETL lives]
│
├── ForEach1               (ForEach ⚠️ — second loop)
│   └── Concate_list_of_tables (SetVariable — ignored ✅)
│
└── Send_mail              (SqlServerStoredProcedure → captured as pre_sql ✅)
```

**Result:** `ir["sources"]`, `ir["transforms"]`, `ir["sinks"]` all empty — the real ETL is
inside the ForEach loops, not at the top-level pipeline.

### The 3 parser fixes already applied

| Issue | Linked Service Property | Fix Applied |
|---|---|---|
| ADF-encrypted credential | `encryptedCredential: "ew0K..."` (opaque blob) | → `ls://sqlServer` (opaque ref, re-configure at deploy) |
| Managed Identity | `credential: {type: CredentialReference}` or `authenticationType: ManagedServiceIdentity` | → `msi://vqevdewmi` (resolved via DefaultAzureCredential at runtime) |
| Child pipeline schedule | Trigger fires parent `ETL_Package`, not this pipeline | → `schedule: ""` + warning: "Schedule controlled by parent ETL_Package" |

### The remaining gap (this document)

The **ForEach parameterized ETL pattern** — all inner copy/dataflow activities use
`@item().tableName` or `@dataset().tableName` as dynamic parameters. The parser must:

1. Detect ForEach loops that contain inner ETL activities
2. Extract the inner activities
3. Identify the iteration parameter (`@item().*` references)
4. Generate either a **parameterized framework job** OR **one job per table** (from control table)

---

## 2. The ForEach Pattern — JSON Structure

```json
{
  "name": "Loop_TableNames",
  "type": "ForEach",
  "dependsOn": [{"activity": "LookupMapping", "dependencyConditions": ["Succeeded"]}],
  "typeProperties": {
    "items": "@activity('LookupMapping').output.value",
    "isSequential": false,
    "batchCount": 4
  },
  "activities": [
    {
      "name": "check_max_date",
      "type": "Script",
      "typeProperties": {
        "scripts": [{"type": "Query",
                     "text": "SELECT MAX(updated_dt) FROM @{item().source_schema}.@{item().source_table}"}]
      }
    },
    {
      "name": "DF_LoadTable",
      "type": "ExecuteDataFlow",
      "typeProperties": {
        "dataflow": {"referenceName": "DF_GenericLoad", "type": "DataFlowReference"},
        "parameters": {
          "sourceTable":  "@item().source_table",
          "sourceSchema": "@item().source_schema",
          "targetTable":  "@item().target_table",
          "targetSchema": "@item().target_schema",
          "watermarkCol": "@item().watermark_column"
        }
      }
    }
  ]
}
```

**What the ForEach activity tells us:**

| Field | Meaning |
|---|---|
| `typeProperties.items` | Source of iteration values — usually a Lookup activity output |
| `typeProperties.batchCount` | Parallelism — maps to framework job concurrency |
| `activities[]` | Inner activities — THIS is where the ETL is |
| `parameters` with `@item().*` | Dynamic column/table names from the control table |

---

## 3. The Lookup Activity — Control Table

The `LookupMapping` activity reads from a control table (common enterprise pattern):

```json
{
  "name": "LookupMapping",
  "type": "Lookup",
  "typeProperties": {
    "source": {
      "type": "AzureSqlSource",
      "sqlReaderQuery": "SELECT source_schema, source_table, target_schema, target_table, watermark_column, load_type FROM dbo.CONTROL_TABLE WHERE is_active = 1"
    },
    "dataset": {"referenceName": "DS_ControlDB", "type": "DatasetReference"},
    "firstRowOnly": false
  }
}
```

The output of this Lookup (`@activity('LookupMapping').output.value`) is a list of rows.
Each row is one iteration of the ForEach loop → one ETL job.

---

## 4. Two Conversion Strategies

### Strategy A — Parameterized Framework Job (recommended)

Generate ONE YAML job where table names are runtime parameters:

```yaml
version: "1.0"
job:
  name: PL_VS_Customer_Information
  description: "Parameterized load — one run per table in CONTROL_TABLE"

parameters:
  source_schema:    "dbo"       # overridden at runtime per iteration
  source_table:     ""          # required
  target_schema:    "dbo"
  target_table:     ""          # required
  watermark_col:    "updated_dt"

sources:
  - id: src_table
    connector: sqlserver
    connection: ls://sqlServer
    query: |
      SELECT * FROM {{ parameters.source_schema }}.{{ parameters.source_table }}
      WHERE {{ parameters.watermark_col }} > :last_run_dt

transformations:
  - id: df_transform
    type: column_derive         # from DF_GenericLoad DataFlow
    input: src_table
    derivations: {}             # populated by DataFlow parser

targets:
  - id: tgt_table
    connector: azure_sql
    connection: msi://vqevdewmi
    schema: "{{ parameters.target_schema }}"
    table:  "{{ parameters.target_table }}"
    input: df_transform
    load_strategy: upsert

pre_sql:
  - "SELECT MAX(updated_dt) FROM {{ parameters.source_schema }}.{{ parameters.source_table }}"

schedule: ""   # driven by parent pipeline ETL_Package
```

**Runner invocation (one call per control table row):**
```bash
etl-run run job_config.yaml \
  --param source_schema=dbo \
  --param source_table=customers \
  --param target_schema=public \
  --param target_table=dim_customer \
  --param watermark_col=updated_dt
```

---

### Strategy B — One Job Per Table (expand from control table)

At migration time, query the control table and generate N YAML files:

```bash
# etl-agent expand generates one YAML per control table row
etl-agent expand \
  --source support_file_PL_VS_Customer_Information.zip \
  --control-conn "Server=...;Database=...;UID=...;PWD=..." \
  --control-query "SELECT * FROM dbo.CONTROL_TABLE WHERE is_active=1" \
  --output-dir output/expanded/
```

Produces:
```
output/expanded/
├── PL_VS_Customer_Information__customers.yaml
├── PL_VS_Customer_Information__orders.yaml
├── PL_VS_Customer_Information__products.yaml
└── expansion_report.json
```

---

## 5. Parser Algorithm Update — `_parse_foreach`

Add this to `adf_support.py`:

```python
def _parse_foreach_activity(
    activity: dict,
    catalog: "AdfCatalog",
    ir: dict,
    pipeline_activities: list[dict],
) -> None:
    """
    Extract ETL from a ForEach loop and populate ir with parameterized sources/transforms/sinks.

    Two cases:
      A. Inner activities contain ExecuteDataFlow or Copy → parameterized ETL
      B. Inner activities are all control-flow only (SetVariable, etc.) → ignore ETL-wise
    """
    act_name = activity["name"]
    inner = activity.get("activities", [])

    # Find the Lookup activity that feeds this ForEach (items expression)
    items_expr = activity["typeProperties"].get("items", "")
    lookup_name = _extract_lookup_ref(items_expr)  # e.g. "LookupMapping"
    lookup_activity = next(
        (a for a in pipeline_activities if a["name"] == lookup_name), None
    )

    # Extract the control table query if available
    if lookup_activity:
        lookup_query = (
            lookup_activity.get("typeProperties", {})
            .get("source", {})
            .get("sqlReaderQuery", "")
        )
        if lookup_query:
            ir["metadata"]["control_table_query"] = lookup_query

    # Find ETL inner activities
    etl_inner = [
        a for a in inner
        if a.get("type") in ("ExecuteDataFlow", "Copy")
    ]

    # Find pre/post SQL inner activities
    for a in inner:
        if a.get("type") in ("Script", "SqlServerStoredProcedure"):
            sql = (
                a.get("typeProperties", {}).get("storedProcedureName") or
                (a.get("typeProperties", {}).get("scripts") or [{}])[0].get("text", "")
            )
            if sql:
                ir["pre_sql"].append(f"-- ForEach inner: {a['name']}\n{sql}")

    if not etl_inner:
        # Pure control-flow inner activities — nothing to extract
        ir["warnings"].append(
            f"ForEach '{act_name}' contains no ETL activities — "
            f"inner activities: {[a['name'] for a in inner]}"
        )
        return

    # Mark as parameterized + flag for manual review
    ir["metadata"]["foreach_pattern"] = True
    ir["metadata"]["foreach_activity"] = act_name
    ir["metadata"]["parallelism"] = activity["typeProperties"].get("batchCount", 1)
    ir["metadata"]["auto_convertible"] = False  # needs human confirmation of strategy

    # Extract @item() parameter references from all inner activities
    item_params = _extract_item_params(etl_inner)
    ir["parameters"].update({p: f"@item().{p}" for p in item_params})
    ir["metadata"]["iteration_params"] = item_params

    # Parse inner ETL activities into IR (same as top-level)
    for inner_act in etl_inner:
        if inner_act["type"] == "ExecuteDataFlow":
            df_ref = inner_act["typeProperties"]["dataflow"]["referenceName"]
            if df_ref in catalog.dataflows:
                _parse_dataflow(catalog.dataflows[df_ref], catalog, ir)
                # Tag sources/sinks as parameterized
                for src in ir["sources"]:
                    src["parameterized"] = True
                    src["param_refs"] = item_params
                for snk in ir["sinks"]:
                    snk["parameterized"] = True
                    snk["param_refs"] = item_params
            else:
                ir["warnings"].append(
                    f"ForEach inner DataFlow '{df_ref}' not found in ZIP"
                )
        elif inner_act["type"] == "Copy":
            _parse_copy_activity(inner_act, catalog, ir)
            # Tag as parameterized
            for src in ir["sources"]:
                src["parameterized"] = True
            for snk in ir["sinks"]:
                snk["parameterized"] = True

    # Add strategy recommendation to metadata
    ir["metadata"]["conversion_strategy"] = (
        "parameterized_job"   # use Strategy A (single YAML + runtime params)
        if len(item_params) <= 6
        else "expand_per_table"  # use Strategy B (one YAML per table)
    )

    ir["warnings"].append(
        f"ForEach '{act_name}' — parameterized ETL detected. "
        f"Iteration params: {item_params}. "
        f"Recommended strategy: {ir['metadata']['conversion_strategy']}. "
        f"Review output/manual_review_items.json for expansion options."
    )


def _extract_lookup_ref(items_expr: str) -> str | None:
    """Extract the Lookup activity name from a ForEach items expression.

    Examples:
      "@activity('LookupMapping').output.value"  → "LookupMapping"
      "@activity('GetTables').output.firstRow"   → "GetTables"
    """
    m = re.search(r"@activity\('([^']+)'\)", items_expr)
    return m.group(1) if m else None


def _extract_item_params(activities: list[dict]) -> list[str]:
    """
    Find all @item().fieldName references in activity typeProperties.
    Returns the list of unique field names.
    """
    params: set[str] = set()
    raw = json.dumps(activities)
    for m in re.finditer(r"@item\(\)\.([\w]+)", raw):
        params.add(m.group(1))
    # Also catch @{item().fieldName} template syntax
    for m in re.finditer(r"@\{item\(\)\.([\w]+)\}", raw):
        params.add(m.group(1))
    return sorted(params)
```

---

## 6. Credential Fix Details

### Fix A — `encryptedCredential`

ADF stores on-premises credentials as an ADF-encrypted blob (tied to the Self-Hosted IR
machine key). The blob cannot be decrypted outside ADF.

```json
{
  "name": "LS_SQLServer_OnPrem",
  "properties": {
    "type": "SqlServer",
    "typeProperties": {
      "connectionString": "data source=on-prem-server;initial catalog=CRM;",
      "encryptedCredential": "ew0KICAiVHlwZSI6ICJTcWxQYXNzd29yZCIsIC..."
    }
  }
}
```

**Parser handling:**
```python
if "encryptedCredential" in type_props:
    # Cannot decrypt — use linked service name as opaque reference
    # Ops team must set ETL_CONN_<LS_NAME_UPPER> env var at deploy time
    return f"ls://{ls_name}"
    # Also add warning to IR
    ir["warnings"].append(
        f"LinkedService '{ls_name}' uses encryptedCredential (ADF Self-Hosted IR key). "
        f"Set env var ETL_CONN_{ls_name.upper().replace('-','_')} with the connection string."
    )
```

---

### Fix B — Managed Identity (`credential` reference)

```json
{
  "name": "LS_AzureSqlMI",
  "properties": {
    "type": "AzureSqlMI",
    "typeProperties": {
      "connectionString": "data source=mi.database.windows.net;initial catalog=DW;",
      "credential": {
        "referenceName": "vqevdewmi",
        "type": "CredentialReference"
      }
    }
  }
}
```

OR inline MSI:
```json
{
  "typeProperties": {
    "connectionString": "...",
    "servicePrincipalId": null,
    "authenticationType": "ManagedServiceIdentity"
  }
}
```

**Parser handling:**
```python
credential = type_props.get("credential", {})
auth_type = type_props.get("authenticationType", "")

if credential.get("type") == "CredentialReference":
    cred_name = credential.get("referenceName", ls_name)
    return f"msi://{cred_name}"
    # Runtime: connector uses DefaultAzureCredential (workload identity / MSI)

elif auth_type in ("ManagedServiceIdentity", "SystemAssignedManagedIdentity"):
    return f"msi://{ls_name}"
```

**Runtime resolution in connectors:**
```python
# framework/config/resolver.py
def _resolve_msi_ref(self, ref: str) -> dict:
    """ref format: msi://<credential_name> — use Azure DefaultAzureCredential."""
    # For SQL Server / Azure SQL MI:
    # connection string uses "Authentication=ActiveDirectoryMsi" with pyodbc
    cred_name = ref.replace("msi://", "")
    server = os.environ.get(f"ETL_SERVER_{cred_name.upper().replace('-','_')}")
    database = os.environ.get(f"ETL_DATABASE_{cred_name.upper().replace('-','_')}")
    return {
        "type": "msi",
        "connection_string": (
            f"Server={server};Database={database};"
            f"Authentication=ActiveDirectoryMsi;Encrypt=yes;"
        )
    }
```

---

### Fix C — Child Pipeline Schedule

The trigger fires `ETL_Package` (parent), not the pipeline being parsed.

```python
def _find_schedule(pipeline_name: str, catalog: "AdfCatalog", ir: dict) -> None:
    """
    Try to find a trigger for this pipeline.
    If none found, look for parent pipeline ExecutePipeline references.
    """
    # Direct trigger
    for trigger in catalog.triggers.values():
        linked = [
            p["pipelineReference"]["referenceName"]
            for p in trigger.get("properties", {}).get("pipelines", [])
        ]
        if pipeline_name in linked:
            ir["job"]["schedule"] = _trigger_to_cron(trigger)
            return

    # No direct trigger — search for parent pipelines that call this one
    for parent_name, parent_data in catalog.pipelines.items():
        if parent_name == pipeline_name:
            continue
        for act in parent_data.get("properties", {}).get("activities", []):
            if (act.get("type") == "ExecutePipeline" and
                act.get("typeProperties", {}).get("pipeline", {})
                    .get("referenceName") == pipeline_name):
                # Found parent — get parent schedule
                for trigger in catalog.triggers.values():
                    parent_linked = [
                        p["pipelineReference"]["referenceName"]
                        for p in trigger.get("properties", {}).get("pipelines", [])
                    ]
                    if parent_name in parent_linked:
                        ir["job"]["schedule"] = _trigger_to_cron(trigger)
                        ir["job"]["schedule_note"] = (
                            f"Schedule inherited from parent pipeline '{parent_name}'"
                        )
                        return

    # Still not found
    ir["warnings"].append(
        "No trigger found for this pipeline. "
        "It may be triggered by an external orchestrator or parent pipeline not in this ZIP."
    )
```

---

## 7. Updated `run()` in `adf_support.py`

```python
def run(state: AgentState) -> dict:
    # ... (existing catalog load and pipeline selection) ...

    for activity in activity_order:
        act_type = activity.get("type", "")
        act_name = activity.get("name", "")

        if act_type == "ExecuteDataFlow":
            # ... existing handling ...

        elif act_type == "Copy":
            # ... existing handling ...

        elif act_type == "ForEach":
            # NEW: extract inner ETL from ForEach loops
            _parse_foreach_activity(activity, catalog, ir, activities)

        elif act_type == "Lookup":
            # Control-flow Lookup (reads control table) — store query for reference
            lookup_query = (
                activity.get("typeProperties", {})
                .get("source", {})
                .get("sqlReaderQuery", "")
            )
            if lookup_query:
                ir["metadata"]["lookup_queries"] = ir["metadata"].get("lookup_queries", [])
                ir["metadata"]["lookup_queries"].append({
                    "activity": act_name,
                    "query": lookup_query,
                })

        elif act_type in ("Script", "SqlServerStoredProcedure", "StoredProcedure"):
            sql = (
                activity.get("typeProperties", {}).get("storedProcedureName") or
                (activity.get("typeProperties", {}).get("scripts") or [{}])[0].get("text", "")
            )
            if sql:
                ir["pre_sql"].append(f"-- {act_name}\n{sql}")

        elif act_type == "SetVariable":
            pass   # variable assignments — ignore for ETL purposes

        elif act_type == "SendMail":
            pass   # notification — ignore

        elif act_type == "ExecutePipeline":
            child = activity["typeProperties"]["pipeline"]["referenceName"]
            ir["warnings"].append(
                f"ExecutePipeline '{act_name}' calls '{child}' — "
                f"convert child pipeline separately"
            )
            ir["metadata"]["auto_convertible"] = False

        elif act_type in ("IfCondition", "Until", "Switch"):
            ir["warnings"].append(
                f"Control-flow '{act_type}' activity '{act_name}' — "
                f"review branching logic manually"
            )
            ir["metadata"]["auto_convertible"] = False

    # Schedule resolution (after all activities processed)
    _find_schedule(pipeline_name, catalog, ir)

    return {"ir": ir}
```

---

## 8. Updated IR for ForEach Pattern

For the real pipeline (`PL_VS_Customer_Information`), the IR now looks like:

```json
{
  "ir_version": "1.0",
  "source_origin": {"type": "adf", "artifact_id": "PL_VS_Customer_Information"},
  "job": {
    "name": "PL_VS_Customer_Information",
    "schedule": "0 2 * * *",
    "schedule_note": "Schedule inherited from parent pipeline 'ETL_Package'",
    "integration_runtime": "azure"
  },
  "parameters": {
    "source_schema":   "@item().source_schema",
    "source_table":    "@item().source_table",
    "target_schema":   "@item().target_schema",
    "target_table":    "@item().target_table",
    "watermark_column":"@item().watermark_column"
  },
  "sources": [{
    "id": "srcCustomers",
    "connector": "sqlserver",
    "connection": "ls://sqlServer",
    "parameterized": true,
    "param_refs": ["source_schema", "source_table", "watermark_column"]
  }],
  "transforms": [
    {"id": "filterActive", "type": "row_filter", "inputs": ["srcCustomers"],
     "properties": {"condition": "status == 'ACTIVE'"}}
  ],
  "sinks": [{
    "id": "sinkTarget",
    "connector": "azure_sql",
    "connection": "msi://vqevdewmi",
    "parameterized": true,
    "param_refs": ["target_schema", "target_table"]
  }],
  "pre_sql": [
    "-- check_max_date\nSELECT MAX(updated_dt) FROM @{item().source_schema}.@{item().source_table}"
  ],
  "metadata": {
    "auto_convertible": false,
    "foreach_pattern": true,
    "foreach_activity": "Loop_TableNames",
    "parallelism": 4,
    "iteration_params": ["source_schema", "source_table", "target_schema", "target_table", "watermark_column"],
    "conversion_strategy": "parameterized_job",
    "control_table_query": "SELECT source_schema, source_table, target_schema, target_table, watermark_column FROM dbo.CONTROL_TABLE WHERE is_active = 1",
    "auto_convertible": false
  },
  "warnings": [
    "LinkedService 'sqlServer' uses encryptedCredential. Set env var ETL_CONN_SQLSERVER.",
    "ForEach 'Loop_TableNames' — parameterized ETL detected. Iteration params: [source_schema, source_table, target_schema, target_table, watermark_column]. Recommended strategy: parameterized_job.",
    "Schedule inherited from parent pipeline 'ETL_Package'"
  ]
}
```

---

## 9. Parameterized YAML Generator Update

When `ir["metadata"]["foreach_pattern"] == True`, the YAML generator must produce
a **parameterized job** rather than a concrete one:

```python
# agent/agents/generation/yaml_generator.py — add this handling

def _render_parameterized_sources(sources: list[dict], ir: dict) -> list[dict]:
    """Replace @item().param references with {{ parameters.param }} template syntax."""
    rendered = []
    for src in sources:
        s = dict(src)
        if s.get("parameterized"):
            # Replace @item().source_table → {{ parameters.source_table }}
            s.pop("parameterized", None)
            s.pop("param_refs", None)
            # Table becomes a parameter reference
            if "table" not in s:
                s["table"] = "{{ parameters.source_table }}"
            if "schema" not in s:
                s["schema"] = "{{ parameters.source_schema }}"
        rendered.append(s)
    return rendered
```

---

## 10. Manual Review Report

For `auto_convertible=False` pipelines, the manual review report must include
the full expansion plan:

```json
{
  "artifact_id": "PL_VS_Customer_Information",
  "track": "manual",
  "reason": "ForEach parameterized ETL pattern",
  "conversion_strategy": "parameterized_job",
  "action_items": [
    {
      "item": "Verify parameterized YAML against actual control table rows",
      "detail": "Run: SELECT * FROM dbo.CONTROL_TABLE WHERE is_active=1 to see all tables",
      "effort_hours": 2
    },
    {
      "item": "Re-configure encryptedCredential for sqlServer linked service",
      "detail": "Set env var ETL_CONN_SQLSERVER with new connection string (old ADF credential cannot be decrypted)",
      "effort_hours": 0.5
    },
    {
      "item": "Verify MSI identity has access to Azure SQL MI target",
      "detail": "Grant db_datareader + db_datawriter to managed identity 'vqevdewmi'",
      "effort_hours": 0.5
    },
    {
      "item": "Wire parent orchestrator to pass parameters",
      "detail": "Parent pipeline ETL_Package must call etl-run with --param flags per control table row",
      "effort_hours": 1
    }
  ],
  "estimated_effort_hours": 4.0
}
```

---

## 11. Implementation Session Prompt — P2c

**Session:** P2c — ForEach pattern, credential fixes, child pipeline schedule
**Sprint:** 5 | **Duration:** 75 min
**Test:** `pytest tests/agent/test_adf_foreach.py -v`

```
Fix and extend `agent/agents/parser/adf_support.py` for real-world ADF patterns.

Read FIRST:
- #file:docs/brainstorming/adf-real-world-fixes.md   (this document — your full spec)
- #file:agent/agents/parser/adf_support.py           (file to modify)

Apply these changes in order:

─── Fix 1: encryptedCredential in _build_connection_ref() ───
In _build_connection_ref(), add before the SecureString check:
  if "encryptedCredential" in type_props:
      ir_ref["warnings"].append(...)   # note: pass ir as param or return warning separately
      return f"ls://{ls_name}"

─── Fix 2: Managed Identity credential in _resolve_linked_service() ───
In _resolve_linked_service(), after extracting type_props:
  credential = type_props.get("credential", {})
  auth_type = type_props.get("authenticationType", "")
  if credential.get("type") == "CredentialReference":
      conn_ref = f"msi://{credential.get('referenceName', ls_name)}"
  elif auth_type in ("ManagedServiceIdentity", "SystemAssignedManagedIdentity"):
      conn_ref = f"msi://{ls_name}"
  else:
      conn_ref = _build_connection_ref(ls_name, type_props, catalog)

─── Fix 3: Child pipeline schedule in run() ───
Replace the current single-pass trigger loop with _find_schedule(pipeline_name, catalog, ir)
as shown in the spec (section 6 of this doc). This checks direct triggers first,
then parent pipeline triggers if no direct trigger found.

─── New: _parse_foreach_activity() ───
Add the complete function from section 5 of this doc.
Wire it into run() under the "ForEach" act_type branch.
Also handle: Lookup (store control_table_query), SetVariable (ignore),
SendMail (ignore), IfCondition/Until/Switch (warning + auto_convertible=False).

─── New: _extract_lookup_ref() and _extract_item_params() ───
Add both helper functions exactly as shown in section 5.

Create test fixtures in tests/fixtures/adf_support/foreach/:
  pipeline/PL_Foreach_Test.json   — ForEach with inner ExecuteDataFlow
  dataflow/DF_GenericLoad.json    — filter + derive in script
  dataset/DS_Src.json + DS_Snk.json
  linkedService/LS_SQLOnPrem.json — with encryptedCredential
  linkedService/LS_SQLMI.json     — with credential CredentialReference
  trigger/TR_Parent.json          — fires parent pipeline, not this one

Write tests in tests/agent/test_adf_foreach.py:
- test_foreach_extracts_inner_dataflow: inner ExecuteDataFlow → ir transforms non-empty
- test_foreach_extracts_iteration_params: @item().source_table found → in ir["parameters"]
- test_foreach_marks_parameterized: sources have parameterized=True
- test_foreach_pre_sql_from_script: inner Script activity → ir["pre_sql"] non-empty
- test_foreach_metadata_strategy: <= 6 params → conversion_strategy="parameterized_job"
- test_encrypted_credential_returns_ls_ref: encryptedCredential → "ls://ls_name"
- test_msi_credential_reference: CredentialReference → "msi://cred_name"
- test_msi_auth_type: authenticationType=ManagedServiceIdentity → "msi://ls_name"
- test_child_pipeline_schedule_inherited: no direct trigger → schedule from parent
- test_no_trigger_emits_warning: no trigger anywhere → warning in ir["warnings"]
- test_control_table_query_captured: Lookup activity → ir["metadata"]["control_table_query"]
- test_auto_convertible_false_for_foreach: ForEach → metadata["auto_convertible"]=False
```

---

## 12. Complexity Scoring Update

Add ForEach pattern to `agent/agents/analysis/complexity.py`:

```python
# Additional scoring rules for ADF-specific patterns
if ir.get("metadata", {}).get("foreach_pattern"):
    score += 1   # parameterized — needs human confirmation of strategy

iteration_params = ir.get("metadata", {}).get("iteration_params", [])
if len(iteration_params) > 6:
    score += 1   # many params → prefer expand_per_table strategy

if any("msi://" in (s.get("connection","")) for s in ir.get("sources",[])+ir.get("sinks",[])):
    # MSI auth — confirm identity has correct DB permissions
    score += 0   # not complexity per se, but add to manual review items

if ir.get("pre_sql"):
    score += 1   # pre/post SQL adds ordering dependency

lookup_queries = ir.get("metadata", {}).get("lookup_queries", [])
if lookup_queries:
    score += 1   # control table pattern — needs ops team coordination
```

---

*Update `agent/CLAUDE.md` with the four new patterns after P2c is implemented.*
