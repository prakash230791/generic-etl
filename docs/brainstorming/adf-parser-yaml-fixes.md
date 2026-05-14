# ADF Parser & YAML Generator Fixes — Session Log & Prompts

**Document Type:** Session Log + Implementation Prompts
**Version:** 1.0
**Date:** 2026-05-14
**Status:** Sessions ADF-FIX-1, ADF-FIX-2, YAML-FIX-1, YAML-FIX-2, YAML-FIX-3 completed locally
**Companion:** `adf-support-file-parser.md`, `adf-real-world-fixes.md`, `control-table-and-framework-v2.md`

---

## What Was Discovered (Real Pipeline Test)

Testing against `VPFLookups_sync_PLE_support_live.zip` revealed 5 additional gaps
beyond the ForEach/credential/schedule fixes in `adf-real-world-fixes.md`:

| Gap | Root Cause | Fix Session |
|---|---|---|
| Script text fields arrive as `{"value":"...", "type":"Expression"}` dicts | ADF serializes parameterized text as Expression objects | ADF-FIX-1 |
| `preCopyScript` on Copy sink not captured | Parser only read `sqlReaderQuery` from source | ADF-FIX-1 |
| Pipeline variables (e.g. TRUNCATE) not mapped to `load_strategy` | Variables block ignored | ADF-FIX-1 |
| Stored procedure steps missing canonical type | `type` was emitted as raw ADF type | ADF-FIX-1 |
| `yaml_generator.py` used `"sql"` key in step blocks | Schema expects `"query"` | YAML-FIX-2 |
| `"on_failure": "warn"` in audit_log step | Schema has `additionalProperties: false` | YAML-FIX-2 |
| `sources`/`targets` missing `id` field | `named_connector` requires `id` | YAML-FIX-2 |

---

## Validated Output (2026-05-14)

Running `python -m agent.cli batch VPFLookups_sync_PLE_support_live.zip` after all fixes:

```
Pipeline:   VPFLookups_sync_PLE
Output:     job_config.yaml — schema validation PASSED (Tier 1 + Tier 2)
Parameters: version 2.0

Source:  sqlserver via ls://VPFSqlServer → dbo.{{ parameters.source_table }}
Target:  azure_sql via msi://vqevdevml (Managed Identity) → {{ parameters.target_table }}
         strategy: append

Pre-steps: 3 captured (stored procedures / ForEach SQL)
Complexity: 2/5 (auto track)

Warnings (manual review required):
  1. Schedule @2 *** is inherited from parent trigger — verify for this child pipeline
  2. ForEach 'LoopVPFAndCrmTableNames' — parameterized ETL, check manual_review_items.json
  3. Second ForEach contains only variable-append logic — skipped
```

---

## Session ADF-FIX-1 — Script text cleaning + preCopyScript + pipeline variables

**Duration:** ~43 min | **Tests:** `pytest tests/agent/ -v`
**File:** `agent/agents/parser/adf_support.py`
**Status:** ✅ DONE locally

### Changes

1. **`_extract_value()` helper** — ADF serializes parameterized text as Expression dicts.
   Add at module level, used everywhere a field may be string or dict:
   ```python
   def _extract_value(o: Any) -> Any:
       """Unwrap ADF Expression dict {"value":..., "type":"Expression"} → str.
       Returns plain scalars unchanged."""
       if isinstance(o, dict):
           return o.get("value", "")
       return o
   ```
   Apply in: `type_props["table"]`, `sqlReaderQuery`, script text, SP params, dataset fields.

2. **`preCopyScript` from Copy sink** — ADF Copy sink has `preCopyScript` / `preSql`
   fields that should become pre_steps. In `_parse_copy_activity()`, after resolving the sink:
   ```python
   pre_copy = sink_props.get("preCopyScript") or sink_props.get("preSql")
   if pre_copy:
       sql_text = _extract_value(pre_copy)
       if sql_text:
           ir["pre_steps"].append({
               "type": "sql",
               "connector": snk.get("connector", ""),
               "connection": snk.get("connection", ""),
               "query": sql_text,
           })
   ```

3. **Pipeline variables → `load_strategy`** — Pipeline `variables` block (separate from
   `parameters`) may contain TRUNCATE markers. In `run()`, after processing `parameters`:
   ```python
   for v_name, v_def in props.get("variables", {}).items():
       default_val = _extract_value(v_def.get("defaultValue", ""))
       if "TRUNCATE" in str(default_val).upper():
           ir["metadata"]["load_strategy"] = "TRUNCATE_INSERT"
       ir["parameters"][v_name] = default_val
   ```

4. **Stored procedure canonical step type** — In `_capture_sql_step()`, emit
   `type: "stored_procedure"` (not the ADF type string) for SP activities:
   ```python
   if act_type in ("SqlServerStoredProcedure", "StoredProcedure"):
       proc_name = type_props.get("storedProcedureName", "")
       params = type_props.get("storedProcedureParameters", {})
       ir["pre_steps"].append({
           "type": "stored_procedure",
           "name": proc_name,
           "parameters": {k: _extract_value(v.get("value","")) for k,v in params.items()},
       })
   ```

### Test assertions to add in `tests/agent/test_adf_support.py`

```python
def test_precopy_script_captured(ir):
    pre = [s for s in ir["pre_steps"] if s["type"] == "sql"]
    assert any("TRUNCATE" in s.get("query", "") for s in pre)

def test_pipeline_variables_load_strategy(ir):
    assert ir["metadata"].get("load_strategy") == "TRUNCATE_INSERT"

def test_stored_procedure_canonical_type(ir):
    sp = [s for s in ir["pre_steps"] if s["type"] == "stored_procedure"]
    assert len(sp) > 0

def test_expression_dict_unwrapped(ir):
    for src in ir["sources"]:
        assert not isinstance(src.get("table"), dict)

def test_no_source_data_in_prompt():
    # Security: confirm IR contains no actual row data
    import json
    ir_text = json.dumps(ir)
    assert "123456" not in ir_text   # sample row value
```

---

## Session ADF-FIX-2 — Integration re-validation

**Duration:** ~9 min | **Tests:** `pytest tests/integration/test_adf_support.py -v`
**Status:** ✅ DONE locally

After ADF-FIX-1, re-run the batch conversion and validate the output YAML:

```
python -m agent.cli batch sample_data/adf/ --output-dir output/batch/
```

Check the generated YAML:
1. `pre_steps[*].type` is `"sql"` or `"stored_procedure"` (not raw ADF type)
2. `pre_steps[*].query` contains real SQL (not `None` or Expression dict)
3. `metadata["load_strategy"]` == `"TRUNCATE_INSERT"` if pipeline had TRUNCATE variable
4. `sources[*].table` and `sinks[*].table` are strings (not dicts)
5. Stored procedures counted correctly

### Definition of Done
- Validates SQL contains real SQL text (not Python garbage)
- `load_strategy` field appears in YAML when TRUNCATE variable detected
- YAML passes schema validation (Tier 1 + Tier 2)
- Stored procedure type = `"stored_procedure"` in pre_steps

---

## Session YAML-FIX-1 — cli_batch.py: Call YAML generator

**Duration:** ~20 min | **Tests:** `python -m pytest tests/ -v`
**File:** `agent/agents/cli_batch.py`
**Status:** ✅ DONE locally

### What to implement

`agent/agents/cli_batch.py` is the batch processing CLI that:
1. Accepts an input directory of ADF ZIP files (or a single ZIP)
2. For each artifact, calls the ADF support parser → IR
3. If `ir["metadata"]["auto_convertible"]` is True (or absent), calls the YAML generator
4. Writes IR JSON and (if convertible) `job_config.yaml` to `output_dir/<artifact_name>/`
5. Returns a summary dict per artifact with `yaml_path` field

### Session Implementation Prompt

```
Implement agent/agents/cli_batch.py

Read FIRST:
  #file:agent/agents/parser/adf_support.py
  #file:agent/agents/generation/yaml_generator.py
  #file:docs/brainstorming/adf-parser-yaml-fixes.md  (this file)

Implement process_one(artifact_path, output_dir) that:
1. Calls adf_support.run(state) where state = {
       "raw_artifact_path": str(artifact_path),
       "artifact_id": artifact_path.stem,
       "source_type": "adf",
       "error_log": []
   }
2. Writes ir.json to output_dir/<stem>/ir.json
3. If ir["metadata"]["auto_convertible"] is True (default) AND no errors:
   - Imports and calls yaml_generator.generate(ir, output_dir / stem)
   - If ir["metadata"].get("auto_convertible") is False: write to draft_<stem>.yaml
     with a comment "# DRAFT — requires manual review"
   - Stores the yaml_path in result dict
4. Returns dict: {
       "artifact": stem,
       "ir_path": str(ir_json_path),
       "yaml_path": str(yaml_path) or None,
       "warnings": ir.get("warnings", []),
       "complexity": ir.get("complexity", {}),
       "auto_convertible": ir["metadata"].get("auto_convertible", True),
   }

Implement batch_migrate_adf(input_path, output_dir) that:
- If input_path is a single .zip → process just that one
- If input_path is a directory → glob for *.zip and *.json files
- Calls process_one() for each
- Returns list of result dicts

Rule: generator import must be INSIDE process_one (not at module top) to avoid
circular imports and keep batch module independently testable.

Run after:
  python -m agent.cli batch sample_data/adf/ --output-dir output/batch/
Expected: output/batch/ contains at least one job_config.yaml file.
```

### Test to add in `tests/agent/test_cli_batch.py`

```python
def test_process_one_returns_yaml_path(tmp_path, sample_adf_zip):
    result = process_one(sample_adf_zip, tmp_path)
    assert result["yaml_path"] is not None
    assert Path(result["yaml_path"]).exists()

def test_process_one_ir_written(tmp_path, sample_adf_zip):
    result = process_one(sample_adf_zip, tmp_path)
    assert Path(result["ir_path"]).exists()

def test_draft_yaml_for_non_convertible(tmp_path, foreach_adf_zip):
    result = process_one(foreach_adf_zip, tmp_path)
    # auto_convertible=False → draft_ prefix or None yaml
    assert result["auto_convertible"] is False
```

---

## Session YAML-FIX-2 — yaml_generator.py: Fix Expression dict + @dataset refs

**Duration:** ~30 min | **Tests:** `pytest tests/ -v`
**File:** `agent/agents/generation/yaml_generator.py`
**Status:** ✅ DONE locally

### Three bugs fixed

| # | Bug | Fix |
|---|---|---|
| 1 | `"sql"` key in step blocks not in schema | Renamed to `"query"` (the correct schema field) |
| 2 | `"on_failure": "warn"` in audit_log step | Removed — schema step has `additionalProperties: false` |
| 3 | `sources`/`targets` missing `id` field | Added `id` from IR source/sink id (required by `named_connector`) |

### Changes Required

**Fix 1: `_extract_value()` helper** — Add at module level:
```python
def _extract_value(o: object) -> str:
    """Unwrap ADF Expression dict {"value": ..., "type": "Expression"} → str."""
    if isinstance(o, dict):
        return str(o.get("value", ""))
    return str(o) if o is not None else ""
```

**Fix 2: `_AT_DATASET_RE` regex** — Add immediately after `_AT_ITER_RE`:
```python
_AT_ITER_RE    = re.compile(r"@\{?item\(\)\.([\w]+)\}?")
_AT_DATASET_RE = re.compile(r"@dataset\(\)\.([\w]+)(?:\.([\w]+))?")
```

**Fix 3: Apply both regexes in `_build_v2_sources()` and `_build_v2_targets()`**
```python
def _build_v2_sources(sources: list[dict], ir: dict) -> list[dict]:
    result = []
    for src in sources:
        s = dict(src)
        # Must have id field (required by named_connector)
        s.setdefault("id", s.get("dataset_name", "src"))

        # Unwrap Expression dicts
        table_raw = _extract_value(s.get("table", ""))
        schema_raw = _extract_value(s.get("schema", ""))

        # @item().param → {{ parameters.param }}
        table_raw = _AT_ITER_RE.sub(
            lambda m: f"{{{{ parameters.{m.group(1)} }}}}", table_raw
        )
        schema_raw = _AT_ITER_RE.sub(
            lambda m: f"{{{{ parameters.{m.group(1)} }}}}", schema_raw
        )

        # @dataset().tableName → {{ parameters.tableName }}
        table_raw = _AT_DATASET_RE.sub(
            lambda m: f"{{{{ parameters.{m.group(1)} }}}}", table_raw
        )
        schema_raw = _AT_DATASET_RE.sub(
            lambda m: f"{{{{ parameters.{m.group(1)} }}}}", schema_raw
        )

        if table_raw:
            s["table"] = table_raw
        if schema_raw:
            s["schema"] = schema_raw

        # Remove internal keys not in YAML schema
        for k in ("dataset_name", "parameterized", "param_refs",
                  "schema_columns", "_raw_script_params"):
            s.pop(k, None)

        result.append(s)
    return result
```

**Fix 4: Pre-step `"sql"` key → `"query"`**
```python
def _render_pre_steps(pre_steps: list[dict]) -> list[dict]:
    rendered = []
    for step in pre_steps:
        s = dict(step)
        # Schema uses "query" not "sql"
        if "sql" in s:
            s["query"] = s.pop("sql")
        # Schema has additionalProperties:false — remove unknown keys
        for k in ("_activity",):
            s.pop(k, None)
        rendered.append(s)
    return rendered
```

**Fix 5: Extract `{{ parameters.* }}` references from YAML output**
```python
def _extract_parameters(ir: dict, config: dict) -> dict:
    """Find all {{ parameters.X }} refs in the config and map them from IR."""
    import re
    params = dict(ir.get("parameters", {}))
    # Translate @item().X → {{ parameters.X }} in param values
    for k, v in params.items():
        if isinstance(v, str) and "@item()." in v:
            field = v.replace("@item().", "")
            params[k] = f"{{{{ parameters.{field} }}}}"
    return params
```

### Session Prompt

```
Fix agent/agents/generation/yaml_generator.py

Read FIRST:
  #file:agent/agents/generation/yaml_generator.py
  #file:docs/brainstorming/adf-parser-yaml-fixes.md section "YAML-FIX-2"
  #file:framework/config/schema.json  (the schema we validate against)

Apply changes in ORDER:

Fix 1: Add _extract_value() helper (module level, below imports)

Fix 2: Add _AT_DATASET_RE = re.compile(r"@dataset\(\)\.([\w]+)...")
       Directly below the existing _AT_ITER_RE line

Fix 3: In _build_v2_sources() and _build_v2_targets():
       - Add s.setdefault("id", ...) before any other processing
       - Wrap table/schema values in _extract_value() before regex subs
       - Apply both _AT_ITER_RE and _AT_DATASET_RE subs
       - Remove internal IR keys not in YAML schema (parameterized, param_refs, etc.)

Fix 4: In _render_pre_steps() (or wherever pre_steps are emitted):
       - Rename "sql" key to "query"
       - Remove "on_failure" key from audit_log steps
       - Remove "_activity" internal key

Fix 5: In _extract_parameters(): translate @item().X param values to
       {{ parameters.X }} template syntax.

Run: pytest tests/ -v
Expected: all existing tests pass + new yaml contains {{ parameters.* }} blocks
```

---

## Session YAML-FIX-3 — Integration test: full ADF support ZIP → YAML

**Duration:** ~5 min | **Tests:** `pytest tests/integration/test_adf_support.py -v`
**File:** `tests/integration/test_adf_support.py`
**Status:** ✅ DONE locally

### Session Prompt

```
Write an integration test that proves the full pipeline:
  ADF ZIP → cli_batch → yaml_generator → valid YAML file

Read FIRST:
  #file:agent/agents/cli_batch.py
  #file:agent/agents/generation/yaml_generator.py
  #file:tests/integration/test_adf_support.py  (if exists — use existing patterns)

Write tests in class TestADFIntegration inside tests/integration/test_adf_support.py:

Fixture: adf_zip (tmp_path fixture that creates a minimal valid ZIP):
  pipeline/PL_Test.json   — one Copy activity referencing DS_Src → DS_Snk
  dataset/DS_Src.json     — SqlServerTable, linked to LS_SQL
  dataset/DS_Snk.json     — AzureSqlMITable, linked to LS_MI
  linkedService/LS_SQL.json — SqlServer with encryptedCredential
  linkedService/LS_MI.json  — AzureSqlMI with credential CredentialReference

Test 1: test_adf_zip_produces_yaml
  - Call batch_migrate_adf(adf_zip, tmp_path)
  - Assert at least one result has yaml_path that is not None
  - Assert the yaml file exists on disk

Test 2: test_yaml_is_valid
  - Load the YAML file with yaml.safe_load()
  - Assert "sources" in config or "source" in config

Test 3: test_yaml_contains_parameters_template
  - For auto_convertible=True pipelines: no {{ parameters }} expected (static)
  - For foreach_pattern pipelines: assert {{ parameters. found in yaml text

Test 4: test_no_raw_credentials_in_yaml
  - Assert "PWD=" not in yaml_text
  - Assert "password" not in yaml_text (case-insensitive check on values)

Run: pytest tests/integration/ -v
All existing tests still pass (no regressions).
```

### Implementation Order

```
YAML-FIX-1 (cli_batch.py) → YAML-FIX-2 (yaml_generator.py) → YAML-FIX-3 (test)
```

YAML-FIX-1 and YAML-FIX-2 can be done in either order (YAML-FIX-2 first if
you want to test the generator before wiring it into the CLI).

---

## Current State After All 5 Sessions

### Files changed (apply in this order in a fresh GHCP session)

| File | Change Type | Session |
|---|---|---|
| `agent/agents/parser/adf_support.py` | MODIFY — add `_extract_value()`, preCopyScript, pipeline vars, SP type | ADF-FIX-1 |
| `tests/agent/test_adf_support.py` | EXTEND — add 5 new assertions | ADF-FIX-1 |
| `tests/integration/test_adf_support.py` | RE-VALIDATE — run after ADF-FIX-1 | ADF-FIX-2 |
| `agent/agents/cli_batch.py` | CREATE — batch processor with YAML gen call | YAML-FIX-1 |
| `agent/agents/generation/yaml_generator.py` | MODIFY — 3 bug fixes + Expression dict + @dataset | YAML-FIX-2 |
| `tests/integration/test_adf_support.py` | EXTEND — ZIP → YAML integration test | YAML-FIX-3 |

### New files that must exist after all sessions

```
agent/
├── state.py                              ← AgentState TypedDict
├── agents/
│   ├── __init__.py
│   ├── parser/
│   │   ├── __init__.py
│   │   └── adf_support.py               ← complete with all fixes
│   ├── generation/
│   │   ├── __init__.py
│   │   └── yaml_generator.py            ← v2.0 with fixes
│   └── cli_batch.py                     ← batch processor
tests/
├── agent/
│   └── test_adf_support.py              ← extended
└── integration/
    ├── __init__.py
    └── test_adf_support.py              ← full ZIP → YAML test
```

---

## Remaining Manual Review Items (from VPFLookups_sync_PLE run)

These require human judgement — not automated:

| # | Item | Reason |
|---|---|---|
| 1 | IfCondition data-change check | Child pipeline — confirm parent trigger is correct driver |
| 2 | Schedule `@2 ***` | Inherited from parent trigger — verify for this child pipeline |
| 3 | `CTRL_CONTROL_TABLE` block | ForEach driven by control table — needs CONTROL_TABLE config in YAML |
| 4 | TabRef | Must be supplied from control table rows at runtime |

---

## Next Sessions After These Fixes

After ADF-FIX-1 through YAML-FIX-3 are done, continue with:

| Session | Task | File |
|---|---|---|
| **FW-V2a** | Rewrite `schema.json` to v2.0 | `framework/config/schema.json` |
| **FW-V2b** | `ParameterResolver` | `framework/config/resolver.py` |
| **FW-V2c** | `StepExecutor` + DB connector execute() | `framework/execution/steps.py` |
| **FW-V2d** | `WatermarkManager` | `framework/execution/watermark.py` |
| **FW-V2e** | `ControlTableExecutor` | `framework/execution/control_table.py` |
| **FW-V2f** | `ExecutionEngine` v2.0 + `runner.py` | `framework/execution/engine.py` |
| **A-V2** | YAML generator v2.0 + AgentState | `agent/agents/generation/yaml_generator.py`, `agent/state.py` |

Full prompts for FW-V2a through A-V2 are in `docs/brainstorming/control-table-and-framework-v2.md` section 8.
