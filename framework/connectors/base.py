"""Abstract base class that all connectors must implement."""

from abc import ABC, abstractmethod
from typing import Any, ClassVar

import pandas as pd


class BaseConnector(ABC):
    """Plugin contract for source and sink connectors.

    Subclasses are discovered via the ``etl.connectors`` entry-point group.
    Each concrete subclass must set ``connector_type`` to the string key used
    in job YAML configs (e.g. ``"sqlite"``).
    """

    connector_type: ClassVar[str]

    def __init__(self, config: dict[str, Any]) -> None:
        """Initialise the connector with its section from the job YAML.

        Args:
            config: Connector-specific configuration dict.
        """
        self.config = config

    @abstractmethod
    def read(self) -> pd.DataFrame:
        """Read data from the source and return it as a DataFrame."""

    @abstractmethod
    def write(self, df: pd.DataFrame) -> None:
        """Write *df* to the sink.

        Args:
            df: DataFrame produced by the transformation pipeline.
        """
