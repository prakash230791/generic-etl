# Enterprise ETL Modernization
## Custom Generic ETL Platform & Automated Migration
### Executive and Technical Proposal

**Document Type:** Executive & Technical Proposal
**Classification:** Confidential — Pre-Decisional
**Version:** 1.0

---

## 1. Executive Summary

### 1.1 The Problem

The enterprise currently operates two large, independent ETL estates built on proprietary tooling:

- **Estate A:** Informatica PowerCenter — batch pipelines, dimension loads, product and promotion data flows, mainframe integration, downstream feeds to Oracle, Azure SQL MI, and mainframe systems
- **Estate B:** Azure Data Factory — cloud-side data movement, Azure-native sources, event-driven pipelines

These estates share the same fundamental problem: **proprietary lock-in, high licensing cost, limited cloud portability, and no path to a modern, code-driven, observable data platform.** As the business moves toward AWS as its preferred cloud, both estates create friction — ADF is Azure-native by design, and Informatica's licensing model does not favor cloud-agnostic deployment.

The combined ETL estate is estimated at **500–800 pipelines** across both systems, representing years of business logic accumulation that cannot be abandoned — only migrated.

### 1.2 The Proposal

This document proposes a two-component solution:

**Component 1 — Custom Generic ETL Framework (VZ-ETL)**
An enterprise-owned, in-house data integration platform: container-based, YAML-driven, cloud-agnostic, running on AWS today with zero re-architecture cost to move to GCP, Azure, or on-prem Kubernetes tomorrow. Built and owned by the enterprise. No vendor licensing. No external dependency on any single community.

**Component 2 — Automated Migration Agent**
An AI-assisted multi-source migration tool that converts Informatica XML and ADF JSON artifacts into VZ-ETL YAML configurations and Airflow DAGs at scale — dramatically compressing what would otherwise be a 3–4 year manual migration into a 12–14 month automated program.

### 1.3 Why Not an Existing Open Source Tool

Several open source ETL frameworks were evaluated (Apache SeaTunnel, Flowman, Metorikku). The evaluation found:

- No existing OSS framework fully covers the enterprise's transformation requirements (complex lookups, SCD2, mainframe integration, multi-target routing)
- Community-backed tools carry supply chain and governance risks that do not align with enterprise security policy
- No existing tool offers the enterprise data governance layer (pipeline tiering, data classification, audit logging, SIEM integration) required for a regulated telecom environment
- **Critical insight:** Apache SeaTunnel's connector architecture and plugin design are the best-in-class open source reference patterns available. The proposal is to **learn from and adapt SeaTunnel's design**, not adopt SeaTunnel itself — producing an enterprise-owned platform that inherits proven design decisions without inheriting the associated risks

### 1.4 Strategic Outcomes

| Outcome | Metric |
|---|---|
| License cost elimination | Informatica + ADF licensing retired |
| Cloud portability | Same platform runs on AWS, GCP, on-prem K8s |
| Migration velocity | 500–800 pipelines migrated in 12–14 months (vs. 36–48 months manual) |
| Pipeline reliability | P0/P1 pipelines at 99.9%/99.5% SLA |
| Platform ownership | Enterprise-owned IP, no vendor dependency |
| Talent availability | Built on Python, Airflow, standard open source — widely available skills |

---

## 2. Business Context

### 2.1 Two ETL Estates, One Target Platform

The enterprise inherited two ETL estates through organic growth and acquisition. Both must converge onto a single platform as part of the broader cloud strategy.

**The convergence challenge:**

```
Informatica Estate          ADF Estate
(500+ pipelines)            (200-300 pipelines)
     │                           │
     │    Different tools        │
     │    Different languages    │
     │    Different deployment   │
     └──────────┬────────────────┘
                │
                ▼
     SINGLE TARGET PLATFORM
     (cloud-agnostic, enterprise-owned)
```

Both estates share common characteristics that make automated migration feasible:
- Both are declarative (Informatica XML, ADF JSON) and machine-parseable
- Both follow well-understood transformation patterns (copy, filter, lookup, aggregate, SCD)
- Both connect to the same downstream systems (relational databases, mainframe, messaging)
- Both are primarily batch-oriented with some event-driven flows

### 2.2 AWS as Current Cloud — Portability as Strategic Requirement

The enterprise has committed to AWS as its preferred cloud platform. All new infrastructure deploys to AWS. However, the data platform strategy explicitly requires **cloud portability** — the ability to run the same pipelines on GCP, Azure, or on-prem Kubernetes without re-architecture.

This requirement eliminates AWS-native ETL tools (AWS Glue, Amazon MWAA alone) as the sole execution layer and necessitates a container-based, cloud-agnostic runtime as the core architectural pattern.

### 2.3 The $500M Synergy Mandate

Operational consolidation is a board-level commitment. Data platform consolidation — eliminating duplicate ETL tooling, reducing infrastructure costs, and collapsing two data engineering organizations onto shared standards — is a direct contributor to the synergy target. The timeline is compressed: integration must deliver measurable outcomes within 18–24 months.

---

## 3. Proposed Architecture

### 3.1 The Two-Component System

```
┌─────────────────────────────────────────────────────────────────────┐
│                    COMPONENT 1: VZ-ETL FRAMEWORK                    │
│                    (Enterprise-owned runtime)                        │
│                                                                      │
│   YAML Job Configs ──► Framework Runner ──► Data Systems            │
│   (declarative)         (container image)   (sources & targets)     │
│                                                                      │
│   Runs on: AWS EKS today │ GCP GKE tomorrow │ On-prem K8s anytime   │
└─────────────────────────────────────────────────────────────────────┘
                              ▲
                              │ produces YAML configs
┌─────────────────────────────────────────────────────────────────────┐
│                    COMPONENT 2: MIGRATION AGENT                     │
│                    (AI-assisted conversion tool)                     │
│                                                                      │
│   Informatica XML ──►┐                                              │
│                      ├──► IR ──► YAML + DAG + Tests + Docs          │
│   ADF JSON      ──►──┘                                              │
│                                                                      │
│   Optional: not required for Framework to operate                   │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 VZ-ETL Framework Architecture

The framework is a **container-first, declarative, plugin-based data integration runtime** designed specifically for enterprise telecom workloads.

**Design philosophy adapted from SeaTunnel:**
SeaTunnel's architecture represents 7+ years of production refinement at scale. Its core design decisions — connector plugin interface, source/transform/sink separation, execution engine abstraction, configuration-as-code model — are the right decisions for enterprise ETL. VZ-ETL adopts these design principles, implements them in Python (vs. SeaTunnel's Java), and extends them with the enterprise governance layer the business requires.

**What we take from SeaTunnel's design:**
- Source → Transform → Sink pipeline model
- Plugin interface contract (read/write abstract base)
- Configuration-driven job definition
- Multi-engine execution (pandas for small, Spark for large)
- Connector registry pattern
- Exactly-once semantics design

**What we add for enterprise requirements:**
- Python-native implementation (vs. Java/Scala)
- Pipeline tiering (P0–P3) with SLA enforcement
- Data classification metadata in YAML schema
- OpenLineage emission (SeaTunnel has limited lineage)
- Enterprise secrets backend integration (Vault / AWS Secrets Manager)
- SIEM audit logging
- Compliance-grade change management (signed commits, approval gates)
- Mainframe EBCDIC/COBOL integration (Cobrix on Spark)
- SCD Type 2 as a first-class transformation
- Enterprise Airflow integration as primary orchestrator

#### 3.2.1 Core Components

```
┌──────────────────────────────────────────────────────────────────┐
│                    VZ-ETL CONTAINER IMAGE                         │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  CLI: vzetl-runner --config <path> [--dry-run] [--validate]│  │
│  └──────────────────────┬─────────────────────────────────────┘  │
│                         ▼                                        │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  CONFIG LAYER                                              │  │
│  │  • Loader (S3 / GCS / local / HTTP)                        │  │
│  │  • JSON Schema Validator (versioned v1, v2...)             │  │
│  │  • Parameter Resolver (watermarks / secrets / vars)        │  │
│  │  • Policy Enforcer (tier rules, PII rules, governance)     │  │
│  └──────────────────────┬─────────────────────────────────────┘  │
│                         ▼                                        │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  EXECUTION ENGINE                                          │  │
│  │  • Plan Builder (DAG of nodes)                             │  │
│  │  • Backend Selector (pandas / Spark / dbt)                 │  │
│  │  • Executor (topological order, parallel where possible)   │  │
│  └──────────────────────┬─────────────────────────────────────┘  │
│                         ▼                                        │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  CONNECTOR REGISTRY          TRANSFORMATION REGISTRY     │    │
│  │  sqlserver    postgres        filter      lookup          │    │
│  │  oracle       azure_sql       expression  joiner          │    │
│  │  s3           gcs             aggregator  router          │    │
│  │  adls         blob            scd_type_2  update_strategy │    │
│  │  mainframe    rabbitmq        sequence    sorter          │    │
│  │  kafka        http_api        union       mask_pii        │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  CROSS-CUTTING SERVICES                                    │  │
│  │  Structured Logging │ Prometheus Metrics │ OTel Tracing    │  │
│  │  OpenLineage        │ Secrets Resolver   │ Watermark Mgr   │  │
│  │  Validation Engine  │ Circuit Breaker    │ SIEM Audit      │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

#### 3.2.2 YAML Job Schema (Canonical)

Every pipeline is a single YAML file. This is the contract between the migration agent and the runtime.

```yaml
version: "1.0"

job:
  name: load_customer_dimension
  domain: customer
  owner: customer-data-team
  description: "Daily incremental customer dimension load with SCD2"

  # Enterprise governance (required fields)
  data_classification: confidential
  pipeline_tier: P1                    # P0=regulatory, P1=critical, P2=important, P3=dev
  contains_pii: true
  retention_class: standard-7yr

  # Runtime
  execution_backend: auto              # auto | pandas | spark | dbt
  resource_profile: medium
  timeout_minutes: 60
  max_retries: 2

  parameters:
    last_run_dt:
      type: timestamp
      source: watermark
      watermark_key: dim_customer.last_load
      default: "1900-01-01 00:00:00"

  sources:
    - id: src_customers
      connector: sqlserver
      connection: src_sqlserver_prod    # resolved from secrets backend
      query: |
        SELECT customer_id, first_name, last_name,
               email, status, segment_id, updated_dt
        FROM dbo.customers
        WHERE updated_dt >= :last_run_dt

  transformations:
    - id: filter_active
      type: filter
      input: src_customers
      condition: "status = 'ACTIVE'"

    - id: lookup_segment
      type: lookup
      input: filter_active
      lookup:
        connector: postgres
        connection: ref_postgres_prod
        table: ref_segments
        cache: static
      join_keys:
        - left: segment_id
          right: segment_id
      return_columns: [segment_code, segment_name]

    - id: derive_fields
      type: expression
      input: lookup_segment
      derivations:
        full_name: "first_name || ' ' || last_name"
        email_domain: "SUBSTRING(email FROM POSITION('@' IN email)+1)"
        customer_tier: |
          CASE WHEN segment_code = 'PREM' THEN 'GOLD'
               WHEN segment_code = 'STD'  THEN 'SILVER'
               ELSE 'BRONZE' END
        load_ts: "CURRENT_TIMESTAMP"

    - id: apply_scd2
      type: scd_type_2
      input: derive_fields
      natural_key: [customer_id]
      tracked_columns: [full_name, email, email_domain, segment_code, customer_tier]
      effective_from: load_ts
      current_flag_column: current_flg
      surrogate_key: customer_key

  targets:
    - id: tgt_dim_customer
      connector: postgres
      connection: tgt_postgres_prod
      table: dim_customer
      input: apply_scd2
      load_strategy: scd_type_2_merge
      commit_interval: 10000

  validations:
    - type: row_count_min
      threshold: 1
      severity: error
    - type: no_nulls
      columns: [customer_id, customer_key]
      severity: error
    - type: unique_current_records
      key: customer_id
      filter: "current_flg = 'Y'"
      severity: error

  watermark:
    key: dim_customer.last_load
    update_expr: "MAX(load_ts)"

  error_handling:
    on_transform_failure: dead_letter
    dead_letter_target: tgt_error_log
```

#### 3.2.3 Cloud Portability — How It Works

The portability guarantee comes from three design decisions:

**Decision 1: KubernetesPodOperator as the execution interface**
Airflow submits jobs as Kubernetes pods. The pod runs on EKS (AWS today), GKE (GCP tomorrow), or any K8s cluster. The DAG code change is one line — the cluster endpoint.

**Decision 2: Config path abstraction**
YAML configs stored in S3 today. The runner accepts `s3://`, `gs://`, or local paths. Moving configs to GCS is `aws s3 sync → gcloud storage cp`. No code change.

**Decision 3: Connector secrets abstraction**
Connections resolve via a pluggable `SecretsResolver`. The AWS implementation reads from Secrets Manager. The GCP implementation reads from Secret Manager. One config line switches backends.

```
┌────────────────────────────────────────────────────────────────┐
│  PORTABILITY LAYERS                                            │
│                                                                │
│  ████████████████████████████████  100% portable              │
│  YAML configs (jobs/*.yaml)                                    │
│  Container image (vzetl:v1.x.x)                               │
│                                                                │
│  ████████████████████░░░░░░░░░░░░  90% portable               │
│  Airflow DAG files                                             │
│  (registry URL + IAM annotations change per cloud)            │
│                                                                │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  Cloud-specific (thin)      │
│  MWAA → Composer  │  ECR → GAR  │  EKS → GKE                  │
│  Secrets Manager → Secret Mgr   │  IAM → Workload Identity    │
└────────────────────────────────────────────────────────────────┘
```

### 3.3 Migration Agent Architecture

The agent is a multi-stage AI pipeline that converts legacy ETL artifacts into VZ-ETL target artifacts. It is **not required for the framework to operate** — new pipelines can be authored directly in YAML.

#### 3.3.1 Pipeline Stages

```
Source Artifacts
       │
       ▼
┌─────────────┐     ┌─────────────┐
│  Informatica│     │     ADF     │   Source-specific
│  Ingestion  │     │  Ingestion  │   (pluggable)
│  + Parser   │     │  + Parser   │
└──────┬──────┘     └──────┬──────┘
       └──────────┬─────────┘
                  ▼
       ┌─────────────────┐
       │  Intermediate   │   Shared — vendor-neutral
       │  Representation │   semantic model of every job
       │  (IR)           │
       └────────┬────────┘
                ▼
       ┌─────────────────┐
       │    Analyzer     │   AI-assisted: complexity scoring,
       │    Agent        │   pattern classification, risk flags
       └────────┬────────┘
                ▼
       ┌─────────────────┐
       │   Translator    │   Hybrid: rule-based first,
       │   Agent         │   LLM fallback for novel expressions
       └────────┬────────┘
                ▼
       ┌─────────────────┐
       │    Generator    │   Deterministic: YAML + DAG +
       │    Agent        │   dbt models + tests + docs
       └────────┬────────┘
                ▼
       ┌─────────────────┐
       │    Validator    │   Syntactic → Unit → Sample run
       │    Agent        │   → Shadow run → Reconciliation
       └────────┬────────┘
                ▼
       ┌─────────────────┐
       │    Reviewer     │   PR generation, business summary,
       │    Agent        │   SME questions, confidence score
       └────────┬────────┘
                ▼
       Human Review Gates (5 defined gates)
                ▼
       Production Cutover
```

#### 3.3.2 Informatica → VZ-ETL Mapping

Every Informatica concept has a direct equivalent:

| Informatica | VZ-ETL Equivalent |
|---|---|
| Mapping (XML) | `jobs/*.yaml` |
| Source Qualifier | `sources[]` block |
| Filter transformation | `filter` transformation |
| Lookup transformation | `lookup` transformation |
| Expression transformation | `expression` transformation |
| Update Strategy | `update_strategy` or `scd_type_2` |
| Aggregator | `aggregator` transformation |
| Router | `router` transformation |
| Session | Airflow task (PodOperator) |
| Workflow | Airflow DAG |
| Connections | Airflow Connections + Secrets Manager |
| Parameter files | Airflow Variables + YAML parameters |
| Workflow Monitor | Airflow UI |
| Session logs | Task logs → S3 → CloudWatch |

#### 3.3.3 ADF → VZ-ETL Mapping

| ADF Concept | VZ-ETL Equivalent |
|---|---|
| Pipeline | Airflow DAG |
| Copy Activity | `sources[]` + `targets[]` |
| Lookup Activity | `lookup` transformation |
| Filter Activity | `filter` transformation |
| ForEach Activity | Airflow dynamic task mapping |
| Data Flow (derived column) | `expression` transformation |
| Data Flow (aggregate) | `aggregator` transformation |
| Data Flow (join) | `joiner` transformation |
| Trigger (schedule) | DAG `schedule` parameter |
| Trigger (event) | Airflow sensor |
| Linked Service | Airflow Connection + Secrets Manager |
| Dataset | Connector config block in YAML |

---

## 4. Deployment Architecture — AWS Today, Cloud-Agnostic Tomorrow

### 4.1 AWS Deployment (Current State)

```
┌─────────────────────────────────────────────────────────────────┐
│  Developer Workflow                                             │
│  IDE → Git PR → CI (GitHub Actions) → Merge                    │
└──────────────────────┬──────────────────────────────────────────┘
                       │
          ┌────────────┼────────────────┐
          ▼            ▼                ▼
    ┌──────────┐  ┌──────────┐  ┌─────────────┐
    │   ECR    │  │    S3    │  │  S3 (DAGs)  │
    │ (images) │  │ (configs)│  │             │
    └────┬─────┘  └────┬─────┘  └──────┬──────┘
         │             │               │
         │         ┌───┘        ┌──────┘
         │         │            │ git-sync
         │         │            ▼
         │         │     ┌─────────────┐
         │         │     │    MWAA     │
         │         │     │ (Scheduler) │
         │         │     └──────┬──────┘
         │         │            │ KubernetesPodOperator
         │         │            ▼
         │         │     ┌─────────────┐
         └─────────┼────►│  EKS Cluster│
                   │     │  (Job pods) │
                   │     └──────┬──────┘
                   │            │
              reads at          │ connects to
              runtime           ▼
                   │     ┌─────────────────────────────┐
                   └────►│  Data Sources & Targets      │
                         │  SQL Server │ Oracle          │
                         │  Postgres   │ Azure SQL MI    │
                         │  Mainframe  │ RabbitMQ        │
                         └─────────────────────────────┘

Supporting Services:
  AWS Secrets Manager    → credential resolution
  Amazon RDS (Postgres)  → Airflow metadata + watermarks
  CloudWatch + S3        → logs
  Amazon MSK or RabbitMQ → messaging
  AWS ECR                → container registry
```

### 4.2 GCP Migration Path (Future State — Minimal Change)

```
Current (AWS)              Future (GCP)
──────────────────────     ──────────────────────
MWAA               →       Cloud Composer
EKS                →       GKE
ECR                →       Artifact Registry
S3 (configs)       →       GCS
S3 (logs)          →       GCS + Cloud Logging
Secrets Manager    →       Secret Manager
IAM + IRSA         →       Workload Identity
CloudWatch         →       Cloud Monitoring

What does NOT change:
  ✓ YAML job configs (zero changes)
  ✓ Container image (re-tag and push to GAR)
  ✓ DAG files (update registry URL + service account annotation)
  ✓ Framework Python code (zero changes)
  ✓ dbt models (zero changes)
  ✓ Tests and validation scripts (zero changes)
```

**Migration effort estimate when GCP move occurs:**
- YAML configs: 0 hours
- Container images: 8 hours (re-tag, push, registry update)
- DAG files: 40–80 hours (bulk update registry + IAM annotations)
- New cloud infrastructure: 4–6 weeks (Composer, GKE, networking, IAM)
- Testing and cutover: 4–8 weeks

Total for a hypothetical full cloud migration: **3–4 months**, not a multi-year re-architecture.

### 4.3 On-Premise Option

The same Helm chart that deploys on EKS or GKE deploys on any Kubernetes distribution (OpenShift, Rancher, vanilla K8s). For workloads with strict data residency requirements (certain regulatory pipelines), the same container image runs on-prem. No code change.

---

## 5. Why Custom Build Over Open Source Adoption

### 5.1 Open Source Evaluation Summary

| Tool | Considered | Primary Gap | Verdict |
|---|---|---|---|
| Apache SeaTunnel | Yes | Supply chain origin concerns; Java-centric; lightweight transforms; limited enterprise governance | Design reference only |
| Flowman | Yes | Spark-only; small Western community; limited connectors | Not suitable |
| Airbyte OSS | Yes | EL only (no T); no transformation capability | Complementary, not core |
| DAG Factory | Yes | Orchestration only; no execution runtime | Complementary for simple DAGs |
| dbt Core | Yes | In-DB transforms only; no data movement | Used as backend for SQL transforms |
| Apache Airflow | Yes — adopt | Industry standard orchestrator; no approval risk | Adopted as orchestrator |

### 5.2 SeaTunnel as Design Reference — Not as Dependency

SeaTunnel's architecture represents the most battle-tested open source design for this problem class. Rather than adopting SeaTunnel (and its associated risks), we extract its proven design decisions:

| SeaTunnel Design Pattern | How VZ-ETL Adopts It |
|---|---|
| Source → Transform → Sink pipeline model | Direct adoption — same three-stage pipeline |
| Abstract connector interface (`TableSource`, `TableSink`) | Adapted to Python `BaseConnector` ABC |
| Transform API (`SeaTunnelTransform`) | Adapted to Python `BaseTransformation` ABC |
| Plugin registry via service loader | Python entry-points based registry |
| Multi-engine execution support | pandas backend + Spark backend + dbt backend |
| Exactly-once semantics | Checkpoint + watermark pattern adopted |
| Configuration-driven job definition | YAML schema, more expressive than SeaTunnel's HOCON |

**Net result:** VZ-ETL inherits 7+ years of SeaTunnel architectural refinement, implemented in Python, with an enterprise governance layer, without any dependency on the SeaTunnel codebase, community, or supply chain.

### 5.3 Build vs. Buy Analysis

| Dimension | Commercial ETL (Informatica Cloud) | Adopt SeaTunnel | Custom VZ-ETL |
|---|---|---|---|
| Licensing cost | $1M–$3M/yr | $0 (OSS) | $0 |
| Build investment | Low | Medium (extension) | High (purpose-built) |
| Cloud portability | Low (vendor cloud preference) | Medium | High (by design) |
| Transformation depth | High | Low | High (purpose-built) |
| Mainframe support | High (native) | None | Built-in (Cobrix) |
| Enterprise governance | High (vendor-provided) | Low (DIY) | High (built-in) |
| Supply chain risk | Medium (vendor dependency) | Medium-High (Chinese origin) | Low (enterprise-owned) |
| Long-term TCO | High (perpetual license) | Medium (ops burden) | Low (fixed build + run) |
| Talent availability | Medium (Informatica specialists) | Low (SeaTunnel specialists) | High (Python, Airflow) |
| Strategic alignment | Low (vendor controls roadmap) | Low (community controls) | High (enterprise controls) |

---

## 6. What We Leverage vs. What We Build

### 6.1 Leverage (Do Not Rebuild)

| Component | Open Source Choice | Rationale |
|---|---|---|
| Orchestration | Apache Airflow (MWAA on AWS) | Industry standard, enterprise-approved, community-backed by Astronomer |
| In-database transforms | dbt Core | Industry standard, widely adopted, no approval risk |
| CDC / streaming | Debezium + Kafka / Amazon MSK | Mature, widely adopted enterprise patterns |
| Mainframe parsing | Apache Spark + Cobrix | Only production-grade open source solution for COBOL/EBCDIC |
| Container platform | Kubernetes (EKS) + Helm | Cloud-agnostic by construction |
| Observability | Prometheus + Grafana + OpenTelemetry | Industry standard open source stack |
| Data lineage | OpenLineage + Marquez | Apache-governed, integrates with enterprise catalogs |
| CI/CD | GitHub Actions | Enterprise-approved, widely used |
| Secret management | AWS Secrets Manager (Vault optional) | AWS-native, enterprise-approved |

### 6.2 Build (Enterprise-Owned IP)

| Component | Build Rationale |
|---|---|
| VZ-ETL framework runner | Core runtime; must match enterprise governance requirements; Python-native |
| YAML job schema (versioned) | Enterprise contract layer; must be stable and governed |
| Connector library | Enterprise-specific sources (mainframe SFTP, Oracle with Instant Client, Azure SQL MI) |
| Transformation library | Informatica-compatible semantics (SCD2, complex lookups, update strategy) |
| Enterprise governance layer | Pipeline tiering, PII handling, SIEM integration, data classification |
| Migration agent (Informatica parser) | No open source equivalent; enterprise-specific IR |
| Migration agent (ADF parser) | No open source equivalent; enterprise-specific IR |
| Migration agent (AI translation) | Enterprise-specific expression patterns; proprietary business logic |
| Validation / reconciliation harness | Enterprise data quality standards |

---

## 7. Revised Implementation Plan

### 7.1 Phase Summary

| Phase | Duration | Theme | Exit Milestone |
|---|---|---|---|
| 0 — Inception | 4 weeks | Team, environments, ADRs | Charter approved, team assembled |
| 1 — Framework MVP | Months 1–4 | Core engine + pilot pipelines | 10 pipelines running on dev/local |
| 2 — AWS Production | Months 5–7 | MWAA + EKS + security | 30+ pipelines in production on AWS |
| 3 — Migration Agent | Months 6–10 | Informatica agent first | 100 Informatica jobs auto-converted |
| 4 — ADF Agent | Months 10–13 | ADF source plugin | 50 ADF jobs auto-converted |
| 5 — Scale & Harden | Months 13–16 | Full wave migrations | 500+ pipelines in production |
| 6 — Cloud Validation | Months 16–18 | GCP proof of portability | Same workloads on GCP validated |

Note: Phases 3 and 2 overlap intentionally — the framework must be stable before the agent begins generating production artifacts, but agent development can begin in parallel with Phase 2 hardening.

### 7.2 Effort Estimate — SeaTunnel-Informed Build

Key insight: **SeaTunnel's design documentation, connector patterns, and transformation contracts are a free blueprint.** By studying SeaTunnel's public codebase and architecture, the framework build avoids the weeks of design exploration that would otherwise be needed. This compresses Phase 1 by approximately 4–6 weeks.

#### Phase 0 (4 weeks)

| Workstream | Effort | Notes |
|---|---|---|
| Team assembly and onboarding | 2 weeks | 8.5 FTE mobilization |
| Environment setup (AWS dev, CI/CD, registry) | 2 weeks | Infrastructure as code |
| Architecture Decision Records (10 ADRs) | 2 weeks | Concurrent with above |
| SeaTunnel design study and adaptation plan | 1 week | Blueprint extraction |
| Pilot pipeline identification | 1 week | 10 candidates from each domain |

#### Phase 1 — Framework MVP (Months 1–4)

| Sprint | Deliverable | Effort Saved vs Greenfield |
|---|---|---|
| 1–2 | Walking skeleton (SeaTunnel S/T/S model as reference) | 3 weeks saved |
| 3 | Plugin architecture (adapted from SeaTunnel connector API) | 2 weeks saved |
| 4 | Config layer (YAML schema, validation, parameter resolution) | 1 week saved |
| 5 | Connector expansion (sqlserver, oracle, s3, azure_sql) | 2 weeks saved |
| 6 | Transformation library (filter, expression, lookup, joiner, SCD2) | 3 weeks saved |
| 7 | Observability foundation | Standard effort |
| 8 | Pilot pipelines (10 hand-authored) | Standard effort |

**Total Phase 1 effort saving from SeaTunnel reference: ~11 weeks** (vs. fully greenfield)
**Phase 1 team cost: 8.5 FTE × 4 months**

#### Phase 2 — AWS Production (Months 5–7)

| Workstream | Effort |
|---|---|
| MWAA + EKS setup (Terraform, Helm) | 4 weeks |
| KubernetesPodOperator pattern + custom operator | 2 weeks |
| Security hardening (image signing, NetworkPolicies, IRSA) | 3 weeks |
| Observability production integration (CloudWatch, Prometheus, OpenLineage) | 3 weeks |
| CI/CD production maturity | 2 weeks |
| Pipeline onboarding (30+ pipelines) | 6 weeks |

#### Phase 3 — Migration Agent — Informatica (Months 6–10)

| Workstream | Effort |
|---|---|
| IR schema design | 2 weeks |
| Informatica XML parser → IR | 4 weeks |
| Expression translator (rule-based patterns) | 6 weeks |
| LLM integration (enterprise AI gateway, RAG vector store) | 3 weeks |
| YAML + DAG generator | 3 weeks |
| Validator (syntactic, unit, sample run) | 4 weeks |
| Reviewer + PR automation | 2 weeks |
| LangGraph orchestrator | 3 weeks |
| Pilot: 50 Informatica jobs | 4 weeks |

#### Phase 4 — Migration Agent — ADF (Months 10–13)

| Workstream | Effort | Reuse from Phase 3 |
|---|---|---|
| ADF JSON parser → IR | 3 weeks | IR schema reused 100% |
| ADF expression translator | 4 weeks | Expression engine reused ~70% |
| ADF-specific analyzer rules | 1 week | Analyzer framework reused 100% |
| Azure connector additions (ADLS, Blob, Synapse) | 3 weeks | Connector pattern reused 100% |
| Pilot: 30 ADF pipelines | 3 weeks | All downstream stages reused 100% |

**ADF agent is ~40% of the Informatica agent effort** because of shared core.

#### Phase 5 — Scale (Months 13–16)

| Workstream | Effort |
|---|---|
| Informatica wave migrations (waves 2–5) | 4 months parallel to ADF |
| ADF wave migrations | 3 months parallel to Informatica |
| Spark backend (large-volume pipelines) | 6 weeks |
| Mainframe integration (Cobrix + SFTP connector) | 6 weeks |
| dbt integration | 4 weeks |
| Legacy ETL retirement (per wave) | Ongoing |

#### Phase 6 — Cloud Portability Validation (Months 16–18)

| Workstream | Effort |
|---|---|
| GCP environment setup (Composer, GKE, Artifact Registry) | 4 weeks |
| Framework portability validation (10 representative pipelines on GCP) | 3 weeks |
| Documentation: cloud migration runbook | 2 weeks |
| On-premise Kubernetes validation | 3 weeks |

### 7.3 Total Cost of Ownership

#### Build Investment (18 Months)

| Category | Estimate |
|---|---|
| Engineering team (8.5 FTE × 18 months) | $3.2M – $4.8M |
| AWS infrastructure (dev, test, prod) | $400K – $700K |
| Software (observability, licensing for Astronomer optional) | $150K – $300K |
| LLM token costs (migration agent AI) | $50K – $100K |
| Training and certification | $50K – $100K |
| External consulting (mainframe specialist, security review) | $150K – $250K |
| Contingency (15%) | ~$600K |
| **Total Build** | **$4.6M – $6.8M** |

**SeaTunnel-informed design saves approximately $800K–$1.2M** vs. fully greenfield build, by reducing design exploration time, providing validated connector patterns, and shortening Phase 1 by 11 weeks.

#### Run Cost (Annual, Steady State)

| Category | Annual Estimate |
|---|---|
| BAU platform team (4–5 FTE) | $1.2M – $1.8M |
| AWS infrastructure (production scale) | $300K – $800K |
| Software licenses | $100K – $200K |
| **Total Annual Run** | **$1.6M – $2.8M** |

#### License Cost Elimination

| Tool | Current Annual License Estimate | Eliminated By |
|---|---|---|
| Informatica PowerCenter | $800K – $2M | Phase 5 completion |
| Azure Data Factory (data flows) | $200K – $600K | Phase 4 completion |
| **Total License Savings** | **$1M – $2.6M/yr** | Recurring |

**Payback period: 2–3 years.** After that, the enterprise runs a superior platform at lower annual cost than the legacy tooling it replaces.

---

## 8. Team Structure

### 8.1 Core Build Team

| Role | FTE | Primary Responsibility |
|---|---|---|
| Platform Engineering Lead (Architect) | 1.0 | Architecture ownership, ADRs, ARB, SeaTunnel pattern adaptation |
| Senior Backend Engineers | 3.0 | Framework engine, connectors, transformations |
| DevOps / Platform Engineers | 2.0 | AWS infrastructure, CI/CD, Helm, Terraform |
| AI / ML Engineer | 1.0 | Migration agent, LLM integration, RAG, prompt engineering |
| Data Engineer (specialist) | 1.0 | Mainframe, Spark, Cobrix, complex connectors |
| Site Reliability Engineer | 1.0 | Observability, on-call, performance |
| Product Manager | 0.5 | Stakeholder management, roadmap |

### 8.2 Governance Roles

| Role | Engagement |
|---|---|
| Executive Sponsor | Monthly steering |
| Architecture Review Board | Biweekly (includes security lead) |
| Data Governance Lead | Phase gate approvals |
| Domain SMEs (ETL owners) | Pipeline validation and sign-off |
| Enterprise Security | Each connector approval, penetration testing |

---

## 9. Risk Register

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 1 | Framework transformation gaps (Informatica patterns without clean equivalent) | High | High | Escape hatch via PythonOperator; document unsupported patterns; SeaTunnel study reduces surprise |
| 2 | Migration agent AI accuracy below target | Medium | Medium | Deterministic-first design; human gates; shadow runs; confidence thresholds |
| 3 | Mainframe integration complexity underestimated | High | High | Mainframe SME engaged Phase 1; conservative estimate; Cobrix patterns validated early |
| 4 | Performance gap vs Informatica for large jobs | Medium | High | Spark backend; benchmarking suite in CI; parallel run data before cutover |
| 5 | Pipeline owners resist migration | High | High | Executive sponsorship; co-build early pipelines; demonstrate wins publicly |
| 6 | AWS cloud costs exceed estimate | Medium | Medium | Cost dashboards from Day 1; right-sizing; spot instances where appropriate |
| 7 | GCP portability claims fail in validation | Low | High | Portability test suite from Phase 1; abstraction discipline enforced in code review |
| 8 | Security review surfaces blockers (connector or image) | Medium | High | Security engaged from Week 1; iterative review, not gate at end |
| 9 | YAML schema breaking change after wide adoption | Low | High | JSON Schema versioning from Day 1; deprecation policy; minor versions backward-compatible |
| 10 | SeaTunnel design reference reveals Java-specific patterns not portable to Python | Low | Medium | Identified during Phase 0 study; adapt interface, not implementation |

---

## 10. Success Metrics

### 10.1 Program Outcomes (18-Month Targets)

| Metric | Target |
|---|---|
| Pipelines migrated | 500+ |
| Legacy ETL licenses retired | 100% of converted scope |
| Pipeline reliability — P0 | 99.9% |
| Pipeline reliability — P1 | 99.5% |
| Time to deploy new pipeline | < 3 business days |
| Cloud portability validated | AWS + GCP + on-prem K8s |
| GCP migration effort (if triggered) | < 4 months for full estate |
| Annual license savings | $1M – $2.6M |

### 10.2 Migration Agent Quality Targets

| Metric | Target |
|---|---|
| Informatica first-pass auto-conversion rate | ≥ 85% (simple), ≥ 70% (complex) |
| ADF first-pass auto-conversion rate | ≥ 80% |
| Reconciliation pass rate (shadow runs) | ≥ 98% |
| False negative rate (defects passing validation) | < 0.5% |

---

## 11. Next Steps

### Immediate Actions (Next 30 Days)

1. **Sponsor approval** of proposal and funding model
2. **Team assembly** — identify internal candidates; open external requisitions for gaps
3. **SeaTunnel architecture study** — 1-week deep-dive by platform lead; document adopted patterns and adaptations
4. **AWS environment provisioning** — dev account, ECR, EKS sandbox, MWAA dev
5. **Pilot pipeline selection** — 10 representative Informatica pipelines spanning complexity tiers
6. **ADR drafting** — 10 founding architectural decisions for ARB review

### Phase 0 Exit Gate (Week 4)

Architecture Review Board reviews and approves:
- Framework architecture design document
- YAML schema v0.1 draft
- Plugin contract interface definitions
- AWS deployment architecture
- SeaTunnel pattern adaptation decisions

---

## 12. Appendix

### A. SeaTunnel Design Patterns Adopted

The following SeaTunnel design decisions are adopted directly into VZ-ETL:

| SeaTunnel Pattern | Source Reference | VZ-ETL Adaptation |
|---|---|---|
| `TableSource` / `TableSink` interface | SeaTunnel Connector API v2 | Python `BaseConnector` ABC with identical `read()` / `write()` contract |
| `SeaTunnelTransform` interface | SeaTunnel Transform SPI | Python `BaseTransformation` ABC |
| Plugin loading via SPI / service loader | Java SPI pattern | Python `importlib.metadata` entry points |
| Multi-table source support | SeaTunnel 2.3+ | Adapted in source config schema |
| Checkpoint + exactly-once | SeaTunnel Zeta engine | Watermark + advisory lock pattern |
| Source → Transform → Sink execution model | Core SeaTunnel architecture | Direct adoption |
| Config-driven job definition | HOCON config files | YAML (more human-readable, JSON Schema validatable) |

### B. Connector Priority Matrix

Phase 1 mandatory connectors (ordered by pipeline coverage impact):

| Priority | Connector | Covers % of Estate |
|---|---|---|
| 1 | `sqlserver` | ~40% of sources |
| 2 | `postgres` | ~35% of targets |
| 3 | `oracle` | ~20% of targets |
| 4 | `s3` | ~30% intermediate / target |
| 5 | `azure_sql_mi` | ~15% of targets |
| 6 | `rabbitmq` | ~10% event-driven |
| 7 | `mainframe_sftp` | ~8% of sources + targets |
| 8 | `azure_blob` | ~12% (ADF estate) |
| 9 | `adls_gen2` | ~10% (ADF estate) |
| 10 | `http_api` | ~5% of sources |

### C. Technology Stack Summary

| Layer | Technology | License | Origin |
|---|---|---|---|
| Orchestration | Apache Airflow (MWAA) | Apache 2.0 | Apache Foundation (Airbnb origin) |
| Container platform | Kubernetes (EKS) + Helm | Apache 2.0 | CNCF |
| In-DB transforms | dbt Core | Apache 2.0 | dbt Labs (US) |
| CDC | Debezium | Apache 2.0 | Red Hat / Apache |
| Streaming | Apache Kafka (MSK) | Apache 2.0 | Apache Foundation (LinkedIn origin) |
| Mainframe parsing | Cobrix (Spark library) | Apache 2.0 | ABSA Group |
| Lineage | OpenLineage + Marquez | Apache 2.0 | Datakin / Apache |
| Observability | Prometheus + Grafana | Apache 2.0 / AGPL | CNCF / Grafana Labs |
| Secrets | AWS Secrets Manager | AWS commercial | Amazon |
| ETL Runtime | VZ-ETL (custom) | Enterprise-owned IP | Built in-house |
| Migration Agent | Custom (LangGraph) | Enterprise-owned IP | Built in-house |

All open source components: Apache 2.0 or equivalent permissive license. All Western-origin or Apache Foundation governed. No components with Chinese-origin community concentration concerns.

---

**End of Proposal**
