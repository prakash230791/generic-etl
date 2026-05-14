# LangGraph Migration Agent — Implementation Plan

**Version:** 1.0 | **Date:** 2026-05-14
**Branch:** `claude/enterprise-hardening-plan` (docs) / local machine (implementation)
**Companion docs:**
- `adf-parser-yaml-fixes.md` — ADF parser sessions (ADF-FIX-1 through YAML-FIX-3, done locally)
- `control-table-and-framework-v2.md` — Framework v2.0 + AgentState v2 design

---

## 1. What We're Building

Replace the current sequential script (`cli_batch.py → adf_support → yaml_generator`) with a
proper **LangGraph StateGraph** that:

- Models each migration stage as a named node with typed state
- Routes pipelines differently based on complexity (auto / human-review / manual)
- Supports an `--llm-enabled` flag — when False (default, safe for local laptop), all
  expression translation uses Python rules only; no API calls
- Produces a migration report per pipeline (markdown + JSON)
- Is **fully visualizable** at any point (Mermaid diagram, ASCII art, or PNG)

### 1.1 Graph Topology

```
START
  │
  ▼
[parse]        — load ZIP/XML → IR JSON (wraps existing AdfCatalog / InformaticaXMLParser)
  │
  ▼
[analyze]      — score complexity (5-dimension, 5–15), detect connector & transform types
  │
  ▼
[classify]     — route: auto | human_review | manual
  │
  ├──(manual)──────────────────────────────────────────┐
  │                                                     │
  ├──(human_review)──────────────────────────────────┐ │
  │                                                   │ │
  └──(auto)────────────────────────────────┐          │ │
                                           ▼          ▼ ▼
                                        [translate]   skip
                                           │          │
                                           └────┬─────┘
                                                ▼
                                          [generate]    — IR → YAML v2.0
                                                │
                                          [validate]    — JSON schema + quality checks
                                                │
                                          [report]      — migration_report.md + summary JSON
                                                │
                                           [gate]       — auto_approved | human_queue
                                                │
                                              END
```

Nodes marked `skip` (manual route) bypass translate and generate — the report documents
what needs manual implementation and routes the pipeline to `human_queue` at the gate.

---

## 2. LLM-Enabled Flag Design

```
                 ┌─────────────────────────────────┐
                 │         TranslateNode            │
                 │                                  │
  expression ───►│  1. Rules engine (always runs)   │
                 │         │                        │
                 │    confidence ≥ 0.95?             │
                 │    YES ──► return (free)          │
                 │    NO  ──► llm_enabled?           │
                 │           │                      │
                 │     FALSE ──► manual_queue        │  ◄── local laptop mode
                 │     TRUE  ──► Haiku classify      │
                 │               │                  │
                 │         simple? ──► Haiku tx      │  ◄── requires ANTHROPIC_API_KEY
                 │         complex? ──► Sonnet tx    │
                 │                                  │
                 └─────────────────────────────────-┘
```

### Flag sources (checked in order)

| Priority | Source | Example |
|---|---|---|
| 1 (highest) | CLI argument | `--llm-enabled` |
| 2 | Environment variable | `ETL_LLM_ENABLED=true` |
| 3 (default) | `AgentConfig` default | `llm_enabled=False` |

**Default is always False** — safe for air-gapped / controlled environments.
The entire graph runs to completion with `llm_enabled=False`, producing valid YAML for
pipelines whose expressions are covered by the rule engine, and a `manual_queue` report
for the rest.

---

## 3. AgentState Schema

```python
# agent/state.py  (full schema)
from typing import TypedDict, Optional

class AgentState(TypedDict):
    # ── Input ───────────────────────────────────────────────
    artifact_path:    str              # path to ZIP or XML file
    artifact_id:      str              # stem of the file (used as job name)
    source_type:      str              # "adf" | "informatica" | "ssis" | "unknown"
    llm_enabled:      bool             # from AgentConfig — propagated into state
    output_dir:       str              # base output directory

    # ── Parse ───────────────────────────────────────────────
    ir:               dict             # intermediate representation (full IR JSON)
    parse_errors:     list[str]        # fatal parse errors

    # ── Analyze ─────────────────────────────────────────────
    complexity_score: int              # 5–15
    complexity_dims:  dict             # per-dimension breakdown
    connector_types:  list[str]        # ["sqlserver", "azure_sql", ...]
    transform_types:  list[str]        # ["lookup_enrich", "row_filter", ...]

    # ── Classify ────────────────────────────────────────────
    route:            str              # "auto" | "human_review" | "manual"
    requires_review:  bool             # True for human_review + manual routes

    # ── Translate ───────────────────────────────────────────
    translated_expressions: dict       # expr_str → translated_str
    manual_queue:     list[dict]       # [{expression, reason, suggested_approach}]
    translation_confidence: float      # 0.0–1.0 (fraction resolved by rules/LLM)
    translation_methods: dict          # expr_str → "rule"|"haiku"|"sonnet"|"manual"

    # ── v2.0 IR additions (from control-table-and-framework-v2.md) ──
    control_table:    Optional[dict]
    watermark:        Optional[dict]
    pre_steps:        list[dict]
    post_steps:       list[dict]
    conditional_load: Optional[dict]
    yaml_version:     str              # "2.0"

    # ── Generate ────────────────────────────────────────────
    yaml_content:     Optional[str]    # rendered YAML string
    yaml_path:        Optional[str]    # absolute path to written file

    # ── Validate ────────────────────────────────────────────
    schema_valid:     bool
    validation_errors:   list[str]
    validation_warnings: list[str]

    # ── Report ──────────────────────────────────────────────
    migration_report: dict             # full structured report
    report_path:      Optional[str]    # path to migration_report.md

    # ── Gate ────────────────────────────────────────────────
    gate_status:      str              # "auto_approved" | "human_queue" | "error"
    overall_confidence: float          # final score used for gate decision

    # ── Metadata ────────────────────────────────────────────
    run_id:           str
    started_at:       str
    completed_at:     Optional[str]
    agent_version:    str
```

---

## 4. Visualizing the LangGraph Agent

LangGraph has three built-in visualization methods. All three work locally without any
external service or API key.

### Method 1 — ASCII art (zero dependencies, terminal)

```python
from agent.graph import build_graph

graph = build_graph()
print(graph.get_graph().draw_ascii())
```

Output (example):
```
        +-----------+
        | __start__ |
        +-----------+
               *
               *
               *
          +-------+
          | parse |
          +-------+
               *
               *
               *
         +---------+
         | analyze |
         +---------+
               *
             ...
```

Run it as a quick sanity check after each session: `python -m agent.visualize ascii`

---

### Method 2 — Mermaid diagram (recommended for local laptop)

```python
from agent.graph import build_graph

graph = build_graph()
mermaid_str = graph.get_graph().draw_mermaid()
print(mermaid_str)
# or write to file:
Path("docs/architecture/agent-graph.mmd").write_text(mermaid_str)
```

**How to render locally (no internet needed):**

1. **VS Code** — install the `Markdown Preview Mermaid Support` extension.
   Then paste the Mermaid string into any `.md` file wrapped in a code fence:
   ````
   ```mermaid
   <paste here>
   ```
   ````
   Use Ctrl+Shift+V to preview.

2. **Mermaid CLI** (offline, npm): `npm install -g @mermaid-js/mermaid-cli`
   then `mmdc -i agent-graph.mmd -o agent-graph.png`

3. **Online** (when internet available): paste to https://mermaid.live

The `agent/visualize.py` script (Session LG-1) writes the file automatically:
```bash
python -m agent.visualize mermaid          # prints to stdout
python -m agent.visualize mermaid --save   # writes docs/architecture/agent-graph.mmd
```

---

### Method 3 — PNG export (needs playwright)

```bash
pip install "langgraph[draw]"    # installs playwright
python -m agent.visualize png    # writes agent-graph.png
```

```python
img_bytes = graph.get_graph().draw_mermaid_png()
Path("agent-graph.png").write_bytes(img_bytes)
```

---

### Method 4 — Jupyter notebook (good for exploration)

```python
# In a Jupyter cell:
from IPython.display import Image, display
from agent.graph import build_graph

graph = build_graph()
display(Image(graph.get_graph().draw_mermaid_png()))
```

---

### What you can see at runtime (state inspection)

```python
# Stream state updates node-by-node
config = {"artifact_path": "input.zip", "llm_enabled": False, ...}
for chunk in graph.stream(initial_state):
    node_name = list(chunk.keys())[0]
    state = chunk[node_name]
    print(f"[{node_name}] route={state.get('route')} confidence={state.get('translation_confidence')}")
```

This prints each node's name and key state fields as the graph runs — a lightweight local
alternative to LangSmith tracing.

---

## 5. File Layout (target)

```
agent/
├── config.py                 LG-0  AgentConfig dataclass (llm_enabled flag)
├── state.py                  LG-0  AgentState TypedDict
├── graph.py                  LG-1  build_graph() → compiled StateGraph
├── visualize.py              LG-1  CLI: python -m agent.visualize [ascii|mermaid|png]
├── nodes/
│   ├── __init__.py           LG-1
│   ├── parse.py              LG-2  ParseNode
│   ├── analyze.py            LG-3  AnalyzeNode
│   ├── classify.py           LG-3  ClassifyNode + route_after_classify()
│   ├── translate.py          LG-4  TranslationNode (rules + optional LLM)
│   ├── generate.py           LG-5  GenerateNode
│   ├── validate.py           LG-5  ValidateNode
│   ├── report.py             LG-6  ReportNode
│   └── gate.py               LG-6  GateNode + route_after_gate()
└── agents/
    ├── cli_batch.py          LG-7  (updated to use graph)
    ├── parser/
    │   └── adf_support.py    ✅ done locally
    └── generation/
        └── yaml_generator.py ✅ done locally (v2)

tests/
└── test_langgraph/
    ├── test_state.py         LG-0
    ├── test_graph_compile.py LG-1
    ├── test_parse_node.py    LG-2
    ├── test_analyze_classify.py LG-3
    ├── test_translate_node.py LG-4
    ├── test_generate_validate.py LG-5
    ├── test_report_gate.py   LG-6
    └── test_end_to_end_graph.py LG-7
```

---

## 6. Dependency Updates

Add to `pyproject.toml` before starting:

```toml
[project.dependencies]
# add to existing list:
langgraph = ">=0.2"
langchain-core = ">=0.2"
# anthropic already present — keep

[project.optional-dependencies]
agent-draw = ["langgraph[draw]"]   # only needed for PNG export
```

```bash
pip install "langgraph>=0.2" "langchain-core>=0.2"
```

---

## 7. Implementation Sessions

All sessions follow the same rule: **one session = one file (or two tightly coupled files)**.
Paste the prompt into your local GHCP session with the listed `#file:` context open.

---

### Session LG-0 — AgentConfig + AgentState

**Duration:** ~25 min | **Files:** `agent/config.py`, `agent/state.py`
**Tests:** `pytest tests/test_langgraph/test_state.py -v`
**Depends on:** nothing new (first session)

#### What to implement

1. `agent/config.py` — `AgentConfig` dataclass with all settings
2. `agent/state.py` — `AgentState` TypedDict (full schema from §3 above)
3. `tests/test_langgraph/test_state.py` — instantiation + field type tests

#### Session Prompt

```
Implement agent/config.py and agent/state.py for the LangGraph migration agent.

Read FIRST:
  #file:docs/brainstorming/langgraph-agent-implementation.md   (sections 2 and 3)
  #file:agent/ir/schema.py
  #file:docs/brainstorming/control-table-and-framework-v2.md   (section 9 — AgentState v2)

Implement agent/config.py:

  @dataclass
  class AgentConfig:
      llm_enabled: bool = False
      llm_model_classify: str = "claude-haiku-4-5-20251001"
      llm_model_translate: str = "claude-sonnet-4-6"
      auto_approve_threshold: float = 0.90
      human_review_threshold: float = 0.70
      output_dir: str = "output"

      @classmethod
      def from_env(cls) -> "AgentConfig":
          """Read llm_enabled from ETL_LLM_ENABLED env var (default False)."""

Implement agent/state.py:

  Full AgentState TypedDict with ALL fields from the schema in section 3 of the doc.
  Include a factory function:
      def make_initial_state(artifact_path: str, config: AgentConfig) -> AgentState
  that pre-fills run_id (uuid4), started_at (ISO timestamp), llm_enabled from config,
  output_dir from config, artifact_id from Path(artifact_path).stem, and zeroes/empties
  for all other fields.

Implement tests/test_langgraph/test_state.py:
  - test_make_initial_state_sets_run_id
  - test_make_initial_state_llm_disabled_by_default
  - test_config_from_env_reads_env_var  (monkeypatch ETL_LLM_ENABLED=true)
  - test_all_required_state_keys_present

Run: pytest tests/test_langgraph/test_state.py -v
```

---

### Session LG-1 — Graph Skeleton + Visualization

**Duration:** ~40 min | **Files:** `agent/graph.py`, `agent/visualize.py`, `agent/nodes/__init__.py`
**Tests:** `pytest tests/test_langgraph/test_graph_compile.py -v`
**Depends on:** LG-0 (AgentState)

#### What to implement

1. `agent/graph.py` — `build_graph()` returns a compiled StateGraph with 8 stub nodes.
   Each stub node just logs its name and returns state unchanged.
2. `agent/visualize.py` — CLI script: `python -m agent.visualize [ascii|mermaid|png --save]`
3. `agent/nodes/__init__.py` — empty, just makes it a package
4. Tests: graph compiles without error, has correct node names, visualization output is non-empty

#### Session Prompt

```
Implement agent/graph.py, agent/visualize.py, and agent/nodes/__init__.py.

Read FIRST:
  #file:docs/brainstorming/langgraph-agent-implementation.md   (sections 1, 3, 4)
  #file:agent/state.py

Implement agent/graph.py:

  from langgraph.graph import StateGraph, END
  from agent.state import AgentState

  def _stub_node(name: str):
      """Return a no-op node function that logs its name."""
      import logging
      logger = logging.getLogger(f"agent.nodes.{name}")
      def node(state: AgentState) -> dict:
          logger.debug("node: %s", name)
          return {}
      node.__name__ = name
      return node

  def build_graph() -> CompiledGraph:
      workflow = StateGraph(AgentState)

      # Add 8 nodes (stubs for now — replaced in later sessions)
      for name in ["parse", "analyze", "classify", "translate", "generate",
                   "validate", "report", "gate"]:
          workflow.add_node(name, _stub_node(name))

      # Wire edges (linear for now — conditional edges added in LG-3)
      workflow.set_entry_point("parse")
      workflow.add_edge("parse", "analyze")
      workflow.add_edge("analyze", "classify")
      workflow.add_edge("classify", "translate")   # will become conditional in LG-3
      workflow.add_edge("translate", "generate")
      workflow.add_edge("generate", "validate")
      workflow.add_edge("validate", "report")
      workflow.add_edge("report", "gate")
      workflow.add_edge("gate", END)

      return workflow.compile()

Implement agent/visualize.py as a CLI module:
  python -m agent.visualize ascii            # prints ASCII tree to stdout
  python -m agent.visualize mermaid          # prints Mermaid string to stdout
  python -m agent.visualize mermaid --save   # also writes docs/architecture/agent-graph.mmd
  python -m agent.visualize png --save       # writes agent-graph.png (needs langgraph[draw])

  Use click for CLI. The mermaid --save path creates the file and prints its location.

Implement tests/test_langgraph/test_graph_compile.py:
  - test_graph_compiles_without_error
  - test_graph_has_all_8_nodes
  - test_graph_entry_point_is_parse
  - test_ascii_output_is_non_empty
  - test_mermaid_output_contains_node_names

Run: pytest tests/test_langgraph/test_graph_compile.py -v
Then: python -m agent.visualize ascii
```

---

### Session LG-2 — ParseNode

**Duration:** ~35 min | **Files:** `agent/nodes/parse.py`
**Tests:** `pytest tests/test_langgraph/test_parse_node.py -v`
**Depends on:** LG-1 (graph skeleton), ADF-FIX-1 (adf_support.py, done locally)

#### What to implement

`ParseNode` is the entry point. It:
1. Detects `source_type` from file extension / content (`.zip` → `adf`, `.xml` → `informatica`)
2. Routes to the correct parser: `AdfCatalog` (ZIP) or `InformaticaXMLParser` (XML)
3. Populates `ir`, `source_type`, `parse_errors` in state
4. On parse error: sets `gate_status = "error"` and routes to END

#### Session Prompt

```
Implement agent/nodes/parse.py — the ParseNode for the LangGraph migration agent.

Read FIRST:
  #file:agent/state.py
  #file:agent/agents/parser/adf_support.py
  #file:agent/parser/informatica_xml.py
  #file:docs/brainstorming/langgraph-agent-implementation.md   (section 1 topology)

Implement agent/nodes/parse.py:

  def parse_node(state: AgentState) -> dict:
      """Load artifact → IR. Updates: ir, source_type, parse_errors, artifact_id."""

  Logic:
  1. Determine source_type from artifact_path suffix:
       .zip  → "adf"
       .xml  → "informatica"
       .dtsx → "ssis"
       else  → "unknown", add parse_error, return early
  2. For "adf": call adf_support.run({
           "raw_artifact_path": artifact_path,
           "artifact_id": artifact_id,
           "source_type": "adf",
           "error_log": []
       })
       Extract ir from result state["ir"].
  3. For "informatica": call InformaticaXMLParser().parse(Path(artifact_path)),
       then convert the IRMapping dataclass to a dict using dataclasses.asdict().
  4. For "ssis" / "unknown": set parse_errors = ["Source type not yet supported: {ext}"]
       set gate_status = "error"
  5. Return dict with ONLY the fields that changed:
       {"ir": ir_dict, "source_type": src, "parse_errors": errors, "artifact_id": id}

  Also add the parse_node into graph.py — replace the stub node:
      workflow.add_node("parse", parse_node)

Implement tests/test_langgraph/test_parse_node.py using pytest fixtures:
  - test_parse_adf_zip_produces_ir  (use sample ZIP from sample_informatica/ or create a tiny fixture ZIP)
  - test_parse_informatica_xml  (use sample_informatica/m_LOAD_CUSTOMERS.xml)
  - test_parse_unknown_extension_sets_error
  - test_parse_error_sets_gate_status_error

Run: pytest tests/test_langgraph/test_parse_node.py -v
```

---

### Session LG-3 — AnalyzeNode + ClassifyNode + Conditional Routing

**Duration:** ~45 min | **Files:** `agent/nodes/analyze.py`, `agent/nodes/classify.py`
**Tests:** `pytest tests/test_langgraph/test_analyze_classify.py -v`
**Depends on:** LG-2 (parse produces IR)

#### What to implement

`AnalyzeNode` computes a complexity score from the IR. `ClassifyNode` uses that score
to decide the route. The conditional edge replaces the stub edge in `graph.py`.

**Complexity scoring (5 dimensions × 1–3 each = 5–15 total):**

| Dimension | Score 1 | Score 2 | Score 3 |
|---|---|---|---|
| `expression_complexity` | SQL/concat/trim only | Custom functions | Unknown functions |
| `connector_count` | 1 connector type | 2–3 types | 4+ or exotic |
| `join_complexity` | No joins or 1:1 | Simple star join | Multi-hop / non-equi |
| `parameterization` | None / static | Simple params | ForEach + dynamic tables |
| `scd_pattern` | None / Type 1 | Type 2 (keys only) | Type 2 full + history |

**Routing thresholds:**
- `score ≤ 7` AND `auto_convertible=True` → `"auto"`
- `score 8–11` OR `auto_convertible=False` → `"human_review"`
- `score ≥ 12` OR `parse_errors` non-empty → `"manual"`

#### Session Prompt

```
Implement agent/nodes/analyze.py and agent/nodes/classify.py.

Read FIRST:
  #file:agent/state.py
  #file:agent/config.py
  #file:docs/brainstorming/langgraph-agent-implementation.md   (section 7, LG-3 block above)

Implement agent/nodes/analyze.py:

  def analyze_node(state: AgentState) -> dict:
      """Score the IR for complexity. Updates: complexity_score, complexity_dims,
      connector_types, transform_types."""

  Use the 5-dimension scoring table above. Extract from state["ir"]:
    - connector_types: look in ir["metadata"]["connector_types"] (ADF) or
      detect from ir source/target connectors (Informatica)
    - transform_types: ir["metadata"]["transform_types"] or IR transformations list
    - expressions: all expression strings in the IR
    - has_foreach / has_scd2 / has_joins: booleans from ir["metadata"] or IR analysis

  Score each dimension, store in complexity_dims dict, sum for complexity_score.
  Return: {"complexity_score": score, "complexity_dims": dims,
           "connector_types": types, "transform_types": transforms}

Implement agent/nodes/classify.py:

  def classify_node(state: AgentState) -> dict:
      """Decide route: auto | human_review | manual.
      Updates: route, requires_review."""

  Routing rules (exact thresholds above). Also check:
    - ir.get("metadata", {}).get("auto_convertible", True) → if False → human_review minimum
    - Any parse_errors → manual

  def route_after_classify(state: AgentState) -> str:
      """Conditional edge function. Returns: 'translate' | 'report' (manual)."""
      return "report" if state["route"] == "manual" else "translate"

Update agent/graph.py:
  - Replace classify stub with real classify_node
  - Replace analyze stub with real analyze_node
  - Replace: workflow.add_edge("classify", "translate")
    With:     workflow.add_conditional_edges(
                  "classify",
                  route_after_classify,
                  {"translate": "translate", "report": "report"}
              )

Implement tests/test_langgraph/test_analyze_classify.py:
  - test_analyze_simple_ir_scores_low        (score ≤ 7)
  - test_analyze_foreach_scores_medium       (parameterization = 3 → score ≥ 8)
  - test_classify_low_score_routes_auto
  - test_classify_medium_score_routes_human_review
  - test_classify_manual_ir_routes_manual
  - test_classify_parse_errors_routes_manual

Run: pytest tests/test_langgraph/test_analyze_classify.py -v
Then: python -m agent.visualize ascii   (should show conditional edge after classify)
```

---

### Session LG-4 — TranslationNode (rules-only path + LLM stub)

**Duration:** ~60 min | **Files:** `agent/nodes/translate.py`
**Tests:** `pytest tests/test_langgraph/test_translate_node.py -v`
**Depends on:** LG-3, existing `agent/translator/expressions.py`

#### What to implement

This is the most important session. The translate node must work perfectly with
`llm_enabled=False` — that's the only mode you'll run locally.

**Rule engine coverage to add** (extends `expressions.py`):

| Pattern | Source | Rule |
|---|---|---|
| `@concat(a, b)` | ADF | `f"{a}{b}"` or `a + b` |
| `@item().colName` | ADF ForEach | `{{ parameters.colName }}` |
| `@pipeline().parameters.X` | ADF | `{{ parameters.X }}` |
| `@utcNow()` | ADF | `datetime.utcnow().isoformat()` |
| `@formatDateTime(t, fmt)` | ADF | `t.strftime(fmt)` |
| `@if(cond, a, b)` | ADF | `a if (cond) else b` |
| `@equals(a, b)` | ADF | `a == b` |
| `@empty(s)` | ADF | `len(s) == 0` |
| `IIF(cond, a, b)` | Informatica | `a if (cond) else b` |
| `DECODE(val, ...)` | Informatica | `CASE WHEN` equivalent |
| `SYSDATE` | Informatica | `datetime.now()` |
| `TO_DATE(str, fmt)` | Informatica | `datetime.strptime(str, fmt)` |
| `SUBSTR(s, start, len)` | Informatica | `s[start:start+len]` |

#### Session Prompt

```
Implement agent/nodes/translate.py — TranslationNode with llm_enabled flag.

Read FIRST:
  #file:agent/state.py
  #file:agent/config.py
  #file:agent/translator/expressions.py     (existing rule engine)
  #file:docs/brainstorming/langgraph-agent-implementation.md   (sections 2 and 7 LG-4)
  #file:docs/brainstorming/adf-parser-yaml-fixes.md            (ADF expression table)

Implement agent/nodes/translate.py:

  class TranslationResult(TypedDict):
      translated: str
      confidence: float   # 0.0–1.0
      method: str         # "rule" | "haiku" | "sonnet" | "cache" | "manual"
      manual: bool        # True if went to manual queue

  def translate_node(state: AgentState) -> dict:
      """Translate all expressions in the IR.
      Updates: translated_expressions, manual_queue, translation_confidence,
               translation_methods."""

  Algorithm:
  1. Collect all expressions from state["ir"]:
       - ADF: iterate all activities for parameterized fields (@concat, @item(), etc.)
       - Informatica: all IRTransformation ports with expression != None
  2. For each expression:
       a. Try _translate_by_rules(expr) — covers Informatica AND ADF patterns
       b. If confidence ≥ 0.95: record as "rule", done
       c. If confidence < 0.95 AND state["llm_enabled"] == False:
            → add to manual_queue with reason="rule_engine_no_match"
            → record method="manual", confidence=0.0
       d. If confidence < 0.95 AND state["llm_enabled"] == True:
            → STUB: raise NotImplementedError("LLM translation not yet implemented")
            (This will be implemented in a future session when LLM access is available)
  3. Compute translation_confidence = len(resolved) / max(len(all), 1)
  4. Return: {
        "translated_expressions": {...},
        "manual_queue": [...],
        "translation_confidence": confidence,
        "translation_methods": {...}
     }

  Implement _translate_by_rules(expr: str) -> TranslationResult:
    Extend the existing rules in expressions.py with ALL ADF + Informatica patterns
    from the table in section 7 LG-4 above.
    Add the new ADF rules as a NEW function _apply_adf_rules(expr) in expressions.py,
    called first (before Informatica rules) when the expression starts with "@".
    Return TranslationResult with confidence=1.0 if fully matched, 0.5 if partial, 0.0 if no match.

  Replace translate stub in graph.py with translate_node.

Implement tests/test_langgraph/test_translate_node.py:
  - test_translate_adf_concat_expression        (llm_enabled=False)
  - test_translate_adf_item_expression          (llm_enabled=False)
  - test_translate_informatica_iif              (llm_enabled=False)
  - test_unknown_expression_goes_to_manual_queue (llm_enabled=False)
  - test_llm_enabled_true_raises_not_implemented (llm_enabled=True, unknown expr)
  - test_translation_confidence_is_fraction_resolved

Run: pytest tests/test_langgraph/test_translate_node.py -v
```

---

### Session LG-5 — GenerateNode + ValidateNode

**Duration:** ~45 min | **Files:** `agent/nodes/generate.py`, `agent/nodes/validate.py`
**Tests:** `pytest tests/test_langgraph/test_generate_validate.py -v`
**Depends on:** LG-4 (translated_expressions in state), existing yaml_generator v2

#### What to implement

`GenerateNode` passes the translated IR into the existing `yaml_generator.generate()`.
`ValidateNode` runs JSON Schema validation (already in `framework/config/validator.py`).

#### Session Prompt

```
Implement agent/nodes/generate.py and agent/nodes/validate.py.

Read FIRST:
  #file:agent/state.py
  #file:agent/agents/generation/yaml_generator.py
  #file:framework/config/validator.py
  #file:framework/config/schema.json

Implement agent/nodes/generate.py:

  def generate_node(state: AgentState) -> dict:
      """Generate YAML from IR + translated expressions.
      Updates: yaml_content, yaml_path."""

  Logic:
  1. If state["route"] == "manual": return {} (skip — no YAML to generate)
  2. Merge translated_expressions back into ir (update expression fields in-place):
       For each expr_str in state["translated_expressions"]:
           Find the matching expression in state["ir"] and replace with translated value.
  3. Call yaml_generator.generate(ir, output_dir / artifact_id)
  4. Read the written file back into yaml_content for downstream use.
  5. Return: {"yaml_content": content, "yaml_path": str(yaml_path)}

  If yaml_generator raises: add to validation_errors, set yaml_path=None.

Implement agent/nodes/validate.py:

  def validate_node(state: AgentState) -> dict:
      """Validate generated YAML against JSON schema.
      Updates: schema_valid, validation_errors, validation_warnings."""

  Logic:
  1. If yaml_path is None: return {"schema_valid": False}
  2. Load yaml_content with yaml.safe_load()
  3. Call framework.config.validator.validate_config(parsed_yaml) — returns (valid, errors, warnings)
  4. Additional checks:
       - Warn if any source table contains {{ parameters. (parameterized → confirm ForEach)
       - Warn if manual_queue is non-empty (some expressions need review)
       - Error if yaml_version != "2.0" (wrong generator version)
  5. Return: {"schema_valid": valid, "validation_errors": errors, "validation_warnings": warnings}

  Replace generate + validate stubs in graph.py.

Implement tests/test_langgraph/test_generate_validate.py:
  - test_generate_produces_yaml_file
  - test_generate_skipped_for_manual_route
  - test_validate_passes_for_valid_yaml
  - test_validate_fails_for_invalid_schema
  - test_validate_warns_on_manual_queue_items

Run: pytest tests/test_langgraph/test_generate_validate.py -v
```

---

### Session LG-6 — ReportNode + GateNode

**Duration:** ~40 min | **Files:** `agent/nodes/report.py`, `agent/nodes/gate.py`
**Tests:** `pytest tests/test_langgraph/test_report_gate.py -v`
**Depends on:** LG-5 (validated YAML)

#### What to implement

`ReportNode` writes a human-readable `migration_report.md` per pipeline.
`GateNode` makes the final auto-approve / human-queue decision.

**Migration report format:**
```markdown
# Migration Report — {artifact_id}

**Date:** {started_at}  **Run ID:** {run_id}

## Summary
| Field | Value |
|---|---|
| Source type | adf |
| Route | auto |
| Complexity score | 6 / 15 |
| Translation confidence | 94% |
| Schema valid | ✅ Yes |
| Gate status | ✅ AUTO APPROVED |

## Translated Expressions
| Original | Translated | Method |
|---|---|---|
| @concat(a, b) | a + b | rule |
...

## Manual Queue (requires human review)
| Expression | Reason | Suggested approach |
|---|---|---|
| @activity('X').output | activity output not supported | Manual post-processing |

## Validation Warnings
- [if any]

## YAML Output
Path: output/artifact_id/job_config.yaml
```

**Gate thresholds:**
- `schema_valid AND translation_confidence ≥ 0.90 AND route == "auto"` → `"auto_approved"`
- Everything else → `"human_queue"`

#### Session Prompt

```
Implement agent/nodes/report.py and agent/nodes/gate.py.

Read FIRST:
  #file:agent/state.py
  #file:agent/config.py
  #file:docs/brainstorming/langgraph-agent-implementation.md   (section 7 LG-6)

Implement agent/nodes/report.py:

  def report_node(state: AgentState) -> dict:
      """Write migration_report.md and summary JSON.
      Updates: migration_report, report_path."""

  1. Build the migration_report dict (all fields: summary, expressions, manual_queue,
     warnings, yaml_path, gate_status_preview).
  2. Render the markdown template (see format above) as a string.
  3. Write to output_dir / artifact_id / "migration_report.md"
  4. Write migration_report dict as output_dir / artifact_id / "migration_report.json"
  5. Return: {"migration_report": report_dict, "report_path": str(md_path)}

Implement agent/nodes/gate.py:

  def gate_node(state: AgentState) -> dict:
      """Final approval gate. Updates: gate_status, overall_confidence."""

  overall_confidence = (
      translation_confidence * 0.6 +
      (1.0 if schema_valid else 0.0) * 0.3 +
      (1.0 if route == "auto" else 0.5 if route == "human_review" else 0.0) * 0.1
  )

  gate_status = (
      "auto_approved"
      if overall_confidence >= config.auto_approve_threshold
         and schema_valid
         and route != "manual"
      else "human_queue"
  )

  Print a summary line to stdout:
    [AUTO APPROVED] artifact_id — confidence: 94% → output/artifact_id/job_config.yaml
  or:
    [HUMAN QUEUE]   artifact_id — confidence: 67% — see output/artifact_id/migration_report.md

  Replace report + gate stubs in graph.py.

Implement tests/test_langgraph/test_report_gate.py:
  - test_report_writes_markdown_file
  - test_report_includes_manual_queue_items
  - test_gate_auto_approves_high_confidence
  - test_gate_queues_low_confidence
  - test_gate_queues_manual_route
  - test_overall_confidence_formula

Run: pytest tests/test_langgraph/test_report_gate.py -v
```

---

### Session LG-7 — CLI Integration + End-to-End Test

**Duration:** ~35 min | **Files:** `agent/agents/cli_batch.py` (updated), `tests/test_langgraph/test_end_to_end_graph.py`
**Tests:** `pytest tests/test_langgraph/test_end_to_end_graph.py -v`
**Depends on:** LG-0 through LG-6 all complete

#### What to implement

Replace the direct function calls in `cli_batch.py` with the LangGraph graph.
Add `--llm-enabled` CLI flag. Run end-to-end with a real ZIP file.

#### Session Prompt

```
Update agent/agents/cli_batch.py to use the LangGraph graph, and add end-to-end tests.

Read FIRST:
  #file:agent/agents/cli_batch.py
  #file:agent/graph.py
  #file:agent/state.py
  #file:agent/config.py
  #file:docs/brainstorming/langgraph-agent-implementation.md   (section 7 LG-7)

Update agent/agents/cli_batch.py:

  Replace process_one() direct calls with:

  def process_one(artifact_path: Path, output_dir: Path, llm_enabled: bool = False) -> dict:
      from agent.graph import build_graph
      from agent.state import make_initial_state
      from agent.config import AgentConfig

      config = AgentConfig(llm_enabled=llm_enabled, output_dir=str(output_dir))
      graph = build_graph()
      initial = make_initial_state(str(artifact_path), config)

      final_state = None
      for chunk in graph.stream(initial):
          node_name = list(chunk.keys())[0]
          final_state = chunk[node_name]
          # print progress: [parse] [analyze] [classify] [translate] etc.

      return {
          "artifact_id": final_state["artifact_id"],
          "gate_status": final_state["gate_status"],
          "yaml_path": final_state.get("yaml_path"),
          "report_path": final_state.get("report_path"),
          "overall_confidence": final_state.get("overall_confidence", 0.0),
      }

  Add --llm-enabled flag to the Click CLI:
      @click.option("--llm-enabled", is_flag=True, default=False,
                    help="Enable LLM translation (requires ANTHROPIC_API_KEY)")

Implement tests/test_langgraph/test_end_to_end_graph.py:
  - test_full_graph_adf_zip_auto_approved:
      Use a real fixture ZIP (or copy VPFLookups_sync_PLE_support_live.zip to tests/fixtures/)
      Run process_one(), assert gate_status in ("auto_approved", "human_queue"),
      assert yaml_path is not None, assert migration_report.md exists.
  - test_full_graph_informatica_xml:
      Use sample_informatica/m_LOAD_CUSTOMERS.xml
      Assert gate_status in ("auto_approved", "human_queue"), yaml_path exists.
  - test_cli_batch_runs_without_error:
      Use subprocess.run(["python", "-m", "agent.agents.cli_batch", str(fixture_zip)])
      Assert returncode == 0.

Run: pytest tests/test_langgraph/test_end_to_end_graph.py -v
Then: python -m agent.visualize mermaid --save   (commit the .mmd file)
Then: python -m agent.agents.cli_batch your_zip_file.zip
```

---

## 8. Session Order & Estimated Time

| Session | Files | Time | Status |
|---|---|---|---|
| **LG-0** | `agent/config.py`, `agent/state.py` | 25 min | 🔲 |
| **LG-1** | `agent/graph.py`, `agent/visualize.py` | 40 min | 🔲 |
| **LG-2** | `agent/nodes/parse.py` | 35 min | 🔲 |
| **LG-3** | `agent/nodes/analyze.py`, `classify.py` | 45 min | 🔲 |
| **LG-4** | `agent/nodes/translate.py` | 60 min | 🔲 |
| **LG-5** | `agent/nodes/generate.py`, `validate.py` | 45 min | 🔲 |
| **LG-6** | `agent/nodes/report.py`, `gate.py` | 40 min | 🔲 |
| **LG-7** | `cli_batch.py` update, e2e tests | 35 min | 🔲 |
| **Total** | | **~5.5 hours** | |

**Do these before LangGraph sessions:**
1. `pip install "langgraph>=0.2" "langchain-core>=0.2"` — add to pyproject.toml first
2. Update pyproject.toml dependencies

---

## 9. After LangGraph Is Complete — LLM Sessions (future)

When you have access to Anthropic API in a non-controlled environment:

| Session | What to implement |
|---|---|
| **LLM-1** | `agent/nodes/translate.py` — Haiku classification tier (replace NotImplementedError stub) |
| **LLM-2** | `agent/nodes/translate.py` — Sonnet translation tier + pgvector cache lookup |
| **LLM-3** | `agent/nodes/translate.py` — prompt caching on Sonnet system prompts |
| **LLM-4** | `agent/nodes/classify.py` — Haiku-powered complexity re-scoring for ambiguous IRs |

The `llm_enabled=True` code path is stubbed (raises `NotImplementedError`) — so the graph
compiles and runs, but flips back to `manual_queue` for any unresolved expression.
No risk of accidental API calls in the controlled environment.
