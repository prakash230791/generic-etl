# ADR-001: Python 3.11+ with pandas execution backend

**Status:** Accepted  
**Date:** 2025-Q4

## Context

The POC needs an execution backend that can run ETL pipelines locally without any infrastructure. The team considered Python/pandas, Java/Spark, and a direct SQL-only approach.

## Decision

Use **Python 3.11+** as the language and **pandas** as the in-process execution backend for the POC.

## Rationale

- Pandas runs entirely in-process — no cluster, no Docker, no infrastructure spin-up during the POC phase
- Python has the richest data ecosystem (pandas, SQLAlchemy, pyarrow, connectors for every database)
- Team already has Python expertise; onboarding cost is zero
- The plugin ABCs (`BaseConnector`, `BaseTransformation`) isolate the execution backend — swapping pandas for Spark later only requires reimplementing the plugins, not the engine or config layer

## Consequences

- **Positive:** Zero-infrastructure local development and CI; fast iteration
- **Negative:** pandas is single-node and memory-bound — not suitable for production scale. Must be replaced with Spark (or DuckDB) before production
- **Mitigation:** The plugin architecture makes this swap surgical. The framework core, YAML schema, and IR are backend-agnostic

## Future

Production target: Apache Spark on AWS EMR. The `BaseTransformation.apply(df)` signature will accept a Spark DataFrame via a type alias — no engine changes required.
