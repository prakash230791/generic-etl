# Enterprise ETL Modernization — Architecture Diagrams

**Document Type:** Architecture Diagrams (L0 → L3)
**Version:** 2.0
**Date:** 2026-05-11
**Classification:** Internal — Architecture Review

---

## L0 — Business Context

What the program replaces, who it serves, and the financial outcome.

```mermaid
flowchart TB
    subgraph LEGACY["🔴 Legacy Estate — $8M/yr"]
        direction LR
        IPC["Informatica PowerCenter\n~450 pipelines\n$6.9M/yr TCO\n⚠ Support ended Mar 2026"]
        ADF["Azure Data Factory\n~250 pipelines\n$1.1M/yr TCO\n⚠ Frozen — moving to Fabric"]
    end

    subgraph ACTORS["Actors"]
        direction TB
        ENG["ETL Engineers"]
        SME["Business SMEs"]
        OPS["Platform / Ops Team"]
        EXEC["Executive Sponsor"]
    end

    subgraph PLATFORM["🟢 Modern Platform — $2M/yr"]
        direction LR
        FW["Generic ETL Framework\nContainer-based · YAML-driven\nAWS today · GCP/On-prem tomorrow"]
        AGENT["Migration Agent\nAI-assisted converter\nInformatica XML → YAML\nADF JSON → YAML"]
    end

    subgraph OUTCOME["Program Outcome"]
        direction LR
        S1["75% cost reduction\n$6M/yr saved"]
        S2["700 pipelines migrated\nin 14 months"]
        S3["Full platform ownership\nZero vendor licensing"]
    end

    IPC -- "AI-assisted migration" --> AGENT
    ADF -- "AI-assisted migration" --> AGENT
    AGENT -- "generates YAML configs" --> FW
    ACTORS --> PLATFORM
    PLATFORM --> OUTCOME

    style LEGACY fill:#4a1010,stroke:#c0392b,color:#fff
    style PLATFORM fill:#0d3b2e,stroke:#27ae60,color:#fff
    style OUTCOME fill:#1a2a4a,stroke:#2e86c1,color:#fff
    style ACTORS fill:#2c2c2c,stroke:#7f8c8d,color:#fff
```

---

## L1 — System Context

The full platform in context — all external systems it interacts with.

```mermaid
flowchart TB
    subgraph SOURCES["Data Sources"]
        direction LR
        SQLS["SQL Server"]
        ORA["Oracle"]
        AZS["Azure SQL MI"]
        PG["PostgreSQL"]
        MF["Mainframe\nSFTP / EBCDIC"]
        S3["S3 / GCS / ADLS"]
        RMQ["RabbitMQ / Kafka"]
    end

    subgraph PLATFORM["Generic ETL Platform"]
        direction TB
        subgraph AGENT_BOX["Migration Agent (build-time)"]
            PARSER["Parsers\nInformatica · ADF"]
            IR["Intermediate\nRepresentation"]
            GEN["Generators\nYAML · DAG · Tests"]
            PARSER --> IR --> GEN
        end

        subgraph FW_BOX["ETL Framework (runtime)"]
            CLI["etl-runner CLI"]
            ENGINE["Execution Engine\npandas · Spark · dbt"]
            CONN["Connector Registry\n10+ connectors"]
            XFORM["Transform Registry\n15+ transforms"]
            CLI --> ENGINE
            ENGINE --> CONN
            ENGINE --> XFORM
        end

        GEN -- "YAML configs" --> CLI
    end

    subgraph ORCHESTRATION["Orchestration"]
        AIRFLOW["Apache Airflow\nMWAA on AWS"]
    end

    subgraph OBS["Observability"]
        PROM["Prometheus\n+ Grafana"]
        OTL["OpenTelemetry\nTracing"]
        OL["OpenLineage\nMarquez"]
        CW["CloudWatch\nSIEM"]
    end

    subgraph SEC["Security"]
        SM["Secrets Manager\n/ Vault"]
        ECR["ECR\nsigned images"]
        IAM["IRSA\nWorkload Identity"]
    end

    subgraph TARGETS["Data Targets"]
        direction LR
        PG2["PostgreSQL\nDW"]
        SNFL["Snowflake"]
        S3T["S3 / Data Lake"]
        AZT["Azure SQL MI"]
    end

    SOURCES --> FW_BOX
    AIRFLOW -- "KubernetesPodOperator" --> FW_BOX
    FW_BOX --> TARGETS
    FW_BOX --> OBS
    SEC --> FW_BOX

    style PLATFORM fill:#0d1b2a,stroke:#2e86c1,color:#fff
    style AGENT_BOX fill:#1a2a1a,stroke:#27ae60,color:#ddd
    style FW_BOX fill:#1a1a2a,stroke:#8e44ad,color:#ddd
    style ORCHESTRATION fill:#2a1a0a,stroke:#e67e22,color:#ddd
    style OBS fill:#1a2a2a,stroke:#1abc9c,color:#ddd
    style SEC fill:#2a1a1a,stroke:#e74c3c,color:#ddd
```

---

## L2a — Generic ETL Framework (Component Architecture)

```mermaid
flowchart TB
    CLI["🖥️ CLI — etl-runner\n--config path --dry-run --validate --tier"]

    subgraph CONFIG["Config Layer"]
        direction LR
        LOADER["Config Loader\ns3:// · gs:// · file://"]
        SCHEMA["JSON Schema\nValidator v1, v2..."]
        RESOLVER["Parameter Resolver\nwatermarks · secrets · vars"]
        POLICY["Policy Enforcer\ntier rules · PII · governance"]
        LOADER --> SCHEMA --> RESOLVER --> POLICY
    end

    subgraph ENGINE["Execution Engine"]
        direction LR
        PLAN["Plan Builder\nDAG of nodes"]
        BACKEND["Backend Selector\nauto · pandas · spark · dbt"]
        EXEC["Executor\ntopological order"]
        PLAN --> BACKEND --> EXEC
    end

    subgraph CONNECTORS["Connector Registry  [plugin: entry-points]"]
        direction LR
        C1["sqlserver"]
        C2["postgres"]
        C3["oracle"]
        C4["s3"]
        C5["azure_sql_mi"]
        C6["mainframe_sftp"]
        C7["kafka"]
        C8["csv_file · parquet"]
    end

    subgraph TRANSFORMS["Transformation Registry  [plugin: entry-points]"]
        direction LR
        T1["filter"]
        T2["expression"]
        T3["lookup"]
        T4["joiner"]
        T5["aggregator"]
        T6["scd_type_2"]
        T7["router · union"]
        T8["mask_pii · validate"]
    end

    subgraph CROSSCUT["Cross-Cutting Services"]
        direction LR
        LOG["Structured\nLogging"]
        MET["Prometheus\nMetrics"]
        TRC["OpenTelemetry\nTracing"]
        LIN["OpenLineage\nEmitter"]
        WM["Watermark\nManager"]
        CB["Circuit\nBreaker"]
        SIEM["SIEM\nAudit Logger"]
    end

    CLI --> CONFIG
    CONFIG --> ENGINE
    ENGINE --> CONNECTORS
    ENGINE --> TRANSFORMS
    ENGINE --> CROSSCUT

    style CONFIG fill:#1a2a3a,stroke:#2e86c1,color:#fff
    style ENGINE fill:#1a3a2a,stroke:#27ae60,color:#fff
    style CONNECTORS fill:#2a1a3a,stroke:#8e44ad,color:#fff
    style TRANSFORMS fill:#3a2a1a,stroke:#e67e22,color:#fff
    style CROSSCUT fill:#2a2a2a,stroke:#7f8c8d,color:#fff
```

---

## L3 — AWS Deployment Architecture

```mermaid
flowchart TB
    subgraph DEV["Developer Plane"]
        direction LR
        IDE["IDE\n+ Git"] --> GH["GitHub\nRepository"]
        GH --> CI["GitHub Actions\nCI/CD Pipeline"]
    end

    subgraph CI_STEPS["CI/CD Steps"]
        direction LR
        LINT["lint · typecheck\nunit tests · SAST"]
        BUILD["docker build\ncosign sign"]
        PUSH["push to ECR\n(signed images only)"]
        SYNC["sync YAML configs\nto S3"]
        LINT --> BUILD --> PUSH
        BUILD --> SYNC
    end

    subgraph AWS["AWS Account — us-east-1"]
        subgraph VPC["VPC — Private Subnets Only"]
            subgraph CTRL["Control Plane"]
                ECR_R["ECR\nContainer Registry\nsigned images"]
                S3_C["S3\netl-configs/\nYAML job configs"]
                SM_R["Secrets Manager\nconnection credentials"]
            end

            subgraph ORCH["Orchestration"]
                MWAA["Amazon MWAA\nAirflow Scheduler\n+ Workers\nDAGs from S3"]
            end

            subgraph DATA["Data Plane — EKS Cluster"]
                subgraph JOBS["Job Execution Namespace"]
                    POD1["ETL Pod\nm5.2xlarge\nspot fleet"]
                    POD2["ETL Pod"]
                    POD3["ETL Pod"]
                end
                subgraph SPARK_NS["Spark Namespace"]
                    SDRV["Spark Driver\nr5.4xlarge"]
                    SEXE["Spark Executors ×N\nr5.4xlarge spot"]
                    SDRV --> SEXE
                end
            end

            subgraph DB["Persistence"]
                RDS["RDS PostgreSQL\nMulti-AZ\nAirflow metadata\nWatermark registry\nAgent audit DB"]
                S3L["S3\nlogs · lineage\nstaging · audit"]
            end
        end

        subgraph OBS_AWS["Observability"]
            CW["CloudWatch\nLogs + Metrics"]
            AMP["Amazon Managed\nPrometheus"]
            GRAF["Grafana\nDashboards"]
            XRAY["AWS X-Ray\nTracing"]
            AMP --> GRAF
        end
    end

    subgraph DATASYS["Data Sources & Targets"]
        direction LR
        SS["SQL Server"]
        PGD["PostgreSQL"]
        OD["Oracle"]
        MFD["Mainframe\nSFTP"]
        S3D["S3\nData Lake"]
    end

    CI --> CI_STEPS
    CI_STEPS --> ECR_R
    CI_STEPS --> S3_C
    S3_C --> MWAA
    MWAA -- "KubernetesPodOperator" --> JOBS
    ECR_R --> JOBS
    ECR_R --> SDRV
    SM_R --> JOBS
    S3_C --> JOBS
    JOBS --> RDS
    JOBS --> S3L
    JOBS --> CW
    JOBS --> AMP
    JOBS --> XRAY
    JOBS <--> DATASYS

    style AWS fill:#0d1b2a,stroke:#f39c12,color:#fff
    style VPC fill:#0a1520,stroke:#2e86c1,color:#ddd
    style DATA fill:#0d2a1a,stroke:#27ae60,color:#ddd
    style OBS_AWS fill:#1a2a2a,stroke:#1abc9c,color:#ddd
    style DATASYS fill:#1a1a2a,stroke:#8e44ad,color:#ddd
```

---

## L3b — Multi-Cloud Portability

```mermaid
flowchart LR
    subgraph PORTABLE["100% Portable — Zero Changes"]
        direction TB
        YAML["📄 YAML Job Configs\njobs/*.yaml"]
        IMG["🐳 Container Image\netl-runner:v1.x.x"]
        CODE["🐍 Framework Python Code\nno cloud SDK references"]
    end

    subgraph NEARPORT["~90% Portable — Minor Config Change"]
        DAG["✈️ Airflow DAG Files\nchange: registry URL +\nservice account annotation only"]
    end

    subgraph THIN["Cloud-Specific Thin Layer"]
        direction TB
        subgraph AWS_L["AWS (Today)"]
            direction TB
            A1["MWAA"]
            A2["EKS"]
            A3["ECR"]
            A4["S3"]
            A5["Secrets Manager"]
            A6["CloudWatch"]
        end
        subgraph GCP_L["GCP (Future)"]
            direction TB
            G1["Cloud Composer"]
            G2["GKE"]
            G3["Artifact Registry"]
            G4["GCS"]
            G5["Secret Manager"]
            G6["Cloud Monitoring"]
        end
        subgraph ONP_L["On-Prem K8s (Option)"]
            direction TB
            O1["Self-managed\nAirflow"]
            O2["OpenShift /\nvanilla K8s"]
            O3["Harbor\nRegistry"]
            O4["MinIO / NFS"]
            O5["HashiCorp\nVault"]
            O6["Prometheus\n+ Loki"]
        end
    end

    PORTABLE --> NEARPORT --> THIN

    A1 -.->|"→"| G1
    A2 -.->|"→"| G2
    A3 -.->|"→"| G3
    A4 -.->|"→"| G4
    A5 -.->|"→"| G5
    A6 -.->|"→"| G6

    style PORTABLE fill:#0d3b2e,stroke:#27ae60,color:#fff
    style NEARPORT fill:#2a2a0d,stroke:#f1c40f,color:#fff
    style THIN fill:#1a1a1a,stroke:#7f8c8d,color:#ddd
    style AWS_L fill:#1a2a1a,stroke:#f39c12,color:#ddd
    style GCP_L fill:#1a1a2a,stroke:#4285f4,color:#ddd
    style ONP_L fill:#2a1a1a,stroke:#e74c3c,color:#ddd
```

---

## Data Flow — End-to-End Pipeline Execution

```mermaid
sequenceDiagram
    autonumber
    actor Airflow
    participant EKS
    participant Runner as etl-runner
    participant Secrets as Secrets Manager
    participant S3Config as S3 (configs)
    participant S3Data as S3 / Database
    participant Watermarks as Watermark DB
    participant Observability

    Airflow->>EKS: KubernetesPodOperator — submit pod
    EKS->>Runner: pull signed image from ECR, start container

    Runner->>S3Config: load YAML config
    Runner->>Runner: validate against JSON Schema
    Runner->>Secrets: resolve connection credentials
    Runner->>Watermarks: read last_run_dt watermark
    Runner->>Runner: build execution plan (DAG of nodes)
    Runner->>Observability: emit job_start event (OpenLineage)

    loop For each Source → Transform → Sink node
        Runner->>S3Data: connector.read() — parameterised query
        S3Data-->>Runner: DataFrame (N rows)
        Runner->>Runner: apply transformations in order
        Note over Runner: filter → lookup → expression → scd_type_2
        Runner->>S3Data: connector.write() — load strategy
    end

    Runner->>Runner: run post-execution validations
    alt Validations pass
        Runner->>Watermarks: update watermark (atomic)
        Runner->>Observability: emit job_success, rows_out, duration
        Runner->>EKS: exit 0
        EKS->>Airflow: task SUCCESS
    else Validations fail
        Runner->>Observability: emit job_failure, error details
        Runner->>EKS: exit 1
        EKS->>Airflow: task FAILED → retry / alert
    end
```

---

## Pipeline Tier SLA Model

```mermaid
quadrantChart
    title Pipeline Tier Classification
    x-axis Low Business Impact --> High Business Impact
    y-axis Low Failure Risk --> High Failure Risk
    quadrant-1 P0 — Regulatory
    quadrant-2 P1 — Business Critical
    quadrant-3 P3 — Dev / Best Effort
    quadrant-4 P2 — Important

    P0 Regulatory Feeds: [0.9, 0.95]
    P0 Financial Reconciliation: [0.85, 0.9]
    P1 Customer Dimension: [0.8, 0.7]
    P1 Revenue Metrics: [0.75, 0.75]
    P2 Marketing Aggregations: [0.55, 0.45]
    P2 Product Inventory: [0.5, 0.4]
    P3 Reporting Snapshots: [0.2, 0.15]
    P3 Dev Test Pipelines: [0.1, 0.1]
```

---

## Technology Stack

```mermaid
graph LR
    subgraph OWNED["Enterprise-Owned IP"]
        direction TB
        FWR["Generic ETL Framework\nPython 3.11+"]
        AGNT["Migration Agent\nPython + LangGraph"]
        YAMLSCH["YAML Job Schema\nVersioned JSON Schema"]
    end

    subgraph ADOPTED["Adopted Open Source  — Apache 2.0"]
        direction TB
        AF["Apache Airflow\nOrchestration"]
        PD["pandas\nSmall-data backend"]
        SP["Apache Spark\nLarge-data backend"]
        DBT["dbt Core\nSQL transforms"]
        K8["Kubernetes\nContainer platform"]
        OL["OpenLineage\nData lineage"]
        PROM["Prometheus + Grafana\nMetrics"]
        OT["OpenTelemetry\nTracing"]
        DBZ["Debezium + Kafka\nCDC / streaming"]
        COB["Cobrix\nMainframe EBCDIC"]
    end

    subgraph CLOUD["Cloud Services  — thin layer"]
        direction TB
        MWAA["MWAA\nManaged Airflow"]
        EKS2["EKS\nManaged K8s"]
        ECR2["ECR\nContainer registry"]
        ASM["Secrets Manager\nCredentials"]
    end

    subgraph AI["AI Layer"]
        direction TB
        CLAUDE["Claude API\nExpression translation\n+ analysis"]
        PGVEC["pgvector\nRAG vector store"]
        LG["LangGraph\nState machine"]
    end

    AGNT --> CLAUDE
    AGNT --> PGVEC
    AGNT --> LG
    FWR --> PD
    FWR --> SP
    FWR --> DBT
    FWR --> AF
    AF --> MWAA
    FWR --> K8
    K8 --> EKS2
    FWR --> OL
    FWR --> PROM
    FWR --> OT

    style OWNED fill:#0d3b2e,stroke:#27ae60,color:#fff
    style ADOPTED fill:#0d1b2a,stroke:#2e86c1,color:#fff
    style CLOUD fill:#2a1a0a,stroke:#f39c12,color:#fff
    style AI fill:#1a0d2a,stroke:#8e44ad,color:#fff
```

---

*All diagrams are written in Mermaid and render natively in GitHub, GitLab, Notion, and most modern documentation systems.*
*For the migration agent deep-dive (agent taxonomy, heterogeneous coordination, LangGraph design) see [`migration-agent-architecture.md`](./migration-agent-architecture.md).*
*For stakeholder presentations use the companion [`executive-presentation.tsx`](./executive-presentation.tsx).*
