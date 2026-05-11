# Enterprise ETL Modernization — Architecture Diagrams

**Document Type:** Architecture Diagrams (L0 → L3)
**Version:** 1.0
**Date:** 2026-05-11
**Classification:** Internal — Architecture Review

---

## L0 — Business Context Diagram

The highest-level view: what the system does, who uses it, and what it replaces.

```
╔══════════════════════════════════════════════════════════════════════════════════╗
║                        ENTERPRISE TELECOM — DATA PLATFORM                        ║
╠══════════════════════════════════════════════════════════════════════════════════╣
║                                                                                  ║
║   LEGACY ESTATE (retiring)            MODERN PLATFORM (target)                  ║
║   ──────────────────────────          ──────────────────────────────             ║
║                                                                                  ║
║   ┌──────────────────────┐            ┌──────────────────────────────┐           ║
║   │  Informatica         │            │  Generic ETL Framework            │           ║
║   │  PowerCenter         │──retires──►│  (enterprise-owned runtime)  │           ║
║   │  ~450 pipelines      │            │  YAML-driven, container-based│           ║
║   │  $6.9M/yr TCO        │            │                              │           ║
║   └──────────────────────┘            │  Runs on AWS today           │           ║
║                                       │  GCP / On-prem tomorrow      │           ║
║   ┌──────────────────────┐            └──────────────┬───────────────┘           ║
║   │  Azure Data Factory  │                           │                           ║
║   │  ~250 pipelines      │──retires──►  ─────────────┘                           ║
║   │  $1.1M/yr TCO        │                                                       ║
║   └──────────────────────┘            ┌──────────────────────────────┐           ║
║                                       │  Migration Agent             │           ║
║   ACTORS                              │  (AI-assisted converter)     │           ║
║   ──────                              │  Informatica XML → YAML      │           ║
║   • ETL Engineers    ────────────────►│  ADF JSON → YAML             │           ║
║   • Platform Team    ────────────────►│  LangGraph + Claude API      │           ║
║   • Business SMEs    (review gates)──►└──────────────────────────────┘           ║
║   • Executive Sponsor (funding)                                                  ║
║                                       ANNUAL COST TARGET: $2M/yr                ║
║   CURRENT ANNUAL COST: $8M/yr         (75% reduction, 18-month program)         ║
╚══════════════════════════════════════════════════════════════════════════════════╝
```

---

## L1 — System Context Diagram

The full system in context: all external systems the platform interacts with.

```
                         ┌──────────────────────────────────────────────────────────┐
                         │                EXTERNAL DATA SYSTEMS                     │
                         │                                                          │
                         │  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
                         │  │ SQL      │  │ Oracle   │  │ Azure    │              │
                         │  │ Server   │  │ DB       │  │ SQL MI   │              │
                         │  └────┬─────┘  └────┬─────┘  └────┬─────┘              │
                         │       │             │             │                      │
                         │  ┌────┴─────┐  ┌────┴──────┐  ┌──┴───────┐             │
                         │  │ Postgres │  │ Mainframe │  │ S3 / GCS │             │
                         │  └──────────┘  └───────────┘  └──────────┘             │
                         └──────────────────────┬───────────────────────────────────┘
                                                │ read / write
                                                │
┌──────────────────┐               ╔════════════╧═════════════════════════════════╗
│  LEGACY ETL      │               ║          Generic ETL Platform                     ║
│  ARTIFACTS       │  converts     ║                                              ║
│                  │──────────────►║  ┌──────────────────┐  ┌──────────────────┐ ║
│  Informatica XML │               ║  │ Migration Agent   │  │ ETL Framework    │ ║
│  ADF JSON        │               ║  │ (build-time tool) │  │ (runtime)        │ ║
│  Parameter files │               ║  └──────────┬────────┘  └──────────────────┘ ║
└──────────────────┘               ║             │ generates YAML                 ║
                                   ╚═════════════╧════════════════════════════════╝
                                                 │
               ┌─────────────────────────────────┼─────────────────────────────────┐
               │                                 │                                 │
               ▼                                 ▼                                 ▼
  ┌────────────────────┐           ┌─────────────────────┐           ┌─────────────────────┐
  │  ORCHESTRATION     │           │  OBSERVABILITY       │           │  SECURITY            │
  │                    │           │                     │           │                     │
  │  Apache Airflow    │           │  Prometheus +        │           │  AWS Secrets Mgr     │
  │  (MWAA on AWS)     │           │  Grafana             │           │  HashiCorp Vault      │
  │  DAG per pipeline  │           │  OpenTelemetry       │           │  Image signing        │
  │  KubePodOperator   │           │  OpenLineage         │           │  (cosign)            │
  └────────────────────┘           │  Marquez (lineage)   │           │  NetworkPolicies      │
                                   │  CloudWatch / SIEM   │           │  RBAC / IRSA          │
                                   └─────────────────────┘           └─────────────────────┘
```

---

## L2 — Component Architecture Diagram

The internal structure of the two core platform components.

### L2a — Generic ETL Framework (Runtime)

```
╔══════════════════════════════════════════════════════════════════════════════════════╗
║                               Generic ETL Framework                                      ║
║                         Container image: etl-runner:v{version}                           ║
╠══════════════════════════════════════════════════════════════════════════════════════╣
║                                                                                      ║
║  ┌────────────────────────────────────────────────────────────────────────────────┐  ║
║  │  CLI  →  etl-runner --config <path> [--dry-run] [--validate] [--tier P0]    │  ║
║  └────────────────────────────────┬───────────────────────────────────────────────┘  ║
║                                   │                                                  ║
║  ┌────────────────────────────────▼───────────────────────────────────────────────┐  ║
║  │  CONFIG LAYER                                                                  │  ║
║  │                                                                                │  ║
║  │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────────────┐ │  ║
║  │  │  Config Loader   │  │  JSON Schema     │  │  Parameter Resolver          │ │  ║
║  │  │  s3:// gs://     │  │  Validator       │  │  watermarks / secrets / vars │ │  ║
║  │  │  file:// http:// │  │  v1, v2, v3...   │  │  AWS Secrets Manager / Vault │ │  ║
║  │  └──────────────────┘  └──────────────────┘  └──────────────────────────────┘ │  ║
║  │  ┌──────────────────────────────────────────────────────────────────────────┐  │  ║
║  │  │  Policy Enforcer — tier rules, PII policy, data classification           │  │  ║
║  │  └──────────────────────────────────────────────────────────────────────────┘  │  ║
║  └────────────────────────────────┬───────────────────────────────────────────────┘  ║
║                                   │                                                  ║
║  ┌────────────────────────────────▼───────────────────────────────────────────────┐  ║
║  │  EXECUTION ENGINE                                                              │  ║
║  │                                                                                │  ║
║  │  ┌────────────────┐   ┌──────────────────────┐   ┌──────────────────────────┐ │  ║
║  │  │  Plan Builder  │   │  Backend Selector     │   │  Executor                │ │  ║
║  │  │  DAG of nodes  │   │  auto / pandas /      │   │  topological order       │ │  ║
║  │  │  dep graph     │   │  spark / dbt          │   │  parallel where possible │ │  ║
║  │  └────────────────┘   └──────────────────────┘   └──────────────────────────┘ │  ║
║  └───────────────────┬──────────────────────────────────┬─────────────────────────┘  ║
║                      │                                  │                            ║
║  ┌───────────────────▼────────────────┐  ┌─────────────▼──────────────────────────┐ ║
║  │  CONNECTOR REGISTRY                │  │  TRANSFORMATION REGISTRY               │ ║
║  │                                    │  │                                        │ ║
║  │  sqlserver    postgres             │  │  filter        lookup                  │ ║
║  │  oracle       azure_sql_mi         │  │  expression    joiner                  │ ║
║  │  s3           gcs / adls           │  │  aggregator    router                  │ ║
║  │  mainframe    kafka                │  │  scd_type_2    update_strategy         │ ║
║  │  rabbitmq     http_api             │  │  sequence      sorter                  │ ║
║  │  csv_file     parquet              │  │  union         mask_pii                │ ║
║  │  sqlite (dev) snowflake            │  │  deduplicate   validate                │ ║
║  │                                    │  │                                        │ ║
║  │  [Plugin: entry-points registry]   │  │  [Plugin: entry-points registry]       │ ║
║  └────────────────────────────────────┘  └────────────────────────────────────────┘ ║
║                                                                                      ║
║  ┌──────────────────────────────────────────────────────────────────────────────────┐║
║  │  CROSS-CUTTING SERVICES                                                          │║
║  │                                                                                  │║
║  │  Structured Logging (JSON)  │  Prometheus Metrics  │  OpenTelemetry Traces       │║
║  │  OpenLineage Emission       │  Secrets Resolver    │  Watermark Manager          │║
║  │  Validation Engine          │  Circuit Breaker     │  SIEM Audit Logger          │║
║  │  Dead-letter Queue Writer   │  Retry w/ Backoff    │  PII Detection + Masking    │║
║  └──────────────────────────────────────────────────────────────────────────────────┘║
╚══════════════════════════════════════════════════════════════════════════════════════╝
```

### L2b — Migration Agent

```
╔══════════════════════════════════════════════════════════════════════════════════════╗
║                               MIGRATION AGENT                                        ║
║                         Build-time tool — not a runtime dependency                   ║
╠══════════════════════════════════════════════════════════════════════════════════════╣
║                                                                                      ║
║  SOURCE PLUGINS (pluggable per legacy ETL technology)                                ║
║  ┌───────────────────────────────────┐  ┌────────────────────────────────────────┐  ║
║  │  INFORMATICA SOURCE PLUGIN        │  │  ADF SOURCE PLUGIN                     │  ║
║  │  ┌─────────────┐ ┌─────────────┐  │  │  ┌──────────────┐ ┌─────────────────┐  │  ║
║  │  │  Ingestion  │ │  Parser     │  │  │  │  Ingestion   │ │  Parser         │  │  ║
║  │  │  pmrep CLI  │ │  XML → IR   │  │  │  │  ADF Git API │ │  JSON → IR      │  │  ║
║  │  └─────────────┘ └──────┬──────┘  │  │  └──────────────┘ └────────┬────────┘  │  ║
║  │  ┌─────────────────────┐│         │  │  ┌─────────────────────────┐│          │  ║
║  │  │  Expression Lexer   ││         │  │  │  Expression Lexer       ││          │  ║
║  │  │  (Informatica DSL)  ││         │  │  │  (ADF Expression DSL)   ││          │  ║
║  │  └─────────────────────┘│         │  │  └─────────────────────────┘│          │  ║
║  └───────────────────────  ┼  ───────┘  └──────────────────────────── ┼ ─────────┘  ║
║                            │                                          │              ║
║                            └──────────────┬───────────────────────────┘              ║
║                                           │                                          ║
║  SHARED CORE (source-agnostic)            ▼                                          ║
║  ┌────────────────────────────────────────────────────────────────────────────────┐  ║
║  │                  INTERMEDIATE REPRESENTATION (IR)                              │  ║
║  │              Canonical JSON — vendor-neutral semantic model                    │  ║
║  │  sources[] / transformations[] / targets[] / parameters[] / dependencies[]    │  ║
║  └─────────────────────────────────┬──────────────────────────────────────────────┘  ║
║                                    │                                                  ║
║              ┌─────────────────────▼──────────────────────┐                          ║
║              │              ANALYZER AGENT                 │  AI-assisted             ║
║              │  complexity scoring / pattern classification│  (Claude API)            ║
║              │  risk flags / effort estimate / routing     │                          ║
║              └─────────────────────┬──────────────────────┘                          ║
║                                    │                                                  ║
║              ┌─────────────────────▼──────────────────────┐                          ║
║              │             TRANSLATOR AGENT                │  Hybrid                  ║
║              │  Lexer → AST → Rule Matcher → LLM fallback │  (deterministic +        ║
║              │  RAG vector store for few-shot examples     │   Claude API)            ║
║              └─────────────────────┬──────────────────────┘                          ║
║                                    │                                                  ║
║              ┌─────────────────────▼──────────────────────┐                          ║
║              │             GENERATOR AGENT                 │  Deterministic           ║
║              │  IR → YAML config                          │                          ║
║              │  IR → Airflow DAG (Python)                  │                          ║
║              │  IR → dbt models (SQL)                      │                          ║
║              │  IR → unit tests + validation fixtures      │                          ║
║              │  IR → business logic markdown (SME docs)    │                          ║
║              └─────────────────────┬──────────────────────┘                          ║
║                                    │                                                  ║
║              ┌─────────────────────▼──────────────────────┐                          ║
║              │             VALIDATOR AGENT                 │  Mostly deterministic    ║
║              │  Tier 1: syntactic (YAML parses, DAG builds)│                          ║
║              │  Tier 2: schema (refs resolve, types match) │                          ║
║              │  Tier 3: unit tests on sample data          │                          ║
║              │  Tier 4: sample-run against real sources    │                          ║
║              │  Tier 5: shadow-run + full reconciliation   │                          ║
║              └─────────────────────┬──────────────────────┘                          ║
║                                    │                                                  ║
║              ┌─────────────────────▼──────────────────────┐                          ║
║              │             REVIEWER AGENT                  │  AI-assisted             ║
║              │  PR generation (GitHub)                     │  (Claude API)            ║
║              │  Business logic summary (plain language)    │                          ║
║              │  Confidence score + reviewer questions      │                          ║
║              └─────────────────────┬──────────────────────┘                          ║
║                                    │                                                  ║
║  ┌─────────────────────────────────▼──────────────────────────────────────────────┐  ║
║  │                       HUMAN REVIEW GATES (5 gates)                             │  ║
║  │  Gate 1: Analysis sample review  │  Gate 4: Reconciliation sign-off            │  ║
║  │  Gate 2: Engineering review      │  Gate 5: Production cutover approval        │  ║
║  │  Gate 3: SME business validation │                                             │  ║
║  └────────────────────────────────────────────────────────────────────────────────┘  ║
║                                                                                      ║
║  ┌────────────────────────────────────────────────────────────────────────────────┐  ║
║  │  ORCHESTRATOR — LangGraph state machine + PostgreSQL audit DB                  │  ║
║  │  States: INGESTED → PARSED → ANALYZED → TRANSLATED → GENERATED →              │  ║
║  │          VALIDATED → REVIEWED → PR_OPEN → PR_APPROVED →                       │  ║
║  │          SHADOW_RUN → CUTOVER_APPROVED → PRODUCTION → LEGACY_RETIRED          │  ║
║  └────────────────────────────────────────────────────────────────────────────────┘  ║
╚══════════════════════════════════════════════════════════════════════════════════════╝
```

---

## L3 — Deployment Architecture Diagram (AWS — Current State)

```
╔══════════════════════════════════════════════════════════════════════════════════════╗
║  AWS ACCOUNT — Generic ETL Platform                                 Region: us-east-1    ║
╠═══════════════════════════════════════╦══════════════════════════════════════════════╣
║  DEVELOPER PLANE                      ║  DATA PLANE                                 ║
║                                       ║                                             ║
║  Developer Workstation                ║  ┌──────────────────────────────────────┐   ║
║  ┌─────────────────────┐              ║  │  VPC — private subnets only          │   ║
║  │  IDE → Git commit   │              ║  │                                      │   ║
║  └──────────┬──────────┘              ║  │  ┌─────────────────────────────────┐ │   ║
║             │                        ║  │  │  MWAA — Amazon Managed Airflow  │ │   ║
║             ▼                        ║  │  │  Scheduler + Workers             │ │   ║
║  ┌─────────────────────┐              ║  │  │  DAGs from S3 (git-synced)       │ │   ║
║  │  GitHub             │              ║  │  └───────────────┬─────────────────┘ │   ║
║  │  Repository         │              ║  │                  │ KubernetesPodOp    │   ║
║  └──────────┬──────────┘              ║  │                  ▼                   │   ║
║             │                        ║  │  ┌─────────────────────────────────┐ │   ║
║             ▼                        ║  │  │  EKS Cluster                    │ │   ║
║  ┌─────────────────────┐              ║  │  │                                 │ │   ║
║  │  GitHub Actions     │              ║  │  │  Job Pods (etl-runner:v1.x)          │ │   ║
║  │  CI/CD Pipeline     │              ║  │  │  ┌────┐ ┌────┐ ┌────┐ ┌────┐   │ │   ║
║  │  ┌───────────────┐  │              ║  │  │  │pod │ │pod │ │pod │ │pod │   │ │   ║
║  │  │ lint / test   │  │              ║  │  │  └────┘ └────┘ └────┘ └────┘   │ │   ║
║  │  │ build image   │──┼──push──────►║  │  │  (m5.2xlarge spot fleet)        │ │   ║
║  │  │ sign image    │  │              ║  │  │                                 │ │   ║
║  │  │ push to ECR   │  │              ║  │  │  Spark Pods (r5.4xlarge spot)   │ │   ║
║  │  └───────────────┘  │              ║  │  │  ┌────────────────────────────┐ │ │   ║
║  └─────────────────────┘              ║  │  │  │ driver  │ executor ×N      │ │ │   ║
║                                       ║  │  │  └────────────────────────────┘ │ │   ║
║  CONTROL PLANE                        ║  │  └─────────────────────────────────┘ │   ║
║                                       ║  │                                      │   ║
║  ┌─────────────────────┐              ║  │  ┌─────────────────────────────────┐ │   ║
║  │  ECR                │              ║  │  │  Supporting Services             │ │   ║
║  │  Container Registry │              ║  │  │                                 │ │   ║
║  │  signed images only │              ║  │  │  S3 Buckets:                    │ │   ║
║  └─────────────────────┘              ║  │  │  • /configs (YAML jobs)         │ │   ║
║                                       ║  │  │  • /dags (Airflow DAGs)         │ │   ║
║  ┌─────────────────────┐              ║  │  │  • /logs (task logs)            │ │   ║
║  │  S3 Config Bucket   │              ║  │  │  • /lineage (OpenLineage events)│ │   ║
║  │  YAML job configs   │              ║  │  │  • /staging (temp data)         │ │   ║
║  └─────────────────────┘              ║  │  │                                 │ │   ║
║                                       ║  │  │  RDS PostgreSQL Multi-AZ:       │ │   ║
║  ┌─────────────────────┐              ║  │  │  • Airflow metadata DB          │ │   ║
║  │  Secrets Manager    │              ║  │  │  • Watermark registry           │ │   ║
║  │  Connection creds   │              ║  │  │  • Agent audit DB               │ │   ║
║  │  API keys           │◄─────────────╬──│  │                                 │ │   ║
║  └─────────────────────┘              ║  │  │  Secrets Manager (resolved)     │ │   ║
║                                       ║  │  └─────────────────────────────────┘ │   ║
║  OBSERVABILITY PLANE                  ║  └──────────────────────────────────────┘   ║
║                                       ║                                             ║
║  ┌─────────────────────┐              ║  ┌──────────────────────────────────────┐   ║
║  │  CloudWatch         │◄─────────────╬──│  DATA SOURCES & TARGETS              │   ║
║  │  Logs + Metrics     │              ║  │  (connected via VPC / PrivateLink)   │   ║
║  └─────────────────────┘              ║  │                                      │   ║
║  ┌─────────────────────┐              ║  │  SQL Server  Oracle  Postgres        │   ║
║  │  Prometheus +       │◄─────────────╬──│  Azure SQL MI  Mainframe SFTP        │   ║
║  │  Grafana            │              ║  │  S3  RabbitMQ  Kafka (MSK)           │   ║
║  └─────────────────────┘              ║  └──────────────────────────────────────┘   ║
║  ┌─────────────────────┐              ║                                             ║
║  │  Marquez            │◄─────────────╬──  OpenLineage events from job pods         ║
║  │  (Data Lineage)     │              ║                                             ║
║  └─────────────────────┘              ║                                             ║
╚═══════════════════════════════════════╩═════════════════════════════════════════════╝
```

---

## L3b — Multi-Cloud Portability Architecture

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                         CLOUD-AGNOSTIC PORTABILITY MODEL                             │
├──────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  100% PORTABLE (zero changes across clouds)                                          │
│  ████████████████████████████████████████████████████████████████████████████████   │
│                                                                                      │
│  ┌───────────────────────────────────────────────────────────────────────────────┐  │
│  │  YAML Job Configs  (jobs/*.yaml)  — pure data, no cloud references            │  │
│  └───────────────────────────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────────────────────────┐  │
│  │  Container Image  (etl-runner:v1.x.x)  — same image pushed to any registry        │  │
│  └───────────────────────────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────────────────────────┐  │
│  │  Framework Python Code  — zero cloud SDK references in framework/             │  │
│  └───────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                      │
│  90% PORTABLE (minor config change per cloud)                                        │
│  ██████████████████████████████████████████████████████████████████░░░░░░░░░░░░░░   │
│                                                                                      │
│  ┌───────────────────────────────────────────────────────────────────────────────┐  │
│  │  Airflow DAG Files  — change: registry URL + service account annotation only  │  │
│  └───────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                      │
│  CLOUD-SPECIFIC THIN LAYER (swap per environment)                                    │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   │
│                                                                                      │
│  AWS (Today)              GCP (Future)              On-Prem K8s (Option)            │
│  ─────────────────         ──────────────────        ─────────────────────          │
│  MWAA            ──►       Cloud Composer   ──►       Self-managed Airflow           │
│  EKS             ──►       GKE              ──►       OpenShift / vanilla K8s        │
│  ECR             ──►       Artifact Registry──►       Harbor registry                │
│  S3 (configs)    ──►       GCS              ──►       MinIO / NFS                    │
│  Secrets Manager ──►       Secret Manager   ──►       HashiCorp Vault                │
│  IAM + IRSA      ──►       Workload Identity──►       SPIFFE / cert-manager          │
│  CloudWatch      ──►       Cloud Monitoring ──►       Prometheus + Loki              │
│                                                                                      │
│  Cloud migration effort (when triggered):                                            │
│  YAML configs:   0 hours     │  Cloud infrastructure:  4–6 weeks to set up          │
│  Container image: 8 hours    │  Testing + cutover:     4–8 weeks                    │
│  DAG files:      40–80 hours │  TOTAL ESTIMATE:        3–4 months (not years)        │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Diagram — End-to-End Pipeline Execution

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                       END-TO-END DATA FLOW                                          │
│                  (Airflow trigger → data at target)                                 │
└─────────────────────────────────────────────────────────────────────────────────────┘

 1. TRIGGER
    Airflow Scheduler (MWAA)
    ├── reads DAG file from S3 (git-synced)
    └── fires KubernetesPodOperator task

 2. POD LAUNCH
    EKS control plane
    ├── pulls etl-runner:{version} from ECR (signed, policy-enforced)
    ├── injects IRSA service account (read S3, read Secrets Manager)
    └── starts pod in job-execution namespace

 3. CONFIG RESOLUTION
    etl-runner --config s3://etl-configs/jobs/load_dim_customer.yaml
    ├── Config Loader: downloads YAML from S3
    ├── JSON Schema Validator: validates against schema v{n}
    ├── Parameter Resolver:
    │   ├── watermarks: SELECT last_load FROM etl_watermarks WHERE key = 'dim_customer'
    │   └── secrets: AWS Secrets Manager → src_sqlserver_prod connection string
    └── Policy Enforcer: checks tier P1 SLA rules, PII handling requirements

 4. PLAN BUILD
    Execution Engine
    ├── builds DAG of nodes: [src_customers] → [filter_active] → [lookup_segment]
    │                                        → [derive_fields] → [apply_scd2] → [tgt_dim_customer]
    ├── selects backend: auto → pandas (rows < 10M) / spark (rows ≥ 10M)
    └── validates no cycles, all inputs resolved

 5. EXECUTION (pandas path shown)
    ├── src_customers.read()
    │   └── SQLServerConnector: execute query against src_sqlserver_prod
    │       WHERE updated_dt >= :last_run_dt
    │       → DataFrame (N rows × M columns)
    │
    ├── filter_active.apply(df)
    │   └── Filter: df[df['status'] == 'ACTIVE']
    │       → DataFrame (N' rows)
    │
    ├── lookup_segment.apply(df)
    │   └── Lookup: JOIN with ref_segments on segment_id
    │       (cache=static: loads full lookup table once at start)
    │       → DataFrame (N' rows + segment_code, segment_name)
    │
    ├── derive_fields.apply(df)
    │   └── Expression: compute full_name, email_domain, customer_tier, load_ts
    │       → DataFrame (N' rows + derived columns)
    │
    ├── apply_scd2.apply(df)
    │   └── SCD Type 2:
    │       ├── expire changed records (set effective_to, current_flg = 'N')
    │       ├── insert new versions (current_flg = 'Y')
    │       └── insert truly new records
    │       → DataFrame (M rows: expires + new inserts)
    │
    └── tgt_dim_customer.write(df)
        └── PostgresConnector: MERGE into dim_customer
            commit_interval = 10,000 rows

 6. POST-EXECUTION
    ├── Validation Engine: row_count_min, no_nulls(customer_id), unique_current_records
    ├── Watermark Manager: UPDATE etl_watermarks SET last_load = MAX(load_ts)
    ├── OpenLineage: emit dataset read/write events to Marquez
    ├── Prometheus: increment rows_processed, job_duration, job_success counters
    └── CloudWatch: structured log with run_id, job_name, rows_in, rows_out, duration_ms

 7. POD TERMINATION
    EKS: pod exits 0 (success) or non-zero (failure → Airflow retry logic)
    Airflow: marks task success/failure, triggers downstream dependencies
```

---

## Migration Agent Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                    MIGRATION AGENT — CONVERSION FLOW                                │
│                     Informatica XML → Production YAML                               │
└─────────────────────────────────────────────────────────────────────────────────────┘

INPUT:  m_LOAD_CUSTOMERS.xml (Informatica PowerCenter mapping export)
OUTPUT: load_dim_customer.yaml + daily_customer_load.py + tests + docs

 1. INGESTION
    ├── pmrep export or REST API pull
    ├── build artifact inventory: {id, type, owner, tier, last_modified}
    └── resolve dependency graph: workflow → sessions → mappings

 2. PARSING  [Deterministic]
    InformaticaXMLParser
    ├── parse <SOURCE> elements → IRSource objects
    ├── traverse CONNECTOR graph (topological walk)
    ├── parse each <TRANSFORMATION>:
    │   ├── SQ_CUSTOMERS   → IRSource (source_qualifier)
    │   ├── FIL_ACTIVE     → IRTransformation(type=filter)
    │   ├── LKP_SEGMENTS   → IRTransformation(type=lookup)
    │   ├── EXP_DERIVE     → IRTransformation(type=expression)
    │   │   ├── FULL_NAME  = CONCAT(FIRST_NAME, ' ', LAST_NAME)
    │   │   └── CUST_TIER  = IIF(SEG_CODE='PREM','GOLD',IIF(SEG_CODE='STD','SILVER','BRONZE'))
    │   └── UPD_STRATEGY   → IRTransformation(type=scd_type_2)
    └── serialize to ir.json (audit artifact)

 3. ANALYSIS  [AI-assisted — Claude API]
    ├── complexity_score = 3 (medium: 4 transforms, expression logic, SCD2)
    ├── pattern = "fact_dim_load_with_scd2"
    ├── risk_flags = ["expression_has_nested_iif", "scd2_natural_key_composite"]
    └── routing → auto_convert_with_review (not fully_manual)

 4. TRANSLATION  [Hybrid]
    For expression FULL_NAME = CONCAT(FIRST_NAME, ' ', LAST_NAME):
    ├── Lexer → AST: CONCAT(a, b, c)
    ├── Rule matcher: CONCAT(*) → recognized pattern
    └── Output (confidence 0.99): "first_name || ' ' || last_name"

    For expression CUST_TIER = IIF(SEG_CODE='PREM','GOLD',IIF(...)):
    ├── Lexer → AST: IIF(cond, true, IIF(cond2, true2, else))
    ├── Rule matcher: nested IIF → partially recognized
    ├── LLM fallback (RAG: retrieve 3 similar nested-IIF examples):
    │   Prompt: "Translate Informatica expression to SQL CASE WHEN..."
    │   Response: "CASE WHEN segment_code='PREM' THEN 'GOLD' WHEN..."
    └── Output (confidence 0.87): SQL CASE expression + human review flag

 5. GENERATION  [Deterministic]
    YAMLGenerator:
    ├── render jobs/load_dim_customer.yaml from IR + translations
    ├── validate against schema.json
    ├── render dags/daily_customer_load.py (Airflow DAG)
    ├── render tests/load_dim_customer_test.yaml (sample data + expected output)
    └── render docs/load_dim_customer.md (plain-language business summary)

 6. VALIDATION
    ├── Tier 1 (Syntactic): YAML parses ✓, DAG imports ✓
    ├── Tier 2 (Schema): all refs resolve ✓, connection names match ✓
    ├── Tier 3 (Unit): 12 test cases pass ✓
    ├── Tier 4 (Sample-run): 1,000-row sample → row count matches ✓
    └── Overall confidence: 0.91

 7. REVIEW PR
    PR created on GitHub:
    ├── Title: "Migrate: m_LOAD_CUSTOMERS → load_dim_customer (Confidence: 0.91)"
    ├── Business summary for SME: "This job loads the customer dimension daily..."
    ├── Reviewer question: "Expression CUST_TIER uses nested IIF — confirm CASE translation matches intent"
    ├── Validation results: ✓✓✓ (syntactic/schema/unit) ⚠ (nested IIF flagged)
    └── Reviewers: @data-eng-team @customer-domain-sme

OUTPUT FILES:
  migrations/wave1/load_dim_customer/
  ├── jobs/load_dim_customer.yaml        ← Framework runtime config
  ├── dags/daily_customer_load.py        ← Airflow DAG
  ├── tests/load_dim_customer_test.yaml  ← Validation test suite
  ├── docs/load_dim_customer.md          ← Business logic summary
  └── migration_metadata.json           ← Source ref, confidence, IR hash
```

---

## Network & Security Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                      NETWORK & SECURITY ARCHITECTURE                                │
└─────────────────────────────────────────────────────────────────────────────────────┘

  PUBLIC INTERNET
       │
       │  (no direct internet ingress to data plane)
       │
  ┌────▼──────────────────────────────────────────────────────────────────────────┐
  │  AWS VPC  (10.0.0.0/8)                                                        │
  │                                                                               │
  │  ┌────────────────────────────────────────────────────────────────────────┐   │
  │  │  Private Subnets (no public IP)                                        │   │
  │  │                                                                        │   │
  │  │  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────────┐   │   │
  │  │  │  MWAA Subnet     │  │  EKS Node Subnet │  │  RDS Subnet        │   │   │
  │  │  │  (scheduler,     │  │  (job pods)      │  │  (Postgres HA)     │   │   │
  │  │  │   workers)       │  │  NetworkPolicy:  │  │  sg: port 5432     │   │   │
  │  │  │                  │  │  deny-all default│  │  only from EKS     │   │   │
  │  │  │  sg: 443 → EKS   │  │  allow: → db     │  │  and MWAA SGs      │   │   │
  │  │  │  sg: 443 → Secs  │  │  allow: → s3 ep  │  └────────────────────┘   │   │
  │  │  └──────────────────┘  │  allow: → secs ep│                            │   │
  │  │                        └──────────────────┘                            │   │
  │  └────────────────────────────────────────────────────────────────────────┘   │
  │                                                                               │
  │  VPC Endpoints (no NAT for AWS services):                                     │
  │  • S3 Gateway endpoint        • ECR API + DKR endpoints                       │
  │  • Secrets Manager endpoint   • CloudWatch endpoint                           │
  │                                                                               │
  │  Transit Gateway → On-premise data centers                                    │
  │  PrivateLink → Azure SQL MI (cross-cloud via ExpressRoute)                    │
  └───────────────────────────────────────────────────────────────────────────────┘

  IDENTITY & ACCESS
  ─────────────────
  Job pods:   IRSA (IAM Role for Service Account)
              → S3 read (configs, staging)
              → Secrets Manager read (connections)
              → CloudWatch write (logs)
              → S3 write (outputs, lineage)

  Image policy: OPA Gatekeeper admission webhook
              → only ECR images with valid cosign signature run
              → image tag pinning required (no :latest in production)

  Secrets:    Zero credentials in YAML configs or DAGs
              All connections reference Secrets Manager path
              Rotation enforced every 90 days
```

---

## Pipeline Tier Model

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                         PIPELINE TIER CLASSIFICATION                             │
├──────────┬────────────────────────────────────────────────────────────────────────┤
│  Tier    │  Definition & Controls                                                 │
├──────────┼────────────────────────────────────────────────────────────────────────┤
│  P0      │  Regulatory / compliance pipelines                                     │
│  (Red)   │  SLA: 99.9% monthly uptime                                             │
│          │  RTO: 15 minutes   RPO: 0 (exactly-once)                               │
│          │  Requires: ARB + Security + DG sign-off for any change                 │
│          │  On-call: 24×7 PagerDuty with 5-min acknowledgement SLA               │
│          │  Examples: CALEA feeds, regulatory reporting, financial reconciliation  │
├──────────┼────────────────────────────────────────────────────────────────────────┤
│  P1      │  Business-critical pipelines                                            │
│  (Amber) │  SLA: 99.5% monthly uptime                                             │
│          │  RTO: 30 minutes   RPO: 1 run (at-least-once with reconciliation)      │
│          │  Requires: Engineering lead sign-off for changes                       │
│          │  On-call: business hours + escalation path for nights/weekends         │
│          │  Examples: customer dimension, revenue metrics, network topology         │
├──────────┼────────────────────────────────────────────────────────────────────────┤
│  P2      │  Important pipelines                                                    │
│  (Blue)  │  SLA: 99.0% monthly uptime                                             │
│          │  RTO: 2 hours   RPO: daily (re-runnable)                               │
│          │  Standard change management                                             │
│          │  On-call: business hours only                                          │
│          │  Examples: marketing aggregations, product inventory, promotion feeds   │
├──────────┼────────────────────────────────────────────────────────────────────────┤
│  P3      │  Non-critical / development pipelines                                  │
│  (Grey)  │  SLA: best-effort                                                      │
│          │  RTO: next business day   RPO: re-run from source                      │
│          │  Self-service change management                                         │
│          │  No on-call                                                             │
│          │  Examples: reporting snapshots, dev test pipelines, one-off extracts    │
└──────────┴────────────────────────────────────────────────────────────────────────┘
```

---

*Document prepared for Architecture Review Board.*
*ASCII diagrams are canonical — to be rendered as proper vector diagrams (Mermaid / draw.io / Lucidchart) before executive presentation.*
