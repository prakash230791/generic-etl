# Architecture Overview

## Problem Statement

Enterprise telecom operates ~700 ETL pipelines across Informatica PowerCenter and Azure Data Factory at a combined annual cost of **$8M/year**. The target is a custom open-source platform hosted on AWS, cloud-agnostic by design, at a target run cost of **$2M/year** — a 75% reduction over 18 months.

---

## Two-Component Design

```
┌─────────────────────────────────────────────────────────────────┐
│  MIGRATION AGENT                                                │
│                                                                 │
│  Informatica XML ──► Parser ──► IR (JSON) ──► YAML Generator   │
│  ADF JSON       ──► Parser ─┘                                   │
└──────────────────────────────┬──────────────────────────────────┘
                               │  job_config.yaml
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  ETL FRAMEWORK (Runtime)                                        │
│                                                                 │
│  Source ──► Transform* ──► Sink                                 │
│    │              │          │                                  │
│  Connector    Transformation  Connector                         │
│  (plugin)      (plugin)      (plugin)                           │
└─────────────────────────────────────────────────────────────────┘
```

The two components are **decoupled**: the framework runs standalone from any YAML config; the agent is only needed for migration.

---

## ETL Framework

### Execution Model

Every job follows the same linear pipeline:

```
Source Connector → [Transformation 1] → [Transformation N] → Sink Connector
```

The framework is **declarative** — jobs are pure YAML data, not code. Adding a new pipeline never requires touching framework code.

### Plugin Architecture

Both connectors and transformations are plugins registered by type string:

```
Connector types:   sqlite | csv_file | (future: postgres, s3, …)
Transform types:   filter | lookup | expression | scd_type_2 | (future: …)
```

Each plugin implements a simple ABC:

```python
# Connector ABC
class BaseConnector(ABC):
    def read(self) -> pd.DataFrame: ...
    def write(self, df: pd.DataFrame) -> None: ...

# Transformation ABC
class BaseTransformation(ABC):
    def apply(self, df: pd.DataFrame) -> pd.DataFrame: ...
```

New plugins require zero changes to the core engine — register the class in the built-in registry dict and ship it.

### Config Schema (YAML)

```yaml
job:
  name: <string>
  version: "1.0"

source:
  type: <connector_type>
  config: { … }

transformations:
  - name: <string>
    type: <transform_type>
    config: { … }

sink:
  type: <connector_type>
  config: { … }
```

Every config is validated against `framework/config/schema.json` (JSON Schema draft-7) before execution.

### Execution Engine

```
loader.py       load_config(path)    → dict
validator.py    validate_config(cfg) → None (raises on error)
engine.py       ExecutionEngine(cfg).run()
  → source.read() → df
  → for each step: xform.apply(df) → df
  → sink.write(df)
```

---

## Migration Agent

### Pipeline

```
Informatica .xml
      │
      ▼
InformaticaXMLParser
  • parse <SOURCE> / <TARGET>
  • follow CONNECTOR edges (topological walk)
  • parse each <TRANSFORMATION>
  • translate expressions (rule-based → LLM fallback)
      │
      ▼
IRMapping  (dataclass, serialised → ir.json)
  • IRSource, IRTarget
  • [IRTransformation]  ← kind: filter | lookup | expression
      • [IRPort]         ← for expression transforms
      │
      ▼
YAMLGenerator
  • build config dict from IR
  • validate against schema.json
  • write job_config.yaml
```

### Expression Translation

Informatica expressions are translated in two passes:

1. **Rule-based** (`agent/translator/expressions.py`) — handles the most common patterns:
   - `CONCAT(a, ' ', b)` → `a + ' ' + b`
   - `=` → `==`, `<>` → `!=`
   - `IIF(cond, a, b)` → `a if cond else b`
   - `TRUNC(x)` → `int(x)`, `TO_INTEGER(x)` → `int(x)`

2. **LLM fallback** (`agent/translator/llm_fallback.py`) — invokes `claude-haiku-4-5-20251001` via Anthropic API when the rule-based pass still sees an Informatica-style function call. Gracefully disabled when `ANTHROPIC_API_KEY` is not set.

### Intermediate Representation (IR)

The IR is the contract between parser and generator. It is source-system-agnostic — the generator knows nothing about Informatica or ADF.

```json
{
  "mapping_name": "m_LOAD_CUSTOMERS",
  "source": { "name": "customers", "table": "customers", "columns": […], "db_path": "source.db" },
  "target": { "name": "dim_customer", "table": "dim_customer", "db_path": "target.db" },
  "transformations": [
    { "name": "FIL_ACTIVE_ONLY", "kind": "filter", "ports": [], "properties": { "condition": "status == 'ACTIVE'" } },
    { "name": "LKP_SEGMENTS",    "kind": "lookup", "ports": [], "properties": { … } },
    { "name": "EXP_DERIVE_FIELDS","kind": "expression", "ports": [{ "name": "full_name", … }], "properties": {} }
  ]
}
```

---

## POC Technology Stack

| Layer | Technology | Rationale |
|---|---|---|
| Language | Python 3.11+ | Broad data ecosystem, team familiarity |
| Execution backend | pandas | Zero-infrastructure local execution for POC |
| Source / Target | SQLite | Zero-dependency local DB, no infra needed |
| Job config | YAML + JSON Schema | Human-readable, validated, declarative |
| Agent LLM | Anthropic claude-haiku | Fast, cheap, accurate for expression translation |
| Tests | pytest | Industry standard, rich fixture support |
| Packaging | pyproject.toml / setuptools | Modern Python packaging |

---

## Future State (Post-POC)

```
Orchestration:  Apache Airflow (DAG per pipeline)
Execution:      Apache Spark (replace pandas for scale)
Connectors:     PostgreSQL, Oracle, S3, Kafka, Snowflake
Infra:          AWS (EKS / EMR), Docker containers
CI/CD:          GitHub Actions → ECR → EKS
```

The plugin architecture means the execution backend swap (pandas → Spark) is isolated to the connector and transformation implementations — the engine, config schema, and YAML format do not change.
