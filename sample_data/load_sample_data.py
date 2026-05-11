"""Creates and populates source.db with sample customers and segments data.

Run once before the demo:
    python sample_data/load_sample_data.py
"""

import logging
import sqlite3
from pathlib import Path

import pandas as pd

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

DB_PATH = Path(__file__).parent / "source.db"

CUSTOMERS = [
    (1, "Alice",   "Smith",  "alice@example.com",  "ACTIVE",   "C001"),
    (2, "Bob",     "Jones",  "bob@example.com",    "INACTIVE", "C002"),
    (3, "Carol",   "White",  "carol@example.com",  "ACTIVE",   "C003"),
    (4, "David",   "Brown",  "david@example.com",  "ACTIVE",   "C004"),
    (5, "Eve",     "Davis",  "eve@example.com",    "INACTIVE", "C005"),
    (6, "Frank",   "Miller", "frank@example.com",  "ACTIVE",   "C001"),
    (7, "Grace",   "Wilson", "grace@example.com",  "ACTIVE",   "C003"),
    (8, "Hank",    "Moore",  "hank@example.com",   "ACTIVE",   "C002"),
]

SEGMENTS = [
    ("C001", "Premium"),
    ("C002", "Standard"),
    ("C003", "Premium"),
    ("C004", "Trial"),
]


def load(db_path: Path = DB_PATH) -> None:
    """Drop and recreate the customers and segments tables with sample rows."""
    logger.info("Writing sample data to %s", db_path)
    conn = sqlite3.connect(db_path)
    try:
        customers_df = pd.DataFrame(
            CUSTOMERS,
            columns=["customer_id", "first_name", "last_name", "email", "status", "segment_code"],
        )
        segments_df = pd.DataFrame(SEGMENTS, columns=["segment_code", "segment_name"])

        customers_df.to_sql("customers", conn, if_exists="replace", index=False)
        segments_df.to_sql("segments", conn, if_exists="replace", index=False)

        logger.info("Loaded %d customers rows", len(customers_df))
        logger.info("Loaded %d segments rows", len(segments_df))
    finally:
        conn.close()


if __name__ == "__main__":
    load()
