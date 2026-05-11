"""Validates a job config dict against the JSON Schema."""

import json
from pathlib import Path
from typing import Any

import jsonschema

_SCHEMA_PATH = Path(__file__).parent / "schema.json"


def validate_config(config: dict[str, Any]) -> None:
    """Validate *config* against framework/config/schema.json.

    Args:
        config: Parsed job configuration dictionary.

    Raises:
        jsonschema.ValidationError: If the config does not conform to the schema.
    """
    with _SCHEMA_PATH.open(encoding="utf-8") as fh:
        schema = json.load(fh)
    jsonschema.validate(instance=config, schema=schema)
