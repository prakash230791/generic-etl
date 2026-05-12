# Scaffold a New Framework Transformation

Creates a new transformation plugin in `framework/transformations/`.

## Usage
/new-transform <name>

Examples:
- /new-transform joiner
- /new-transform aggregator
- /new-transform mask_pii

## What to generate

1. **Transformation file** at `framework/transformations/$NAME.py`:
```python
"""$NAME transformation for the Generic ETL Framework."""
import logging
import pandas as pd
from framework.transformations.base import BaseTransformation

logger = logging.getLogger(__name__)


class ${NAME_PASCAL}Transformation(BaseTransformation):
    """
    Implements $NAME transformation.

    Config keys (from YAML):
      - required_key: description
      - optional_key (default=X): description

    Example YAML:
      - id: my_$NAME
        type: $NAME_KEY
        input: upstream_id
        required_key: value
    """

    def apply(self, df: pd.DataFrame, config: dict) -> pd.DataFrame:
        """
        Apply $NAME transformation.
        Must not modify the input DataFrame — return a new one.
        """
        logger.info("transform=$NAME_KEY input_rows=%d", len(df))
        result = df.copy()
        # TODO: implement
        logger.info("transform=$NAME_KEY output_rows=%d", len(result))
        return result
```

2. **Register in `pyproject.toml`** under `[project.entry-points."etl.transformations"]`:
```toml
$NAME_KEY = "framework.transformations.$NAME:${NAME_PASCAL}Transformation"
```

3. **Update `framework/config/schema.json`** — add an `if/then` clause for the new type:
```json
{
  "if": { "properties": { "type": { "const": "$NAME_KEY" } } },
  "then": {
    "required": ["required_key"],
    "properties": {
      "required_key": { "type": "string" }
    }
  }
}
```

4. **Tests** in `tests/test_framework.py`:
```python
class Test${NAME_PASCAL}Transformation:
    @pytest.fixture
    def sample_df(self):
        return pd.DataFrame({...})  # realistic sample

    def test_apply_happy_path(self, sample_df):
        config = {...}
        result = ${NAME_PASCAL}Transformation().apply(sample_df, config)
        assert len(result) == expected_rows
        assert "expected_column" in result.columns

    def test_apply_does_not_mutate_input(self, sample_df):
        original = sample_df.copy()
        ${NAME_PASCAL}Transformation().apply(sample_df, config)
        pd.testing.assert_frame_equal(sample_df, original)

    def test_apply_empty_dataframe(self, sample_df):
        result = ${NAME_PASCAL}Transformation().apply(pd.DataFrame(), config)
        assert len(result) == 0
```

## Rules
- `apply()` MUST be pure — never modify input df; always `df.copy()` first
- `apply()` must reset index: `result.reset_index(drop=True)`
- Must use `logging`, not `print`
- Do NOT modify `BaseTransformation` — only implement the existing interface
- Run `pip install -e .` after `pyproject.toml` change
- Run `make test` before considering the work done
