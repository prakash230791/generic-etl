# ETL POC

Proof-of-concept for enterprise ETL modernisation: Informatica PowerCenter → custom open-source framework.

## Quick Start

```bash
# Install dependencies
make install

# Run the full end-to-end demo
make demo
```

## What the Demo Does

1. **Load sample data** — creates `sample_data/source.db` with `customers` and `segments` tables
2. **Convert mapping** — migration agent parses `sample_informatica/m_LOAD_CUSTOMERS.xml` and emits `output/job_config.yaml`
3. **Execute job** — framework runner reads the YAML and writes `dim_customer` rows to `sample_data/target.db`

## Project Layout

```
framework/   ETL runtime — connectors, transformations, execution engine
agent/       Migration agent — Informatica XML parser → YAML generator
tests/       pytest suite (≥80 % coverage required)
```

## Running Tests

```bash
make test
```

## Design Documentation

See [docs/](docs/) for the full design picture:

- [Architecture overview](docs/architecture.md) — component diagram, plugin pattern, IR, execution model
- [Migration strategy](docs/migration-strategy.md) — 18-month plan, phased rollout, risk register
- [Transformation mapping guide](docs/transformation-mapping-guide.md) — Informatica → YAML translation reference
- [ADR log](docs/adr/) — Architecture Decision Records (ADR-001 through ADR-007)
- [Brainstorming notes](docs/brainstorming/) — informal notes and explorations
