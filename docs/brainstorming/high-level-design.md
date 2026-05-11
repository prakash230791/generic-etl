# Enterprise ETL Modernization — High-Level Design

**Document Type:** High-Level Design (HLD)
**Version:** 1.0
**Date:** 2026-05-11
**Status:** Draft — Architecture Review Board Review
**Audience:** Engineering Leadership, Enterprise Architecture, Product Management

---

## 1. Purpose

This document describes the high-level design of the Generic ETL platform — a two-component system comprising:

1. **Generic ETL Framework** — an enterprise-owned, container-based, YAML-driven ETL runtime
2. **Migration Agent** — an AI-assisted multi-source pipeline conversion tool

It defines component responsibilities, interfaces, data flows, integration contracts, and non-functional requirements at a level sufficient for architecture review and team scoping. Low-level implementation detail is in the companion Low-Level Design document.

---

## 2. Design Goals and Constraints

### 2.1 Design Goals

| Goal | Description |
|---|---|
| Cloud portability | Same platform runs on AWS, GCP, and on-prem Kubernetes without re-architecture |
| Zero vendor lock-in | No proprietary ETL runtime licensing; built on open standards and Python |
| Declarative pipelines | Jobs are YAML data, not code; authoring a pipeline requires no framework knowledge |
| Plugin extensibility | New connectors and transformations require zero changes to the core engine |
| Enterprise governance | Pipeline tiering, PII handling, audit logging, and data classification are first-class features |
| Migration acceleration | Agent converts 85%+ of Informatica and 80%+ of ADF pipelines automatically |
| Observable by default | Every job emits structured logs, metrics, traces, and data lineage without configuration |
| AI-augmented, human-approved | Agent uses AI for translation and analysis; humans approve before production cutover |

### 2.2 Design Constraints

| Constraint | Source |
|---|---|
| AWS as primary cloud (today) | Enterprise cloud strategy |
| Python 3.11+ only | Enterprise approved language; avoids Java/Scala runtime burden |
| Enterprise AI gateway for LLM access | ENT-AI-001: only approved models via approved gateway |
| Approved open source only | Enterprise supply chain policy; Apache 2.0 preferred |
| All secrets via Secrets Manager or Vault | ENT-SEC-001 |
| All deployments via GitOps (no click-ops) | ENT-OPS-001 |
| SOX/GDPR/Telecom regulatory compliance | Legal and compliance requirements |
| Informatica PowerCenter standard support ends March 2026 | Migration urgency driver |

---

## 3. System Overview

The platform consists of two independently deployable, loosely coupled components. The framework has no dependency on the agent — pipelines can be authored directly in YAML and run without any migration activity.

```
Legacy ETL Artifacts          Pipeline Authors
(Informatica XML, ADF JSON)   (YAML-first new pipelines)
         │                            │
         ▼                            │
  ┌──────────────────┐                │
  │  Migration Agent │                │
  │  (build-time)    │ generates ─────┤
  └──────────────────┘                │
                                      ▼
                            ┌──────────────────────┐
                            │   Job Config Store    │
                            │   (YAML files in S3)  │
                            └──────────┬────────────┘
                                       │
                                       ▼
                            ┌──────────────────────┐
                            │  Apache Airflow       │
                            │  (MWAA orchestrator)  │
                            │  triggers via         │
                            │  KubePodOperator      │
                            └──────────┬────────────┘
                                       │
                                       ▼
                            ┌──────────────────────┐
                            │  Generic ETL Framework     │
                            │  (container runtime)  │
                            │  reads YAML, runs job │
                            └──────────┬────────────┘
                                       │
                              ┌────────┴────────┐
                              ▼                 ▼
                        Source Systems    Target Systems
```

---

## 4. Component Descriptions

### 4.1 Generic ETL Framework

**What it is:** A Python-based container image that reads a YAML job configuration and executes a data integration pipeline: extract from source(s), apply transformations, load to target(s).

**What it is not:** An orchestrator, a scheduler, or a migration tool. It is a single-job executor invoked by Airflow.

#### 4.1.1 Sub-Components

| Sub-Component | Responsibility |
|---|---|
| CLI (`etl-runner`) | Entry point; parses arguments; drives the execution lifecycle |
| Config Layer | Loads YAML from any storage backend; validates against JSON Schema; resolves parameters and secrets |
| Execution Engine | Builds a DAG of nodes; selects execution backend; runs nodes in topological order |
| Connector Registry | Plugin registry of all available source/target connectors; loaded via Python entry-points |
| Transformation Registry | Plugin registry of all available transformation types |
| Cross-Cutting Services | Logging, metrics, tracing, lineage, watermark management, circuit breaker, SIEM audit |

#### 4.1.2 Execution Backends

| Backend | When Used | Technology |
|---|---|---|
| `pandas` | Default; datasets up to ~10M rows; single-node | pandas + SQLAlchemy |
| `spark` | Large datasets (>10M rows); explicit override | PySpark + Spark Operator on EKS |
| `dbt` | Pure SQL transformations on a single database | dbt Core via subprocess |
| `auto` | Engine selects based on source row count estimate | Heuristic + connector metadata |

#### 4.1.3 Connector Interface Contract

```
BaseConnector (ABC)
├── read(config: ConnectorConfig) → DataFrame
├── write(df: DataFrame, config: ConnectorConfig) → WriteResult
├── schema(config: ConnectorConfig) → Schema
├── test_connection(config: ConnectorConfig) → bool
└── supported_load_strategies() → List[LoadStrategy]
```

All connectors implement this contract. The engine knows nothing about connector internals.

#### 4.1.4 Transformation Interface Contract

```
BaseTransformation (ABC)
├── apply(df: DataFrame, config: TransformConfig) → DataFrame
├── validate_config(config: TransformConfig) → List[ValidationError]
└── schema_out(schema_in: Schema, config: TransformConfig) → Schema
```

All transformations implement this contract. The engine knows nothing about transformation internals.

#### 4.1.5 Connector Priority Roadmap

| Phase | Connectors Added | Pipeline Coverage |
|---|---|---|
| Phase 1 (MVP) | sqlserver, postgres, oracle, s3, csv_file, sqlite | ~60% of estate |
| Phase 2 (Prod) | azure_sql_mi, azure_blob, adls_gen2, rabbitmq, kafka | ~80% of estate |
| Phase 3 (Scale) | mainframe_sftp, snowflake, http_api, synapse | ~95% of estate |
| Phase 4+ | Additional per demand via plugin pattern | 100% |

#### 4.1.6 Transformation Roadmap

| Phase | Transformations Added |
|---|---|
| Phase 1 | filter, expression, lookup, joiner, aggregator, scd_type_2, update_strategy |
| Phase 2 | router, union, sequence, sorter, deduplicate |
| Phase 3 | mask_pii, validate, flatten_json, pivot, unpivot |
| Phase 4+ | Custom Python transform escape hatch |

---

### 4.2 Migration Agent

**What it is:** A multi-stage AI pipeline that converts Informatica XML and ADF JSON artifacts into Framework YAML configs, Airflow DAGs, dbt models, unit tests, and documentation. Designed as a build-time tool — not a production runtime.

**What it is not:** Autonomous. All conversions require human review. Agent failure never impacts running framework jobs.

#### 4.2.1 Pipeline Stages

| Stage | Type | Primary Responsibility |
|---|---|---|
| Ingestion | Deterministic | Pull artifacts from source systems; build dependency graph |
| Parser | Deterministic | Source-specific XML/JSON → Canonical IR (JSON) |
| Analyzer | AI-assisted | Complexity scoring, pattern classification, routing decision |
| Translator | Hybrid | Expression translation: rule-based first, LLM fallback with RAG |
| Generator | Deterministic | IR → YAML + DAG + dbt + tests + docs |
| Validator | Mostly deterministic | 5-tier validation: syntactic → schema → unit → sample-run → shadow-run |
| Reviewer | AI-assisted | PR generation, business summary, confidence score, reviewer questions |
| Orchestrator | State machine | Job conversion lifecycle management (LangGraph + PostgreSQL) |

#### 4.2.2 Source Plugin Contract

```
SourceParser (ABC)
├── supported_artifact_types() → List[str]
├── parse(raw_artifact_path: str) → IR
├── parse_expression(expr: str, context: dict) → ExpressionAST
└── validate_artifact(raw_artifact_path: str) → List[ParseWarning]
```

Adding a new legacy ETL source (e.g., SSIS, Talend) requires implementing this interface only. All downstream stages (Analyzer, Translator, Generator, Validator, Reviewer) are reused without modification.

#### 4.2.3 Human Review Gates

Five gates are defined and cannot be bypassed:

| Gate | Trigger | Approver | What They Verify |
|---|---|---|---|
| Gate 1 | Post-Analyzer (first 10% of batch) | Engineering Lead | Pattern library calibration; complexity scoring accuracy |
| Gate 2 | Post-Generator (per job) | Data Engineer | Technical correctness of YAML; expression translations |
| Gate 3 | Post-Validator (sample-run) | Business SME | Business logic correctness; intent preserved |
| Gate 4 | Shadow-run complete | Data Quality Lead | Reconciliation report; row counts; column checksums |
| Gate 5 | Pre-cutover | Platform Architect | Production readiness; SLA tier confirmation |

#### 4.2.4 Confidence Scoring and Routing

Each conversion produces a confidence score (0.0 to 1.0) computed from:
- Expression translation confidence (weighted 40%)
- Pattern recognition confidence (weighted 30%)
- Validator tier pass rates (weighted 30%)

Routing decisions by confidence:

| Score | Routing |
|---|---|
| ≥ 0.90 | Auto-convert with standard Gate 2 review |
| 0.70–0.89 | Auto-convert with enhanced engineering review + SME flag |
| 0.50–0.69 | Partial conversion; remaining gaps marked for manual completion |
| < 0.50 | Route to manual conversion queue; agent produces analysis notes only |

---

### 4.3 Airflow Orchestration Layer

**Technology:** Apache Airflow (Amazon MWAA on AWS; Cloud Composer on GCP; self-managed Helm on on-prem).

**Role:** Schedule and trigger Generic ETL Framework jobs; manage inter-job dependencies; handle retries, SLA alerting, and failure notification.

**Key Pattern:**

Every framework job is a single `KubernetesPodOperator` task. The operator:
1. Pulls the container image from ECR (image version pinned)
2. Passes the YAML config S3 path as an environment variable
3. Mounts an IRSA service account for cloud resource access
4. Runs the job to completion; captures exit code
5. Ships pod logs to S3 and CloudWatch

**DAG Structure:**

```python
# Every framework job follows this template
with DAG("load_dim_customer", schedule="0 2 * * *", ...) as dag:
    run_job = EtlOperator(  # Custom operator wrapping KubernetesPodOperator
        task_id="run_load_dim_customer",
        config_path="s3://etl-configs/jobs/load_dim_customer.yaml",
        tier="P1",
        resource_profile="medium",
    )
    # Upstream dependencies
    customer_extract_done >> run_job >> dim_customer_loaded
```

---

### 4.4 Observability Stack

Every framework job emits four signal types without additional configuration:

| Signal | Technology | Destination | Retention |
|---|---|---|---|
| Structured logs | Python logging + JSON formatter | CloudWatch Logs → S3 | 90 days hot / 7 years cold |
| Metrics | Prometheus client | Amazon Managed Prometheus → Grafana | 15 months |
| Traces | OpenTelemetry | AWS X-Ray or Tempo | 30 days |
| Data lineage | OpenLineage | Marquez → Collibra/Atlan | Indefinite (governance artifact) |

**Standard Metric Set (emitted by every job):**

```
etl_job_rows_read_total{job, source_id, tier}
etl_job_rows_written_total{job, target_id, tier}
etl_job_duration_seconds{job, tier, backend}
etl_job_errors_total{job, stage, error_type, tier}
etl_job_retries_total{job, tier}
etl_connector_query_duration_seconds{job, connector_type, operation}
etl_transformation_duration_seconds{job, transformation_id, type}
```

**SLA Dashboard per Tier:**

| Tier | Alert Condition | PagerDuty Severity |
|---|---|---|
| P0 | Job failure OR missed schedule | P1 (immediate) |
| P0 | Job duration > 2× historical p95 | P2 (high) |
| P1 | Job failure | P2 (high) |
| P1 | Job duration > 3× historical p95 | P3 (medium) |
| P2 | Job failure for 3 consecutive runs | P3 (medium) |
| P3 | No alerting; monitored via dashboard only | — |

---

## 5. Integration Architecture

### 5.1 Job Configuration Store

YAML job configs are stored in S3 (`s3://etl-configs/jobs/`) with:
- Version control: configs committed to Git; S3 sync on merge to main
- Access: job pods read-only via IRSA; no write access from pods
- Validation: configs validated in CI before S3 sync; invalid configs never reach prod S3

### 5.2 Secrets Integration

Connection credentials are never stored in YAML configs. Instead:

```yaml
# In job config:
sources:
  - id: src_customers
    connector: sqlserver
    connection: src_sqlserver_prod    # ← reference only, not credentials
```

At runtime, the Secrets Resolver maps `src_sqlserver_prod` to:
- AWS: `arn:aws:secretsmanager:us-east-1:ACCOUNT:secret:etl/connections/src_sqlserver_prod`
- GCP: `projects/PROJECT/secrets/etl-connections-src-sqlserver-prod`
- On-prem: Vault path `secret/etl/connections/src_sqlserver_prod`

The resolver implementation is pluggable — switching backends requires changing one config line.

### 5.3 Watermark Management

Incremental pipelines track their last-processed timestamp/ID in a watermark registry (PostgreSQL table `etl_watermarks`):

```
Schema: (key VARCHAR PK, last_value JSONB, updated_at TIMESTAMP, updated_by VARCHAR)
Key:    {job_name}.{watermark_name}  (e.g., "load_dim_customer.last_run_dt")
```

- **Read**: Framework reads watermark at job start, passes as parameter to source query
- **Write**: Framework updates watermark at job completion (only on success; atomic with validation pass)
- **Bootstrap**: First run uses `default` value from YAML config

### 5.4 Agent ↔ Framework Interface

The agent produces standard YAML configs that the framework consumes. The interface is the YAML schema — versioned with JSON Schema at `framework/config/schema.json`. This one-directional, file-based interface is intentionally simple:

```
Agent produces:  migrations/wave1/<job>/jobs/<job>.yaml
Framework reads: s3://etl-configs/jobs/<job>.yaml  (after review + merge)
```

No runtime API between agent and framework. No framework code awareness in agent.

---

## 6. Non-Functional Requirements

### 6.1 Performance

| Requirement | Target |
|---|---|
| Throughput (pandas backend) | ≥ 500K rows/minute for simple copy jobs |
| Throughput (Spark backend) | ≥ 10M rows/minute per executor (scale horizontally) |
| Job startup latency (pod ready) | < 90 seconds (cold) / < 30 seconds (warm node pool) |
| Config validation latency | < 2 seconds for any config |
| Watermark read/write | < 100ms |
| Migration agent: single job parse + analyze | < 60 seconds |
| Migration agent: full conversion (parse → PR) | < 10 minutes |
| Migration agent batch throughput | ≥ 50 jobs/hour |

### 6.2 Reliability

| Requirement | Target |
|---|---|
| P0 pipeline availability | 99.9% monthly |
| P1 pipeline availability | 99.5% monthly |
| P2 pipeline availability | 99.0% monthly |
| P3 pipeline availability | Best-effort |
| Exactly-once semantics | Required for P0; guaranteed via watermark + advisory lock |
| At-least-once semantics | Standard for P1/P2; idempotent targets where possible |
| Connector retry policy | 3 retries with exponential backoff (2s, 4s, 8s) |
| Circuit breaker | Opens after 5 consecutive failures; half-open after 30s |

### 6.3 Scalability

| Requirement | Target |
|---|---|
| Concurrent pipeline runs | ≥ 100 simultaneous jobs (EKS auto-scaling) |
| Total managed pipelines | ≥ 1,000 (at steady state post-migration) |
| Config store | Flat S3 directory; unlimited scale |
| Connector plugin count | No architectural limit; entry-points based |
| Migration agent batch size | Up to 500 jobs per wave without redesign |

### 6.4 Security

| Requirement | Control |
|---|---|
| No credentials in configs or DAGs | Secrets Resolver pattern; enforced via CI lint |
| Container image integrity | cosign signing + OPA admission webhook |
| Pod isolation | NetworkPolicy default-deny; namespace isolation |
| Workload identity | IRSA (AWS) / Workload Identity (GCP); no long-lived keys in pods |
| PII pipeline handling | mask_pii transformation; data_classification: confidential in YAML |
| Audit logging | All job starts/completions logged to SIEM; immutable |
| LLM data handling | Agent never sends source data to LLM; IR contains metadata only |
| Static analysis | bandit + semgrep on all framework and agent code in CI |

### 6.5 Maintainability

| Requirement | Target |
|---|---|
| Test coverage — framework | ≥ 80% line coverage (enforced in CI) |
| Test coverage — agent deterministic components | ≥ 80% |
| Time to add a new connector | < 1 day for experienced engineer |
| Time to add a new transformation | < 1 day for experienced engineer |
| Documentation | Every public class and method has a docstring |
| YAML schema backward compatibility | Minor versions backward-compatible; breaking changes require new major version |
| Deprecation policy | ≥ 2 minor versions notice before removal of any public API |

### 6.6 Compliance

| Regulation | Requirement | Implementation |
|---|---|---|
| SOX | Audit trail for data flowing through financial pipelines | OpenLineage + SIEM; 7-year retention |
| GDPR | No PII in agent LLM prompts; PII pipelines logged | Metadata-only IR; data classification in YAML |
| EU AI Act (Limited Risk) | Transparency + human oversight for AI decisions | Confidence scores; mandatory HITL gates |
| Telecom regulatory | Certain pipelines require on-prem execution | Hybrid deployment pattern; per-pipeline execution target |

---

## 7. Technology Stack

### 7.1 Build Stack (Enterprise-Owned)

| Component | Technology | License | Notes |
|---|---|---|---|
| ETL runtime | Generic ETL Framework (Python 3.11+) | Enterprise-owned IP | This codebase |
| Migration agent | Python 3.11+ | Enterprise-owned IP | This codebase |
| Agent AI orchestration | LangGraph | MIT | State machine for agent pipeline |
| Agent LLM | Claude (via enterprise gateway) | Commercial (per-token) | Expression translation + analysis |
| Agent vector store | pgvector (PostgreSQL extension) | PostgreSQL License | RAG few-shot examples |
| Config format | YAML + JSON Schema | Apache 2.0 | Human-readable, validatable |

### 7.2 Leverage Stack (Adopted Open Source)

| Component | Technology | License | Notes |
|---|---|---|---|
| Orchestration | Apache Airflow (MWAA) | Apache 2.0 | Industry standard |
| Pandas execution | pandas | BSD | POC + small datasets |
| Spark execution | Apache Spark (PySpark) | Apache 2.0 | Large datasets (>10M rows) |
| SQL transforms | dbt Core | Apache 2.0 | In-database transforms |
| Container platform | Kubernetes (EKS) | Apache 2.0 | CNCF; cloud-agnostic |
| Container image | Helm + Docker | Apache 2.0 | Standard tooling |
| Lineage | OpenLineage + Marquez | Apache 2.0 | Apache-governed |
| Metrics | Prometheus + Grafana | Apache 2.0 / AGPL | CNCF standard |
| Tracing | OpenTelemetry | Apache 2.0 | CNCF standard |
| CDC | Debezium + Kafka | Apache 2.0 | Future: event-driven pipelines |
| Mainframe parsing | Cobrix (Spark library) | Apache 2.0 | COBOL/EBCDIC; ABSA origin |
| Secrets | AWS Secrets Manager | AWS commercial | Primary secrets backend |
| IaC | Terraform | MPL 2.0 | All infrastructure as code |
| CI/CD | GitHub Actions | Enterprise plan | Approved tooling |

**Supply chain note:** All open source components use Apache 2.0 or equivalent permissive license. All are Western-origin or Apache Foundation governed.

---

## 8. Quality Attributes Trade-off Analysis

### 8.1 Portability vs. Managed Service Convenience

**Decision:** Prefer container-based, cloud-portable patterns over AWS-native services where practical.

**Trade-off:** AWS-native tools (AWS Glue, Step Functions) would be simpler to deploy but create cloud lock-in. The portability requirement is a hard constraint, so managed services are used only for the thin infrastructure layer (MWAA, EKS, ECR) where cloud-portable Kubernetes equivalents exist.

### 8.2 Custom Build vs. Open Source Adoption

**Decision:** Build the core ETL runtime; adopt Apache Airflow for orchestration; adopt dbt for in-database transforms.

**Trade-off:** Custom build creates maintenance burden but ensures enterprise governance requirements are met (SeaTunnel was evaluated and rejected due to supply chain concerns and governance gaps). Airflow and dbt adoption avoids rebuilding well-solved problems.

### 8.3 AI Autonomy vs. Human Control

**Decision:** AI is used for analysis and translation only; humans approve all production deployments.

**Trade-off:** Full AI autonomy would maximize migration velocity but creates regulatory risk (EU AI Act) and data quality risk. The deterministic-first, AI-for-exceptions pattern provides 85%+ automation rate while keeping humans in control of production impact.

### 8.4 Monorepo vs. Polyrepo

**Decision:** Monorepo for framework + agent + connectors; separate repos for job configs and DAGs.

**Trade-off:** Monorepo simplifies cross-component refactoring and reduces integration friction. Job configs and DAGs are separated because they are authored by pipeline teams (not the platform team) and have different change management workflows.

---

## 9. Architecture Decision Record Summary

| ADR | Decision | Status |
|---|---|---|
| ADR-001 | Python 3.11+, pandas for POC execution | Accepted |
| ADR-002 | SQLite for POC source/target | Accepted |
| ADR-003 | YAML for job configs, JSON Schema for validation | Accepted |
| ADR-004 | Plugin pattern — BaseConnector and BaseTransformation ABCs | Accepted |
| ADR-005 | IR as JSON between parser and generator | Accepted |
| ADR-006 | pytest, ≥80% coverage | Accepted |
| ADR-007 | Entry-point based plugin registry | Accepted |
| ADR-008 (pending) | Managed vs self-managed Airflow | To be decided in Phase 0 |
| ADR-009 (pending) | Spark deployment: Spark Operator vs EMR Serverless | To be decided in Phase 1 |
| ADR-010 (pending) | dbt project structure (single vs domain-aligned) | To be decided in Phase 3 |

---

## 10. Open Issues

| Issue | Owner | Target Resolution |
|---|---|---|
| Exactly-once guarantees for connectors without native ACID (Kafka, S3) | Platform Architect | Phase 1, Sprint 6 |
| Expression AST representation for nested Informatica DSL functions | Agent Lead | Phase 3, Sprint 2 |
| Mainframe EBCDIC decimal encoding variants across legacy sources | Data Engineer | Phase 3, Sprint 6 |
| dbt vs framework boundary guidelines (when to use each) | Platform Architect | Phase 3, Sprint 1 |
| Spark executor sizing guidelines per transformation type | Data Engineer | Phase 2, Sprint 3 |
| Enterprise catalog integration (Collibra vs Atlan vs Marquez) | Data Governance | Phase 0 |

---

*Companion documents: Enterprise Architecture Diagrams, Low-Level Design, Migration Strategy, Cost Analysis.*
