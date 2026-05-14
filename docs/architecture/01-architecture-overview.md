# Generic ETL Engine — Enterprise Architecture Overview

**Document:** 01 of 8
**Audience:** Enterprise Architects, Engineering Directors, CTO
**Version:** 1.0 | **Date:** 2026-05-14
**Status:** Approved for Phase 0–1 execution

---

## 1. Executive Summary

The Generic ETL Engine is an open-source, cloud-agnostic, declarative ETL platform designed to
replace enterprise-licensed tools (Informatica PowerCenter, Azure Data Factory) at a **75% lower
total cost** while delivering superior observability, extensibility, and migration automation.

| Dimension | Current State | Target State |
|---|---|---|
| Annual cost | $8M (Informatica $5.5M + ADF $2.5M) | $2M (infra + team) |
| Pipeline count | ~700 (Informatica + ADF) | 700+ on new platform |
| Time to onboard a new connector | 4–6 weeks (vendor dependency) | 1–2 days (plugin SDK) |
| Migration automation | 0% (fully manual) | 70–80% (agent-assisted) |
| Observability | Vendor portals (siloed) | Unified Prometheus/Grafana stack |
| Deployment | Vendor SaaS + Azure cloud | Kubernetes on AWS (cloud-agnostic) |

---

## 2. Architectural Principles

These seven principles are non-negotiable and drive every design decision:

| # | Principle | Implication |
|---|---|---|
| P1 | **Declarative over imperative** | Jobs are YAML data, not code. Operators never write Python. |
| P2 | **Plugin-based, zero core changes** | New connectors and transforms ship as pip packages. Core engine is frozen. |
| P3 | **Source-agnostic runtime** | The engine knows nothing about Informatica, ADF, or SSIS. Only the agent does. |
| P4 | **No credentials in configs** | Secrets resolved at runtime via Secrets Resolver; YAML files are safe to commit. |
| P5 | **Observability as a first-class citizen** | Every execution emits structured metrics, logs, and data lineage. |
| P6 | **Backward-compatible evolution** | Schema v1 configs run unchanged on v2 engine. Breaking changes require major version bump + migration guide. |
| P7 | **Agent is optional** | Framework runs standalone from hand-authored YAML. Agent accelerates migration but is not a runtime dependency. |

---

## 3. System Context (C4 Level 1)

```
┌─────────────────────────────────────────────────────────────────┐
│                     Enterprise Telecom                          │
│                                                                 │
│  ┌─────────────┐    YAML    ┌──────────────────────────────┐   │
│  │  ETL Team   │──configs──▶│                              │   │
│  │  (authors)  │            │   Generic ETL Engine         │   │
│  └─────────────┘            │                              │   │
│                             │  ┌──────────┐  ┌──────────┐  │   │
│  ┌─────────────┐   migrate  │  │ Execution│  │Migration │  │   │
│  │  Migration  │──────────▶│  │ Runtime  │  │  Agent   │  │   │
│  │  Team       │            │  └──────────┘  └──────────┘  │   │
│  └─────────────┘            │                              │   │
│                             └──────────────────────────────┘   │
│                                    │           │                │
│  ┌──────────┐  ┌──────────┐   ┌───▼──┐   ┌───▼──┐            │
│  │SQL Server│  │Oracle DB │   │AWS S3│   │Azure │            │
│  │PostgreSQL│  │Snowflake │   │ADLS  │   │Blob  │            │
│  └──────────┘  └──────────┘   └──────┘   └──────┘            │
└─────────────────────────────────────────────────────────────────┘
```

**External actors:**
- **ETL Team** — authors YAML job configs; runs `etl-run` or deploys to Airflow
- **Migration Team** — runs `etl-agent batch` to convert legacy Informatica/ADF/SSIS artifacts
- **Monitoring System** — scrapes Prometheus metrics, reads structured logs
- **Data Sources/Sinks** — any supported connector target (see `canonical-taxonomy.md`)

---

## 4. Container Diagram (C4 Level 2)

```
┌─────────────────────────────────────────────────────────────────┐
│                    Generic ETL Engine Platform                   │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                   Execution Runtime                        │  │
│  │                                                            │  │
│  │   ┌─────────────┐   ┌──────────────┐   ┌──────────────┐  │  │
│  │   │Config Loader│──▶│  Validator   │──▶│   Engine     │  │  │
│  │   │ (YAML→dict) │   │(JSON Schema) │   │(Orchestrator)│  │  │
│  │   └─────────────┘   └──────────────┘   └──────┬───────┘  │  │
│  │                                                │           │  │
│  │   ┌────────────┐  ┌──────────────┐  ┌────────▼────────┐  │  │
│  │   │  Connector │  │Transformation│  │ Parameter       │  │  │
│  │   │  Registry  │  │  Registry    │  │ Resolver        │  │  │
│  │   │(entry pts) │  │(entry pts)   │  │({{ params }})   │  │  │
│  │   └────────────┘  └──────────────┘  └─────────────────┘  │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                   Migration Agent                          │  │
│  │                                                            │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │  │
│  │  │Informatica│  │  ADF    │  │  SSIS   │  │Dispatcher│ │  │
│  │  │  Parser  │  │ Parser  │  │  Parser │  │(auto-route│ │  │
│  │  └────┬─────┘  └────┬────┘  └────┬────┘  └──────────┘ │  │
│  │       └─────────────┴────────────┘                      │  │
│  │                      ▼                                   │  │
│  │              ┌───────────────┐                          │  │
│  │              │ IR (v2.0 JSON)│                          │  │
│  │              └───────┬───────┘                          │  │
│  │    ┌──────────────────┼──────────────────┐              │  │
│  │    ▼                  ▼                  ▼               │  │
│  │ ┌──────┐       ┌──────────┐        ┌─────────┐          │  │
│  │ │ YAML │       │Complexity│        │Validator│          │  │
│  │ │ Gen  │       │Assessor  │        │(Tier1-4)│          │  │
│  │ └──────┘       └──────────┘        └─────────┘          │  │
│  └────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. Current State Assessment

### 5.1 What Works (POC Complete)

| Component | Maturity | Notes |
|---|---|---|
| Plugin ABCs (`BaseConnector`, `BaseTransformation`) | ✅ Production | Stable contracts — do not modify |
| SQLite connector | ✅ Production | Full read/write |
| `row_filter` transform | ✅ Production | pandas `.query()` |
| `lookup_enrich` transform | ✅ Production | left-join enrichment |
| `column_derive` transform | ✅ Production | sandboxed `eval()` |
| JSON Schema v1 validation | ✅ Production | Needs v2 extension |
| Informatica XML parser | ✅ Production | 4 transform types |
| YAML generator (v1) | ✅ Production | SQLite-only output |
| Expression rule engine | ✅ Production | 20+ Informatica rules |
| ADF ZIP parser | ✅ Production (local) | ForEach, MSI, credentials |
| YAML generator v2 | ✅ Production (local) | Parameterized jobs |
| CLI batch processor | ✅ Production (local) | ADF → YAML batch |

### 5.2 Critical Gaps to Production

| Gap | Severity | Blocks | Phase to Fix |
|---|---|---|---|
| No real database connectors (only SQLite) | P0 | Any real workload | Phase 1 |
| No secrets management | P0 | Security compliance | Phase 1 |
| No Kubernetes deployment | P0 | Scale-out | Phase 2 |
| No Airflow integration | P0 | Scheduling / orchestration | Phase 1 |
| No distributed execution (Spark) | P1 | >10GB datasets | Phase 2 |
| No data quality framework | P1 | Production confidence | Phase 2 |
| No RBAC / audit logging | P1 | Regulatory compliance | Phase 1 |
| SCD Type 2 is stub | P1 | Dimension loads | Phase 1 |
| No monitoring dashboards | P1 | Operations | Phase 1 |
| SSIS parser missing | P2 | Full migration | Phase 2 |
| No LangGraph multi-agent | P2 | High-volume migration | Phase 2 |

---

## 6. Target Architecture (18-Month Vision)

### 6.1 Execution Tiers

The engine supports three execution tiers, selected via config:

```yaml
job:
  name: load_dim_customer
  execution_tier: pandas          # pandas | ray | spark (default: pandas)
```

| Tier | Engine | Dataset Size | Parallelism | Use Case |
|---|---|---|---|---|
| `pandas` | pandas DataFrame | < 5GB | Single node | Dev, small loads |
| `ray` | Ray on Kubernetes | 5–500GB | Multi-core, multi-node | Standard enterprise |
| `spark` | Apache Spark (EMR/Dataproc) | > 500GB | Cluster | Data warehouse loads |

All tiers share the same connector and transformation plugin contracts. Plugins are written once.

### 6.2 Deployment Architecture

```
                     ┌─────────────────────────┐
                     │  Control Plane (K8s NS)  │
                     │                         │
                     │  ┌──────────────────┐   │
                     │  │  API Gateway     │   │
                     │  │  (Job Submit,    │   │
                     │  │   Status, Cancel)│   │
                     │  └──────┬───────────┘   │
                     │         │               │
                     │  ┌──────▼───────────┐   │
                     │  │  Job Scheduler   │   │
                     │  │  (Airflow 2.x)   │   │
                     │  └──────┬───────────┘   │
                     └─────────┼───────────────┘
                               │
          ┌────────────────────┼────────────────────┐
          ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  Worker Pod A   │  │  Worker Pod B   │  │  Worker Pod C   │
│  (pandas tier)  │  │  (pandas tier)  │  │  (ray tier)     │
│  etl-run job1   │  │  etl-run job2   │  │  etl-run job3   │
└────────┬────────┘  └────────┬────────┘  └────────┬────────┘
         │                    │                    │
         ▼                    ▼                    ▼
   ┌───────────────────────────────────────────────────┐
   │              Data Plane (Secrets Resolver)        │
   │     SQL Server | Oracle | PostgreSQL | S3 | ...   │
   └───────────────────────────────────────────────────┘
```

### 6.3 Key Architectural Decisions (ADRs)

**ADR-001: pandas execution (POC)**
Rationale: Zero dependencies, testable, sufficient for POC. Replaced by Spark for large datasets.

**ADR-002: SQLite source/target (POC)**
Rationale: No infrastructure required for local testing. Replaced by enterprise connectors in Phase 1.

**ADR-003: YAML for job configs, JSON Schema for validation**
Rationale: Human-readable, versionable, diff-able. Schema enforces contract.
*Decision stands for all phases.*

**ADR-004: Plugin pattern via Python entry-points**
Rationale: Zero core changes for new connectors/transforms. Third-party packages possible.
*Decision stands — critical for extensibility.*

**ADR-005: IR (Intermediate Representation) between parser and generator**
Rationale: Decouples source format (Informatica/ADF/SSIS) from output format (YAML/Airflow/Terraform).
*Extension: IR v2.0 adds parameters, control_table, watermark, pre/post steps.*

**ADR-006: pytest with 80% coverage minimum**
Rationale: Fast feedback, CI/CD integration. Minimum floor, not ceiling.
*Extension: Add integration tests against real databases in CI.*

**ADR-007: Entry-point based plugin registry**
*Decision stands — enables pip-installable plugins.*

**ADR-008: Secrets never in YAML configs (new)**
Rationale: Configs are version-controlled; credentials must not appear in git history.
Implementation: Secrets Resolver layer reads `kv://`, `ls://`, `msi://` references at runtime.

**ADR-009: Kubernetes-first deployment (new)**
Rationale: Cloud-agnostic, autoscaling, resource isolation per job.
Implementation: Helm chart for platform; each job run = ephemeral pod.

**ADR-010: Airflow 2.x as primary scheduler (new)**
Rationale: Industry standard, large ecosystem, Python-native, data team familiarity.
Implementation: `dag_generator.py` produces Airflow DAGs from IR; DAGs committed to git.

---

## 7. Component Inventory (Target State)

### Framework Components

```
framework/
├── config/
│   ├── schema.json           v2.0 — parameters, sources[], targets[], pre_steps
│   ├── loader.py             YAML → dict, env var substitution
│   ├── validator.py          JSON Schema validation, semantic checks
│   └── resolver.py     NEW   ParameterResolver — {{ parameters.X }} substitution
│
├── connectors/
│   ├── base.py               BaseConnector ABC + execute(), execute_procedure()
│   ├── sqlite.py             ✅ complete
│   ├── csv.py                rename from csv_file.py + implement
│   ├── postgres.py     NEW   psycopg2 + SQLAlchemy
│   ├── sqlserver.py    NEW   pyodbc fast_executemany, BCP bulk load
│   ├── oracle.py       NEW   oracledb thin mode
│   ├── azure_sql.py    NEW   MSI auth + SQL auth
│   ├── s3.py           NEW   boto3, parquet/csv
│   ├── adls.py         NEW   azure-storage-blob
│   ├── snowflake.py    NEW   snowflake-connector-python
│   ├── excel.py        NEW   openpyxl
│   ├── fixed_width.py  NEW   pd.read_fwf, EBCDIC support
│   ├── kafka.py        NEW   confluent-kafka-python
│   ├── sftp.py         NEW   paramiko
│   └── http_api.py     NEW   httpx, pagination, auth headers
│
├── transformations/
│   ├── base.py               BaseTransformation ABC
│   ├── row_filter.py         renamed from filter.py
│   ├── column_derive.py      renamed from expression.py
│   ├── lookup_enrich.py      renamed from lookup.py
│   ├── scd_type_2.py         IMPLEMENT
│   ├── stream_join.py  NEW
│   ├── aggregate.py    NEW
│   ├── column_select.py NEW
│   ├── union_all.py    NEW
│   ├── row_sort.py     NEW
│   ├── route_split.py  NEW
│   ├── scd_type_1.py   NEW
│   ├── row_deduplicate.py NEW
│   ├── data_convert.py NEW
│   ├── sequence_generate.py NEW
│   ├── rank.py         NEW
│   ├── window_fn.py    NEW
│   ├── pivot.py        NEW
│   ├── unpivot.py      NEW
│   ├── mask_pii.py     NEW   PII masking, hashing, tokenization
│   ├── data_validate.py NEW  row-level assertions, null checks
│   ├── python_fn.py    NEW   sandboxed custom Python logic
│   └── flatten_json.py NEW
│
└── execution/
    ├── engine.py             v2.0 — parameters, pre/post steps, watermark, control table
    ├── resolver.py     NEW   ParameterResolver
    ├── steps.py        NEW   StepExecutor (pre/post SQL, stored procs, Python)
    ├── watermark.py    NEW   WatermarkManager
    ├── control_table.py NEW  ControlTableExecutor
    ├── backends/       NEW
    │   ├── base.py           ExecutionBackend ABC
    │   ├── pandas_backend.py current engine
    │   ├── ray_backend.py    Ray distributed
    │   └── spark_backend.py  PySpark
    └── metrics.py      NEW   Prometheus counters, histograms
```

### Agent Components

```
agent/
├── state.py            NEW   AgentState TypedDict
├── graph.py            NEW   LangGraph workflow definition
├── cli.py              extend add 'batch' command
│
├── agents/
│   ├── parser/
│   │   ├── informatica.py    NEW (production version of parser/informatica_xml.py)
│   │   ├── adf_support.py    ✅ done locally
│   │   ├── ssis.py           NEW .dtsx XML parser
│   │   └── dispatcher.py     NEW auto-detect source type
│   ├── analysis/
│   │   ├── complexity.py     NEW heuristic scorer + Haiku SQL classifier
│   │   └── classifier.py     NEW pgvector pattern matching
│   ├── translation/
│   │   ├── rules_agent.py    NEW expanded rule engine (60+ rules)
│   │   ├── rules/
│   │   │   ├── informatica.yaml   60+ rules
│   │   │   ├── adf.yaml           40+ rules
│   │   │   └── ssis.yaml          30+ rules
│   │   └── llm_translator.py NEW tiered Haiku→Sonnet fallback + RAG
│   ├── generation/
│   │   ├── yaml_generator.py ✅ done locally (v2.0 with bug fixes)
│   │   ├── dag_generator.py  NEW Airflow DAG Python AST builder
│   │   ├── test_generator.py NEW pytest fixture generator
│   │   └── summary_generator.py NEW Haiku plain-language summary
│   ├── validation/
│   │   ├── syntax_validator.py NEW Tier 1+2 (YAML + schema)
│   │   ├── unit_test_runner.py NEW Tier 3 (pytest subprocess)
│   │   └── reconciliation.py   NEW Tier 4+5 (row-count + shadow run)
│   └── review/
│       └── pr_generator.py   NEW GitHub PR + Sonnet body
│
└── memory/
    ├── vector_store.py   NEW pgvector client (embed + ANN search)
    └── audit_log.py      NEW PostgreSQL audit trail
```

---

## 8. Technology Stack Decision Matrix

| Layer | POC Choice | Production Choice | Rationale |
|---|---|---|---|
| Execution engine | pandas | pandas + Ray + Spark | Tier-based; pandas for small, Spark for large |
| Orchestration | None (CLI) | Airflow 2.x + K8s | Industry standard; scales to 10K+ DAGs |
| Deployment | Local Python | Kubernetes (EKS/AKS) | Cloud-agnostic; autoscaling; resource isolation |
| Secrets | Hardcoded | HashiCorp Vault / AWS Secrets Manager | Zero-trust; rotating credentials |
| Observability | Python logging | Prometheus + Grafana + OpenTelemetry | Standard enterprise stack |
| Data lineage | None | Apache Atlas / OpenLineage | Regulatory compliance; impact analysis |
| Catalog | None | Apache Hive Metastore / AWS Glue | Schema governance; discovery |
| CI/CD | None | GitHub Actions + ArgoCD | GitOps; automated deploy on merge |
| Agent LLM | Claude Haiku | Claude Sonnet + Haiku (tiered) | Cost-optimized; Haiku for classification |
| Agent memory | None | pgvector (PostgreSQL) | Few-shot RAG; pattern library |
| Config store | Git (YAML files) | Git + Config Service (read API) | Version control + runtime API |

---

## 9. Integration Points with Enterprise Systems

| System | Integration Method | Phase |
|---|---|---|
| Informatica PowerCenter | XML export → agent parser | Phase 1 |
| Azure Data Factory | ZIP export → agent parser | Phase 1 ✅ |
| SSIS (.dtsx) | XML parser → agent | Phase 2 |
| Airflow (scheduling) | DAG generator → git commit | Phase 1 |
| GitHub (code review) | PR generator via API | Phase 2 |
| HashiCorp Vault | Secrets Resolver at runtime | Phase 1 |
| Active Directory / Azure AD | OAuth2/OIDC for RBAC | Phase 1 |
| Prometheus / Grafana | Metrics exporter on engine | Phase 1 |
| AWS CloudWatch / Azure Monitor | Log sink on structured logger | Phase 1 |
| Slack / Teams | Alerting on job failure / human gate | Phase 2 |
| PagerDuty | On-call escalation for P0 pipelines | Phase 2 |
| Apache Atlas / OpenLineage | Lineage events from engine | Phase 2 |
| Snowflake / Redshift | Connector plugins | Phase 1–2 |

---

## 10. Reference Documents

| Doc | Content |
|---|---|
| `02-scalability.md` | Execution tiers, Spark backend, K8s sizing |
| `03-security.md` | Auth, secrets, RBAC, audit, encryption, PII |
| `04-extensibility.md` | Plugin SDK, connector/transform taxonomy |
| `05-cost-model.md` | TCO breakdown, ROI, infrastructure sizing |
| `06-observability.md` | Metrics, logging, lineage, alerting |
| `07-roadmap-18m.md` | Phased 18-month delivery plan |
| `08-migration-playbook.md` | 700-pipeline migration strategy |
| `brainstorming/control-table-and-framework-v2.md` | Framework v2.0 design |
| `brainstorming/adf-parser-yaml-fixes.md` | ADF-FIX/YAML-FIX session log |
| `brainstorming/implementation-plan.md` | GHCP session prompts |
| `framework/CLAUDE.md` | Framework implementation contracts |
| `agent/CLAUDE.md` | Agent implementation contracts |
