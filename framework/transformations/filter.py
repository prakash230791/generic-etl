"""Filter transformation — drops rows that do not match a condition."""

import logging
from typing import Any

import pandas as pd

from framework.transformations.base import BaseTransformation

logger = logging.getLogger(__name__)


class FilterTransformation(BaseTransformation):
    """Retains only rows where *condition* evaluates to True.

    Config keys:
        condition (str): A pandas ``DataFrame.query()``-compatible expression,
                         e.g. ``"status == 'ACTIVE'"``.
    """

    transformation_type = "filter"

    def __init__(self, config: dict[str, Any]) -> None:
        super().__init__(config)
        self._condition: str = config["condition"]

    def apply(self, df: pd.DataFrame) -> pd.DataFrame:
        """Filter rows using the configured condition.

        Returns:
            DataFrame containing only rows where *condition* is True,
            with a clean integer index.
        """
        result = df.query(self._condition).reset_index(drop=True)
        logger.debug("filter '%s': %d → %d rows", self._condition, len(df), len(result))
        return result
