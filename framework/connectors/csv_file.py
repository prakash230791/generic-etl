"""CSV file connector — reads from / writes to a CSV file."""

from typing import Any

import pandas as pd

from framework.connectors.base import BaseConnector


class CSVFileConnector(BaseConnector):
    """Connector for flat CSV file sources and sinks.

    Config keys:
        path      (str): Path to the CSV file.
        delimiter (str): Field delimiter (default ``,``).
        encoding  (str): File encoding (default ``utf-8``).
    """

    def __init__(self, config: dict[str, Any]) -> None:
        super().__init__(config)

    def read(self) -> pd.DataFrame:
        """Read the CSV file and return a DataFrame."""
        raise NotImplementedError

    def write(self, df: pd.DataFrame) -> None:
        """Write *df* to the CSV file."""
        raise NotImplementedError
