# GitHub Copilot Instructions — Generic ETL Platform

## Project Overview
Two-component enterprise ETL modernisation platform:
1. **`framework/`** — YAML-driven ETL runtime (Python 3.11+, pandas). **Status: POC complete.**
2. **`agent/`** — LangGraph-based heterogeneous migration agent. **Status: POC complete; production agent in progress.**

---

## Active Development Focus
**Production Migration Agent** — implementing `agent/agents/`, `agent/state.py`, `agent/graph.py`.
See `agent/CLAUDE.md` for the full specification.

---

## Key Patterns

### Plugin pattern (framework)
Every connector and transformation is a plugin registered via Python entry-points.

```python
# New connector: extend BaseConnector
class MyConnector(BaseConnector):
    def read(self, config: dict) -> pd.DataFrame: ...
    def write(self, df: pd.DataFrame, config: dict) -> None: ...

# New transform: extend BaseTransformation
class MyTransformation(BaseTransformation):
    def apply(self, df: pd.DataFrame, config: dict) -> pd.DataFrame:
        result = df.copy()  # always copy — never mutate input
        ...
        return result
```

### Agent pattern (migration agent)
Every specialist agent is a function that reads `AgentState` and returns a partial dict.

```python
from agent.state import AgentState

def run(state: AgentState) -> dict:
    # Read from state, do work, return only changed keys
    return {"ir": new_ir, "error_log": state["error_log"]}
```

**No agent calls another agent directly** — all routing through LangGraph graph edges.

### LLM usage (agent only)
```python
import anthropic
client = anthropic.Anthropic()

# Always use prompt caching for repeated system prompts
response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=1024,
    system=[{"type": "text", "text": SYSTEM_PROMPT,
              "cache_control": {"type": "ephemeral"}}],
    messages=[{"role": "user", "content": user_msg}]
)
```

Use **Haiku** (`claude-haiku-4-5-20251001`) for classification tasks.
Use **Sonnet** (`claude-sonnet-4-6`) for translation and PR generation.

---

## Coding Standards

- Type hints on every function signature
- Docstring on every class and public method (one-line minimum)
- `logging.getLogger(__name__)` — never `print()`
- `pathlib.Path` — never string path concatenation
- `df.copy()` before modifying any DataFrame in a transformation
- `pytest` for all tests; fixtures in `conftest.py`
- No hardcoded credentials — `os.environ` references only

---

## File Locations (Critical)

| What | Where |
|---|---|
| Job YAML schema | `framework/config/schema.json` |
| AgentState definition | `agent/state.py` |
| LangGraph graph | `agent/graph.py` |
| Informatica parser | `agent/agents/parser/informatica.py` |
| Expression rules | `agent/agents/translation/rules/informatica.yaml` |
| LLM translator | `agent/agents/translation/llm_translator.py` |
| YAML generator | `agent/agents/generation/yaml_generator.py` |
| Tests | `tests/` (framework + agent + end-to-end) |

---

## Do NOT

- Modify `BaseConnector` or `BaseTransformation` ABCs
- Send source data rows to any LLM (IR contains metadata only)
- Store credentials in any file
- Add `print()` statements
- Return LLM output without parsing and validating structure
- Implement a new agent that calls another agent directly
- Skip confidence scoring on any LLM-translated expression

---

## Test Commands

```bash
make test                    # all tests + coverage
pytest tests/ -v -k "test_parser"   # filter by name
make demo                    # full end-to-end demo
ruff check framework/ agent/ # lint
```
