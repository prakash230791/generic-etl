# Scaffold a New Specialist Agent

Create a new specialist agent in `agent/agents/`.

## Usage
/new-agent <tier>/<name>

Examples:
- /new-agent analysis/pattern_classifier
- /new-agent translation/adf_rules
- /new-agent validation/row_count_checker

## What to generate

1. **Agent file** at `agent/agents/$ARGUMENTS.py`:
```python
"""
<One-line description of what this agent does>.
Reads from AgentState, writes result back, returns to Supervisor via graph edge.
"""
import logging
from agent.state import AgentState

logger = logging.getLogger(__name__)


def run(state: AgentState) -> dict:
    """
    <Docstring: what it reads from state, what it writes back>.
    Returns partial AgentState dict — LangGraph merges it.
    """
    logger.info("agent=<name> artifact_id=%s", state["artifact_id"])

    # TODO: implement

    return {}  # return only the keys you changed
```

2. **Test file** at `tests/agent/test_<name>.py`:
```python
import pytest
from agent.agents.$ARGUMENTS import run


@pytest.fixture
def base_state():
    return {
        "artifact_id": "test_001",
        "source_type": "informatica",
        "raw_artifact_path": "sample_informatica/m_LOAD_CUSTOMERS.xml",
        "ir": None,
        "complexity_score": None,
        "pattern_id": None,
        "pattern_similarity": None,
        "track": None,
        "confidence_scores": {},
        "generated_artifacts": {},
        "validation_results": [],
        "pr_url": None,
        "gate_status": {},
        "error_log": [],
        "retry_count": {},
    }


def test_run_happy_path(base_state):
    result = run(base_state)
    assert isinstance(result, dict)
    # TODO: add specific assertions


def test_run_error_handling(base_state):
    # TODO: test what happens when the agent encounters bad input
    pass
```

3. **Register the node** in `agent/graph.py`:
   - Add `workflow.add_node("<name>", run)` 
   - Add the appropriate edge from the Supervisor routing

## Rules
- Agent must accept `AgentState` and return `dict` (partial state update)
- No direct calls to other agents — route via graph edges only
- No LLM unless the agent's tier explicitly uses one (check `agent/CLAUDE.md`)
- All state keys written must already be defined in `AgentState` (`agent/state.py`)
