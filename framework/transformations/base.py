"""Abstract base class that all transformations must implement."""

from abc import ABC, abstractmethod
from typing import Any, ClassVar

import pandas as pd


class BaseTransformation(ABC):
    """Plugin contract for pipeline transformations.

    Subclasses are discovered via the ``etl.transformations`` entry-point group.
    Each concrete subclass must set ``transformation_type`` to the string key
    used in job YAML configs (e.g. ``"filter"``).
    """

    transformation_type: ClassVar[str]

    def __init__(self, config: dict[str, Any]) -> None:
        """Initialise the transformation with its section from the job YAML.

        Args:
            config: Transformation-specific configuration dict.
        """
        self.config = config

    @abstractmethod
    def apply(self, df: pd.DataFrame) -> pd.DataFrame:
        """Apply the transformation to *df* and return the result.

        Args:
            df: Input DataFrame from the previous pipeline stage.

        Returns:
            Transformed DataFrame passed to the next stage.
        """
