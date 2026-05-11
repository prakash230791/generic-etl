"""SCD Type 2 transformation — manages slowly-changing dimension history."""

from typing import Any

import pandas as pd

from framework.transformations.base import BaseTransformation


class SCDType2Transformation(BaseTransformation):
    """Implements Slowly-Changing Dimension Type 2 merge logic.

    Compares incoming rows to existing dimension records, expires changed rows
    by setting ``effective_end_date``, and inserts new versions.

    Config keys:
        business_key   (list[str]): Natural key column(s).
        tracked_columns (list[str]): Columns that trigger a new SCD version on change.
        effective_start_col (str): Column name for row effective start date.
        effective_end_col   (str): Column name for row effective end date.
        current_flag_col    (str): Column name for the active-row boolean flag.
        sink_connector (dict): Connector config pointing at the dimension table.
    """

    def __init__(self, config: dict[str, Any]) -> None:
        super().__init__(config)

    def apply(self, df: pd.DataFrame) -> pd.DataFrame:
        """Merge *df* into the dimension table and return the final state."""
        raise NotImplementedError
