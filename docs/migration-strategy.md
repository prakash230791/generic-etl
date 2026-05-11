# Migration Strategy — Informatica PowerCenter to Custom ETL Framework

## Business Case

| Metric | Current State | Target State |
|---|---|---|
| ETL platforms | Informatica PowerCenter + Azure Data Factory | Custom open-source framework on AWS |
| Annual cost | $8M/year (licences + infrastructure) | $2M/year (infrastructure only) |
| Savings | — | **$6M/year (75% reduction)** |
| Timeline | — | 18 months |
| Pipeline count | ~700 (Informatica + ADF) | All migrated to framework YAML |

---

## Migration Approach

### Guiding Principles

1. **Automated first, manual fallback** — the migration agent converts as many pipelines as possible automatically. Only truly complex mappings require manual intervention.
2. **Validate before cut-over** — every migrated pipeline runs in parallel with the source system and row counts / checksums are reconciled before the Informatica version is retired.
3. **Risk-stratified sequencing** — migrate simple pipelines first to build confidence; complex SCD Type 2 and multi-source pipelines last.
4. **Framework is source-agnostic** — the same runtime executes pipelines regardless of origin (Informatica, ADF, hand-written YAML).

---

## Phased Rollout Plan

### Phase 0 — POC (Months 1–2)
**Goal:** Prove the complete technical flow end-to-end on a minimal representative mapping.

- Scope: 1 sample mapping (`m_LOAD_CUSTOMERS`) covering filter, lookup, expression
- Source/Target: SQLite (no real databases)
- Execution: pandas (single-node, local)
- Validation: Output rows match `expected_output.csv`
- Exit criteria: `make demo` runs clean; all tests pass

**Status: Complete.**

---

### Phase 1 — Foundation (Months 2–4)
**Goal:** Production-grade framework runtime; migrate 20 simple pipelines.

- Replace SQLite with production connectors (PostgreSQL, Oracle, Snowflake)
- Replace pandas with Apache Spark on AWS EMR
- Containerise runner (Docker → EKS)
- Implement Airflow DAG template for scheduling
- Migrate 20 pipelines: filter + expression only (no lookups, no SCD)
- Parallel validation: run Informatica and framework side-by-side, reconcile row counts
- Exit criteria: 20 pipelines in production, zero data quality incidents for 30 days

---

### Phase 2 — Scale (Months 4–10)
**Goal:** Migrate 400 pipelines; cover all transformation types.

- Implement SCD Type 2 transformation (slowly changing dimensions)
- Implement multi-source lookup (cross-database joins)
- Implement ADF parser (parallel to Informatica parser) for ADF pipelines
- Automate migration pipeline: Git PR per converted mapping, automated test generation
- Migrate 400 pipelines (batch: ~60/month)
- Decommission Informatica for migrated pipelines
- Exit criteria: 400 pipelines in production on new framework; Informatica licence partially reduced

---

### Phase 3 — Completion (Months 10–16)
**Goal:** Migrate remaining 300 pipelines; full decommission of Informatica.

- Address complex patterns: custom SQL, stored procedure calls, multi-target outputs
- LLM-assisted migration for edge cases (expand the `llm_fallback` module)
- Full Informatica decommission
- ADF decommission for migrated pipelines
- Exit criteria: All 700 pipelines running on framework; both legacy licences terminated

---

### Phase 4 — Optimisation (Months 16–18)
**Goal:** Cost and performance optimisation; operational handover.

- Spark tuning: partitioning, caching, cluster auto-scaling
- Monitoring and alerting (Grafana, CloudWatch)
- Runbook documentation; on-call handover to platform team
- Target: $2M/year confirmed run cost
- Exit criteria: Platform team owns on-call; cost target achieved

---

## Pipeline Complexity Classification

| Category | Criteria | Estimated Count | Auto-migration Rate |
|---|---|---|---|
| Simple | filter + expression only, single source | ~250 | ~95% |
| Medium | lookup joins, derived columns, date logic | ~300 | ~80% |
| Complex | SCD Type 2, multi-source, custom SQL | ~150 | ~50% |

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Data quality regression in migrated pipelines | Medium | High | Parallel run + row-count/checksum reconciliation before cut-over |
| Complex Informatica expressions not translatable by rules | Medium | Medium | LLM fallback + manual review queue |
| Spark performance worse than Informatica for some pipelines | Low | Medium | Benchmarking in Phase 1; Spark tuning in Phase 4 |
| Team unfamiliar with new framework | Low | Medium | Internal training; CLAUDE.md as living doc; pairing during Phase 1 |
| Informatica vendor locks in during migration | Low | High | Phase 2 partial decommission reduces leverage |

---

## Success Metrics

- **Migration velocity:** ≥50 pipelines/month from Phase 2 onward
- **Auto-migration rate:** ≥80% of pipelines converted without manual code
- **Data quality:** Zero incidents where migrated pipeline produced different results from Informatica (validated by parallel run)
- **Cost:** ≤$2M/year run cost confirmed by end of Phase 4
- **Timeline:** Full decommission by Month 18
