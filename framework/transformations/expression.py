"""Expression transformation — derives new columns from existing ones."""

import logging
import math
from typing import Any

import pandas as pd

from framework.transformations.base import BaseTransformation

logger = logging.getLogger(__name__)

# Safe built-ins exposed to expression eval — no file I/O, no imports.
# Sufficient for arithmetic, type coercion, and basic math in agent-generated configs.
_EVAL_GLOBALS: dict[str, Any] = {
    "__builtins__": {},
    "abs": abs, "round": round, "min": min, "max": max,
    "len": len, "str": str, "int": int, "float": float,
    "math": math,
}


class ExpressionTransformation(BaseTransformation):
    """Adds or replaces columns using Python expressions evaluated over DataFrame columns.

    Each expression is evaluated with column names as local variables pointing to
    their pandas Series.  Standard Python operators (``+``, ``*``, etc.) apply
    element-wise because Series overloads them.  String literals broadcast
    correctly — ``first_name + ' ' + last_name`` works as expected.

    Config keys:
        expressions (list[dict]):
            Each item must have:
                target (str): Name of the output column to create or overwrite.
                expr   (str): Python expression string referencing column names.

    Example config::

        expressions:
          - target: full_name
            expr: "first_name + ' ' + last_name"
          - target: revenue
            expr: "price * quantity"
    """

    transformation_type = "expression"

    def __init__(self, config: dict[str, Any]) -> None:
        super().__init__(config)
        self._expressions: list[dict[str, str]] = config["expressions"]

    def apply(self, df: pd.DataFrame) -> pd.DataFrame:
        """Evaluate each expression and assign the result to the target column.

        Expressions are applied in order so later ones may reference columns
        created by earlier ones.

        Returns:
            Copy of *df* with target columns added or overwritten.
        """
        result = df.copy()
        for spec in self._expressions:
            target: str = spec["target"]
            expr: str = spec["expr"]
            col_ns = {col: result[col] for col in result.columns}
            result[target] = eval(expr, _EVAL_GLOBALS, col_ns)  # noqa: S307
            logger.debug("expression '%s' → column '%s'", expr, target)
        return result
