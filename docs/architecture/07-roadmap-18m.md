# Generic ETL Engine — 18-Month Production Roadmap

**Document:** 07 of 8
**Audience:** Engineering Leadership, Product Management, Program Managers
**Version:** 1.0 | **Date:** 2026-05-14

---

## Roadmap Summary

```
Month:  0    1    2    3    4    5    6    7    8    9   10   11   12   13   14   15   16   17   18
        ├────┤────┤────┤────┤────┤────┤────┤────┤────┤────┤────┤────┤────┤────┤────┤────┤────┤────┤
Phase:  [──── Phase 0 ────][──────────── Phase 1 ──────────────][──── Phase 2 ────][── Phase 3 ──]
        Foundation          Enterprise-Ready Core               Scale & Quality     Self-Service
        [Foundation (M0-2)] [Enterprise Core (M2-8)]            [Scale (M8-14)]    [Self-Service M14-18]
```

| Phase | Months | Theme | Key Deliverable | Success Metric |
|---|---|---|---|---|
| **Phase 0** | 0–2 | Foundation | CI/CD, canonical names, real connectors | All existing tests green; PostgreSQL + SQL Server working |
| **Phase 1** | 2–8 | Enterprise Core | Security, observability, major transforms, Airflow | 50 pipelines running in production |
| **Phase 2** | 8–14 | Scale & Quality | Spark backend, K8s, data quality, SSIS parser | 300 pipelines; 10GB+ datasets processing |
| **Phase 3** | 14–18 | Self-Service | Migration automation, catalog, governance | 650+ pipelines; 80% agent-assisted migration |

---

## Phase 0 — Foundation (Months 0–2)

**Objective:** Make the POC production-quality without adding new features. Fix all known gaps.
**Team:** 2 engineers (1 senior + 1 mid)

### Milestones

| Milestone | Month | Deliverable |
|---|---|---|
| M0.1 | 0.5 | Canonical renames complete; all tests pass |
| M0.2 | 0.5 | CI/CD pipeline on GitHub Actions (test + lint + coverage) |
| M0.3 | 1.0 | CSV connector implemented; SCD Type 2 implemented |
| M0.4 | 1.5 | PostgreSQL connector + unit tests |
| M0.5 | 1.5 | SQL Server connector + unit tests |
| M0.6 | 2.0 | `stream_join` + `aggregate` transforms |
| M0.7 | 2.0 | Framework schema v2.0 (parameters, sources[], targets[]) |
| M0.8 | 2.0 | Integration test suite against real PostgreSQL in Docker |

### Sprint Plan

**Sprint 1 (Weeks 1–2): Rename + CI/CD**
```
Tasks:
  □ Rename filter→row_filter, expression→column_derive, lookup→lookup_enrich, csv_file→csv
  □ Update pyproject.toml entry-points, schema.json enum, test fixtures
  □ pip install -e . && make test (all 67 tests pass)
  □ GitHub Actions: pytest + ruff + coverage gate (80%)
  □ Docker Compose: PostgreSQL 15 for integration tests
```

**Sprint 2 (Weeks 3–4): Complete Stubs**
```
Tasks:
  □ CSV connector: pd.read_csv/to_csv with options (delimiter, encoding, skip_rows)
  □ SCD Type 2: implement algorithm from framework/CLAUDE.md
  □ Unskip SCD Type 2 tests; all pass
  □ Add CSV connector tests (read, write, append mode)
```

**Sprint 3 (Weeks 5–6): Enterprise Connectors**
```
Tasks:
  □ PostgreSQL connector: psycopg2 + SQLAlchemy, read/write, connection pooling
  □ SQL Server connector: pyodbc, fast_executemany, BCP bulk load option
  □ Integration tests for both (Docker Compose + real DB)
  □ Update pyproject.toml entry-points
```

**Sprint 4 (Weeks 7–8): Transforms + Schema v2**
```
Tasks:
  □ stream_join transform
  □ aggregate transform
  □ column_select transform
  □ row_sort transform
  □ Framework schema v2.0 (backward-compatible: source/sources, sink/targets)
  □ ParameterResolver: {{ parameters.X }} substitution
  □ Run all tests (framework + end-to-end)
```

### Phase 0 Exit Criteria
- [ ] 0 ruff violations
- [ ] Test coverage ≥ 85%
- [ ] PostgreSQL + SQL Server connectors tested against live DBs in CI
- [ ] All POC tests still pass
- [ ] Canonical rename complete (no old names in non-test code)
- [ ] GitHub Actions pipeline green on every PR

---

## Phase 1 — Enterprise Core (Months 2–8)

**Objective:** Production-ready security, observability, orchestration, and the migration agent
for the first 50 pipelines.
**Team:** 5 engineers (1 tech lead + 2 senior + 2 mid)

### Milestones

| Milestone | Month | Deliverable |
|---|---|---|
| M1.1 | 3.0 | Secrets management (Vault integration); no credentials in YAML |
| M1.2 | 3.5 | RBAC + audit logging (PostgreSQL-backed) |
| M1.3 | 4.0 | Prometheus metrics + Grafana dashboard |
| M1.4 | 4.5 | Airflow DAG generator; first 10 pipelines scheduled |
| M1.5 | 5.0 | Oracle connector; Azure SQL MI connector |
| M1.6 | 5.5 | S3 + ADLS connector (Parquet + CSV) |
| M1.7 | 6.0 | Framework v2.0 (watermark, control table, pre/post steps) |
| M1.8 | 7.0 | Production agent: Informatica parser + LangGraph (core nodes) |
| M1.9 | 7.5 | 50 pipelines migrated and running in production |
| M1.10 | 8.0 | Data quality framework (schema validation + row count assertions) |

### Sprint Plan

**Sprints 5–6 (Month 3): Secrets + Auth**
```
Tasks:
  □ SecretsResolver: kv://, ls://, msi:// reference formats
  □ HashiCorp Vault integration (VAULT_ADDR + VAULT_TOKEN)
  □ AWS Secrets Manager fallback
  □ Azure Key Vault (via DefaultAzureCredential)
  □ Pre-commit hook: block YAML with connection strings or passwords
  □ CI secret-scanning gate (gitleaks or trufflehog)
  □ OAuth2/OIDC integration (Azure AD) for API Gateway
  □ RBAC: job-level permissions (read_config, execute_job, admin)
  □ Audit log: every execution writes to PostgreSQL audit_events table
```

**Sprints 7–8 (Month 4): Observability**
```
Tasks:
  □ Prometheus client: etl_job_rows_total, etl_job_duration_seconds, etl_job_errors_total
  □ OpenTelemetry traces: span per execution stage (source/transform/sink)
  □ Structured JSON logging: job_id, run_id, stage, connector_type, row_count
  □ Grafana dashboard: job success rate, throughput, error rate, duration P50/P99
  □ Alerting: PagerDuty for P0 job failures; Slack for P1/P2
  □ Data lineage events: OpenLineage facets on each run
```

**Sprints 9–10 (Month 5): Orchestration + Connectors**
```
Tasks:
  □ Airflow DAG generator: IR → Python DAG via ast module
  □ Kubernetes executor config for Airflow
  □ Oracle connector (oracledb thin mode, no client install)
  □ Azure SQL MI connector (MSI auth + pyodbc)
  □ Azure SQL Database connector
  □ Snowflake connector (snowflake-connector-python)
  □ Deploy first 10 pipelines to Airflow (manual validation)
```

**Sprints 11–12 (Month 6): Cloud Storage + Framework v2**
```
Tasks:
  □ S3 connector: boto3, Parquet/CSV read/write, partitioned write
  □ ADLS Gen2 connector: azure-storage-blob + azure-identity
  □ Framework v2.0 engine: watermark, control table, pre/post steps
  □ ControlTableExecutor + WatermarkManager
  □ runner.py --param flag for runtime parameter injection
  □ 20 additional pipelines migrated
```

**Sprints 13–16 (Months 7–8): Production Agent + Data Quality**
```
Tasks:
  □ agent/state.py AgentState TypedDict
  □ LangGraph graph (parse → analyze → translate → generate → validate → gate)
  □ Production Informatica parser (agent/agents/parser/informatica.py)
  □ Complexity assessor (heuristic + Haiku SQL classifier)
  □ Rules agent (60+ Informatica rules, 40+ ADF rules)
  □ LLM translator (Haiku → Sonnet → manual, pgvector RAG)
  □ Tier 1–4 validation (YAML syntax → schema → pytest → row count)
  □ PR generator (GitHub API + Sonnet body)
  □ Data quality transforms: data_validate, row_deduplicate, mask_pii
  □ 50 total pipelines in production ← Phase 1 success gate
```

### Phase 1 Exit Criteria
- [ ] Zero credentials in any YAML config (secrets scanner CI gate)
- [ ] Every job execution written to audit log
- [ ] Prometheus metrics scraped; Grafana dashboard live
- [ ] 50 pipelines running in Airflow with success rate ≥ 99%
- [ ] Agent converts Informatica XML with ≥ 70% automatic rate
- [ ] Tier 1–3 validation passing on all generated YAMLs
- [ ] Oracle + SQL Server + PostgreSQL + S3 + ADLS connectors in production

---

## Phase 2 — Scale & Quality (Months 8–14)

**Objective:** Handle large-scale data (10GB+), complete the transform library, migrate 300 pipelines.
**Team:** 7 engineers (1 tech lead + 2 senior + 3 mid + 1 SRE)

### Milestones

| Milestone | Month | Deliverable |
|---|---|---|
| M2.1 | 9.0 | Ray execution backend (5–50GB datasets) |
| M2.2 | 10.0 | Kubernetes deployment (Helm chart + EKS cluster) |
| M2.3 | 10.5 | SSIS .dtsx parser |
| M2.4 | 11.0 | Complete transform library (20 canonical types) |
| M2.5 | 12.0 | Apache Spark backend (50GB+ datasets) |
| M2.6 | 12.5 | Data quality framework (DQ checks, Great Expectations integration) |
| M2.7 | 13.0 | 300 pipelines migrated and running |
| M2.8 | 14.0 | Performance benchmarks: 100M rows in < 10 min on Spark |

### Sprint Plan

**Sprints 17–20 (Months 9–10): Ray Backend + K8s**
```
Tasks:
  □ ExecutionBackend ABC (backends/base.py)
  □ Ray backend: ray.data pipeline; auto-partition by rows
  □ Kubernetes Helm chart (control plane + worker node pool)
  □ Job-level resource quotas (CPU/memory limits from YAML)
  □ Autoscaler: KEDA for job queue depth
  □ Multi-tenant namespace isolation
  □ Remaining transforms: union_all, route_split, scd_type_1, row_deduplicate
```

**Sprints 21–24 (Months 11–12): SSIS + Spark**
```
Tasks:
  □ SSIS parser: SSIS_COMPONENT_MAP (25 types), .dtsx XML, bracket columns
  □ SSIS expression translator (30+ rules, DT_I4 cast, component params)
  □ Spark backend: PySpark DataFrame, EMR/Dataproc connector
  □ Connectors: Excel (openpyxl), fixed-width (pd.read_fwf, EBCDIC)
  □ Remaining transforms: data_convert, sequence_generate, rank, window_fn, pivot, unpivot, flatten_json, mask_pii, python_fn
  □ 200 additional pipelines migrated (300 total)
```

**Sprints 25–28 (Months 13–14): Data Quality + Performance**
```
Tasks:
  □ Great Expectations integration (data_validate transform wraps GE suites)
  □ Schema inference on read (auto-detect column types)
  □ Row count reconciliation (source count vs sink count assertion)
  □ Column-level lineage tracking (OpenLineage column-level facets)
  □ Performance benchmarks and tuning (SQLAlchemy bulk insert, Arrow I/O)
  □ Remaining connectors: MySQL, Kafka, SFTP, HTTP API
  □ pgvector RAG: few-shot translation library (1000+ example pairs)
```

### Phase 2 Exit Criteria
- [ ] 300 pipelines in production; average daily run success ≥ 99.5%
- [ ] 10GB dataset processed in < 5 minutes on Ray backend
- [ ] 100GB dataset processed in < 15 minutes on Spark backend
- [ ] All 20 canonical transforms implemented and tested
- [ ] SSIS parser handling ≥ 60% of .dtsx files automatically
- [ ] Great Expectations DQ checks running on P0/P1 pipelines

---

## Phase 3 — Self-Service & Governance (Months 14–18)

**Objective:** 80% migration automation rate, self-service portal, complete governance.
**Team:** 8 engineers (1 architect + 1 tech lead + 2 senior + 3 mid + 1 SRE)

### Milestones

| Milestone | Month | Deliverable |
|---|---|---|
| M3.1 | 15.0 | Self-service migration portal (web UI) |
| M3.2 | 15.5 | Human-in-the-loop gates (LangGraph interrupt + Slack) |
| M3.3 | 16.0 | Data catalog integration (Apache Atlas or AWS Glue) |
| M3.4 | 16.5 | 500 pipelines migrated |
| M3.5 | 17.0 | Plugin SDK published (pip-installable third-party extensions) |
| M3.6 | 17.5 | 650+ pipelines migrated (target: all 700) |
| M3.7 | 18.0 | Informatica PowerCenter fully decommissioned |
| M3.8 | 18.0 | ADF partially decommissioned (keep only real-time triggers) |

### Sprint Plan

**Sprints 29–32 (Months 15–16): Portal + Gates + Catalog**
```
Tasks:
  □ Migration portal: React UI showing pipeline status, complexity scores, YAML previews
  □ Human-in-the-loop: LangGraph interrupt_before gate + Slack notification
  □ Batch expand command: control table rows → N individual job YAMLs
  □ Apache Atlas / AWS Glue connector: auto-register datasets on first run
  □ Column-level lineage in catalog from OpenLineage events
  □ Impact analysis: "which jobs read from table X?" query
  □ 200 additional pipelines migrated (500 total)
```

**Sprints 33–36 (Months 17–18): SDK + Final Migration + Decommission**
```
Tasks:
  □ Plugin SDK: pyproject.toml template, cookiecutter scaffold, docs site
  □ Publish sdk.generic-etl.io documentation
  □ Validation tier 5: shadow run for P0 pipelines (parallel shadow + reconciliation)
  □ Final 150 pipelines migrated (650+ total)
  □ Informatica decommission checklist: dependency analysis, sign-off gates, runbook
  □ ADF decommission: keep event-trigger pipelines only; migrate batch
  □ Final cost audit: confirm $2M/year target achieved
  □ Handover to operations team: runbooks, on-call rotation, escalation paths
```

### Phase 3 Exit Criteria
- [ ] 650+ pipelines running on new platform (≥ 93% of estate)
- [ ] 80% of migrations completed automatically (agent-only, no human edits)
- [ ] Informatica PowerCenter license cancelled (saves $4M+/year)
- [ ] ADF batch pipelines decommissioned (saves $1.5M/year)
- [ ] Self-service portal operational for ETL team
- [ ] Plugin SDK published with at least 2 third-party connectors

---

## Team Structure

### Recommended Team Composition

| Role | Count | Responsibilities |
|---|---|---|
| **Principal Architect** | 1 | Architecture decisions, ADRs, cross-phase planning |
| **Tech Lead — Framework** | 1 | Framework engine, connectors, transforms |
| **Tech Lead — Agent** | 1 | LangGraph, parsers, expression engine, LLM integration |
| **Senior Backend Engineer** | 2 | Enterprise connectors, execution backends |
| **Backend Engineer** | 3 | Transforms, data quality, observability |
| **SRE / Platform Engineer** | 1 | K8s, CI/CD, monitoring, on-call |
| **Data Engineer (Migration)** | 2 | Pipeline-by-pipeline migration, testing |
| **Product Manager** | 1 | Stakeholder alignment, priority |

**Total: 12 people across Phase 1–3** (Phase 0: 2 engineers)

### Estimated Annual Team Cost
```
Principal Architect:     $250K
2x Tech Lead:            $400K
2x Senior Backend:       $360K
3x Backend Engineer:     $450K
1x SRE:                  $200K
2x Data Engineer:        $280K
1x Product Manager:      $200K
────────────────────────────────
Total (loaded 1.3x):     ~$2.8M/year
```

---

## Risk Register

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Informatica parsing accuracy < 70% | Medium | High | Manual review backlog; LLM Tier 3 fallback; SSIS parser in Phase 2 |
| Large dataset performance (>10GB) | Medium | High | Ray backend in Phase 2; Spark in Phase 2.5 |
| Enterprise security audit failure | Low | Critical | Early Vault integration (Phase 1); pen-test in Phase 2 |
| Airflow operational complexity | Medium | Medium | Managed Airflow (MWAA/Composer); dedicated SRE |
| Key engineer attrition | Medium | High | Documentation-first culture; pair programming; prompt libraries |
| Scope creep (more transforms needed) | High | Medium | Plugin SDK enables community contributions; backlog groomed monthly |
| ADF export format changes | Low | Medium | Parser version detection; test matrix against each ADF API version |
| Regulatory data residency requirements | Medium | High | Region-per-cluster K8s deployment; data-at-rest encryption |
| Budget overrun | Low | High | Phase gates with CFO approval; open-source first; cloud spot instances |
| Legacy pipeline has undocumented behavior | High | Medium | Shadow run validation (Phase 3); business user sign-off gates |

---

## Success Metrics by Phase

| Metric | Phase 0 Target | Phase 1 Target | Phase 2 Target | Phase 3 Target |
|---|---|---|---|---|
| Pipelines in production | 0 | 50 | 300 | 650+ |
| Agent auto-conversion rate | N/A | 70% (Informatica) | 70% (+ ADF/SSIS) | 80% overall |
| Job success rate (daily) | N/A | ≥ 99% | ≥ 99.5% | ≥ 99.9% |
| Mean time to onboard new connector | 1–2 weeks | 1–2 days | < 1 day | < 4 hours |
| Annual licensing cost saved | $0 | $0 | $2M | $6M+ |
| Test coverage | 85% | 88% | 90% | 90% |
| P0 pipeline MTTR | N/A | < 30 min | < 15 min | < 10 min |
| Dataset throughput (max tested) | 500MB | 2GB | 100GB | 1TB (Spark) |

---

## Dependencies & Procurement

### Infrastructure Required (Phase 1+)

| Item | Purpose | Cost/Month | Procurement |
|---|---|---|---|
| AWS EKS cluster (3 nodes, c5.4xlarge) | Worker execution | ~$2,500 | AWS Enterprise |
| AWS RDS PostgreSQL (db.r6g.xlarge) | Audit log, pgvector | ~$500 | AWS Enterprise |
| HashiCorp Vault (HCP) | Secrets management | ~$500 | HashiCorp |
| AWS MSK (Kafka, 3 brokers) | Streaming (Phase 2) | ~$800 | AWS Enterprise |
| Grafana Cloud | Dashboards + alerting | ~$300 | Grafana Labs |
| GitHub Enterprise | Source control + Actions | ~$1,000 | GitHub |

**Total infrastructure: ~$5,600/month (~$67K/year)**

### Open-Source Components (zero license cost)
- Apache Airflow 2.x (KubernetesExecutor)
- Prometheus + Grafana (self-hosted or Grafana Cloud)
- Apache Spark 3.x (EMR or Dataproc on-demand)
- Ray 2.x (open-source)
- OpenLineage (open-source)
- Apache Atlas (if self-hosted) or AWS Glue Data Catalog

---

## Next 30-Day Action Plan

1. **Week 1:** Assign Phase 0 team (2 engineers); set up GitHub repo structure; create Phase 0 sprint board
2. **Week 2:** Complete canonical renames (Session F0); set up GitHub Actions CI/CD
3. **Week 3:** Implement CSV + SCD Type 2 (Sessions C1, F3); PostgreSQL connector (Session C3)
4. **Week 4:** SQL Server connector (C4); schema v2.0 (FW-V2a); ParameterResolver (FW-V2b)
5. **Month 2:** Complete Framework v2.0 (FW-V2c through FW-V2f); stream_join + aggregate
6. **End of Month 2:** Phase 0 gate review → kick off Phase 1 team hiring
