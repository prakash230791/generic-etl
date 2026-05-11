# ADR-002: SQLite as source and target for POC

**Status:** Accepted  
**Date:** 2025-Q4

## Context

The POC needs to demonstrate real data movement from a source to a target. Production sources are Oracle, SQL Server, and Azure SQL; targets include Snowflake and Azure Synapse. Spinning up any of these for a POC is slow, expensive, and adds infrastructure dependencies.

## Decision

Use **SQLite** for both source and target databases in the POC.

## Rationale

- SQLite is bundled with Python's standard library — zero installation, zero configuration
- Pandas reads and writes SQLite via `sqlite3` (also stdlib) — no ORM or connection pooling complexity
- The `SQLiteConnector` plugin satisfies the same `BaseConnector` ABC that production connectors will implement — the engine, framework, and tests are identical in structure to what production will use
- Sample data fits comfortably in a single file (`source.db`), making it trivial to reset and reproduce

## Consequences

- **Positive:** Any developer can clone the repo and run `make demo` with no external dependencies
- **Negative:** SQLite does not support concurrent writes, schemas with types, or the SQL dialects used by production databases. POC query results are not representative of production performance
- **Out of scope:** Connection pooling, SSL, authentication, schema migrations — all deferred to the production connector implementations

## Future

Production: `PostgreSQLConnector`, `SnowflakeConnector`, `OracleConnector` — each implementing `BaseConnector.read()` / `write()`. The framework and YAML schema are unchanged; only the connector plugin is swapped.
