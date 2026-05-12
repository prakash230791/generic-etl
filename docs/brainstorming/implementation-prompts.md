# Implementation Prompts — Claude Sonnet 4.6 in VS Code GHCP

**Purpose:** Ready-to-use prompts for each implementation session.  
**Model:** Claude Sonnet 4.6 (`claude-sonnet-4-6`)  
**Tool:** GitHub Copilot Chat in VS Code (`@workspace` context)

---

## How to Use These Prompts Effectively

### Token Optimization Principles

1. **One file per session.** Never ask Claude to implement multiple agents or connectors
   in one message. Each session should produce one working, tested file.
   
2. **Start every session with `/impl-status`.** This loads current test state into context
   — Claude won't re-implement something already done.

3. **Reference files by path, not by description.** Say "read `agent/CLAUDE.md`" not
   "read the agent implementation guide". Paths are unambiguous.

4. **Provide the exact class contract upfront.** Paste the relevant section of
   `agent/CLAUDE.md` or `framework/CLAUDE.md` directly into the prompt — don't
   ask Claude to discover it.

5. **End every session with a test run.** Ask Claude to run `make test` and confirm
   all tests pass before ending the session.

6. **Never ask for explanation + implementation in the same prompt.**  
   - Explanation session: ask *why* and *how* — no code changes  
   - Implementation session: implement one file — no explanations

### VS Code GHCP Context Tricks

- Use `@workspace` to let GHCP search the codebase automatically
- Open the file you want implemented in the editor before asking — GHCP picks up the active file
- Use `#file:agent/CLAUDE.md` to pin a specific file into context
- Keep the canonical taxonomy doc open in a split pane — reference it by name in prompts

---

## Session 0 — Rename POC Names to Canonical

**Scope:** Rename `filter`→`row_filter`, `expression`→`column_derive`, `lookup`→`lookup_enrich`, `csv_file`→`csv` across the framework  
**Duration:** 30–45 min  
**Test command:** `make test`

```
Rename the existing POC transformation and connector plugins to use canonical names.

Read `framework/CLAUDE.md` section "Canonical Name Refactor" for the full mapping table.
Read `docs/brainstorming/canonical-taxonomy.md` for the naming convention rules.

For each rename:
1. Rename the Python file (e.g. filter.py → row_filter.py)
2. Rename the class inside (e.g. FilterTransformation → RowFilterTransformation)
3. Update the entry-point in pyproject.toml
4. Update the enum value in framework/config/schema.json
5. Update the _BUILTIN registry dict in the connector or transformation __init__.py
6. Update any test fixtures in tests/ that reference the old name (e.g. type: "filter" → type: "row_filter")

After all renames: run `pip install -e . && make test`. All tests must pass before finishing.
Do not implement any new functionality — only rename. Keep apply() logic identical.
```

---

## Session 1 — `agent/state.py` (AgentState TypedDict)

**Scope:** Define the shared state contract used by every LangGraph node  
**Duration:** 20 min  
**Test command:** `python -c "from agent.state import AgentState; print('OK')"`

```
Create `agent/state.py` with the AgentState TypedDict and supporting dataclasses.

Read `agent/CLAUDE.md` section "AgentState — The Shared Contract" for the exact field names.

Rules:
- AgentState must be a TypedDict (from typing)
- Every field in AgentState must have a type annotation
- No default values in TypedDict — use Optional where the field may be None
- Include these fields exactly: artifact_id, source_type, raw_artifact_path, ir,
  complexity_score, pattern_id, pattern_similarity, track, confidence_scores,
  generated_artifacts, validation_results, pr_url, gate_status, error_log, retry_count

Also add a helper function `make_initial_state(artifact_id, source_type, path) -> AgentState`
that returns a fully initialized state with all fields set to their zero values.

Write a simple test in tests/agent/test_state.py that:
- Imports AgentState and make_initial_state
- Verifies make_initial_state returns a dict with all required keys
- Verifies type annotations are correct (use TypedDict.__annotations__)
```

---

## Session 2 — `agent/agents/parser/informatica.py`

**Scope:** Production Informatica XML parser using canonical names  
**Duration:** 45–60 min  
**Test command:** `pytest tests/agent/test_parser.py -v`

```
Implement `agent/agents/parser/informatica.py`. This is the production version
of the existing POC at `agent/parser/informatica_xml.py`.

Read these files before writing any code:
- `agent/CLAUDE.md` section "Vendor → Canonical Mapping Tables"
- `docs/brainstorming/canonical-taxonomy.md` section "Informatica PowerCenter → Canonical"
- `agent/parser/informatica_xml.py` (existing POC — understand what it does, then improve)
- `sample_informatica/m_LOAD_CUSTOMERS.xml` (the sample XML to parse)

The new parser must:
1. Use INFORMATICA_TRANSFORM_MAP (from agent/CLAUDE.md) to map Informatica TYPE → canonical IR type
2. Use INFORMATICA_CONNECTOR_MAP to map source/target DBTYPE → canonical connector name
3. Return an IR dict (not the old IRMapping dataclass) that matches the AgentState["ir"] field
4. Handle unknown transform types: emit a warning to ir["warnings"], set auto_convertible=False
5. Parse expressions from TABLEATTRIBUTE into a separate raw_expression field
6. Build the topological ordering of transformations (reuse the CONNECTOR graph logic from the POC)

IR structure the parser must produce:
{
  "ir_version": "1.0",
  "source_origin": {"type": "informatica", "artifact_id": "...", "exported_at": "..."},
  "job": {"name": "...", "description": ""},
  "sources": [{"id": "...", "connector": "<canonical>", "connection": "<ref>", "table": "..."}],
  "transforms": [{"id": "...", "type": "<canonical>", "inputs": [...], "properties": {...}}],
  "sinks": [{"id": "...", "connector": "<canonical>", "table": "..."}],
  "complexity": {"score": null, "auto_convertible": null},
  "warnings": []
}

Write tests in `tests/agent/test_parser.py`:
- test_parse_sample_xml: parse m_LOAD_CUSTOMERS.xml; assert 3 transforms in output
  with canonical types: row_filter, lookup_enrich, column_derive (in topological order)
- test_canonical_names: assert no transform has type "Filter", "Expression", or "Lookup Procedure"
- test_unknown_transform_emits_warning: create a minimal XML with TYPE="Java Transformation";
  assert warnings[] is not empty and auto_convertible=False
- test_connector_names: assert source connector is canonical (e.g. "sqlserver" not "SQLSERVER")
```

---

## Session 3 — `agent/agents/analysis/complexity.py`

**Scope:** Complexity scoring agent (heuristic + Haiku for edge cases)  
**Duration:** 30 min  
**Test command:** `pytest tests/agent/test_complexity.py -v`

```
Implement `agent/agents/analysis/complexity.py`.

Read `agent/CLAUDE.md` section "Complexity Agent".
Read `docs/brainstorming/canonical-taxonomy.md` to understand which transform types are complex.

The function signature must be:
  def run(state: AgentState) -> dict

Rules:
1. Read state["ir"] to access the parsed IR
2. Compute score with this heuristic (no LLM unless embedded SQL found):
   score = 0
   +1 if number of transforms > 10
   +1 if any transform has type "scd_type_2"
   +1 if any stream_join has more than 2 inputs
   +1 if number of column_derive transforms > 5
   +1 if any source connector is "mainframe_sftp"
   +2 if ir["warnings"] contains any entry (unsupported transform found)
   final_score = min(score, 5)

3. Set state["track"]:
   score <= 2 → "auto"
   score 3–4 → "review"
   score == 5 → "manual"

4. Return only changed keys: {"complexity_score": score, "track": track}

5. Use Claude Haiku ONLY if any source query contains a non-trivial SQL string AND
   the query contains keywords like "EXEC", "PROCEDURE", or "WITH ROLLUP".
   Haiku prompt: "Is this SQL ANSI standard or vendor-specific? Reply with one word: ansi or vendor"
   If vendor_specific: score += 1

Write tests in `tests/agent/test_complexity.py`:
- test_simple_mapping_auto_track: IR with 2 transforms → score<=2 → track="auto"
- test_scd_adds_complexity: IR with scd_type_2 → score includes +1
- test_unsupported_transform_forces_manual: IR with warning → score=5, track="manual"
- test_returns_only_changed_keys: result dict has only complexity_score and track keys
Do NOT mock the Anthropic client — skip Haiku invocation in tests by patching with score=0 SQL result.
```

---

## Session 4 — `agent/agents/translation/rules_agent.py`

**Scope:** Rule-based expression translator using canonical output names  
**Duration:** 60 min  
**Test command:** `pytest tests/agent/test_rules_agent.py -v`

```
Implement `agent/agents/translation/rules_agent.py`. This is the production version
of the existing POC at `agent/translator/expressions.py`.

Read before writing:
- `agent/CLAUDE.md` section "Rules Agent"
- `docs/brainstorming/canonical-taxonomy.md` section "Transformation: Properties Contract"
- `agent/translator/expressions.py` (existing POC rules — reuse the translation logic)

The rules agent translates Informatica/ADF expression strings into Python/pandas expressions.
It does NOT change type names — those are already canonical after parsing.
It translates EXPRESSION SYNTAX: e.g. IIF(STATUS='A','ACTIVE','INACTIVE') → np.where(df['STATUS']=='A','ACTIVE','INACTIVE')

Create a YAML rules file at `agent/agents/translation/rules/informatica.yaml`:
rules:
  - id: iif_to_np_where
    pattern: "IIF({cond}, {a}, {b})"
    output: "np.where({cond}, {a}, {b})"
    confidence: 1.0
  - id: isnull_check
    pattern: "ISNULL({x})"
    output: "pd.isnull({x})"
    confidence: 1.0
  - id: nvl_to_fillna
    pattern: "NVL({x}, {default})"
    output: "({x} if not pd.isnull({x}) else {default})"
    confidence: 0.95
  - id: concat_to_plus
    pattern: "CONCAT({a}, {b})"
    output: "str({a}) + str({b})"
    confidence: 1.0
  - id: trim_to_strip
    pattern: "LTRIM(RTRIM({x}))"
    output: "{x}.strip()"
    confidence: 1.0
  - id: upper
    pattern: "UPPER({x})"
    output: "{x}.str.upper()"
    confidence: 1.0
  - id: lower
    pattern: "LOWER({x})"
    output: "{x}.str.lower()"
    confidence: 1.0
  # Add at least 15 rules total covering the most common Informatica functions

Function signature:
  def translate_expression(expr: str, source_dialect: str = "informatica") -> dict:
    # Returns: {translated: str | None, confidence: float, method: "rules" | "unmatched"}

If no rule matches: return {translated: None, confidence: 0.0, method: "unmatched"}
The LLM Translator handles unmatched expressions in the next session.

Write tests in `tests/agent/test_rules_agent.py`:
- test_iif_translates: IIF(STATUS='A','Y','N') → np.where(...)
- test_isnull_translates: ISNULL(X) → pd.isnull(X)
- test_unknown_expression_returns_unmatched: made-up function → method="unmatched", confidence=0.0
- test_confidence_is_1_for_rules: all rule-matched translations have confidence=1.0
```

---

## Session 5 — `agent/agents/generation/yaml_generator.py`

**Scope:** IR → Framework YAML using canonical names throughout  
**Duration:** 45 min  
**Test command:** `pytest tests/agent/test_generators.py -v`

```
Implement `agent/agents/generation/yaml_generator.py`. This replaces the POC at
`agent/generator/yaml_generator.py`.

Read before writing:
- `framework/CLAUDE.md` section "YAML Config Reference (Canonical)"
- `docs/brainstorming/canonical-taxonomy.md` section "Transformation: Properties Contract"
- `framework/config/schema.json` (the schema the output must validate against)
- `agent/generator/yaml_generator.py` (POC — reuse the structure, update names)

The generator must:
1. Read state["ir"] (canonical IR dict)
2. Render a YAML job config using the canonical transform and connector names
3. The IR type field maps directly to the YAML type field (identity — no name translation)
4. Validate the rendered YAML against framework/config/schema.json before returning
5. If validation fails: try 1 auto-fix (add missing required fields with defaults)
   If still fails after auto-fix: raise ValueError with clear message

Function signature:
  def generate_yaml(ir: dict, output_path: Path) -> Path
  # Writes validated YAML to output_path; returns the path

YAML property mapping from IR:
- ir["transforms"][n]["type"] → yaml transforms[n]["type"]   (identical — no rename)
- ir["transforms"][n]["properties"]["condition"] → yaml condition field (for row_filter)
- ir["transforms"][n]["properties"]["derivations"] → yaml derivations dict (for column_derive)
- Use "row_filter", "column_derive", "lookup_enrich" in the YAML — NEVER "filter", "expression", "lookup"

Write tests in `tests/agent/test_generators.py`:
- test_generates_valid_yaml: run generator on sample IR; load output with yaml.safe_load; 
  validate against schema.json; assert no errors
- test_canonical_names_in_output: assert yaml output contains "row_filter" not "filter"
- test_schema_validation_catches_invalid: feed malformed IR; assert ValueError raised
- test_idempotent: running generator twice on same IR produces identical output
```

---

## Session 6 — `agent/agents/validation/syntax_validator.py` (Tiers 1–2)

**Scope:** Syntactic and schema validation of generated artifacts  
**Duration:** 30 min  
**Test command:** `pytest tests/agent/test_validators.py -v`

```
Implement `agent/agents/validation/syntax_validator.py`.

Read `agent/CLAUDE.md` section "Validation Tier" for the 5-tier design.
This session covers Tier 1 (YAML loads without error) and Tier 2 (JSON Schema validation).

Function signature:
  def validate(state: AgentState) -> dict:
    # Returns {"validation_results": [...], "error_log": [...]}

Tier 1 (yaml load):
  yaml.safe_load(open(yaml_path)) — if it raises yaml.YAMLError → tier 1 fail

Tier 2 (schema validation):
  import jsonschema
  schema = json.load(open("framework/config/schema.json"))
  jsonschema.validate(config, schema) — if raises → tier 2 fail

validation_results structure:
  [{"tier": 1, "passed": True/False, "errors": ["..."]},
   {"tier": 2, "passed": True/False, "errors": ["..."]}]

If tier 1 fails: skip tier 2 (can't schema-validate unparseable YAML).
Return partial state: {"validation_results": results, "error_log": state["error_log"] + new_errors}

Tests in `tests/agent/test_validators.py`:
- test_valid_yaml_passes_both_tiers: use sample output from test_generators.py
- test_malformed_yaml_fails_tier1: write "invalid: yaml: {unclosed" to temp file; tier 1 must fail
- test_schema_violation_fails_tier2: valid YAML but missing required "job.name" → tier 2 fail
- test_tier2_skipped_if_tier1_fails: malformed YAML → validation_results has only 1 entry
```

---

## Session 7 — `agent/graph.py` (LangGraph wiring)

**Scope:** Wire all implemented nodes into the LangGraph graph  
**Duration:** 45 min  
**Test command:** `pytest tests/agent/test_graph.py -v`

```
Implement `agent/graph.py` to wire the LangGraph state machine.

Read `agent/CLAUDE.md` section "LangGraph Graph (agent/graph.py)".
Read `docs/brainstorming/migration-agent-architecture.md` section "LangGraph State Machine".

Wire only the nodes that are already implemented (Sessions 1–6):
- parse (informatica.py → run)
- analyze (complexity.py → run)
- translate (rules_agent.py → translate all expressions in IR)
- generate (yaml_generator.py → generate_yaml)
- validate (syntax_validator.py → validate)

Use conditional routing:
- After parse: success → analyze; error → END (set error_log)
- After analyze: track=="manual" → END; otherwise → translate
- After translate: any confidence<0.7 → END (manual queue); else → generate
- After generate: → validate
- After validate: all passed → END (success); any failed → END (with error_log)

Do NOT wire gate nodes yet (that's Session 10).
Do NOT wire LLM translator yet (that's Session 8).

Compile WITHOUT checkpointer for now (add PostgreSQL in Session 9):
  app = workflow.compile()

Write a full integration test in `tests/agent/test_graph.py`:
- test_full_pipeline_on_sample_xml:
  state = make_initial_state("test_001", "informatica", "sample_informatica/m_LOAD_CUSTOMERS.xml")
  final = app.invoke(state)
  assert final["generated_artifacts"]["yaml"] is not None
  assert Path(final["generated_artifacts"]["yaml"]).exists()
  assert final["error_log"] == []
  # Load the YAML and validate it contains row_filter (not filter)
  cfg = yaml.safe_load(Path(final["generated_artifacts"]["yaml"]).read_text())
  types = [t["type"] for t in cfg["transformations"]]
  assert "row_filter" in types
  assert "filter" not in types
```

---

## Session 8 — `agent/agents/translation/llm_translator.py`

**Scope:** Claude Sonnet + RAG fallback for unmatched expressions  
**Duration:** 60 min  
**Test command:** `pytest tests/agent/test_llm_translator.py -v --mock-llm`

```
Implement `agent/agents/translation/llm_translator.py`.

Read `agent/CLAUDE.md` section "LLM Translator Agent".
Read `docs/brainstorming/migration-agent-architecture.md` section "5. LLM Translator Agent".

This agent is called ONLY for expressions where rules_agent returned method="unmatched".

Use Claude Sonnet 4.6: model="claude-sonnet-4-6"
Enable prompt caching on the system prompt (it never changes between calls):
  system=[{"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}]

SYSTEM_PROMPT must include:
- Instruction to return ONLY JSON: {"translated": "...", "confidence": 0.0-1.0, "reasoning": "..."}
- Instruction: "If confidence < 0.7, say so honestly — do not guess"
- Target dialect: Python/pandas, no imports allowed
- Framework version context

For RAG: implement a stub get_examples(expr: str, n: int = 3) → list[dict] that
returns an empty list for now (pgvector implemented in Session 9).

Function signature:
  def translate_expression(expr: str, source_dialect: str, examples: list[dict]) -> dict:
    # Returns: {"translated": str, "confidence": float, "method": "llm", "reasoning": str}

Parse and validate LLM response:
- If JSON parsing fails: return {"translated": None, "confidence": 0.0, "method": "llm_error"}
- If confidence < 0.7: set review_required=True in the transform's IR

Tests in `tests/agent/test_llm_translator.py` using pytest-mock to mock the Anthropic client:
- test_valid_response_parsed: mock returns valid JSON → confidence and translated extracted
- test_json_parse_failure_handled: mock returns non-JSON → method="llm_error", confidence=0.0
- test_low_confidence_sets_review_flag: mock returns confidence=0.5 → review_required=True
- test_prompt_caching_header_set: assert system message has cache_control=ephemeral
- test_no_source_data_in_prompt: assert prompt does NOT contain any actual row values
  (only expression string — never data)
```

---

## Session 9 — `agent/memory/vector_store.py`

**Scope:** pgvector RAG store for few-shot translation examples  
**Duration:** 45 min  
**Test command:** `pytest tests/agent/test_vector_store.py -v --integration`

```
Implement `agent/memory/vector_store.py`.

Read `agent/CLAUDE.md` section "Memory Architecture" for the long-term memory design.
Read `docs/brainstorming/migration-agent-architecture.md` section "3. Classifier Agent".

Use psycopg2 + pgvector extension. Connection string from env: PGVECTOR_URL.

Functions to implement:
  embed(text: str) -> list[float]
    # Use sentence-transformers or the Anthropic embedding API
    # Embed text → fixed-length float vector

  store_example(source_expr: str, canonical_type: str, translated: str, confidence: float) -> None
    # INSERT into etl_translation_examples (source_expr, canonical_type, translated, confidence, embedding)

  find_similar(expr: str, n: int = 3) -> list[dict]
    # SELECT with <-> operator for ANN cosine similarity
    # Returns list of {source_expr, translated, confidence, similarity}

  CREATE TABLE IF NOT EXISTS etl_translation_examples (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    source_expr  TEXT         NOT NULL,
    canonical_type VARCHAR(50) NOT NULL,  -- row_filter, column_derive, etc.
    translated   TEXT         NOT NULL,
    confidence   FLOAT        NOT NULL,
    embedding    vector(768)  NOT NULL,   -- dimension matches your embedding model
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
  );

Tests in `tests/agent/test_vector_store.py` (tagged --integration, requires running PostgreSQL):
- test_store_and_retrieve: store one example, find_similar with similar text → returned in results
- test_returns_n_results: store 5, find_similar with n=3 → returns exactly 3
- test_empty_store_returns_empty: fresh table → find_similar returns []

Update llm_translator.py to call find_similar() instead of the stub in Session 8.
```

---

## Session 10 — `agent/agents/review/pr_generator.py`

**Scope:** Auto-generate GitHub PR with confidence table and SME checklist  
**Duration:** 45 min  
**Test command:** `pytest tests/agent/test_pr_generator.py -v --mock-llm`

```
Implement `agent/agents/review/pr_generator.py`.

Read `agent/CLAUDE.md` section "PR Generator + Reviewer Agent".
Read `docs/brainstorming/migration-agent-architecture.md` section "8. PR Generator Agent".

This agent:
1. Reads state["generated_artifacts"]["yaml"] → loads YAML content
2. Reads state["confidence_scores"] → builds confidence table
3. Calls Claude Sonnet to generate a business-readable PR description
4. Creates a GitHub PR via PyGithub (token from env: GITHUB_TOKEN)

PR body must contain these sections (generated by Claude Sonnet):
  ## What this pipeline does
  ## Expression confidence summary  ← table: expression | score | review needed?
  ## Expressions needing human review  ← only those with score < 0.9
  ## SME validation checklist  ← 3–5 questions about business logic
  ## Test results  ← pass/fail for each validation tier
  ## Rollback plan

Function signature:
  def create_pr(state: AgentState, repo_name: str, base_branch: str = "main") -> dict:
    # Returns: {"pr_url": str, "pr_number": int}

Tests using mock (no real GitHub calls):
- test_pr_body_contains_all_sections: mock GitHub; assert all 5 sections present in body
- test_low_confidence_expressions_flagged: confidence 0.6 expression → appears in review section
- test_high_confidence_not_in_review: confidence 0.95 → NOT in review section
- test_no_source_data_in_pr_body: PR body must not contain any table row data
```

---

## Framework Sessions (Parallel Track)

### Session F1 — `stream_join` transformation

```
Implement `framework/transformations/stream_join.py` following the plugin pattern.

Read `framework/CLAUDE.md` section "Phase 1 — Transforms to Implement" for the
exact class structure and YAML config contract.

The transformation must:
- Accept a dict of DataFrames (not a single df) since it joins two streams
- Support join_type: inner | left | right | full
- Support multiple join_keys [{left, right}] pairs
- Return a single merged DataFrame, index reset

Register in pyproject.toml:
  stream_join = "framework.transformations.stream_join:StreamJoinTransformation"

Update framework/config/schema.json to add "stream_join" to the type enum
and add an if/then schema block for it.

Tests in tests/test_framework.py (TestStreamJoin class):
- test_inner_join_filters_non_matching
- test_left_join_keeps_all_left_rows
- test_multiple_join_keys
- test_does_not_mutate_inputs
```

### Session F2 — `aggregate` transformation

```
Implement `framework/transformations/aggregate.py`.

Read `framework/CLAUDE.md` section "aggregate" for the YAML config contract.

The transformation must parse measure expressions like "sum(amount)", "count(order_id)", "mean(amount)"
and execute them as pandas groupby aggregations.

Parse measure string: extract function name and column name.
Supported functions: sum, count, mean, min, max, first, last, nunique

Tests in tests/test_framework.py (TestAggregateTransformation):
- test_sum_by_group
- test_multiple_measures
- test_count_distinct_with_nunique
- test_group_by_multiple_columns
- test_empty_dataframe_returns_empty
```

### Session F3 — `postgres` connector

```
Implement `framework/connectors/postgres.py`.

Read `framework/CLAUDE.md` section "postgres — New connector".

Dependencies: psycopg2-binary, SQLAlchemy (already in use via pandas read_sql).

The connector must:
- read(): use pd.read_sql with psycopg2 connection
- write(): use df.to_sql with SQLAlchemy engine
- Support named parameters in queries (:param_name style)
- Support load_strategy: append | overwrite via if_exists parameter
- Resolve connection string from config["connection"] (secrets reference for now:
  just read from os.environ[config["connection"]] in POC mode)

Tests in tests/test_framework.py (TestPostgresConnector):
- Use pytest-docker-fixtures or skip with @pytest.mark.integration if no DB available
- test_read_returns_dataframe (mocked connection)
- test_write_and_read_roundtrip (integration, requires DB)
- test_query_parameterization (no SQL injection possible)
```

---

## Prompt Templates for Ad-Hoc Questions

### "How do I add a new transformation type?"

```
I want to add a new transformation type called `row_deduplicate` to the Generic ETL Framework.

Read `framework/CLAUDE.md` section "Plugin Pattern — Adding Any New Plugin".
Read `docs/brainstorming/canonical-taxonomy.md` to confirm `row_deduplicate` is in the Phase 2 catalog.

Show me:
1. The Python class with apply() method that removes duplicate rows based on config["key_columns"]
2. The pyproject.toml entry-point line to add
3. The schema.json change needed
4. Two pytest test cases

Do not implement it — just show me the code I should write.
```

### "Why is my test failing?"

```
My test `test_generates_valid_yaml` in `tests/agent/test_generators.py` is failing with:
[paste exact error message here]

The test uses this input IR:
[paste the ir dict]

Read `framework/config/schema.json` to check the schema contract.
Read `agent/agents/generation/yaml_generator.py` to find the bug.
Do not change the test — fix the generator.
```

### "Check my implementation against the spec"

```
Review my implementation of `agent/agents/analysis/complexity.py` against the spec.

Spec is in `agent/CLAUDE.md` section "Complexity Agent".

Check:
1. Does it use only heuristic scoring for the main path (no LLM)?
2. Does it set state["track"] correctly for each score range?
3. Does it return only the changed keys (not the full state)?
4. Does Haiku get called only for embedded SQL detection?
5. Are tests comprehensive (happy path + edge cases)?

Report any deviations from the spec. Do not rewrite — only report what needs fixing.
```

---

## Session Checklist (use before ending any session)

Before marking a session complete, verify:

- [ ] File exists at the correct path from `agent/CLAUDE.md` or `framework/CLAUDE.md`
- [ ] All functions have type hints and docstrings
- [ ] No `print()` statements — only `logging.getLogger(__name__)`
- [ ] No credentials or data rows in any LLM prompt
- [ ] Canonical names used everywhere (`row_filter` not `filter`, etc.)
- [ ] Tests written and `make test` passes
- [ ] `ruff check` passes on the new file
- [ ] Changes committed with descriptive message

```bash
# Final check before ending session
make test && ruff check framework/ agent/ && echo "Session complete ✅"
```
