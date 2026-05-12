# Migration Agent — Implementation Guide

## Context

The POC agent (`parser/`, `ir/`, `translator/`, `generator/`) converts Informatica XML → YAML
and all tests pass. This CLAUDE.md guides the **production agent** implementation:
a LangGraph-based heterogeneous multi-agent system with 8 specialist agents, pgvector RAG,
PostgreSQL checkpointing, and 5 human-in-the-loop gates.

---

## What Exists (POC — Keep and Extend)

| File | Keep? | Notes |
|---|---|---|
| `agent/cli.py` | Extend | Add `batch` command alongside existing `convert` |
| `agent/parser/informatica_xml.py` | Keep | Rename/move to `agent/agents/parser/informatica.py` |
| `agent/ir/schema.py` | Replace | Current `IRMapping` is too simple; use full `IR` dataclass below |
| `agent/translator/expressions.py` | Keep | Becomes `agent/agents/translation/rules_agent.py` |
| `agent/translator/llm_fallback.py` | Keep | Becomes part of `agent/agents/translation/llm_translator.py` |
| `agent/generator/yaml_generator.py` | Keep | Becomes `agent/agents/generation/yaml_generator.py` |

---

## Target File Layout

```
agent/
├── cli.py                              # Extend: add batch command
├── state.py                            # NEW: ConversionState TypedDict
├── graph.py                            # NEW: LangGraph graph definition
│
├── agents/
│   ├── parser/
│   │   ├── base.py                     # NEW: SourceParser ABC
│   │   ├── informatica.py              # MOVE from parser/informatica_xml.py
│   │   └── adf.py                      # NEW: ADF JSON parser
│   ├── analysis/
│   │   ├── complexity.py               # NEW: heuristic + Haiku SQL classifier
│   │   └── classifier.py               # NEW: pgvector ANN similarity search
│   ├── translation/
│   │   ├── rules_agent.py              # MOVE from translator/expressions.py
│   │   ├── rules/
│   │   │   └── informatica.yaml        # MOVE rule definitions here
│   │   ├── llm_translator.py           # EXTEND from translator/llm_fallback.py
│   │   └── confidence.py               # NEW: per-expression confidence scorer
│   ├── generation/
│   │   ├── yaml_generator.py           # MOVE from generator/yaml_generator.py
│   │   ├── dag_generator.py            # NEW: Airflow DAG Python AST builder
│   │   ├── test_generator.py           # NEW: pytest fixture generator
│   │   └── summary_generator.py        # NEW: Claude Haiku plain-language summary
│   ├── validation/
│   │   ├── syntax_validator.py         # NEW: Tier 1–2 (YAML load, schema check)
│   │   ├── unit_test_runner.py         # NEW: Tier 3–4 (subprocess pytest + row count)
│   │   └── reconciliation.py           # NEW: Tier 5 shadow run (P0/P1 only)
│   └── review/
│       └── pr_generator.py             # NEW: GitHub PR + Claude Sonnet body
│
├── memory/
│   ├── vector_store.py                 # NEW: pgvector client (embed + ANN search)
│   └── audit_log.py                    # NEW: PostgreSQL audit trail writer
│
└── gates/
    └── human_gate.py                   # NEW: LangGraph interrupt + Slack notify
```

---

## AgentState — The Shared Contract

Every agent reads from and writes to `AgentState`. No agent calls another agent directly.

```python
# agent/state.py
from typing import TypedDict, Optional

class AgentState(TypedDict):
    artifact_id: str
    source_type: str                     # "informatica" | "adf"
    raw_artifact_path: str
    ir: Optional[dict]                   # Populated by Parser
    complexity_score: Optional[int]      # 1–5, set by Complexity Agent
    pattern_id: Optional[str]            # Set by Classifier Agent
    pattern_similarity: Optional[float]  # 0.0–1.0
    track: Optional[str]                 # "auto" | "review" | "manual"
    confidence_scores: dict[str, float]  # expr_id → confidence
    generated_artifacts: dict            # "yaml" | "dag" | "tests" | "summary" → path
    validation_results: list[dict]       # tier → {passed, errors}
    pr_url: Optional[str]
    gate_status: dict[str, str]          # gate_id → "pending"|"approved"|"rejected"
    error_log: list[str]
    retry_count: dict[str, int]          # node_id → count
```

**Rule:** Every agent function signature is `def run(state: AgentState) -> AgentState`.
Return a new dict with only the keys you changed — LangGraph merges it.

---

## LangGraph Graph (`agent/graph.py`)

```python
from langgraph.graph import StateGraph, START
from agent.state import AgentState

workflow = StateGraph(AgentState)

# Register nodes (one per specialist agent)
workflow.add_node("parse",      parse_node)
workflow.add_node("analyze",    analyze_node)
workflow.add_node("classify",   classify_node)
workflow.add_node("translate",  translate_node)
workflow.add_node("generate",   generate_node)
workflow.add_node("validate",   validate_node)
workflow.add_node("pr_gen",     pr_generator_node)
workflow.add_node("gate",       gate_node)           # reusable gate node

# Edges — Supervisor never appears as a node; routing IS the edges
workflow.add_edge(START, "parse")
workflow.add_conditional_edges("parse", route_after_parse,
    {"success": "analyze", "error": END})
workflow.add_edge("analyze", "classify")
workflow.add_conditional_edges("classify", route_by_track,
    {"auto": "translate", "review": "translate", "manual": END})
workflow.add_conditional_edges("translate", route_after_translate,
    {"confident": "generate", "low_confidence": END})  # END = manual queue
workflow.add_edge("generate", "validate")
workflow.add_conditional_edges("validate", route_after_validate,
    {"pass": "pr_gen", "t1_t2_fail": "generate", "t3_t4_fail": "translate"})
workflow.add_edge("pr_gen", "gate")
workflow.add_conditional_edges("gate", route_after_gate,
    {"approved": END, "rejected": "translate"})

# Compile with PostgreSQL checkpointing
app = workflow.compile(
    checkpointer=PostgresSaver(conn_string=os.environ["AGENT_DB_URL"]),
    interrupt_before=["gate"]           # pause here for human approval
)
```

---

## IR Schema — Full Version

Replace `agent/ir/schema.py` with the production dataclasses:

```python
# Key fields the Parser must populate:
@dataclass
class IR:
    ir_version: str = "1.0"
    source_origin: dict           # {type, artifact_id, exported_at}
    job: dict                     # {id, name, description, domain}
    sources: list[IRSource]
    transformations: list[IRTransformation]
    targets: list[IRTarget]
    complexity: ComplexityAssessment   # filled by Complexity Agent
    warnings: list[str]

@dataclass
class IRTransformation:
    id: str
    original_name: str
    type: str                     # TransformType enum value
    inputs: list[str]             # upstream node IDs
    ports: list[IRPort]
    properties: dict
    complexity_contribution: int  # 1–3

@dataclass
class ExpressionTranslation:
    source_expression: str
    python_output: Optional[str]
    confidence: float             # 0.0–1.0
    translation_method: str       # "deterministic" | "llm" | "manual"
    review_required: bool         # True if confidence < 0.7
```

---

## Specialist Agent Implementation Rules

### Parser Agent
- Lives in `agent/agents/parser/`
- Input: `raw_artifact_path` from state
- Output: `ir` (dict) in state
- **No LLM** — use `lxml` for XML, `json` for ADF
- On any parse error: set `error_log`, return — do NOT guess

### Complexity Agent
- Lives in `agent/agents/analysis/complexity.py`
- Heuristic scoring first (no LLM):
  ```python
  score = 0
  if len(ir["transformations"]) > 10: score += 1
  if any(t["type"] == "scd_type_2" for t in ir["transformations"]): score += 1
  if any(t.get("complexity_contribution", 0) >= 3 for t in ir["transformations"]): score += 1
  ```
- Invoke **Claude Haiku only** for embedded SQL classification (binary: ansi/vendor)
- Set `track`: `score ≤ 2 → "auto"`, `3–4 → "review"`, `5 → "manual"`

### Rules Agent (Translation Tier)
- Lives in `agent/agents/translation/rules_agent.py`
- Rules loaded from `agent/agents/translation/rules/informatica.yaml`
- Must handle `IIF`, `ISNULL`, `NVL`, `CONCAT`, `TRIM`, `TO_DATE`, `UPPER`, `LOWER`, `SUBSTR`, `IN`
- Unmatched expressions: add to state with `confidence=None` for LLM Translator

### LLM Translator Agent
- Lives in `agent/agents/translation/llm_translator.py`
- Only called when Rules Agent has `confidence=None` expressions
- Use **Claude Sonnet** (`claude-sonnet-4-6`)
- Retrieve 3 few-shot examples from pgvector before each call
- Enable **prompt caching** on the system prompt (it's identical across calls)
- Return JSON: `{"translated": "...", "confidence": 0.0–1.0, "reasoning": "..."}`
- Auto-store to pgvector if `confidence >= 0.9`

### Generators (run in parallel with `asyncio.gather`)
- `yaml_generator.py` — Jinja2 templates; `jsonschema.validate()` before returning
- `dag_generator.py` — Build Python `ast` module AST; `ast.unparse()` to emit code
- `test_generator.py` — Emit `pytest` fixtures; one test per transformation
- `summary_generator.py` — Claude Haiku; 3-sentence business description

### Validator Agent
- Tier 1–2: pure Python, no subprocess
- Tier 3: `subprocess.run(["pytest", test_file, "-q"])` — check exit code
- Tier 4: call `etl-runner --config <yaml> --dry-run --sample-rows 1000`
- Tier 5: full run in shadow environment — P0/P1 only; skip for P2/P3

---

## LLM Usage Policy

| Agent | Model | When |
|---|---|---|
| Complexity (SQL check) | `claude-haiku-4-5-20251001` | Only if embedded SQL found |
| LLM Translator | `claude-sonnet-4-6` | Only unmatched expressions (~20%) |
| Summary Generator | `claude-haiku-4-5-20251001` | Once per job |
| PR Generator | `claude-sonnet-4-6` | Once per job |

Always use `anthropic` SDK. Always set `max_tokens`. Always enable prompt caching for
repeated system prompts using `{"type": "text", "text": "...", "cache_control": {"type": "ephemeral"}}`.

---

## Environment Variables Required

```bash
ANTHROPIC_API_KEY=...            # Claude API access
AGENT_DB_URL=postgresql://...    # LangGraph checkpointer + audit log
PGVECTOR_URL=postgresql://...    # RAG vector store (can be same DB)
GITHUB_TOKEN=...                 # PR Generator
```

---

## Dependencies to Add (`pyproject.toml`)

```toml
dependencies = [
    # existing ...
    "langgraph>=0.2",
    "langchain-anthropic>=0.2",
    "pgvector>=0.3",
    "psycopg2-binary>=2.9",
    "jinja2>=3.1",
    "sqlfluff>=3.0",             # SQL formatter for query beautification
    "pygithub>=2.3",             # PR Generator
]
```

---

## Test Strategy

```
tests/
├── test_framework.py            # existing — do not break
├── test_agent.py                # existing — extend, do not rewrite
├── test_end_to_end.py           # existing — must still pass
└── agent/
    ├── test_parser.py           # unit: XML/JSON → IR
    ├── test_complexity.py       # unit: scoring heuristics
    ├── test_rules_agent.py      # unit: each rule pattern
    ├── test_llm_translator.py   # integration: mock Claude API
    ├── test_generators.py       # unit: YAML/DAG/test output
    ├── test_validators.py       # integration: Tier 1–4
    └── test_graph.py            # integration: full LangGraph run
```

Run: `pytest tests/ -v --cov=agent --cov-fail-under=80`

---

## Implementation Order (Recommended)

Work in this order — each step is independently testable:

1. `agent/state.py` — AgentState TypedDict
2. `agent/agents/parser/informatica.py` — move + expand existing parser
3. `agent/agents/analysis/complexity.py` — heuristic scorer (no LLM yet)
4. `agent/agents/translation/rules_agent.py` — move + expand existing rules
5. `agent/graph.py` — wire graph with nodes 1–4 only; run end-to-end
6. `agent/agents/translation/llm_translator.py` — add Sonnet + RAG
7. `agent/agents/generation/` — all 4 generators (parallel, test each)
8. `agent/agents/validation/` — Tier 1→4 validators
9. `agent/memory/` — pgvector + audit log
10. `agent/gates/human_gate.py` — LangGraph interrupt
11. `agent/agents/review/pr_generator.py` — GitHub PR

---

## Do NOT

- Call one agent directly from another — all routing through graph edges
- Send source data rows to any LLM — IR contains metadata only
- Store credentials anywhere — use `os.environ` references only
- Use `print()` — use `logging.getLogger(__name__)`
- Skip confidence scores on any LLM-translated expression
- Implement Tier 5 shadow run before Tiers 1–4 are stable
