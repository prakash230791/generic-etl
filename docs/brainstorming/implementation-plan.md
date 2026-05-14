# Enterprise ETL Platform — Implementation Plan

**Document Type:** Engineering Implementation Guide
**Version:** 1.2
**Date updated:** 2026-05-14
**Model:** Claude Sonnet 4.6 (`claude-sonnet-4-6`) via GitHub Copilot Chat (GHCP)
**Companion docs:**
- `canonical-taxonomy.md` — naming reference
- `enterprise-hardening-plan.md` — gap analysis, connector specs, expression rules
- `adf-support-file-parser.md` — ADF ZIP parser design (sessions P2b, P2c)
- `adf-real-world-fixes.md` — ForEach pattern, credential fixes, child pipeline schedule
- `adf-parser-yaml-fixes.md` — **NEW** ADF-FIX-1/2, YAML-FIX-1/2/3 session prompts ← start here
- `control-table-and-framework-v2.md` — Framework v2.0 design (sessions FW-V2a through A-V2)
- `agent/CLAUDE.md` — agent implementation contracts
- `framework/CLAUDE.md` — framework implementation contracts

---

## Progress Update — 2026-05-14

### ✅ Completed locally (GHCP sessions)

| Session | File | What Was Done |
|---|---|---|
| P2b | `agent/agents/parser/adf_support.py` | ADF ZIP parser — AdfCatalog, reference resolution chain, DataFlow script DSL parser |
| P2c | `agent/agents/parser/adf_support.py` | Real-world fixes: ForEach inner activities, encryptedCredential, MSI, child pipeline schedule |
| ADF-FIX-1 | `agent/agents/parser/adf_support.py` | `_extract_value()`, preCopyScript, pipeline variables→load_strategy, SP canonical type |
| ADF-FIX-2 | `tests/integration/test_adf_support.py` | Integration re-validation — all assertions pass |
| YAML-FIX-1 | `agent/agents/cli_batch.py` | Batch CLI: process_one() calls YAML generator, returns yaml_path |
| YAML-FIX-2 | `agent/agents/generation/yaml_generator.py` | 3 bug fixes + `_extract_value()` + `_AT_DATASET_RE` + `_build_v2_sources/targets` |
| YAML-FIX-3 | `tests/integration/test_adf_support.py` | Full ADF ZIP → YAML integration test |

**Validated result:** `VPFLookups_sync_PLE_support_live.zip` → schema-valid v2.0 YAML with
`ls://VPFSqlServer` source, `msi://vqevdevml` target, 3 pre-steps, `{{ parameters.* }}` blocks.

### 🔲 Next: Framework v2.0 (implement in this order)

| Session | File | What to Do |
|---|---|---|
| **FW-V2a** | `framework/config/schema.json` | Rewrite to v2.0 — add parameters, sources[], targets[], pre_steps, watermark |
| **FW-V2b** | `framework/config/resolver.py` | `ParameterResolver` — `{{ parameters.X }}` template substitution |
| **FW-V2c** | `framework/execution/steps.py` | `StepExecutor` + `execute()`/`execute_procedure()` on all DB connectors |
| **FW-V2d** | `framework/execution/watermark.py` | `WatermarkManager` — read/write watermark, write only on success |
| **FW-V2e** | `framework/execution/control_table.py` | `ControlTableExecutor` — serial + parallel row iteration |
| **FW-V2f** | `framework/execution/engine.py` | `ExecutionEngine` v2.0 rewrite + `runner.py` `--param` flag |
| **A-V2** | `agent/agents/generation/yaml_generator.py` | `_render_v2_config()` for foreach_pattern + `agent/state.py` |

Full prompts for FW-V2a through A-V2: `docs/brainstorming/control-table-and-framework-v2.md` section 8.

### 📋 Remaining items in this plan (unchanged)

Continue with F0 through X3 below after Framework v2.0 is done.

---

---

## How to Use This Document

1. **One session = one file.** Never implement two components in one GHCP session.
2. **Always start with context.** Open the referenced `#file:` paths before pasting the prompt.
3. **Always end with tests.** Every session prompt includes a test command — run it before closing.
4. **Follow the session order.** Later sessions depend on earlier ones — do not skip.
5. **Mark progress** using the checkboxes in the Master Checklist below.

### Session Checklist (run before ending every session)
```bash
make test && ruff check framework/ agent/ && echo "Session complete ✅"
```

---

## Master Checklist

### Framework — Transforms
- [ ] **F0** — Rename POC names to canonical (filter→row_filter, expression→column_derive, etc.)
- [ ] **F1** — `stream_join`
- [ ] **F2** — `aggregate`
- [ ] **F3** — `scd_type_2` (complete stub)
- [ ] **F4** — `column_select`
- [ ] **F5** — `union_all`
- [ ] **F6** — `row_sort`
- [ ] **F7** — `route_split` (engine change required)
- [ ] **F8** — `scd_type_1`
- [ ] **F9** — `row_deduplicate`
- [ ] **F10** — `data_convert` (SSIS Data Conversion)
- [ ] **F11** — `sequence_generate`
- [ ] **F12** — `rank`
- [ ] **F13** — `window_fn`
- [ ] **F14** — `pivot`
- [ ] **F15** — `unpivot`
- [ ] **F16** — `mask_pii`
- [ ] **F17** — `data_validate`
- [ ] **F18** — `python_fn`
- [ ] **F19** — `flatten_json`
- [ ] **F20** — `row_count` + `fuzzy_match`

### Framework — Connectors
- [ ] **C1** — `csv` (complete stub)
- [ ] **C2** — `parquet`
- [ ] **C3** — `postgres`
- [ ] **C4** — `sqlserver`
- [ ] **C5** — `oracle`
- [ ] **C6** — `azure_sql` (SQL MI)
- [ ] **C7** — `s3`
- [ ] **C8** — `excel`
- [ ] **C9** — `fixed_width`
- [ ] **C10** — `snowflake`
- [ ] **C11** — `adls`
- [ ] **C12** — `kafka`
- [ ] **C13** — `mysql`
- [ ] **C14** — `sftp`
- [ ] **C15** — `http_api`

### Agent — Core Pipeline
- [ ] **A1** — `agent/state.py` (AgentState TypedDict) ← included in A-V2
- [ ] **A2** — `agent/agents/analysis/complexity.py`
- [x] **A3** — `agent/agents/generation/yaml_generator.py` ← v2.0 done in YAML-FIX-2 locally
- [ ] **A4** — `agent/agents/validation/syntax_validator.py`
- [ ] **A5** — `agent/graph.py` (LangGraph wiring — core nodes)
- [ ] **A6** — `agent/agents/review/pr_generator.py`
- [ ] **A7** — `agent/memory/vector_store.py` (pgvector RAG)

### Agent — Parsers
- [ ] **P1** — `agent/agents/parser/informatica.py` (production Informatica parser)
- [x] **P2b** — `agent/agents/parser/adf_support.py` — ADF ZIP parser (AdfCatalog, DataFlow DSL, ref chain) ✅ done locally
- [x] **P2c** — `agent/agents/parser/adf_support.py` — ForEach, encryptedCredential, MSI, child schedule ✅ done locally
- [x] **ADF-FIX-1** — `agent/agents/parser/adf_support.py` — `_extract_value()`, preCopyScript, pipeline vars, SP type ✅ done locally
- [ ] **P3** — `agent/agents/parser/ssis.py` (SSIS .dtsx package)
- [ ] **P4** — `agent/agents/parser/dispatcher.py` (multi-source auto-detect)

### Agent — Expression Engine
- [ ] **E1** — `rules/informatica.yaml` + `rules_agent.py` (60+ Informatica rules)
- [ ] **E2** — `rules/adf.yaml` (40+ ADF wrangling expression rules)
- [ ] **E3** — `rules/ssis.yaml` + SSIS pre-processing pipeline
- [ ] **E4** — `agent/agents/translation/llm_translator.py` (tiered Haiku → Sonnet → manual)

### Agent — Advanced (Batch CLI + Integration)
- [x] **YAML-FIX-1** — `agent/agents/cli_batch.py` — batch CLI, calls YAML generator ✅ done locally
- [x] **YAML-FIX-2** — `agent/agents/generation/yaml_generator.py` — 3 bug fixes, Expression dict, @dataset ✅ done locally
- [x] **YAML-FIX-3** — `tests/integration/test_adf_support.py` — ZIP → YAML integration test ✅ done locally
- [ ] **X1** — Extend `agent/cli.py` with batch command (wire to cli_batch.py)
- [ ] **X2** — Observability (structured metrics in `framework/execution/engine.py`)
- [ ] **X3** — Full integration test suite (`tests/integration/`)

### Framework v2.0 (new — required for control-table pattern)
- [ ] **FW-V2a** — `framework/config/schema.json` v2.0 (parameters, sources[], targets[], pre_steps)
- [ ] **FW-V2b** — `framework/config/resolver.py` (`ParameterResolver`)
- [ ] **FW-V2c** — `framework/execution/steps.py` (`StepExecutor` + DB connector execute())
- [ ] **FW-V2d** — `framework/execution/watermark.py` (`WatermarkManager`)
- [ ] **FW-V2e** — `framework/execution/control_table.py` (`ControlTableExecutor`)
- [ ] **FW-V2f** — `framework/execution/engine.py` v2.0 + `runner.py` `--param` flag
- [ ] **A-V2** — `agent/agents/generation/yaml_generator.py` `_render_v2_config()` + `agent/state.py`

---

---

# PART 1 — FRAMEWORK

---

## F0 — Rename POC Names to Canonical

**Scope:** Rename all POC transform/connector plugins to canonical names
**Sprint:** 1 | **Duration:** 30–45 min
**Test:** `make test`
**Files:** `framework/transformations/`, `framework/connectors/`, `pyproject.toml`, `framework/config/schema.json`, `tests/`

```
Rename the existing POC transformation and connector plugins to use canonical names.

Read #file:framework/CLAUDE.md section "Canonical Name Refactor" for the full mapping table.
Read #file:docs/brainstorming/canonical-taxonomy.md section "Refactoring the Existing POC Names".

Rename each of the following (file, class, pyproject.toml entry-point, schema.json enum, test fixtures):

| Old name     | New name       | Old class                 | New class                       |
|---|---|---|---|
| filter       | row_filter     | FilterTransformation      | RowFilterTransformation         |
| expression   | column_derive  | ExpressionTransformation  | ColumnDeriveTransformation      |
| lookup       | lookup_enrich  | LookupTransformation      | LookupEnrichTransformation      |
| csv_file     | csv            | CsvFileConnector          | CsvConnector                    |

For each rename:
1. Rename the Python file (e.g. filter.py → row_filter.py)
2. Rename the class inside the file
3. Update the entry-point key in pyproject.toml
4. Update the enum value in framework/config/schema.json
5. Update any test fixture config dicts (e.g. type: "filter" → type: "row_filter")

Do NOT change any logic inside apply(). Rename only.

After all renames: pip install -e . && make test
All tests must pass before finishing this session.
```

---

## F1 — `stream_join`

**Scope:** Join two input streams on key columns
**Sprint:** 1 | **Duration:** 30 min
**Test:** `pytest tests/test_framework.py -k stream_join -v`
**File:** `framework/transformations/stream_join.py`

```
Implement `framework/transformations/stream_join.py`.

Read #file:framework/CLAUDE.md section "stream_join" for the exact implementation pattern.
Read #file:framework/transformations/row_filter.py as a style reference.

The class StreamJoinTransformation(BaseTransformation) must:
- apply(self, dfs: dict[str, pd.DataFrame], config: dict) -> pd.DataFrame
  (note: takes dfs dict, not a single df — this transform has two inputs)
- Read config["inputs"] (list of 2 step IDs) to get left and right DataFrames
- Read config["join_keys"] (list of {left, right} dicts) for join columns
- Read config.get("join_type", "left") for join type: inner | left | right | full
- Return df.merge(left_on=..., right_on=..., how=join_type).reset_index(drop=True)

Add to pyproject.toml entry-points and schema.json enum.

Write tests:
- test_inner_join: 5 left rows, 5 right rows, 3 matching keys → 3 output rows
- test_left_join: non-matching right rows produce NaN columns
- test_join_on_different_key_names: left: customer_id, right: cust_id
- test_full_join: all rows from both sides

Run: pip install -e . && make test
```

---

## F2 — `aggregate`

**Scope:** Group by and compute aggregate measures
**Sprint:** 1 | **Duration:** 30 min
**Test:** `pytest tests/test_framework.py -k aggregate -v`
**File:** `framework/transformations/aggregate.py`

```
Implement `framework/transformations/aggregate.py`.

Read #file:framework/CLAUDE.md section "aggregate" for the implementation sketch.

The class AggregateTransformation(BaseTransformation) must:
- apply(self, df: pd.DataFrame, config: dict) -> pd.DataFrame
- Read config["group_by"]: list of column names to group on
- Read config["measures"]: dict of {output_col: "fn(input_col)"} e.g. {"total": "sum(amount)"}
- Parse each measure string with a helper _parse_measure(expr) → (fn_name, col_name)
  Supported functions: sum, count, mean, avg, min, max, first, last, nunique
  "avg" should map to pandas "mean"
- Use df.groupby(group_by).agg(...).reset_index() to compute results
- Return reset_index(drop=True)

Write tests:
- test_sum_by_group: group by region, sum amount → verify totals
- test_count_by_group: count distinct rows per group
- test_multiple_measures: sum + count + mean in single step
- test_avg_alias: "avg(amount)" uses pandas mean
```

---

## F3 — `scd_type_2` (complete stub)

**Scope:** Slowly Changing Dimension Type 2 — expire old, insert new
**Sprint:** 1 | **Duration:** 45 min
**Test:** `pytest tests/test_framework.py -k scd_type_2 -v`
**File:** `framework/transformations/scd_type_2.py`

```
Complete the stub in `framework/transformations/scd_type_2.py`.
The current apply() raises NotImplementedError — replace it with a real implementation.

Read #file:framework/CLAUDE.md section "scd_type_2" for the full algorithm.

The algorithm must:
1. Load current dimension from the sink connector (use get_connector() from connectors/__init__.py)
2. Filter current_live = current dimension WHERE current_flag_col == "Y"
3. Merge incoming df with current_live on natural_key (left join)
4. New records (no match): assign eff_from=today, eff_to=NaT, current_flag='Y', new UUID surrogate key
5. Changed records (tracked_columns differ): expire old (eff_to=today, flag='N'), insert new version
6. Return pd.concat([expired_rows, new_rows, changed_new_versions], ignore_index=True)

Config keys:
  natural_key, tracked_columns, effective_from_col, effective_to_col,
  current_flag_col, surrogate_key_col, sink_connector

Write tests using SQLite in-memory connector:
- test_new_record_inserted: incoming row with new key → inserted with flag='Y'
- test_existing_unchanged_not_touched: same tracked values → no expiry
- test_changed_record_expires_old_inserts_new: tracked col change → 2 rows (expired + new)
- test_surrogate_key_is_uuid: new rows have valid UUID surrogate keys
```

---

## F4 — `column_select`

**Scope:** Project, rename, and drop columns
**Sprint:** 2 | **Duration:** 25 min
**Test:** `pytest tests/test_framework.py -k column_select -v`
**File:** `framework/transformations/column_select.py`

```
Implement `framework/transformations/column_select.py`.

Read #file:docs/brainstorming/enterprise-hardening-plan.md section "column_select".
Read #file:framework/transformations/row_filter.py as style reference.

apply(self, df, config) must:
1. Read config["columns"] as {output_col_name: input_col_name}
2. Select only the listed input columns from df
3. Rename them to the output names
4. Drop all unlisted columns
5. Return reset_index(drop=True)

Edge cases:
- Input column in map but not in df → raise KeyError with clear message
- Empty columns dict → return empty DataFrame with no columns
- Input and output name identical → keep column as-is (no rename)

Add to pyproject.toml and schema.json.

Write tests:
- test_select_and_rename: {cust_name: full_name} → full_name renamed to cust_name
- test_unlisted_columns_dropped: only mapped columns in output
- test_missing_input_column_raises: KeyError on unknown input column
- test_identity_mapping: output_name == input_name → column kept unchanged
```

---

## F5 — `union_all`

**Scope:** Concatenate multiple input streams
**Sprint:** 2 | **Duration:** 25 min
**Test:** `pytest tests/test_framework.py -k union_all -v`
**File:** `framework/transformations/union_all.py`

```
Implement `framework/transformations/union_all.py`.

Read #file:docs/brainstorming/enterprise-hardening-plan.md section "union_all".
Read #file:framework/execution/engine.py to understand how multi-input transforms are invoked.

Note: union_all receives dfs: dict[str, pd.DataFrame] (not a single df) because it has
multiple inputs listed in config["inputs"]. The engine passes all named frames.

apply(self, dfs: dict[str, pd.DataFrame], config: dict) -> pd.DataFrame:
1. Read config["inputs"] — list of upstream step IDs
2. Pull each DataFrame from dfs
3. pd.concat(frames, ignore_index=True)
4. If config.get("align_columns", True): reindex to union of all columns (missing → NaN)
5. Return reset_index(drop=True)

Write tests:
- test_union_two_equal_schema: same columns, row count = sum of both
- test_union_column_alignment: different columns, missing cells → NaN
- test_union_three_frames: all rows present from all three frames
- test_align_false_raises_on_schema_mismatch: align_columns=False with different schemas
```

---

## F6 — `row_sort`

**Scope:** Sort rows by one or more columns
**Sprint:** 2 | **Duration:** 20 min
**Test:** `pytest tests/test_framework.py -k row_sort -v`
**File:** `framework/transformations/row_sort.py`

```
Implement `framework/transformations/row_sort.py`.

Read #file:docs/brainstorming/enterprise-hardening-plan.md section "row_sort".

apply(self, df, config) must:
1. Read config["keys"]: list of {column, direction} dicts
   direction: "asc" | "desc" (default: "asc")
2. Extract column names and ascending flags
3. df.sort_values(by=cols, ascending=flags, na_position="last")
4. Return reset_index(drop=True)

Write tests:
- test_sort_single_asc: 5 rows, sort by amount asc → verify order
- test_sort_single_desc: sort by amount desc → verify reverse order
- test_sort_multi_column: primary + secondary sort key
- test_sort_nulls_last: NaN values always appear after non-null values
```

---

## F7 — `route_split` + Engine Update

**Scope:** Conditional branching — split stream into named outputs
**Sprint:** 2 | **Duration:** 50 min
**Test:** `pytest tests/test_framework.py -k route_split -v`
**Files:** `framework/transformations/route_split.py`, `framework/execution/engine.py`

```
Implement `framework/transformations/route_split.py` AND update the execution engine.

Read #file:docs/brainstorming/enterprise-hardening-plan.md section "route_split".
Read #file:framework/execution/engine.py — you MUST modify it to handle dict return values.

route_split is the only transform that returns dict[str, DataFrame] instead of DataFrame.

Step 1 — Implement RouteSplitTransformation:
apply(self, df, config) -> dict[str, pd.DataFrame]:
  For each route in config["routes"] (except "__default__"):
    mask = df.eval(condition)
    result[route_name] = df[mask].copy().reset_index(drop=True)
    remove matched rows from remaining
  Default route catches all unmatched remaining rows.
  Return the dict of branch DataFrames.

Step 2 — Update engine.py:
After calling any transformation's apply():
  if isinstance(result, dict):
    for branch_name, branch_df in result.items():
      results[f"{step_id}.{branch_name}"] = branch_df
  else:
    results[step_id] = result

Downstream steps reference route_split outputs as: input: "split_step.active"

Write tests:
- test_two_branches_correct_counts: 10 rows, 6 active + 4 inactive → verify counts
- test_default_branch_catches_remainder: rows matching no condition go to "__default__"
- test_engine_stores_branch_outputs: engine results contain "step.branch" keys
- test_downstream_reads_branch: next step receives only its branch rows
```

---

## F8 — `scd_type_1`

**Scope:** Type 1 SCD — overwrite existing dimension rows on match
**Sprint:** 2 | **Duration:** 35 min
**Test:** `pytest tests/test_framework.py -k scd_type_1 -v`
**File:** `framework/transformations/scd_type_1.py`

```
Implement `framework/transformations/scd_type_1.py`.

Read #file:docs/brainstorming/enterprise-hardening-plan.md section "scd_type_1".
Read #file:framework/transformations/scd_type_2.py as structural reference.

apply(self, df, config) must:
1. Load current dimension via connector (same pattern as scd_type_2)
2. Left-merge current dimension with incoming df on config["natural_key"]
3. For matched rows: all non-key columns take the incoming values
4. For unmatched (new keys): insert as-is
5. Return the merged DataFrame representing the complete updated dimension

Config keys: natural_key (list), sink_connector (connector config dict)

Write tests using SQLite in-memory connector:
- test_existing_row_overwritten: incoming row replaces current non-key values
- test_new_row_inserted: new key not in current → appears in output
- test_unchanged_row_preserved: key exists, same values → row unchanged
- test_batch_mixed: 3 updates + 2 inserts in one batch
```

---

## F9 — `row_deduplicate`

**Scope:** Remove duplicate rows by key columns
**Sprint:** 2 | **Duration:** 20 min
**Test:** `pytest tests/test_framework.py -k row_deduplicate -v`
**File:** `framework/transformations/row_deduplicate.py`

```
Implement `framework/transformations/row_deduplicate.py`.

Read #file:docs/brainstorming/enterprise-hardening-plan.md section "row_deduplicate".

apply(self, df, config) -> pd.DataFrame:
  key_columns = config.get("key_columns")   # None = use all columns
  keep = config.get("keep", "first")        # "first" | "last"
  return df.drop_duplicates(subset=key_columns, keep=keep).reset_index(drop=True)

Write tests:
- test_dedupe_all_columns: exact duplicate rows → one kept
- test_dedupe_on_key: duplicates on key_columns only → first/last kept
- test_keep_last: keep="last" retains the last occurrence
- test_no_duplicates_unchanged: no duplicates → same row count
```

---

## F10 — `data_convert`

**Scope:** Column type casting (SSIS Data Conversion component)
**Sprint:** 3 | **Duration:** 25 min
**Test:** `pytest tests/test_framework.py -k data_convert -v`
**File:** `framework/transformations/data_convert.py`

```
Implement `framework/transformations/data_convert.py`.

Read #file:docs/brainstorming/enterprise-hardening-plan.md section "data_convert".

The class-level _SSIS_TYPE_MAP maps SSIS DT_* type strings to pandas dtype strings:
  "DT_STR" → str, "DT_I4" → "Int32", "DT_R8" → float,
  "DT_DBTIMESTAMP" → "datetime64[ns]", "DT_BOOL" → bool, etc.
(Use the full map from enterprise-hardening-plan.md section 4.1)

apply(self, df, config) -> pd.DataFrame:
  For each col, target_type in config["conversions"].items():
    pandas_type = _SSIS_TYPE_MAP.get(target_type, target_type)
    result[col] = result[col].astype(pandas_type)
  Return reset_index(drop=True)

Write tests:
- test_cast_to_int: string "42" → Int32
- test_cast_to_float: string "3.14" → float
- test_cast_to_datetime: string "2024-01-01" → datetime64
- test_unknown_type_passthrough: unknown DT_CUSTOM → passed as-is to pandas astype
```

---

## F11–F20 — Phase 3 Transforms

**Sprint:** 5–6 | **Duration:** 30–45 min each

For each transform below, use this prompt template:

```
Implement `framework/transformations/{name}.py`.

Read #file:docs/brainstorming/enterprise-hardening-plan.md section "{Name}" for the
implementation pattern and YAML config contract.
Read #file:framework/transformations/aggregate.py as a style reference.

The class {CamelCase}Transformation(BaseTransformation) must implement:
  apply(self, df: pd.DataFrame, config: dict) -> pd.DataFrame

Add to pyproject.toml entry-points and framework/config/schema.json enum.

Write 3–4 pytest tests covering: happy path, edge case, config validation.
Run: pip install -e . && make test
```

| Session | Transform | Key Config Keys |
|---|---|---|
| **F11** | `sequence_generate` | `output_column`, `start`, `increment` |
| **F12** | `rank` | `partition_by`, `order_by`, `output_column`, `method` |
| **F13** | `window_fn` | `partition_by`, `order_by`, `functions` (ROW_NUMBER, LAG, LEAD, SUM) |
| **F14** | `pivot` | `index`, `columns`, `values`, `agg_fn` |
| **F15** | `unpivot` | `id_columns`, `value_columns`, `variable_name`, `value_name` |
| **F16** | `mask_pii` | `columns` (dict of col → hash_sha256 \| redact \| mask_partial \| last_four) |
| **F17** | `data_validate` | `rules` (list of {column, check, …}), `on_failure` |
| **F18** | `python_fn` | `module`, `function` (calls user function with df + config) |
| **F19** | `flatten_json` | `column` (nested JSON column to flatten into rows) |
| **F20** | `row_count` + `fuzzy_match` | row_count: `output_column`; fuzzy_match: `threshold`, `key_columns` |

---

## C1 — `csv` (complete stub)

**Scope:** Complete the CSV connector read/write
**Sprint:** 1 | **Duration:** 20 min
**Test:** `pytest tests/test_framework.py -k csv -v`
**File:** `framework/connectors/csv.py` (renamed from csv_file.py in F0)

```
Complete the read() and write() methods in `framework/connectors/csv.py`.

Read #file:framework/CLAUDE.md section "csv — Complete the stub" for the implementation.

read(self, config) -> pd.DataFrame:
  opts = config.get("options", {})
  return pd.read_csv(
      config["file_path"],
      delimiter=opts.get("delimiter", ","),
      encoding=opts.get("encoding", "utf-8"),
      skiprows=opts.get("skip_rows", 0),
  )

write(self, df, config) -> None:
  mode = "a" if config.get("if_exists") == "append" else "w"
  df.to_csv(config["file_path"], index=False, mode=mode, header=(mode == "w"))

Write tests using tmp_path pytest fixture:
- test_round_trip: write df → read back → assert equal
- test_delimiter_option: write with delimiter="|" → read with same delimiter
- test_append_mode: write twice with if_exists=append → double rows
- test_skip_rows: CSV with 2 header rows → skip_rows=1
```

---

## C2 — `parquet`

**Scope:** Parquet file connector (local + S3/ADLS via storage_options)
**Sprint:** 3 | **Duration:** 20 min
**Test:** `pytest tests/test_framework.py -k parquet -v`
**File:** `framework/connectors/parquet.py`

```
Implement `framework/connectors/parquet.py`.

Read #file:docs/brainstorming/enterprise-hardening-plan.md section "parquet" (section 6.6).

read(self, config): pd.read_parquet(config["file_path"], storage_options=self._storage_options(config))
write(self, df, config): df.to_parquet(config["file_path"], index=False, storage_options=...)

_storage_options(self, config): resolve connection string to {"key": ..., "secret": ...} dict
  If no connection field → return {} (local file)

Add dependency: pyarrow>=14.0 to pyproject.toml.

Write tests using tmp_path:
- test_round_trip: write parquet → read back → assert DataFrame equal
- test_preserves_dtypes: datetime and int columns round-trip correctly
- test_local_no_storage_options: no connection key → empty storage_options
```

---

## C3 — `postgres`

**Scope:** PostgreSQL connector (read with psycopg2, write with SQLAlchemy)
**Sprint:** 3 | **Duration:** 35 min
**Test:** `pytest tests/test_framework.py -k postgres -v` (mocked)
**File:** `framework/connectors/postgres.py`

```
Implement `framework/connectors/postgres.py`.

Read #file:docs/brainstorming/enterprise-hardening-plan.md section 6.6 (postgres pattern).

Connection string format: "postgresql://user:pass@host:port/database"
  OR libpq DSN: "host=... dbname=... user=... password=..."

read(self, config) -> pd.DataFrame:
  with psycopg2.connect(self._resolve_connection(config["connection"])) as conn:
      query = config.get("query") or f"SELECT * FROM {config.get('schema','public')}.{config['table']}"
      return pd.read_sql(query, conn)

write(self, df, config) -> None:
  from sqlalchemy import create_engine
  engine = create_engine(self._resolve_connection(config["connection"]))
  df.to_sql(config["table"], engine,
            schema=config.get("schema", "public"),
            if_exists=config.get("load_strategy", "append"),
            index=False, chunksize=10_000)

Add dependencies: psycopg2-binary>=2.9, sqlalchemy>=2.0 to pyproject.toml.

Write tests using unittest.mock.patch on psycopg2.connect and create_engine:
- test_read_executes_query: verify pd.read_sql called with correct query
- test_read_uses_table_if_no_query: no "query" key → SELECT * FROM schema.table
- test_write_uses_load_strategy: "overwrite" → if_exists="overwrite"
- test_connection_resolved_from_secrets: _resolve_connection called with config["connection"]
```

---

## C4 — `sqlserver`

**Scope:** SQL Server connector with watermark injection and BCP bulk
**Sprint:** 3 | **Duration:** 45 min
**Test:** `pytest tests/test_framework.py -k sqlserver -v` (mocked)
**File:** `framework/connectors/sqlserver.py`

```
Implement `framework/connectors/sqlserver.py`.

Read #file:docs/brainstorming/enterprise-hardening-plan.md section 6.3 (full implementation shown).

Must implement three methods:
  read(self, config) — pyodbc connect, pd.read_sql, watermark param injection
  write(self, df, config) — SQLAlchemy with fast_executemany=True; bulk strategy → _bulk_insert()
  _bulk_insert(self, df, config) — write to temp CSV → BCP subprocess

ODBC connection string construction:
  f"DRIVER={{ODBC Driver 18 for SQL Server}};{raw};Encrypt=yes;TrustServerCertificate=no;"

Watermark injection:
  If config has "watermark_param" key, add it as a bind parameter to the query.
  If config has "last_run_dt", use that value; else default to "1900-01-01".

Add dependency: pyodbc>=5.0 to pyproject.toml.

Write tests (all mocked):
- test_builds_odbc_string: DRIVER and Encrypt=yes present in connection string
- test_watermark_injected: config with watermark_param → param passed to pd.read_sql
- test_write_uses_fast_executemany: SQLAlchemy engine created with fast_executemany=True
- test_bulk_strategy_calls_bcp: load_strategy="bulk" → subprocess.run called with bcp
```

---

## C5 — `oracle`

**Scope:** Oracle Database connector (python-oracledb thin mode)
**Sprint:** 3 | **Duration:** 40 min
**Test:** `pytest tests/test_framework.py -k oracle -v` (mocked)
**File:** `framework/connectors/oracle.py`

```
Implement `framework/connectors/oracle.py`.

Read #file:docs/brainstorming/enterprise-hardening-plan.md section 6.1 (full implementation).

Use python-oracledb in thin mode — no Oracle Instant Client required.
Connection string format: "user/password@host:port/service_name"

read(self, config) -> pd.DataFrame:
  with oracledb.connect(conn_str) as conn:
      query = config.get("query") or f"SELECT * FROM {config.get('schema','')}.{config['table']}"
      return pd.read_sql(query, conn, params=config.get("params", {}))

write(self, df, config) -> None:
  SQLAlchemy dialect: oracle+oracledb://user:pass@host:port/?service_name=svc

Edge cases (must handle):
  1. CHAR(n) trailing spaces: if config.get("strip_char_columns"): df = df.apply(lambda c: c.str.rstrip() if c.dtype == object else c)
  2. Schema-qualified table: f"{config.get('schema', '')}.{config['table']}" (skip schema prefix if empty)
  3. Oracle DATE → always cast to datetime64 (Oracle DATE includes time component)

Add dependency: oracledb>=1.4 to pyproject.toml.

Write tests (mocked):
- test_thin_mode_connect: oracledb.connect called with connection string
- test_schema_qualified_table: config with schema → schema.table in query
- test_char_strip_option: strip_char_columns=True → rstrip applied to string columns
- test_write_uses_sqlalchemy: create_engine called with oracle+oracledb dialect
```

---

## C6 — `azure_sql` (SQL Managed Instance)

**Scope:** Azure SQL MI connector with MSI and SQL auth
**Sprint:** 4 | **Duration:** 45 min
**Test:** `pytest tests/test_framework.py -k azure_sql -v` (mocked)
**File:** `framework/connectors/azure_sql.py`

```
Implement `framework/connectors/azure_sql.py`.

Read #file:docs/brainstorming/enterprise-hardening-plan.md section 6.2 (full implementation).

Supports two auth modes (auto-detected from connection string):
  1. SQL auth:  "Server=...;Database=...;UID=...;PWD=..."
  2. MSI auth:  "Server=...;Database=...;Authentication=ActiveDirectoryMsi"

_build_conn_str(self, config_ref): prepend DRIVER and Encrypt=yes to the resolved string.

read(self, config): pyodbc.connect → pd.read_sql
write(self, df, config): SQLAlchemy with mssql+pyodbc dialect, fast_executemany=True

Schema: always use config.get("schema", "dbo") for writes.

Write tests:
- test_sql_auth_conn_string: UID/PWD format → DRIVER + Encrypt=yes added
- test_msi_conn_string: Authentication=ActiveDirectoryMsi preserved
- test_write_uses_dbo_schema_default: no schema in config → "dbo" used
- test_fast_executemany_enabled: engine created with fast_executemany=True
```

---

## C7 — `s3`

**Scope:** AWS S3 connector supporting CSV, Parquet, JSON formats
**Sprint:** 4 | **Duration:** 35 min
**Test:** `pytest tests/test_framework.py -k s3 -v` (mocked)
**File:** `framework/connectors/s3.py`

```
Implement `framework/connectors/s3.py`.

Use boto3 + s3fs + fsspec for transparent S3 access.

Connection string resolves to: "AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|region"
  OR: use instance role (empty connection → no storage_options key needed)

read(self, config) -> pd.DataFrame:
  storage_opts = self._s3_opts(config)
  fmt = config.get("format", "parquet")
  path = f"s3://{config['file_path']}"
  dispatch: csv → pd.read_csv, parquet → pd.read_parquet, json → pd.read_json

write(self, df, config) -> None:
  Same dispatch for write (to_csv, to_parquet, to_json)

Add dependencies: boto3>=1.34, s3fs>=2024.1, fsspec>=2024.1.

Write tests (mock s3fs.S3FileSystem and boto3):
- test_parquet_read: format=parquet → pd.read_parquet called
- test_csv_read: format=csv → pd.read_csv called with s3:// path
- test_write_dispatches_by_format
- test_instance_role_no_storage_opts: empty connection → {} storage options
```

---

## C8 — `excel`

**Scope:** Excel file connector (SSIS Excel Source/Destination)
**Sprint:** 4 | **Duration:** 25 min
**Test:** `pytest tests/test_framework.py -k excel -v`
**File:** `framework/connectors/excel.py`

```
Implement `framework/connectors/excel.py`.

Read #file:docs/brainstorming/enterprise-hardening-plan.md section 6.4 (full implementation).

read(self, config) -> pd.DataFrame:
  pd.read_excel(file_path, sheet_name=opts.get("sheet_name", 0),
                header=opts.get("header_row", 0), skiprows=opts.get("skip_rows", 0),
                engine="openpyxl")

write(self, df, config) -> None:
  df.to_excel(file_path, sheet_name=opts.get("sheet_name", "Sheet1"),
              index=False, engine="openpyxl")

Add dependency: openpyxl>=3.1.

Write tests using tmp_path:
- test_round_trip: write → read → assert equal
- test_sheet_name_option: write to "MySheet" → read from "MySheet"
- test_header_row_offset: header_row=2 → correct column names
- test_skip_rows: skip_rows=1 skips one data row after header
```

---

## C9 — `fixed_width`

**Scope:** Fixed-width text files (SSIS Flat File, mainframe EBCDIC)
**Sprint:** 4 | **Duration:** 35 min
**Test:** `pytest tests/test_framework.py -k fixed_width -v`
**File:** `framework/connectors/fixed_width.py`

```
Implement `framework/connectors/fixed_width.py`.

Read #file:docs/brainstorming/enterprise-hardening-plan.md section 6.5 (full implementation).

Config requires column specs: [{name, start, width, type?, format?}]

read(self, config) -> pd.DataFrame:
  colspecs = [(c["start"], c["start"] + c["width"]) for c in config["columns"]]
  names = [c["name"] for c in config["columns"]]
  df = pd.read_fwf(file_path, colspecs=colspecs, names=names,
                   encoding=config.get("encoding", "utf-8"),
                   skiprows=config.get("skip_rows", 0))
  Apply date format conversion for columns with type="date".
  Return df.reset_index(drop=True)

write(self, df, config) -> None:
  For each row: ljust each value to its column width, concatenate, write line.

Write tests using tmp_path:
- test_round_trip: write → read → assert equal (string columns)
- test_date_column_parsed: type=date, format="%Y%m%d" → datetime column
- test_ebcdic_encoding: encoding="cp037" → file read without error
- test_value_truncated_to_width: values longer than width are truncated on write
```

---

## C10–C15 — Remaining Connectors

**Sprint:** 7 | **Duration:** 35–50 min each

For each connector, use this prompt template:

```
Implement `framework/connectors/{name}.py`.

Read #file:docs/brainstorming/enterprise-hardening-plan.md section 6.6 for the {Name} pattern.
Read #file:framework/connectors/postgres.py as structural reference.

Implement read(self, config) and write(self, df, config).
Add required dependencies to pyproject.toml [project.optional-dependencies].
Add entry-point to pyproject.toml [project.entry-points."etl.connectors"].

Write 3 tests (at least 2 mocked). Run: pip install -e . && make test
```

| Session | Connector | Key Library | Auth / Notes |
|---|---|---|---|
| **C10** | `snowflake` | `snowflake-connector-python[pandas]` | `write_pandas()`, account identifier |
| **C11** | `adls` | `azure-storage-file-datalake`, `adlfs` | MSI or SAS token |
| **C12** | `kafka` | `confluent-kafka` | read=consumer, write=producer; JSON serialization |
| **C13** | `mysql` | `mysql-connector-python`, `sqlalchemy` | Standard DSN |
| **C14** | `sftp` | `paramiko` | key-based auth; read=get file to tmp, write=put |
| **C15** | `http_api` | `httpx` | read=GET paginated, write=POST batched; retry on 429/5xx |

---

---

# PART 2 — AGENT

---

## A1 — `agent/state.py`

**Scope:** AgentState TypedDict — shared state contract for all LangGraph nodes
**Sprint:** 1 | **Duration:** 20 min
**Test:** `python -c "from agent.state import AgentState, make_initial_state; print('OK')"`
**File:** `agent/state.py`

```
Create `agent/state.py` with the AgentState TypedDict and make_initial_state helper.

Read #file:agent/CLAUDE.md section "AgentState — The Shared Contract" for the exact field list.

Rules:
- AgentState must be a TypedDict (from typing)
- Every field must have a type annotation
- No default values in TypedDict — use Optional[X] where field may be None
- Required fields (exact names):
    artifact_id: str
    source_type: str           # "informatica" | "adf" | "ssis"
    raw_artifact_path: str
    ir: Optional[dict]
    complexity_score: Optional[int]
    pattern_id: Optional[str]
    pattern_similarity: Optional[float]
    track: Optional[str]       # "auto" | "review" | "manual"
    confidence_scores: dict[str, float]
    generated_artifacts: dict[str, str]
    validation_results: list[dict]
    pr_url: Optional[str]
    gate_status: Optional[str]
    error_log: list[str]
    retry_count: int
    # Enterprise additions:
    parameters: dict[str, Any]
    pre_sql: list[str]
    post_sql: list[str]
    manual_review_items: list[dict]
    expression_translations: list[dict]

Also add make_initial_state(artifact_id, source_type, path) -> AgentState
that returns a fully initialized state with all fields at zero values.

Write `tests/agent/test_state.py`:
- test_make_initial_state_has_all_keys: result has all AgentState field names
- test_source_type_set: source_type == passed value
- test_error_log_empty_list: error_log is []
- test_confidence_scores_empty_dict: confidence_scores is {}
```

---

## A2 — `agent/agents/analysis/complexity.py`

**Scope:** Heuristic complexity scorer with Haiku for edge cases
**Sprint:** 2 | **Duration:** 30 min
**Test:** `pytest tests/agent/test_complexity.py -v`
**File:** `agent/agents/analysis/complexity.py`

```
Implement `agent/agents/analysis/complexity.py`.

Read #file:agent/CLAUDE.md section "Complexity Agent".
Read #file:docs/brainstorming/enterprise-hardening-plan.md section 7.2 for SSIS additions.

Signature: def run(state: AgentState) -> dict

Heuristic scoring (no LLM for main path):
  score = 0
  +1 if len(transforms) > 10
  +1 if any transform type is "scd_type_2"
  +1 if any stream_join has > 2 inputs
  +1 if count of column_derive transforms > 5
  +1 if any source connector is "mainframe_sftp" or "fixed_width"
  +2 if ir["warnings"] non-empty (unsupported transform found)
  # SSIS additions:
  +2 if any transform type is "python_fn" (Script Component)
  +1 if any transform type is "fuzzy_match"
  +1 if ir.get("pre_sql") non-empty
  final_score = min(score, 5)

Track assignment:
  score <= 2 → "auto"
  score 3–4 → "review"
  score == 5 → "manual"

Haiku call ONLY if any source query contains "EXEC", "WITH ROLLUP", or "PROCEDURE".
Return: {"complexity_score": score, "track": track}

Write tests:
- test_simple_auto: 2 transforms, no SCD → score<=2, track="auto"
- test_scd_adds_score: scd_type_2 in transforms → score includes +1
- test_script_component_adds_two: python_fn transform → +2
- test_warning_forces_manual: ir["warnings"] non-empty → score=5, track="manual"
- test_returns_only_changed_keys: result dict has exactly 2 keys
```

---

## A3 — `agent/agents/generation/yaml_generator.py`

**Scope:** IR → Framework YAML with schema validation
**Sprint:** 2 | **Duration:** 45 min
**Test:** `pytest tests/agent/test_generators.py -v`
**File:** `agent/agents/generation/yaml_generator.py`

```
Implement `agent/agents/generation/yaml_generator.py`.

Read #file:framework/CLAUDE.md section "YAML Config Reference (Canonical)".
Read #file:docs/brainstorming/canonical-taxonomy.md section "Transformation: Properties Contract".
Read #file:framework/config/schema.json — the output YAML must validate against this.
Read #file:agent/generator/yaml_generator.py (POC — reuse structure, update names).

The generator must:
1. Read state["ir"] (canonical IR dict)
2. Render a YAML job config
3. IR type → YAML type is identity (row_filter → row_filter, no translation)
4. Validate rendered YAML against framework/config/schema.json (jsonschema)
5. Auto-fix attempt on validation failure (add missing required fields with defaults)
6. Raise ValueError if still invalid after auto-fix

Function: def run(state: AgentState) -> dict
  Returns: {"generated_artifacts": {"yaml": "/path/to/output.yaml"}}

Write tests:
- test_generates_valid_yaml: sample IR → YAML passes schema validation
- test_canonical_names_only: output contains "row_filter" not "filter"
- test_ir_type_equals_yaml_type: no renaming in generator (identity mapping)
- test_schema_violation_raises: malformed IR → ValueError
- test_idempotent: two calls on same IR → identical output files
```

---

## A4 — `agent/agents/validation/syntax_validator.py`

**Scope:** Tier 1 (YAML syntax) + Tier 2 (JSON Schema) validation
**Sprint:** 2 | **Duration:** 30 min
**Test:** `pytest tests/agent/test_validators.py -v`
**File:** `agent/agents/validation/syntax_validator.py`

```
Implement `agent/agents/validation/syntax_validator.py`.

Read #file:agent/CLAUDE.md section "Validation Agent".

Signature: def run(state: AgentState) -> dict

Tier 1 — YAML syntax:
  yaml.safe_load(open(yaml_path)) — YAMLError → tier 1 fail

Tier 2 — JSON Schema:
  jsonschema.validate(config, schema) — ValidationError → tier 2 fail
  Skip Tier 2 if Tier 1 fails.

validation_results format:
  [{"tier": 1, "passed": True/False, "errors": ["..."]},
   {"tier": 2, "passed": True/False, "errors": ["..."]}]

Return: {"validation_results": results, "error_log": updated_log}

Write tests:
- test_valid_yaml_passes_both_tiers
- test_malformed_yaml_fails_tier1_only: tier2 entry absent in results
- test_schema_violation_fails_tier2: valid YAML, missing required field
- test_tier2_skipped_when_tier1_fails: only 1 entry in validation_results
```

---

## A5 — `agent/graph.py` (LangGraph wiring)

**Scope:** Wire all implemented nodes into LangGraph state machine
**Sprint:** 3 | **Duration:** 45 min
**Test:** `pytest tests/agent/test_graph.py -v`
**File:** `agent/graph.py`

```
Implement `agent/graph.py` wiring all implemented agent nodes.

Read #file:agent/CLAUDE.md section "LangGraph Graph (agent/graph.py)".
Read #file:docs/brainstorming/migration-agent-architecture.md section "LangGraph State Machine".

Wire these nodes (in order):
  parse (dispatcher.run) → analyze (complexity.run) → translate (rules_agent + llm_translator)
  → generate (yaml_generator.run) → validate (syntax_validator.run)

Conditional routing:
  After parse: error_log non-empty → END; else → analyze
  After analyze: track=="manual" → END; else → translate
  After translate: any confidence<0.7 and track!="review" → END (manual); else → generate
  After validate: any tier failed → END (with error); else → END (success)

Use dispatcher.run (P4) as the parse node — auto-detects Informatica/ADF/SSIS.
Compile WITHOUT PostgreSQL checkpointer for now: app = workflow.compile()

Write integration test in tests/agent/test_graph.py:
- test_full_pipeline_informatica: invoke with m_LOAD_CUSTOMERS.xml
  assert final["generated_artifacts"]["yaml"] exists
  assert final["error_log"] == []
  assert YAML contains "row_filter" not "filter"
- test_manual_track_exits_early: IR with warnings → final["track"]=="manual", no YAML generated
```

---

## A6 — `agent/agents/review/pr_generator.py`

**Scope:** GitHub PR generation with confidence table and SME checklist
**Sprint:** 3 | **Duration:** 45 min
**Test:** `pytest tests/agent/test_pr_generator.py -v --mock-llm`
**File:** `agent/agents/review/pr_generator.py`

```
Implement `agent/agents/review/pr_generator.py`.

Read #file:agent/CLAUDE.md section "PR Generator + Reviewer Agent".

This agent:
1. Reads state["generated_artifacts"]["yaml"] → loads YAML content
2. Reads state["confidence_scores"] → builds a Markdown confidence table
3. Reads state["manual_review_items"] → builds an SME checklist
4. Uses Claude Sonnet 4.6 to write the PR body (system prompt cached)
5. Creates the GitHub PR via gh CLI subprocess call

PR body must include:
  ## Converted Pipeline: {job_name}
  ## Confidence Summary (table of transform → confidence)
  ## SME Review Checklist (items requiring human verification)
  ## Changes (diff-friendly list of sources → transforms → sinks)

Security: PR body must NOT contain any source data row values.

Model: claude-sonnet-4-6
Caching: system=[{"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}]

Write tests (mock Anthropic client + mock subprocess):
- test_pr_body_contains_confidence_table: markdown table in body
- test_pr_body_contains_sme_checklist: manual_review_items appear as checkboxes
- test_no_source_data_in_pr_body: body does NOT contain actual table row values
- test_gh_cli_called: subprocess.run called with "gh pr create"
- test_prompt_caching_set: system message has cache_control=ephemeral
```

---

## A7 — `agent/memory/vector_store.py`

**Scope:** pgvector RAG store for few-shot translation examples
**Sprint:** 4 | **Duration:** 45 min
**Test:** `pytest tests/agent/test_vector_store.py -v -m integration`
**File:** `agent/memory/vector_store.py`

```
Implement `agent/memory/vector_store.py`.

Read #file:agent/CLAUDE.md section "Memory Architecture".
Connection string from env: PGVECTOR_URL

Functions:
  embed(text: str) -> list[float]
    Use Anthropic Embeddings API or sentence-transformers (make configurable via env EMBED_BACKEND)

  store_example(source_expr, canonical_type, translated, confidence) -> None
    INSERT INTO etl_translation_examples

  find_similar(expr, n=3) -> list[dict]
    SELECT with <-> cosine distance operator; return top n results

Table DDL (run on first connect):
  CREATE TABLE IF NOT EXISTS etl_translation_examples (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_expr    TEXT NOT NULL,
    canonical_type VARCHAR(50) NOT NULL,
    translated     TEXT NOT NULL,
    confidence     FLOAT NOT NULL,
    embedding      vector(768) NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

Mark integration tests @pytest.mark.integration (require running PostgreSQL+pgvector):
- test_store_and_retrieve: store one → find_similar returns it
- test_top_n_results: store 5, n=3 → returns 3
- test_empty_store: find_similar on empty table → []
- test_auto_learn: approved migration → stored automatically
```

---

## P1 — `agent/agents/parser/informatica.py`

**Scope:** Production Informatica XML parser using all canonical names
**Sprint:** 2 | **Duration:** 60 min
**Test:** `pytest tests/agent/test_parser.py -v`
**File:** `agent/agents/parser/informatica.py`

```
Implement `agent/agents/parser/informatica.py` — the production parser.

Read before writing:
- #file:agent/CLAUDE.md section "Vendor → Canonical Mapping Tables" for INFORMATICA_TRANSFORM_MAP
- #file:docs/brainstorming/enterprise-hardening-plan.md section 7.1 (IR structure)
- #file:agent/parser/informatica_xml.py (POC — understand structure, do not copy class)
- #file:sample_informatica/m_LOAD_CUSTOMERS.xml (test artifact)

Signature: def run(state: AgentState) -> dict

Must:
1. Parse .xml at state["raw_artifact_path"] using xml.etree.ElementTree
2. Use INFORMATICA_TRANSFORM_MAP for all TYPE attributes → canonical IR type
3. Use INFORMATICA_CONNECTOR_MAP for DBTYPE → canonical connector name
4. Handle Update Strategy: check UPDATEOVERRIDE expression for SCD type detection
5. Emit ir["warnings"] for unknown types; set auto_convertible=False
6. Build topological sort from CONNECTOR elements
7. Parse TABLEATTRIBUTE expressions into properties dict per transform
8. Return: {"ir": ir_dict} following the canonical IR structure

Write tests:
- test_parse_sample_xml: 3 transforms, canonical types: row_filter, lookup_enrich, column_derive
- test_no_vendor_names_in_ir: no "Filter", "Expression", "Lookup Procedure" in output
- test_unknown_type_warning: Java Transformation → warnings non-empty, auto_convertible=False
- test_connector_names_canonical: source connector is "sqlserver" not "SQLSERVER"
- test_topological_order: transforms ordered by data flow (source → filter → lookup → expression)
```

---

## P2 — `agent/agents/parser/adf.py`

**Scope:** ADF pipeline JSON + Data Flow JSON parser
**Sprint:** 5 | **Duration:** 75 min
**Test:** `pytest tests/agent/test_adf_parser.py -v`
**File:** `agent/agents/parser/adf.py`

```
Implement `agent/agents/parser/adf.py`.

Read:
- #file:agent/CLAUDE.md section "Vendor → Canonical Mapping Tables" (ADF_ACTIVITY_MAP)
- #file:docs/brainstorming/enterprise-hardening-plan.md section 7.3 (ADF JSON structure)
- #file:agent/agents/parser/informatica.py (same run() signature pattern)

ADF artifacts: a folder of JSON files.
  Pipeline JSON: list of activities including ExecuteDataFlow references
  Data Flow JSON: sources[], transformations[], sinks[], script (ADF DSL)

Signature: def run(state: AgentState) -> dict

Must:
1. Load pipeline JSON from state["raw_artifact_path"]
2. Find ExecuteDataFlow activities → load referenced Data Flow JSON from same folder
3. Map transformation types via ADF_ACTIVITY_MAP
4. Map linked service types via ADF_LINKED_SERVICE_MAP
5. Extract pipeline parameters → ir["parameters"]
6. Handle unknown activity types → warning + auto_convertible=False
7. Return canonical IR dict

Write tests using fixtures in tests/fixtures/adf/:
- test_parse_simple_dataflow: source → derived_column → sink → IR with column_derive
- test_linked_service_mapped: AzureSqlMI → azure_sql connector
- test_unknown_activity_emits_warning
- test_parameters_extracted
- test_execute_dataflow_loads_referenced_json
```

---

## P3 — `agent/agents/parser/ssis.py`

**Scope:** SSIS .dtsx package parser (new — not in original POC)
**Sprint:** 6 | **Duration:** 90 min
**Test:** `pytest tests/agent/test_ssis_parser.py -v`
**File:** `agent/agents/parser/ssis.py`

```
Implement `agent/agents/parser/ssis.py`.

Read:
- #file:docs/brainstorming/enterprise-hardening-plan.md sections 3.1–3.3 (SSIS structure + SSIS_COMPONENT_MAP)
- #file:agent/agents/parser/informatica.py (same run() signature)

Signature: def run(state: AgentState) -> dict

Must:
1. Parse .dtsx XML with xml.etree.ElementTree; register SSIS namespaces
2. Extract ConnectionManagers → connector refs via SSIS_CONNECTION_MAP
3. Extract DTS:Variables → ir["parameters"]
4. Find the Microsoft.Pipeline executable → parse inner <pipeline>/<components>
5. Map each componentClassID via SSIS_COMPONENT_MAP
6. Parse <paths> → topological DAG → ordered transforms
7. Extract Execute SQL Tasks before/after Data Flow → ir["pre_sql"], ir["post_sql"]
8. Detect SCD type from ColumnType attributes (FixedAttribute→type1, ChangingAttribute→type2)
9. Unknown components → warning + auto_convertible=False

Create minimal .dtsx fixtures in tests/fixtures/ssis/:

Write tests:
- test_simple_dft: OLEDBSource → DerivedColumn → OLEDBDestination → IR produced
- test_conditional_split_to_route_split: componentClassID→route_split
- test_script_component_manual_queue: ScriptComponent → warning, auto_convertible=False
- test_scd_wizard_type_detection: ColumnType attributes → scd_type_1 vs scd_type_2
- test_variables_become_parameters
- test_execute_sql_becomes_pre_sql
```

---

## P4 — `agent/agents/parser/dispatcher.py`

**Scope:** Auto-detect source format and route to correct parser
**Sprint:** 6 | **Duration:** 30 min
**Test:** `pytest tests/agent/test_dispatcher.py -v`
**File:** `agent/agents/parser/dispatcher.py`

```
Implement `agent/agents/parser/dispatcher.py`.

Read #file:docs/brainstorming/enterprise-hardening-plan.md section "Multi-Source Dispatcher".

Signature: def run(state: AgentState) -> dict

Detection logic:
  path = Path(state["raw_artifact_path"])
  .dtsx OR source_type=="ssis"        → ssis.run(state)
  .json OR source_type=="adf"         → adf.run(state)
  .xml  OR source_type=="informatica" → informatica.run(state)
  else → error_log + return

Wire dispatcher.run as the "parse" node in agent/graph.py (replaces direct informatica ref).

Write tests:
- test_dtsx_routes_to_ssis
- test_json_routes_to_adf
- test_xml_routes_to_informatica
- test_source_type_overrides_extension: source_type="ssis" with .xml extension → ssis parser
- test_unknown_format_logs_error
```

---

## E1 — Informatica Expression Rules

**Scope:** `rules/informatica.yaml` + `rules_agent.py` (60+ rules)
**Sprint:** 3 | **Duration:** 60 min
**Test:** `pytest tests/agent/test_rules_agent.py -v`
**Files:** `agent/agents/translation/rules/informatica.yaml`, `agent/agents/translation/rules_agent.py`

```
Implement the Informatica expression rule engine.

Read #file:docs/brainstorming/enterprise-hardening-plan.md section 5.1 for the complete
informatica.yaml structure covering: string_functions, numeric_functions, date_functions,
conditional_functions, type_conversion, security_hashing.

Step 1 — Create agent/agents/translation/rules/informatica.yaml
Include ALL rules from section 5.1 (minimum 60 rules across all categories).
Format: rule entries with pattern, python, and optional notes/format_map fields.

Step 2 — Implement agent/agents/translation/rules_agent.py
  def run(state: AgentState) -> dict
  def translate_expression(expr: str, source_dialect: str = "informatica") -> dict
    Returns: {translated: str | None, confidence: float, method: "rules" | "unmatched"}

The translator must:
  - Load the correct rules YAML based on source_dialect
  - Pattern-match using regex (handle {arg} placeholders)
  - Return method="unmatched" if no rule matches (LLM handles these)

Write parametrised tests covering every rule category:
  @pytest.mark.parametrize("expr,expected", [
    ("IIF(STATUS='A','Y','N')", "np.where(df['STATUS']=='A','Y','N')"),
    ("ISNULL(EMAIL)", "df['EMAIL'].isna()"),
    ("NVL(PHONE, 'UNKNOWN')", "df['PHONE'].fillna('UNKNOWN')"),
    ("UPPER(LAST_NAME)", "df['LAST_NAME'].str.upper()"),
    ("SUBSTR(CODE, 1, 3)", "df['CODE'].str[0:3]"),
    ("TO_DATE(DATE_STR, 'MM/DD/YYYY')", "pd.to_datetime(df['DATE_STR'], format='%m/%d/%Y')"),
    ("ADD_TO_DATE(BIRTH_DATE, 'YYYY', 18)", "df['BIRTH_DATE'] + pd.DateOffset(years=18)"),
    ("SHA256(SSN)", "df['SSN'].apply(lambda x: hashlib.sha256(str(x).encode()).hexdigest())"),
  ])
```

---

## E2 — ADF Expression Rules

**Scope:** `rules/adf.yaml` (40+ ADF wrangling expression rules)
**Sprint:** 4 | **Duration:** 45 min
**Test:** `pytest tests/agent/test_adf_expressions.py -v`
**File:** `agent/agents/translation/rules/adf.yaml`

```
Create agent/agents/translation/rules/adf.yaml.

Read #file:docs/brainstorming/enterprise-hardening-plan.md section 5.2 for the complete
adf.yaml structure covering: string, numeric, date, conditional functions.

Update agent/agents/translation/rules_agent.py to:
  - Load adf.yaml when source_dialect="adf"
  - Support the ADF function call syntax: functionName(args) without $ prefix

Write parametrised tests in tests/agent/test_adf_expressions.py:
  ("iif(status == 'ACTIVE', 1, 0)",       "np.where(df['status'] == 'ACTIVE', 1, 0)"),
  ("coalesce(email, phone)",              "df['email'].combine_first(df['phone'])"),
  ("upper(last_name)",                    "df['last_name'].str.upper()"),
  ("toString(order_id)",                  "df['order_id'].astype(str)"),
  ("toDate(date_str, 'yyyy-MM-dd')",      "pd.to_datetime(df['date_str'], format='%Y-%m-%d')"),
  ("year(birth_date)",                    "df['birth_date'].dt.year"),
  ("sha2(ssn, 256)",                      "df['ssn'].apply(lambda x: hashlib.sha256(...))"),
  ("uuid()",                              "pd.Series([str(uuid.uuid4()) for _ in range(len(df))])"),
```

---

## E3 — SSIS Expression Rules

**Scope:** `rules/ssis.yaml` with cast operator pre-processing pipeline
**Sprint:** 5 | **Duration:** 60 min
**Test:** `pytest tests/agent/test_ssis_expressions.py -v`
**File:** `agent/agents/translation/rules/ssis.yaml`

```
Create agent/agents/translation/rules/ssis.yaml.

Read #file:docs/brainstorming/enterprise-hardening-plan.md section 5.3 for the complete
structure including: pre_processing, cast_operators, string_functions, numeric_functions,
date_functions, conditional_functions, logical_operators.

Update agent/agents/translation/rules_agent.py for SSIS dialect:
  1. Run pre_processing regexes FIRST (bracket columns + variable substitution)
  2. Run cast_operator regexes (strip (DT_I4) type casts before function matching)
  3. Run function rule matching
  4. Handle SSIS ternary: condition ? trueVal : falseVal → np.where(...)

Write parametrised tests in tests/agent/test_ssis_expressions.py:
  ("TRIM([first_name])",                           "df['first_name'].str.strip()"),
  ("(DT_I4)[order_id]",                            "df['order_id'].astype('Int32')"),
  ("(DT_DBTIMESTAMP)[order_date]",                 "pd.to_datetime(df['order_date'])"),
  ("YEAR([birth_date])",                           "df['birth_date'].dt.year"),
  ("ISNULL([email])",                              "df['email'].isna()"),
  ("SUBSTRING([code], 1, 3)",                      "df['code'].str[0:3]"),
  ("[status] == \"ACTIVE\" ? 1 : 0",               "np.where(df['status'] == 'ACTIVE', 1, 0)"),
  ("@[User::SourceSchema]",                        "config['parameters']['SourceSchema']"),
  ("(DT_STR, 50, 1252)([first_name] + \" \" + [last_name])", "(df['first_name'] + ' ' + df['last_name']).astype(str)"),
```

---

## E4 — LLM Expression Translator (Tiered Fallback)

**Scope:** Haiku → Sonnet → manual queue with confidence gating
**Sprint:** 5 | **Duration:** 60 min
**Test:** `pytest tests/agent/test_llm_translator.py -v --mock-llm`
**File:** `agent/agents/translation/llm_translator.py`

```
Harden `agent/agents/translation/llm_translator.py` with the tiered fallback ladder.

Read #file:docs/brainstorming/enterprise-hardening-plan.md section 5.4 (Tier 0–3 spec).
Read #file:agent/CLAUDE.md section "LLM Translator Agent".

Replace the current single-Sonnet-call approach with:

Tier 1 — Haiku classification (for unmatched expressions):
  model: claude-haiku-4-5-20251001
  System (cached): "Identify the closest rule template for this ETL expression. Return JSON:
    {template_id: str, confidence: float, params: dict}"
  If confidence >= 0.7 → apply template with extracted params → confidence = haiku_conf

Tier 2 — Sonnet full translation (if Tier 1 confidence < 0.7):
  model: claude-sonnet-4-6
  System (cached): "Translate the ETL expression to Python/pandas. Return JSON:
    {python_expr: str, confidence: float, explanation: str}.
    Use df['col'] for columns. No imports. If uncertain, say so honestly."
  If confidence >= 0.5 → use result

Tier 3 — Manual queue (confidence < 0.5 from Sonnet):
  Add to state["manual_review_items"]: {expression, source_type, reason, tier_reached}
  Set expression in IR to "# TODO: manually translate: {original}"

Security enforcement:
  NEVER include data values in prompt — only expression strings.
  Assert: prompt length < 2000 chars (data rows would inflate this significantly)

Write tests (mock both Haiku and Sonnet clients):
- test_haiku_called_first_for_unmatched
- test_sonnet_called_when_haiku_low_confidence
- test_manual_queue_when_sonnet_low_confidence
- test_no_data_in_prompt: assert actual row values not in any prompt string
- test_prompt_caching_on_both_models: cache_control ephemeral on system prompts
```

---

## X1 — Batch Migration CLI

**Scope:** Process a folder of ETL artifacts end-to-end
**Sprint:** 7 | **Duration:** 45 min
**Test:** `pytest tests/agent/test_batch.py -v`
**File:** `agent/cli_batch.py`

```
Implement `agent/cli_batch.py` — batch migration command.

Read #file:docs/brainstorming/enterprise-hardening-plan.md section "Batch Migration CLI" (A16).

CLI: etl-agent batch --input-dir ./exports/ --output-dir ./yaml/ [--source-type informatica|adf|ssis]

For each artifact in input-dir:
  1. Create AgentState via make_initial_state
  2. Auto-detect source_type from file extension if --source-type not specified
  3. Run app.invoke(state) using the compiled LangGraph graph
  4. Write YAML to output-dir if generated_artifacts["yaml"] set
  5. Collect metrics for batch_report.json

Output files:
  {output-dir}/batch_report.json:
    {total, auto_converted, needs_review, manual_queue,
     by_source_type, estimated_review_hours, failures}
  {output-dir}/manual_review_items.json: aggregated list of all manual items

Add entry-point: etl-batch = "agent.cli_batch:main" in pyproject.toml.

Write tests:
- test_batch_processes_folder: 3 fixtures → 3 yaml files
- test_report_counts_correct: auto + review + manual = total
- test_failures_captured: corrupt fixture → appears in report failures[]
- test_manual_items_aggregated: items from all pipelines merged into one file
```

---

## X2 — Observability and Job Metrics

**Scope:** Structured per-step metrics in the framework execution engine
**Sprint:** 8 | **Duration:** 40 min
**Test:** `pytest tests/test_framework.py -k observability -v`
**File:** `framework/execution/engine.py`

```
Add structured observability to framework/execution/engine.py.

Read #file:docs/brainstorming/enterprise-hardening-plan.md section "Agent Session A17".
Read the current engine.py to understand the execution loop.

Add to each job run:
1. run_id = str(uuid.uuid4()) — unique per job invocation
2. Per-step logging at INFO level (JSON format via logging.getLogger("etl.metrics")):
   {"run_id": "...", "step_id": "...", "step_type": "...",
    "input_rows": N, "output_rows": M, "duration_s": T}
3. Job summary at completion:
   {"run_id": "...", "job_name": "...", "status": "success|failure",
    "total_source_rows": N, "total_sink_rows": M, "duration_s": T, "steps": [...]}
4. Row count assertion after each sink write:
   if written_count != len(df): raise AssertionError(f"Row count mismatch: expected {len(df)}, got {written_count}")

Use logging.getLogger("etl.metrics") — never print().

Write tests:
- test_run_id_in_all_step_logs: capture log output, assert same run_id across steps
- test_step_metrics_logged: each step produces one JSON log entry
- test_row_count_mismatch_raises: mock sink returning wrong count → AssertionError
- test_job_summary_logged: final summary entry present in log output
```

---

## X3 — Integration Test Suite

**Scope:** End-to-end tests across all three source types
**Sprint:** 8 | **Duration:** 60 min
**Test:** `pytest tests/integration/ -v -m integration`
**File:** `tests/integration/test_full_estate_sample.py`

```
Create tests/integration/test_full_estate_sample.py.

Read #file:docs/brainstorming/enterprise-hardening-plan.md section "Agent Session A18".

Create 5 minimal but representative fixtures in tests/fixtures/integration/:
  1. informatica_scd2.xml    — row_filter + lookup_enrich + column_derive + scd_type_2
  2. ssis_etl.dtsx           — DataConversion + Sort + ConditionalSplit + OLE DB
  3. adf_aggregate.json      — DerivedColumn + Aggregate + Join + Sink
  4. ssis_scd.dtsx           — SCD Wizard with type 1 + type 2 columns
  5. informatica_router.xml  — Router (multi-group) + Sorter

For each fixture, parametrised test:
  @pytest.mark.integration
  @pytest.mark.parametrize("fixture_path,source_type,expected_transforms", [
      ("tests/fixtures/integration/informatica_scd2.xml", "informatica", ["row_filter", "lookup_enrich", "column_derive", "scd_type_2"]),
      ...
  ])
  def test_full_pipeline(fixture_path, source_type, expected_transforms):
      state = make_initial_state("test", source_type, fixture_path)
      final = app.invoke(state)
      assert final["ir"] is not None
      assert final["complexity_score"] is not None
      ir_types = [t["type"] for t in final["ir"]["transforms"]]
      for t in expected_transforms:
          assert t in ir_types
      if final["track"] == "auto":
          assert Path(final["generated_artifacts"]["yaml"]).exists()

Run: pytest tests/integration/ -v -m integration
```

---

## Appendix — Complete `pyproject.toml` Entry-Points

Add the following to `pyproject.toml` as each session completes:

```toml
[project.scripts]
etl-run   = "framework.runner:main"
etl-agent = "agent.cli:main"
etl-batch = "agent.cli_batch:main"

[project.entry-points."etl.transformations"]
row_filter        = "framework.transformations.row_filter:RowFilterTransformation"
column_derive     = "framework.transformations.column_derive:ColumnDeriveTransformation"
lookup_enrich     = "framework.transformations.lookup_enrich:LookupEnrichTransformation"
stream_join       = "framework.transformations.stream_join:StreamJoinTransformation"
aggregate         = "framework.transformations.aggregate:AggregateTransformation"
scd_type_2        = "framework.transformations.scd_type_2:ScdType2Transformation"
column_select     = "framework.transformations.column_select:ColumnSelectTransformation"
union_all         = "framework.transformations.union_all:UnionAllTransformation"
row_sort          = "framework.transformations.row_sort:RowSortTransformation"
route_split       = "framework.transformations.route_split:RouteSplitTransformation"
scd_type_1        = "framework.transformations.scd_type_1:ScdType1Transformation"
row_deduplicate   = "framework.transformations.row_deduplicate:RowDeduplicateTransformation"
data_convert      = "framework.transformations.data_convert:DataConvertTransformation"
sequence_generate = "framework.transformations.sequence_generate:SequenceGenerateTransformation"
rank              = "framework.transformations.rank:RankTransformation"
window_fn         = "framework.transformations.window_fn:WindowFnTransformation"
pivot             = "framework.transformations.pivot:PivotTransformation"
unpivot           = "framework.transformations.unpivot:UnpivotTransformation"
flatten_json      = "framework.transformations.flatten_json:FlattenJsonTransformation"
mask_pii          = "framework.transformations.mask_pii:MaskPiiTransformation"
data_validate     = "framework.transformations.data_validate:DataValidateTransformation"
python_fn         = "framework.transformations.python_fn:PythonFnTransformation"
row_count         = "framework.transformations.row_count:RowCountTransformation"
fuzzy_match       = "framework.transformations.fuzzy_match:FuzzyMatchTransformation"

[project.entry-points."etl.connectors"]
sqlite      = "framework.connectors.sqlite:SqliteConnector"
csv         = "framework.connectors.csv:CsvConnector"
parquet     = "framework.connectors.parquet:ParquetConnector"
postgres    = "framework.connectors.postgres:PostgresConnector"
sqlserver   = "framework.connectors.sqlserver:SqlServerConnector"
oracle      = "framework.connectors.oracle:OracleConnector"
azure_sql   = "framework.connectors.azure_sql:AzureSqlConnector"
s3          = "framework.connectors.s3:S3Connector"
excel       = "framework.connectors.excel:ExcelConnector"
fixed_width = "framework.connectors.fixed_width:FixedWidthConnector"
snowflake   = "framework.connectors.snowflake:SnowflakeConnector"
adls        = "framework.connectors.adls:AdlsConnector"
kafka       = "framework.connectors.kafka:KafkaConnector"
mysql       = "framework.connectors.mysql:MySqlConnector"
sftp        = "framework.connectors.sftp:SftpConnector"
http_api    = "framework.connectors.http_api:HttpApiConnector"
```
