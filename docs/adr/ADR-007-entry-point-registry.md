# ADR-007: Entry-point based plugin registry (design intent vs. implementation)

**Status:** Accepted with modification  
**Date:** 2025-Q4

## Context

The plugin pattern (ADR-004) requires a registry that maps type strings to connector/transformation classes. The original design called for using Python's `importlib.metadata` entry points (defined in `pyproject.toml` under `[project.entry-points]`) so that third-party packages could register their own plugins without modifying this repo.

## Decision

**For the POC:** Use a **hardcoded dict** inside `__init__.py` with lazy `importlib.import_module()` resolution. The entry-points mechanism is defined in `pyproject.toml` for documentation purposes but **not used at runtime**.

**For production:** Third-party plugins should use the entry-points mechanism; the factory functions can fall back to scanning `etl.connectors` / `etl.transformations` entry-point groups when a type string is not in the built-in dict.

## Rationale for modification

During implementation, runtime entry-point scanning via `importlib.metadata.entry_points()` triggered a flood of `ResourceWarning: unclosed database connection` messages from Python 3.13's internal `importlib._bootstrap_external` SQLite metadata cache. This is a Python 3.13 regression; the warnings are benign but noisy and could mask real warnings in CI.

The lazy-dict approach achieves the same result for built-in plugins with zero overhead and no side effects.

## Entry points in pyproject.toml (for future third-party plugins)

```toml
[project.entry-points."etl.connectors"]
sqlite   = "framework.connectors.sqlite:SQLiteConnector"
csv_file = "framework.connectors.csv_file:CSVFileConnector"

[project.entry-points."etl.transformations"]
filter      = "framework.transformations.filter:FilterTransformation"
lookup      = "framework.transformations.lookup:LookupTransformation"
expression  = "framework.transformations.expression:ExpressionTransformation"
scd_type_2  = "framework.transformations.scd_type_2:SCDType2Transformation"
```

## Consequences

- **Positive:** No ResourceWarning noise; simpler and faster resolution for built-in plugins
- **Negative:** Third-party plugins cannot self-register in the POC — must be added to the dict manually
- **Mitigation:** The factory functions (`get_connector`, `get_transformation`) can trivially be extended to scan entry points as a fallback after the dict lookup fails
