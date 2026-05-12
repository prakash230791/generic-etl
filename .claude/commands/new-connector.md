# Scaffold a New Framework Connector

Creates a new connector plugin in `framework/connectors/`.

## Usage
/new-connector <name> <connector_type_key>

Examples:
- /new-connector postgres postgres
- /new-connector sqlserver sqlserver
- /new-connector s3 s3

## What to generate

1. **Connector file** at `framework/connectors/$NAME.py`:
```python
"""$NAME connector for the Generic ETL Framework."""
import logging
from typing import Any
import pandas as pd
from framework.connectors.base import BaseConnector

logger = logging.getLogger(__name__)


class ${NAME_PASCAL}Connector(BaseConnector):
    """
    Connector for $NAME.
    Config keys: (list what goes in the extra dict)
    """

    def read(self, config: dict) -> pd.DataFrame:
        """Read data from $NAME and return as DataFrame."""
        logger.info("connector=$NAME_KEY operation=read")
        # TODO: implement
        raise NotImplementedError

    def write(self, df: pd.DataFrame, config: dict) -> None:
        """Write DataFrame to $NAME."""
        logger.info("connector=$NAME_KEY operation=write rows=%d", len(df))
        # TODO: implement
        raise NotImplementedError
```

2. **Register in `pyproject.toml`** under `[project.entry-points."etl.connectors"]`:
```toml
$CONNECTOR_TYPE_KEY = "framework.connectors.$NAME:${NAME_PASCAL}Connector"
```

3. **Tests** in `tests/test_framework.py`:
```python
class Test${NAME_PASCAL}Connector:
    def test_read_returns_dataframe(self, tmp_path):
        ...
    def test_write_and_read_roundtrip(self, tmp_path):
        ...
    def test_if_exists_replace(self, tmp_path):
        ...
    def test_if_exists_append(self, tmp_path):
        ...
```

## Rules
- Must use `logging`, not `print`
- Must use `pathlib.Path`, not string paths
- `read()` must return a `pd.DataFrame`
- `write()` must not return anything (void)
- Do NOT modify `BaseConnector` — only implement the existing interface
- After adding to `pyproject.toml`, run `pip install -e .` to register the plugin
