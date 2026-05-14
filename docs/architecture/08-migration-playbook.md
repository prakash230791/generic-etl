# Migration Playbook — 700 Pipelines

**Document:** 08 of 8
**Audience:** Program Manager, Migration Lead, Data Engineering Team
**Version:** 1.0 | **Date:** 2026-05-14

---

## 1. Migration Program Overview

### 1.1 Scope

| Source System | Pipeline Count | Complexity Range | Migration Track |
|---|---|---|---|
| Informatica PowerCenter | ~500 | Low → Very High | Track A |
| Azure Data Factory | ~160 | Low → High | Track B |
| SSIS (legacy) | ~40 | Medium → High | Track C |
| **Total** | **700** | | |

### 1.2 Goals

- Replace 700 pipelines with framework YAML configs that run identically
- Achieve ≥ 90% automated conversion rate (agent-driven)
- Complete decommission of Informatica by Month 18
- Zero production incidents caused by migration (shadow run gates)
- Full audit trail for every migrated pipeline

### 1.3 Non-Goals

- Business logic changes during migration (lift-and-shift only)
- Rewriting poorly designed pipelines
- Migrating pipelines that are candidates for deprecation (triage first)

---

## 2. Pipeline Triage & Classification

### 2.1 Priority Tiers

Every pipeline is classified before migration begins.

| Tier | Label | Criteria | Count (est.) | Migration Window |
|---|---|---|---|---|
| P0 | Critical / Blocked | Revenue-impacting; blocks downstream DW refresh | ~30 | Migrate last (Month 12–18) |
| P1 | High | Daily DW loads; SLA-tracked | ~120 | Month 6–12 |
| P2 | Medium | Weekly / on-demand analytical loads | ~300 | Month 3–10 |
| P3 | Low | Ad-hoc / archive / infrequent | ~250 | Month 2–8 |

> **Rule:** Migrate from low to high risk. Build confidence on P3, then P2, then P1, then P0.

### 2.2 Complexity Scoring (Agent Output)

The migration agent scores each pipeline on 5 dimensions:

| Dimension | Score 1 | Score 2 | Score 3 |
|---|---|---|---|
| Expression complexity | SQL-only / simple lookups | Custom functions | Vendor proprietary |
| Connector types | SQLite, CSV | SQL Server, PostgreSQL | Oracle, SAP, COBOL |
| Join cardinality | 1:1, 1:many simple | Star schema | Complex multi-hop |
| Parameterization | Hardcoded | Simple params | ForEach with dynamic tables |
| SCD pattern | None | SCD Type 1 | SCD Type 2 (full) |

```
complexity_score = sum(dimension_scores)    # range 5–15
  5–7:  LOW    → agent auto-migrates; no human review
  8–11: MEDIUM → agent migrates; human spot-checks 20%
  12+:  HIGH   → agent drafts; human must approve before deploy
```

### 2.3 Triage Workflow

```
Source XML / JSON ZIP
    │
    ▼
[Agent: AnalyzeAgent]
    ├── complexity_score
    ├── connector_types[]
    ├── transform_types[]
    └── estimated_confidence (0.0–1.0)
    │
    ▼
Triage DB (PostgreSQL)
    │
    ├── AUTO-APPROVE if confidence ≥ 0.90 AND complexity ≤ 7
    ├── HUMAN-REVIEW if confidence 0.70–0.89 OR complexity 8–11
    └── MANUAL if confidence < 0.70 OR complexity ≥ 12
```

---

## 3. Migration Tracks

### Track A — Informatica PowerCenter

#### A1: Source File Extraction

```bash
# Export from PowerCenter Repository Manager
pmrep connect -r MyRepo -d MyDomain -n admin -x password
pmrep exportobject -f m_LOAD_CUSTOMERS.xml -t mapping -n m_LOAD_CUSTOMERS -u /tmp/exports/
```

Or bulk export via Repository API:
```python
# agent/sources/informatica_repo_api.py
class InformaticaRepoClient:
    def list_mappings(self, folder: str) -> list[str]: ...
    def export_mapping(self, folder: str, name: str) -> str: ...  # returns XML string
    def bulk_export(self, folder: str, output_dir: Path) -> list[Path]: ...
```

#### A2: XML → IR → YAML (Agent Pipeline)

```
m_LOAD_CUSTOMERS.xml
    │
    ▼ [InformaticaXMLParser]
InformaticaIR (JSON) — metadata, sources, sinks, transforms
    │
    ▼ [TranslationAgent]
TranslatedIR — all expressions converted or flagged
    │
    ▼ [YAMLGenerator]
load_customers.yaml — framework v2.0 YAML
    │
    ▼ [ValidatorAgent]
Validation report: schema_valid=True, warnings=[], errors=[]
```

#### A3: Informatica Expression Translation Map

| Informatica Function | Framework Equivalent | Method |
|---|---|---|
| `IIF(cond, true, false)` | `CASE WHEN cond THEN true ELSE false END` | Rule |
| `SUBSTR(str, start, len)` | `SUBSTRING(str, start, len)` | Rule |
| `TO_DATE(str, fmt)` | `strptime(str, fmt)` (Python) | Rule |
| `SYSDATE` | `CURRENT_TIMESTAMP` | Rule |
| `ISNULL(col)` | `col IS NULL` | Rule |
| `DECODE(val, a, b, ...)` | `CASE val WHEN a THEN b ...` | Rule |
| `IN(val, a, b, c)` | `val IN (a, b, c)` | Rule |
| `LTRIM / RTRIM` | `LTRIM / RTRIM` (standard SQL) | Rule |
| `MD5(col)` | `hashlib.md5(col)` | Rule |
| Custom Java UDF | Flag for manual review | Manual |
| Custom C++ transform | Flag for manual review | Manual |

#### A4: Common Informatica Pitfalls

| Issue | Detection | Resolution |
|---|---|---|
| Router transform (multi-output) | XML `<TRANSFORMATION TYPE="Router">` | Map to conditional_load with multiple targets |
| Joiner with non-equi join | `CONDITION` contains `<`, `>`, `!=` | Translate to pandas merge + post-filter |
| Sorter transform | `<TRANSFORMATION TYPE="Sorter">` | Add `order_by` to source query |
| Normalizer (COBOL) | `<TRANSFORMATION TYPE="Normalizer">` | Manual — use pivot_longer equivalent |
| Aggregator without group-by | `<TRANSFORMATION TYPE="Aggregator">` without `GROUP BY` keys | Flag for human review |
| Sequence Generator | `<TRANSFORMATION TYPE="Sequence Generator">` | Replace with ROW_NUMBER() or DB sequence |

---

### Track B — Azure Data Factory

#### B1: Source File Extraction (ARM Export)

```bash
# Export ADF as ARM template (Azure CLI)
az datafactory export-template \
    --resource-group MyRG \
    --factory-name MyADF \
    --output-file /tmp/adf_export/arm_template.json

# Or export Support Files ZIP from ADF Studio
# File → Export → ARM Template → adf_export.zip
```

#### B2: ZIP → IR → YAML

```
adf_export.zip
    │  contains: pipelines/*.json, datasets/*.json, linkedServices/*.json
    ▼ [AdfParser (AdfCatalog)]
AdfIR — resolves pipeline→dataset→linkedService→keyVault reference chain
    │
    ▼ [TranslationAgent]
TranslatedIR
    │
    ▼ [YAMLGenerator]
framework_v2_job.yaml
```

#### B3: ADF Component Translation Table

| ADF Component | Framework Equivalent | Notes |
|---|---|---|
| Copy Activity | sources + targets | Direct mapping |
| Data Flow | transformations[] | Each transformation node maps to a plugin |
| ForEach Activity | control_table | @item() params → {{ parameters.X }} |
| If Condition | conditional_load | conditions[] list |
| Lookup Activity | lookup_enrich transform | |
| Stored Procedure Activity | pre_steps or post_steps | sql type |
| preCopyScript | pre_steps[0] | sql type |
| Dataset parameterization | parameters block | |
| Pipeline parameters | parameters block | |
| Trigger schedule | Airflow DAG schedule | Separate from job config |
| Integration Runtime | Kubernetes namespace | |
| Linked Service (JDBC) | connector + connection ref | kv:// or ls:// |
| Linked Service (Key Vault) | kv://ls_name/secret_name | SecretsResolver handles |

#### B4: ADF Expression Translation Map

| ADF Expression | Framework Equivalent | Method |
|---|---|---|
| `@concat(a, b)` | `f"{a}{b}"` (Python) | Rule |
| `@item().tableName` | `{{ parameters.tableName }}` | Rule |
| `@pipeline().parameters.X` | `{{ parameters.X }}` | Rule |
| `@utcNow()` | `datetime.utcnow().isoformat()` | Rule |
| `@formatDateTime(t, fmt)` | `t.strftime(fmt)` | Rule |
| `@if(cond, a, b)` | `a if cond else b` | Rule |
| `@equals(a, b)` | `a == b` | Rule |
| `@activity('X').output.rowsRead` | Audit DB query (not supported in config) | Manual |
| Custom Mapping Data Flow | Spark / pandas expression | Sonnet (complex) |

---

### Track C — SSIS

#### C1: SSIS Extraction

```bash
# Export SSIS packages from SSISDB
dtutil /FILE "C:\packages\MyPackage.dtsx" /COPY SQL;".\SSISDB\MyFolder\MyPackage"
```

Or bulk export via SQL:
```sql
SELECT name, convert(nvarchar(max), convert(varbinary(max), object_data)) as xml_content
FROM [SSISDB].[catalog].[packages]
WHERE folder_name = 'MyFolder'
```

#### C2: SSIS Translation Challenges

SSIS is the highest-risk track due to:
- Script Tasks (VB.NET / C# code in packages)
- Custom components (.NET assemblies)
- Event Handler chains
- Package configurations (XML-based, legacy)

| SSIS Component | Automatable? | Strategy |
|---|---|---|
| OLE DB Source / Destination | Yes (90%) | Direct connector mapping |
| Flat File Source / Destination | Yes (85%) | CSV connector |
| Data Conversion | Yes | column_derive type cast |
| Derived Column | Yes | column_derive |
| Lookup | Yes | lookup_enrich |
| Conditional Split | Partial (70%) | conditional_load |
| Merge Join | Partial (60%) | stream_join |
| Aggregate | Partial (60%) | aggregate transform |
| Script Task (simple) | Partial (40%) | Sonnet translation; human review |
| Script Task (complex) | No | Manual rewrite |
| Custom Component | No | Manual rewrite |
| Execute SQL Task | Yes | pre_steps / post_steps |
| Send Mail Task | No (out of scope) | Separate notification service |
| Execute Package Task | Partial | Airflow DAG dependency |

---

## 4. Validation & Shadow Run Protocol

### 4.1 Three-Stage Gate Model

```
Stage 1: Structural Validation (Agent)
    ├── schema_valid: true
    ├── all connections resolvable (ls:// or kv:// refs valid)
    ├── all transform types known
    └── confidence ≥ threshold for tier

Stage 2: Shadow Run (Framework)
    ├── Run new YAML against PRODUCTION source (read-only)
    ├── Write to shadow target (separate schema: _etl_shadow_*)
    ├── Compare: row_count, column_means, null_rates, pk_violations
    └── Pass criteria: delta < 0.1% on key metrics

Stage 3: Parallel Run (Production)
    ├── Run BOTH old and new pipelines simultaneously (1–4 weeks)
    ├── Compare targets using DataQualityChecker
    ├── Alert on any divergence
    └── Sign-off from data consumer team
```

### 4.2 Shadow Run Implementation

```yaml
# Shadow run job config (auto-generated by agent)
version: "2.0"
job:
  name: load_customers__shadow
  shadow_of: load_customers         # links to original job
  shadow_mode: true                 # writes to _etl_shadow schema only

sources:
  - id: src
    connector: sqlserver
    connection: ls://SrcDB
    query: "SELECT * FROM dbo.customers"

targets:
  - id: tgt
    connector: sqlserver
    connection: ls://DW_Shadow        # points to shadow schema
    table: "_etl_shadow.dbo.dim_customer"
    load_strategy: replace

validation:
  compare_with: dbo.dim_customer      # original target table
  tolerance:
    row_count_delta_pct: 0.1
    null_rate_delta: 0.01
    numeric_mean_delta_pct: 0.5
  fail_on: any                         # any tolerance breach = gate fails
```

### 4.3 Comparison Query (DataQualityChecker)

```sql
-- Auto-generated for each migrated pipeline
WITH original AS (
    SELECT COUNT(*) AS cnt,
           AVG(CAST(revenue AS FLOAT)) AS avg_revenue,
           SUM(CASE WHEN customer_id IS NULL THEN 1 ELSE 0 END) AS null_customer_id
    FROM dbo.dim_customer
),
shadow AS (
    SELECT COUNT(*) AS cnt,
           AVG(CAST(revenue AS FLOAT)) AS avg_revenue,
           SUM(CASE WHEN customer_id IS NULL THEN 1 ELSE 0 END) AS null_customer_id
    FROM _etl_shadow.dbo.dim_customer
)
SELECT
    ABS(o.cnt - s.cnt) * 1.0 / NULLIF(o.cnt, 0) AS row_count_delta_pct,
    ABS(o.avg_revenue - s.avg_revenue) / NULLIF(ABS(o.avg_revenue), 0) AS revenue_delta_pct,
    o.null_customer_id AS orig_nulls,
    s.null_customer_id AS shadow_nulls
FROM original o, shadow s;
```

### 4.4 Sign-Off Checklist

Before a pipeline is "migrated" (Informatica version decommissioned):

```
□ Shadow run passed for ≥ 3 consecutive daily runs
□ Parallel run passed for ≥ 5 business days
□ Data consumer team signed off (email + JIRA ticket)
□ Rollback procedure documented and tested
□ New pipeline added to Airflow DAG with correct schedule
□ Alerting configured for new pipeline (Prometheus rules)
□ Lineage verified in Marquez (source → target chain correct)
□ Config YAML committed to Git (PR reviewed + merged)
□ Old Informatica mapping disabled (not deleted yet)
□ Old Informatica mapping deleted after 30-day retention window
```

---

## 5. Rollback Strategy

### 5.1 Rollback Trigger Conditions

| Condition | Rollback Type | Time to Execute |
|---|---|---|
| Shadow run fails (row count delta > 1%) | Block — do not proceed | Immediate |
| Parallel run divergence detected | Switch back to old pipeline | < 15 minutes |
| New pipeline misses SLA for 2 consecutive runs | Switch back | < 30 minutes |
| Data consumer raises data quality issue | Switch back | < 60 minutes |
| New pipeline causes downstream failures | Emergency rollback | < 15 minutes |

### 5.2 Rollback Procedure

```bash
# Step 1: Disable new Airflow DAG
airflow dags pause load_customers_v2

# Step 2: Re-enable Informatica mapping (via pmcmd)
pmcmd startworkflow -sv IntegrationService -d Domain -u admin -p pass \
    -f SharedFolder -w wf_load_customers -paramfile params.txt

# Step 3: Re-run new pipeline from last known good watermark (if data was written)
etl-run run /configs/load_customers_v2.yaml \
    --param "last_run_dt=2026-05-13T00:00:00"

# Step 4: Alert data consumers
# Step 5: Create incident ticket, attach shadow run diff
```

### 5.3 No Data Loss Guarantee

- New pipeline ALWAYS writes to shadow target first (Stage 2)
- Production writes only begin after shadow validation passes (Stage 3)
- Watermark is only updated after target write is confirmed
- If new pipeline fails mid-write: `load_strategy: replace` or SCD2 merge is idempotent (safe to retry)

---

## 6. Migration Tracking & Governance

### 6.1 Migration Registry (PostgreSQL)

```sql
CREATE TABLE etl_migration_registry (
    id                  SERIAL PRIMARY KEY,
    source_system       VARCHAR(32) NOT NULL,   -- informatica | adf | ssis
    source_name         VARCHAR(255) NOT NULL,  -- original pipeline name
    source_file         VARCHAR(512),           -- path to XML/JSON/DTSX
    priority_tier       VARCHAR(4) NOT NULL,    -- P0 | P1 | P2 | P3
    complexity_score    INTEGER,                -- 5–15
    agent_confidence    NUMERIC(4,3),           -- 0.000–1.000
    automation_method   VARCHAR(32),            -- rule | sonnet | manual
    yaml_path           VARCHAR(512),           -- path in Git repo
    git_commit          VARCHAR(64),
    status              VARCHAR(32) NOT NULL DEFAULT 'pending',
        -- pending | shadow_pass | parallel_pass | signed_off | decommissioned | blocked
    shadow_run_date     TIMESTAMPTZ,
    parallel_run_start  TIMESTAMPTZ,
    parallel_run_end    TIMESTAMPTZ,
    sign_off_date       TIMESTAMPTZ,
    signed_off_by       VARCHAR(255),
    decommission_date   TIMESTAMPTZ,
    notes               TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);
```

### 6.2 Migration Dashboard Metrics

```promql
# Migration progress (Grafana)
# % pipelines signed off
(
    SELECT COUNT(*) FROM etl_migration_registry WHERE status = 'signed_off'
) / 700 * 100

# Automation rate by source system
SELECT source_system,
       COUNT(*) FILTER (WHERE automation_method != 'manual') * 1.0 / COUNT(*) AS auto_rate
FROM etl_migration_registry GROUP BY source_system;

# Blocked pipelines (need attention)
SELECT * FROM etl_migration_registry WHERE status = 'blocked' ORDER BY priority_tier;
```

### 6.3 Weekly Migration Standup Template

```
Date: ____
Facilitator: ____

1. Progress since last week
   - Pipelines migrated (shadow pass):  __ / __ target
   - Pipelines signed off:              __ / __ target
   - Informatica decommissions:         __ (total YTD: __)

2. Blockers
   - Pipeline name | Blocker type | Owner | ETA

3. Agent metrics
   - Automation rate this week:         __% (target: 90%)
   - Manual queue depth:                __ pipelines
   - New expression types encountered:  __ (add to rule engine?)

4. Upcoming
   - P1 pipelines starting parallel run next week: [list]
   - Informatica decommissions planned next 2 weeks: [list]

5. Risks
   - [New risks since last week]
```

---

## 7. Phase-by-Phase Migration Plan

### Phase 1 (Month 2–8): P3 + P2 Pipelines (~250 pipelines)

**Goal:** Prove the approach, build agent confidence, train the team.

| Month | Target | Activity |
|---|---|---|
| M2 | 10 P3 pipelines | Manual validation; calibrate shadow run thresholds |
| M3 | 30 P3 pipelines | Enable auto-approve for confidence ≥ 0.90 |
| M4 | 50 P3 pipelines | Enable batch shadow runs (nightly) |
| M5 | 60 P2 pipelines | First P2 parallel runs; agent rule engine expansion |
| M6 | 100 P2 pipelines | Decommission Informatica dev/test (saves $840K/year) |
| M7–M8 | Remaining P2 | Sign off + decommission ~150 pipelines |

**Success criteria for Phase 1:**
- 250 pipelines signed off
- Agent automation rate ≥ 85%
- Zero production incidents from migrated pipelines
- Informatica dev/test environments decommissioned

### Phase 2 (Month 8–14): P1 Pipelines (~120 pipelines)

**Goal:** Migrate the high-volume, SLA-critical daily pipelines.

| Month | Target | Activity |
|---|---|---|
| M8–M9 | 20 P1 pipelines | Shadow run only; extended parallel run (4 weeks) |
| M10–M11 | 40 P1 pipelines | Scale parallel runs; monitor all SLAs |
| M12 | 60 P1 pipelines | Decommission Informatica prod (50% — saves $2.1M/year) |
| M13–M14 | Remaining P1 | Sign off + decommission remaining P1 |

**Key risk mitigations for Phase 2:**
- Extended parallel runs (4 weeks, not 1)
- Data consumer sign-off required (no self-certification)
- Real-time divergence alerts (< 5 minute notification)
- Dedicated on-call rotation during parallel runs

### Phase 3 (Month 14–18): P0 Pipelines (~30 pipelines)

**Goal:** Migrate the highest-risk revenue-critical pipelines.

| Month | Target | Activity |
|---|---|---|
| M14–M15 | 10 P0 pipelines | Shadow run + 6-week parallel run |
| M16 | 10 P0 pipelines | Parallel run; no decommission until Month 18 gate |
| M17 | 10 P0 pipelines | Final parallel runs |
| M18 | Full decommission | Informatica prod fully off; saves $4.2M/year |

**Phase 3 special controls:**
- Executive sign-off required for each P0 pipeline
- Change freeze window: no migration during month-end close
- Dedicated DBA on standby during each cutover
- Full data reconciliation report (row-by-row audit for critical tables)

---

## 8. Team Structure for Migration

| Role | Count | Responsibility |
|---|---|---|
| Migration Lead | 1 | Program tracking, stakeholder communication, escalation |
| Data Engineers | 3 | Run agent, review YAML, fix translation issues |
| QA / Validation Engineer | 1 | Shadow run scripts, comparison queries, sign-off |
| Platform Engineer (SRE) | 1 | Infrastructure for shadow targets, monitoring |
| Business Analyst | 1 | Data consumer liaison, sign-off coordination |
| Part-time: Informatica SME | 0.5 FTE | Advise on complex transforms, edge cases |

---

## 9. Agent Improvement Loop

The migration agent improves continuously as more pipelines are processed:

```
Pipeline migrated → shadow pass → signed off
    │
    ▼
New translation patterns added to:
    ├── Rule engine (agent/rules/expression_rules.yaml) — highest ROI
    ├── pgvector cache (auto — every Sonnet translation cached)
    └── Few-shot examples (agent/prompts/few_shot_examples.json)

Weekly review:
    ├── Top 10 manual queue items → add as rules
    ├── Confidence < 0.70 patterns → Sonnet prompt tuning
    └── New source system types → new parser plugin
```

**Expected automation rate progression:**

| Month | Automation Rate | Rationale |
|---|---|---|
| M2 | 70% | Initial rule set |
| M4 | 80% | Rule engine expanded from P3 learnings |
| M6 | 85% | pgvector cache warming up |
| M10 | 90% | Full rule set for Informatica patterns |
| M14 | 93% | ADF patterns mature; SSIS rules added |
| M18 | 95%+ | Full pattern library across all three sources |

---

## 10. Decommission Checklist (Per System)

### Informatica PowerCenter

```
Phase: Dev/Test (Month 6)
□ All dev/test pipelines migrated and signed off
□ Repository backup created and archived (7-year retention)
□ Informatica Repository Service stopped
□ Dev/test servers powered off
□ License notification sent to vendor (90-day notice required)
□ Annual license cost savings recorded: $840,000

Phase: Production (50%, Month 12)
□ 370+ production pipelines signed off
□ Remaining 130 pipelines still running on Informatica (P0/P1 tail)
□ Informatica license renegotiated to 50% CPU count
□ Annual license savings recorded: $2,100,000

Phase: Production (Full, Month 18)
□ All 500 Informatica pipelines migrated and signed off
□ 60-day parallel run complete for all P0 pipelines
□ Final Repository backup archived
□ All Informatica servers decommissioned
□ License cancelled; vendor confirmation received
□ Total annual savings: $4,200,000 + $700,000 maintenance = $4,900,000/year
```

### Azure Data Factory

```
Phase: Batch pipelines (Month 18)
□ All 160 ADF batch pipelines migrated to framework
□ ADF event-trigger pipelines: KEEP (not in scope — replaced by Kafka in Phase 3)
□ ADF linked services: decommission database-type only
□ ADF integration runtimes: decommission shared IR
□ Annual savings: $900,000 (batch compute)
□ Remaining ADF cost: $600,000 (event triggers, kept indefinitely)
```

### SSIS (Legacy)

```
□ 40 SSIS packages migrated or deprecated (Month 14)
□ SSIS catalog backed up
□ SQL Server Agent jobs pointing to SSIS: updated to Airflow DAGs
□ Oracle ETL server licenses released (Month 14): $420,000/year saved
```

---

## 11. Communication Plan

### Stakeholder Matrix

| Stakeholder | Interest | Frequency | Channel | Content |
|---|---|---|---|---|
| CFO | Cost savings | Monthly | Email report | Savings realized vs plan |
| CTO | Technical progress | Bi-weekly | Slack + dashboard | Pipeline count, risks, timeline |
| Data Consumers | Their data | Before cutover | Email + meeting | What changes (nothing visible) |
| Data Engineering | Day-to-day | Daily standup | Slack | Blockers, queue depth |
| Informatica Vendor | Contract | As needed | Account manager | License reduction notices |

### Communication Templates

**Pre-migration notification (to data consumers):**
```
Subject: ETL Migration — [Pipeline Name] moving to new platform on [Date]

The [pipeline name] ETL job will be migrated to the new Generic ETL platform
on [date]. You will see no change in:
  - Data availability schedule (same time)
  - Target table structure (identical schema)
  - Data values (validated via 2-week parallel run)

A parallel run has been running since [start date] with zero divergence detected.
If you notice any data issues after [cutover date], contact etl-platform@company.com.
```

**Post-decommission announcement:**
```
Subject: Informatica Phase 1 Decommission Complete

We have successfully migrated 250 pipelines off Informatica.
  - Dev/test environments: OFFLINE as of [date]
  - Savings realized: $840,000/year
  - Agent automation rate: 85%
  - Production incidents: 0

Next milestone: 120 P1 pipelines by Month 12.
```
