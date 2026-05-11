"""Loads and parses YAML job configuration files."""

from pathlib import Path
from typing import Any

import yaml


def load_config(path: Path) -> dict[str, Any]:
    """Load a YAML job config file and return it as a plain dict.

    Args:
        path: Absolute or relative path to the YAML file.

    Returns:
        Parsed configuration dictionary.

    Raises:
        yaml.YAMLError: If the file is not valid YAML.
        FileNotFoundError: If *path* does not exist.
    """
    with path.open("r", encoding="utf-8") as fh:
        return yaml.safe_load(fh)
