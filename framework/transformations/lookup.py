"""Lookup transformation — enriches the pipeline DataFrame via a join."""

import logging
from typing import Any

import pandas as pd

from framework.transformations.base import BaseTransformation

logger = logging.getLogger(__name__)


class LookupTransformation(BaseTransformation):
    """Left-joins the pipeline DataFrame with a lookup dataset.

    Config keys:
        lookup_source (dict): Connector block for the lookup table
                              (``type`` + ``config`` keys, same shape as ``source``).
        join_on       (list[str]): Column(s) present in both DataFrames to join on.
        columns       (list[str]): Columns to pull in from the lookup table.
                                   If omitted, all non-join columns are included.
    """

    transformation_type = "lookup"

    def __init__(self, config: dict[str, Any]) -> None:
        super().__init__(config)
        self._join_on: list[str] = config["join_on"]
        self._columns: list[str] = config.get("columns", [])
        self._lookup_cfg: dict[str, Any] = config["lookup_source"]

    def apply(self, df: pd.DataFrame) -> pd.DataFrame:
        """Left-join *df* with the lookup source and return the enriched DataFrame.

        Unmatched rows receive NaN for the added columns.
        """
        from framework.connectors import get_connector

        lookup_conn = get_connector(self._lookup_cfg["type"], self._lookup_cfg["config"])
        lookup_df = lookup_conn.read()

        if self._columns:
            keep = self._join_on + [c for c in self._columns if c not in self._join_on]
            lookup_df = lookup_df[keep]

        result = df.merge(lookup_df, on=self._join_on, how="left")
        logger.debug(
            "lookup join_on=%s added %d columns, %d rows",
            self._join_on,
            len(lookup_df.columns) - len(self._join_on),
            len(result),
        )
        return result
