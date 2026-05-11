# ADR-006: pytest for all tests, minimum 80% coverage

**Status:** Accepted  
**Date:** 2025-Q4

## Context

The project needs a test strategy that covers unit tests (individual plugins), integration tests (engine + connectors), and end-to-end tests (XML → YAML → execution → output rows).

## Decision

Use **pytest** as the sole test runner with **pytest-cov** for coverage measurement. Enforce a **minimum 80% line coverage** gate (`--cov-fail-under=80`) in CI.

## Rationale

- pytest is the de facto standard for Python; fixtures, parametrize, and tmp_path are exactly what ETL plugin testing needs
- `tmp_path` fixture allows each test to create isolated SQLite databases — no shared state, no cleanup needed
- Golden-pair tests (known input DataFrame → assert output) are the most reliable way to verify transformation correctness
- 80% coverage is a pragmatic threshold: it catches untested branches without mandating coverage of boilerplate stubs

## Test structure

```
tests/
  test_framework.py    unit tests for connectors and transformations
  test_agent.py        unit tests for parser, translator, generator
  test_end_to_end.py   integration: XML → IR → YAML → engine → output assertions
```

## Key patterns

- **Golden-pair transformation tests:** build a `pd.DataFrame`, call `xform.apply(df)`, assert column values
- **tmp_path SQLite fixtures:** `source_db(tmp_path)` creates and populates a fresh SQLite db per test
- **End-to-end fixture:** `e2e_output(tmp_path, source_db)` runs the entire pipeline and returns the output DataFrame

## Consequences

- **Positive:** Fast, isolated, reproducible tests; coverage gate prevents regressions; no external infrastructure needed
- **Note:** `--cov-fail-under=80` is commented out in `pyproject.toml` during active development (stub files `csv_file.py` and `scd_type_2.py` have 0% coverage). Will be re-enabled once those are implemented.
- **ResourceWarning suppression:** `filterwarnings = ["ignore::ResourceWarning"]` added to pytest config — Python 3.13 generates warnings from internal SQLite metadata cache during test teardown; these are not test failures.
