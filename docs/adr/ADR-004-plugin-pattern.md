# ADR-004: Plugin pattern — BaseConnector and BaseTransformation ABCs

**Status:** Accepted  
**Date:** 2025-Q4

## Context

The framework needs to support multiple connector types (SQLite, CSV, Postgres, S3, …) and transformation types (filter, lookup, expression, SCD Type 2, …) without requiring changes to the core engine when new ones are added.

## Decision

Define **Abstract Base Classes** (`BaseConnector`, `BaseTransformation`) as plugin contracts. Register built-in implementations in a dict inside each package's `__init__.py`. Resolve plugins at runtime via `get_connector(type, config)` and `get_transformation(type, config)` factory functions using lazy `importlib.import_module()`.

## Rationale

- ABCs enforce the interface at class definition time (Python raises `TypeError` on instantiation if abstract methods are missing)
- Lazy imports avoid circular dependency issues between `__init__.py` and submodule files
- The dict-based registry is simpler and faster than scanning entry points at runtime (entry-points scanning triggered ResourceWarning floods from Python 3.13's internal SQLite metadata cache)
- New plugins are added by: (1) creating the class, (2) adding one line to the registry dict — zero changes to the engine

## Plugin registration

```python
# framework/connectors/__init__.py
_BUILTIN_CONNECTORS: dict[str, str] = {
    "sqlite":   "framework.connectors.sqlite:SQLiteConnector",
    "csv_file": "framework.connectors.csv_file:CSVFileConnector",
}

def get_connector(connector_type: str, config: dict) -> BaseConnector:
    module_path, class_name = _BUILTIN_CONNECTORS[connector_type].split(":")
    module = importlib.import_module(module_path)
    return getattr(module, class_name)(config)
```

## Consequences

- **Positive:** Engine is closed for modification, open for extension; every plugin is independently testable
- **Negative:** Type errors in plugins surface at runtime (first `apply()` call), not at import time — mitigated by tests
- **Note:** Third-party plugins (outside this repo) can still use setuptools entry points — the factory function can be extended to fall back to entry-point lookup if the type is not in the built-in dict
