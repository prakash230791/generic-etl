"""Connector plugin registry for the ETL framework."""

from typing import Any

from framework.connectors.base import BaseConnector

# Maps type strings (as they appear in job YAML) to their module + class.
# entry-points in pyproject.toml mirror this for pip-installed third-party plugins.
_BUILTIN_CONNECTORS: dict[str, str] = {
    "sqlite":   "framework.connectors.sqlite:SQLiteConnector",
    "csv_file": "framework.connectors.csv_file:CSVFileConnector",
}


def get_connector(connector_type: str, config: dict[str, Any]) -> BaseConnector:
    """Instantiate a connector by its YAML type string.

    Resolves *connector_type* against the built-in registry.  Third-party
    connectors can be registered by adding an ``etl.connectors`` entry-point
    in their own ``pyproject.toml`` — extend ``_BUILTIN_CONNECTORS`` or
    override this function to pick those up at runtime.

    Args:
        connector_type: Value of the ``type`` key in the job YAML connector block.
        config:         Connector-specific configuration dict.

    Returns:
        Instantiated connector ready for ``read()`` or ``write()`` calls.

    Raises:
        ValueError: If *connector_type* is not registered.
    """
    import importlib

    if connector_type not in _BUILTIN_CONNECTORS:
        known = sorted(_BUILTIN_CONNECTORS)
        raise ValueError(f"Unknown connector type: {connector_type!r}. Known types: {known}")

    module_path, class_name = _BUILTIN_CONNECTORS[connector_type].split(":")
    module = importlib.import_module(module_path)
    cls: type[BaseConnector] = getattr(module, class_name)
    return cls(config)
