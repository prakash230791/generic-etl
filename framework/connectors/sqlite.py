"""SQLite connector — reads from / writes to a SQLite database table."""

import logging
import sqlite3
from pathlib import Path
from typing import Any

import pandas as pd

from framework.connectors.base import BaseConnector

logger = logging.getLogger(__name__)


class SQLiteConnector(BaseConnector):
    """Connector for SQLite sources and sinks.

    Config keys:
        db_path   (str): Path to the ``.db`` file (created on write if absent).
        table     (str): Table name to read from or write to.
        if_exists (str): ``replace`` | ``append`` | ``fail`` (write only, default ``replace``).
    """

    connector_type = "sqlite"

    def __init__(self, config: dict[str, Any]) -> None:
        super().__init__(config)
        self._db_path = Path(config["db_path"])
        self._table = config["table"]

    def read(self) -> pd.DataFrame:
        """Read all rows from the configured table and return a DataFrame.

        Returns:
            DataFrame containing every row and column from the table.
        """
        logger.debug("SQLiteConnector.read: %s / %s", self._db_path, self._table)
        with sqlite3.connect(self._db_path) as conn:
            return pd.read_sql(f'SELECT * FROM "{self._table}"', conn)

    def write(self, df: pd.DataFrame) -> None:
        """Write *df* to the configured table.

        Args:
            df: DataFrame to persist.  Column names must match the target schema
                when ``if_exists='append'`` or ``'fail'``.
        """
        if_exists: str = self.config.get("if_exists", "replace")
        logger.debug(
            "SQLiteConnector.write: %s / %s (%s), rows=%d",
            self._db_path,
            self._table,
            if_exists,
            len(df),
        )
        with sqlite3.connect(self._db_path) as conn:
            df.to_sql(self._table, conn, if_exists=if_exists, index=False)
