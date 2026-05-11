# ETL POC — Project Context

## What This Project Is
A proof-of-concept for an enterprise ETL modernization program.
Two components:
1. A generic ETL framework — container-based, YAML-driven runtime
2. A migration agent — converts Informatica XML to framework YAML

## Business Context
- Enterprise telecom with ~700 ETL pipelines across Informatica
  PowerCenter and Azure Data Factory
- Current annual ETL cost: $8M/year (Informatica + ADF)
- Target: Custom open source platform on AWS, cloud-agnostic by design
- Target annual run cost: $2M/year (75% reduction)
- Migration timeline: 18 months

## POC Scope (Minimal, End-to-End)
Prove the complete flow:
  Informatica XML → Migration Agent → YAML config → Framework Runner
  → Data moved from source to target

### POC Boundaries
- Use SQLite as source and target (no real databases needed)
- Pandas execution backend only (no Spark yet)
- Cover 4 transformation types: filter, lookup, expression, scd_type_2
- Cover 2 connector types: sqlite, csv_file
- Migration agent: rule-based parser + basic LLM fallback via Anthropic API
- No Airflow yet — invoke framework via CLI only
- No Docker yet — run as plain Python locally

## Repository Structure
etl-poc/
├── CLAUDE.md                    # This file
├── README.md
├── pyproject.toml
├── Makefile
├── framework/
│   ├── runner.py                # CLI entry point
│   ├── config/
│   │   ├── loader.py
│   │   ├── validator.py
│   │   └── schema.json
│   ├── connectors/
│   │   ├── base.py
│   │   ├── sqlite.py
│   │   └── csv_file.py
│   ├── transformations/
│   │   ├── base.py
│   │   ├── filter.py
│   │   ├── lookup.py
│   │   ├── expression.py
│   │   └── scd_type_2.py
│   └── execution/
│       └── engine.py
├── agent/
│   ├── cli.py
│   ├── parser/
│   │   └── informatica_xml.py
│   ├── ir/
│   │   └── schema.py
│   ├── translator/
│   │   ├── expressions.py
│   │   └── llm_fallback.py
│   └── generator/
│       └── yaml_generator.py
├── sample_data/
│   ├── load_sample_data.py
│   └── source.db               # created by load_sample_data.py
├── sample_informatica/
│   └── m_LOAD_CUSTOMERS.xml
├── output/                      # agent writes here
│   ├── ir.json
│   └── job_config.yaml
└── tests/
    ├── test_framework.py
    ├── test_agent.py
    └── test_end_to_end.py

## Architecture Decisions (ADRs)
- ADR-001: Python 3.11+, pandas for execution (no Spark in POC)
- ADR-002: SQLite for source/target (zero-dependency local DB)
- ADR-003: YAML for job configs, JSON Schema for validation
- ADR-004: Plugin pattern — BaseConnector and BaseTransformation ABCs
- ADR-005: IR (Intermediate Representation) as JSON between parser and generator
- ADR-006: pytest for all tests, minimum 80% coverage
- ADR-007: Entry-point based plugin registry

## Key Design Principles
1. Declarative over imperative — jobs are YAML data, not code
2. Plugin-based — new connectors/transforms require zero changes to core
3. Source-agnostic runtime — framework knows nothing about Informatica or ADF
4. Agent is optional — framework runs standalone via CLI
5. SeaTunnel design reference — Source→Transform→Sink model, plugin contracts

## The Sample Informatica Mapping (POC Scenario)
Mapping: m_LOAD_CUSTOMERS
Flow: source → filter(status=ACTIVE) → lookup(segments) → expression(full_name) → target
Source: customers table (SQLite)
Target: dim_customer table (SQLite)
This mapping exercises all 4 transformation types and proves end-to-end conversion.

## Coding Standards
- Type hints on all functions
- Docstrings on all classes and public methods
- pytest for tests with fixtures
- No hardcoded paths — use pathlib.Path
- Structured logging (not print statements) in production code
- pyproject.toml for dependency management (no requirements.txt)

## Definition of Done (POC)
- [ ] make demo runs without errors
- [ ] sample Informatica XML converts to valid YAML
- [ ] framework executes generated YAML against SQLite
- [ ] output rows match expected_output.csv
- [ ] all tests pass
- [ ] README documents how to run the demo