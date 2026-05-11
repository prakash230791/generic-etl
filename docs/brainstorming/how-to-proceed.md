# How to Proceed: ETL Modernization Program
## Benefits, Challenges, and Execution Guide

**Document Type:** Decision & Execution Guide
**Version:** 1.0
**Date:** 2026-05-11
**Audience:** Executive Sponsor, Engineering Leadership, Program Management

---

## 1. The Idea in One Paragraph

The enterprise currently spends $8M/year on ETL tooling (Informatica PowerCenter + Azure Data Factory) that is approaching end-of-life, is cloud-locked to specific vendors, and requires expensive certified specialists to operate. This program proposes replacing both systems with a single enterprise-owned, Python-based, container-first ETL platform that runs on any Kubernetes cluster — AWS today, GCP or on-prem tomorrow — at a steady-state cost of $2M/year. An AI-assisted migration agent (built on Claude and LangGraph) converts the existing 700 pipelines to the new format automatically, compressing what would otherwise be a 3–4 year manual migration to 12–14 months. The enterprise saves $17.5M over 5 years, eliminates all proprietary ETL licensing, and gains permanent platform ownership.

---

## 2. The Case for Acting Now

### 2.1 External Forcing Functions

Three external events have removed the option to defer this decision:

| Event | Impact | Urgency |
|---|---|---|
| Informatica PowerCenter standard support ended March 2026 | Forced upgrade to IDMC (expensive) or migration | **Immediate** |
| Microsoft ADF development frozen; new features in Fabric Data Factory only | ADF estate will require re-migration to Fabric in 2–3 years regardless | **Near-term** |
| Informatica license renewal window opens Q3 2026 | Last leverage point to negotiate exit terms | **This quarter** |

The enterprise is facing a migration regardless — the question is only whether it happens on our terms (planned, funded, with AI assistance) or on the vendor's terms (forced, expensive, rushed).

### 2.2 The Cost of Inaction

| Year | Status Quo Cost | Opportunity Cost (not building) |
|---|---|---|
| Year 1 | $8.0M | — |
| Year 2 | $8.3M | $1.1M (savings not captured) |
| Year 3 | $8.5M | $7.4M (savings not captured) |
| Year 4 | $8.8M | $13.9M (savings not captured) |
| Year 5 | $9.0M | $17.5M total not saved |

Every month of delay costs approximately $560K in foregone savings at steady state.

---

## 3. Benefits

### 3.1 Financial Benefits

| Benefit | Value | When Realized |
|---|---|---|
| Informatica license elimination | $4.5M/yr | Month 14–16 (Phase 5) |
| ADF cost reduction | $350K/yr | Month 13 (Phase 4) |
| People efficiency (19 FTE → 10 FTE) | $1.7M/yr | Gradual through phases |
| Infrastructure optimization (cloud-native) | $400K/yr vs on-prem | Month 5 (Phase 2) |
| **Total annual saving at steady state** | **$6.7M/yr** | From Year 3 onward |
| **5-year net saving vs status quo** | **$17.5M** | Compounding |
| **Payback period** | **26 months** | Month 26 |
| **ROI (5 years)** | **69%** | Net of all costs |

**Cost per pipeline drops from $11,481/year to $2,857/year — a 75% reduction.**

### 3.2 Strategic Benefits

| Benefit | Description |
|---|---|
| Platform ownership | Enterprise owns the code, the roadmap, and the IP — no vendor holds leverage |
| Cloud portability | Same pipelines run on AWS, GCP, or on-prem Kubernetes in < 4 months if cloud strategy changes |
| Talent availability | Python + Airflow skills are 10× more available than Informatica specialists; lower hiring costs, larger candidate pool |
| Elimination of end-of-support risk | No more forced upgrades at vendor-dictated timelines and costs |
| Future AI integration | Platform designed for AI-assisted pipeline authoring from Day 1; easy to extend with Copilot-style features |
| Vendor negotiation leverage | Migration removes Informatica's leverage at renewal; can negotiate exit terms from position of strength |
| Speed of delivery | New pipeline: < 3 business days (vs 2–4 weeks in Informatica); removes a bottleneck on business agility |

### 3.3 Technical Benefits

| Benefit | Description |
|---|---|
| Modern engineering practices | GitOps, CI/CD, IaC, containerization, proper testing — none of which are native to Informatica |
| Observable by default | Every pipeline emits structured logs, Prometheus metrics, OpenTelemetry traces, and OpenLineage events |
| Data lineage | Column-level lineage tracked automatically; satisfies data governance requirements cleanly |
| Plugin extensibility | Adding a new data source or transformation type requires zero changes to core framework |
| Multi-backend execution | Same YAML config runs on pandas (small data), Spark (big data), or dbt (in-database transforms) |
| Testable pipelines | Every migrated pipeline gets auto-generated unit tests and reconciliation fixtures |

### 3.4 Organizational Benefits

| Benefit | Description |
|---|---|
| Unified ETL estate | One platform, one skillset, one operations team — instead of two separate siloed toolchains |
| Self-service pipeline authoring | Non-platform engineers can author YAML pipelines without learning a proprietary GUI |
| Democratized visibility | Airflow UI and Grafana dashboards are accessible to all; no Informatica Workflow Monitor training required |
| Reduced vendor management | One vendor relationship (AWS) replacing two (Informatica, Microsoft Azure) |

---

## 4. Challenges

### 4.1 Technical Challenges

#### 4.1.1 Migration Completeness

**Challenge:** Not all Informatica mappings will be automatically convertible. An estimated 15% of simple, 30% of medium, and 50% of complex mappings will require manual engineering work. The "last 20%" of edge cases (stored procedures, custom Java transformations, hardcoded environment-specific logic) will consume disproportionate effort.

**Mitigation:**
- Start with simple pipelines to build momentum and calibrate the agent
- Maintain an explicit "manual queue" with estimated effort per job
- Set stakeholder expectations: agent is a velocity multiplier, not a magic wand
- Plan for 1.5× effort buffer on complex pipelines

#### 4.1.2 Performance Parity

**Challenge:** Informatica has a 20+ year head start on performance optimization. Some pipelines optimized over years for Informatica's execution model may not perform equivalently on pandas or even Spark without tuning.

**Mitigation:**
- Benchmark every migrated pipeline in shadow-run before cutover
- Spark backend available for large-volume pipelines
- Set explicit performance acceptance criteria per pipeline before migration starts
- Maintain Informatica as fallback until parallel-run validation passes

#### 4.1.3 Mainframe Integration Complexity

**Challenge:** Mainframe COBOL/EBCDIC parsing is notoriously tricky. Different copybook dialects, packed decimal encodings, and VSAM file formats create a long tail of implementation work that is frequently underestimated.

**Mitigation:**
- Engage mainframe SME specialist in Phase 0 (external consultant budgeted)
- Validate Cobrix (Spark library) against actual production mainframe files in Phase 1
- Budget 2× engineering estimate for the first 5 mainframe pipelines
- Accept that 5–10 mainframe-heavy pipelines may require bespoke engineering

#### 4.1.4 Expression Translation Accuracy

**Challenge:** Informatica's expression language has hundreds of built-in functions, date arithmetic quirks, null-handling semantics, and platform-specific behaviors that don't map cleanly to SQL or Python. Even the AI translator will miss edge cases.

**Mitigation:**
- Deterministic rule-based translator covers ≥80% of expressions; AI only for remainder
- Every expression translated by AI is flagged for human review
- Reconciliation shadow-runs catch any semantic differences before cutover
- Build a growing library of "known-tricky" patterns as the migration progresses

#### 4.1.5 YAML Schema Evolution

**Challenge:** The YAML schema will evolve as new features are added. Once hundreds of pipelines are on the platform, backward-incompatible schema changes become costly.

**Mitigation:**
- JSON Schema versioning from Day 1 (v1.0, v2.0 etc.)
- Minor versions must be backward-compatible
- Breaking changes require a migration script and a deprecation window
- Schema validator enforced in CI; no invalid configs ever reach production

---

### 4.2 Organizational Challenges

#### 4.2.1 Stakeholder Resistance

**Challenge:** Pipeline owners who have spent years building expertise in Informatica will be reluctant to migrate. The "why fix what isn't broken" mindset is the single largest program risk.

**Mitigation:**
- Executive sponsorship is mandatory — not optional
- Co-build first pipelines with domain teams; don't migrate at them, migrate with them
- Make early wins visible: publish velocity metrics, cost savings, delivery speed improvements
- Tie migration to the Informatica support deadline — the status quo is also not sustainable

#### 4.2.2 Team Assembly and Retention

**Challenge:** Assembling 8.5 FTE with the right mix of Python, Airflow, AWS, and data engineering skills in a competitive market. Losing key team members mid-program is a critical risk.

**Mitigation:**
- Identify internal candidates first; reduce dependency on external hires
- Knowledge distribution from Day 1: no hero dependencies; cross-training required
- Documentation-first culture: every component documented as it's built
- Competitive compensation; acknowledge this is a high-value platform role

#### 4.2.3 Knowledge Transfer from Legacy Systems

**Challenge:** The Informatica pipelines encode years of business logic that may not be fully documented. Some pipeline authors may have left the company. Edge cases and undocumented behaviors discovered during migration.

**Mitigation:**
- Inventory all pipelines with their domain owners in Phase 0
- Require SME availability commitment as a condition of migration planning
- Shadow-run reconciliation is the safety net; anomalies surface undocumented logic
- Accept that some discovered behavior may be bugs in Informatica being preserved inadvertently — document and decide

#### 4.2.4 Parallel Operation Overhead

**Challenge:** During the migration period (12–18 months), both the old and new systems will run in parallel, increasing operational load on teams that are already stretched.

**Mitigation:**
- Stagger migrations by domain; not all 700 pipelines in parallel at once
- Retire legacy pipelines immediately after cutover — do not leave both running indefinitely
- Allocate dedicated migration support from the platform team during each wave
- Track and celebrate decommissions; make the shrinking of the legacy estate visible

---

### 4.3 Financial Challenges

#### 4.3.1 Front-Loaded Investment

**Challenge:** The program requires $3.5M investment before significant savings materialize. In Year 1, total spend actually increases (build cost + continuing license costs during migration).

**Mitigation:**
- Model this explicitly for executives; the J-curve is unavoidable for any migration
- Begin Informatica renewal negotiation now to lock in reduced rate during migration
- Break the investment into phase gates; each phase releases next tranche of funding
- Even in the pessimistic scenario (40% cost overrun, 24-month migration), 5-year saving is $13.7M

#### 4.3.2 Cloud Cost Visibility

**Challenge:** AWS costs can grow unexpectedly as pipeline volume increases, Spark jobs run, and data volumes grow. Cloud cost management is a new discipline for teams migrating from fixed-cost on-prem.

**Mitigation:**
- Cost dashboards from Day 1 (per-pipeline attribution via resource tagging)
- Spot instances for EKS job nodes (40–60% cost reduction)
- Right-sizing review quarterly
- Cost anomaly alerts in CloudWatch; auto-notification on unexpected spikes

#### 4.3.3 LLM Cost Scaling

**Challenge:** At scale (500 migrations × LLM calls), agent AI costs could exceed projections if complex jobs require extensive retranslation or multi-model validation.

**Mitigation:**
- Deterministic-first: ≥80% of expressions handled without LLM; LLM calls bounded
- Per-run cost cap enforced at AI gateway level
- Budget model: $2/job average × 700 jobs = $1,400 — well within $75K budget
- LLM cost tracked per conversion run and reported to program management

---

## 5. How to Proceed

### 5.1 Immediate Actions (This Month)

These six actions are prerequisite to everything else. They can proceed in parallel:

| Action | Owner | Deadline | Why It Can't Wait |
|---|---|---|---|
| 1. Secure program funding ($3.5M) | Executive Sponsor | Week 2 | No team can be hired without it |
| 2. Begin Informatica renewal negotiation | Procurement + Sponsor | Week 1 | Use migration as leverage; lock in lower rate during transition |
| 3. Identify internal team candidates | Engineering Lead | Week 3 | Internal moves take 4–6 weeks; start now |
| 4. Open external requisitions for gaps | HR + Engineering Lead | Week 2 | External hires take 8–12 weeks |
| 5. Provision AWS dev account + EKS sandbox | DevOps Lead | Week 2 | Engineers can't start without infrastructure |
| 6. Convene Architecture Review Board | Platform Architect | Week 3 | 10 founding ADRs need approval before Phase 1 |

### 5.2 Phase-by-Phase Execution Plan

#### Phase 0 — Inception (Weeks 1–4)
**Goal:** Team, environments, charter. No code yet.

Deliverables:
- Core team assembled and onboarded (8.5 FTE)
- 10 founding ADRs approved by ARB
- Dev AWS environment functional (engineer can build + test locally)
- CI/CD pipeline running (hello-world build/test/publish)
- 10 pilot pipelines identified with stakeholder commitment
- Program charter signed by sponsor

Exit criteria: All of the above. No exceptions — the cost of skipping Phase 0 is paid in Phase 1 firefighting.

#### Phase 1 — Framework MVP (Months 1–4)
**Goal:** Core engine + first pipelines running.

Deliverables:
- Walking skeleton: read from source → transform → write to target (end-to-end)
- Plugin architecture: BaseConnector + BaseTransformation + registry
- Config layer: YAML loading, JSON Schema validation, parameter resolution
- 5 connectors: sqlserver, postgres, oracle, s3, csv_file
- 6 transformations: filter, expression, lookup, joiner, aggregator, scd_type_2
- Observability foundation: structured logs, Prometheus metrics, OpenLineage
- 10 pilot pipelines running on local/dev environment
- Stakeholder demo: positive sign-off

**Fastest risk reduction:** Build the second connector immediately after the first — validates the plugin contract is genuinely extensible.

#### Phase 2 — AWS Production (Months 5–7)
**Goal:** Real pipelines running in production on AWS.

Deliverables:
- MWAA + EKS deployed via Terraform (no click-ops)
- KubernetesPodOperator pattern established
- Secrets Manager integration live
- Security hardening: image signing, NetworkPolicies, IRSA, Pod Security Standards
- Observability production stack: CloudWatch, Prometheus/Grafana, Marquez
- 30+ pipelines in production for 2+ weeks without manual intervention
- On-call rotation established

**Critical path:** Network connectivity from MWAA/EKS to source systems. Engage networking team in Week 1 of Phase 2 — firewall changes take weeks to approve.

#### Phase 3 — Migration Agent (Months 6–10, overlapping Phase 2)
**Goal:** AI-assisted Informatica XML conversion operational.

Deliverables:
- IR schema v1.0 finalized (most critical artifact in the program)
- Informatica XML parser → IR (deterministic)
- Expression translator: rule-based library + Claude API fallback
- YAML + DAG + test generator
- Validator tiers 1–4 working
- Reviewer agent with PR generation
- LangGraph state machine with audit database
- 50 Informatica pipelines converted and in production

**Key insight:** Invest heavily in the IR schema. Every downstream stage depends on it. A well-designed IR makes adding ADF and future sources cheap. A poorly designed IR creates exponential debt.

#### Phase 4 — ADF Migration Agent (Months 10–13)
**Goal:** ADF JSON conversion operational; license retirement begins.

Deliverables:
- ADF ingestion: pull from Azure DevOps Git / ADF REST API
- ADF JSON parser → IR (reuses IR schema 100%)
- ADF expression translator (reuses expression engine ~70%)
- 50 ADF pipelines converted
- Informatica license partial retirement (first wave of licenses returned)

**Cost saving:** ADF agent is ~40% of the Informatica agent effort because the shared core (IR, translator engine, generator, validator, reviewer) is already built.

#### Phase 5 — Scale (Months 13–16)
**Goal:** 500+ pipelines migrated; legacy licenses retired.

Deliverables:
- Spark backend for high-volume pipelines
- Mainframe connector (Cobrix)
- dbt integration for SQL-friendly pipelines
- Wave migrations: 4–5 waves × 100 pipelines
- Informatica + ADF licenses fully retired
- Annual license savings confirmed: $5M/yr

#### Phase 6 — Cloud Validation (Months 16–18)
**Goal:** Prove portability; preserve strategic options.

Deliverables:
- Same framework running on GCP (Cloud Composer + GKE) — 10 representative pipelines
- Same framework running on on-prem K8s — 5 pipelines
- Cloud migration runbook published
- Platform handed over to BAU team
- Year-2 roadmap published

---

### 5.3 Governance Model

```
PROGRAM GOVERNANCE STRUCTURE

  Executive Sponsor
  ├── Monthly steering: investment, risk escalation, decommission approvals
  └── Funds tranches per phase gate sign-off

  Architecture Review Board (ARB)
  ├── Biweekly working sessions
  ├── Approves all ADRs
  ├── Approves schema versions
  └── Approves cloud architecture changes

  Platform Engineering Lead (Architect)
  ├── Technical decision authority within ARB-approved boundaries
  ├── Owns ADR backlog
  └── Single point of accountability for framework quality

  Data Governance Lead
  ├── PII handling sign-off
  ├── Data classification review per migrated pipeline
  └── Phase gate approver for P0 pipeline migrations

  Security Lead
  ├── Per-connector security review
  ├── Penetration testing coordination
  └── Compliance evidence review

  Domain SMEs (per business domain)
  ├── Gate 3 approval for their domain's migrated pipelines
  └── Business logic validation during shadow runs

  Program Manager
  ├── Sprint planning, stakeholder communication, risk tracking
  └── Phase gate milestone management
```

### 5.4 Decision Framework: When to Proceed vs. When to Pause

**Proceed immediately if:**
- All 6 immediate actions (Section 5.1) are complete
- Core team is ≥75% assembled
- Pilot pipelines identified with committed SMEs
- Executive sponsor has signed program charter

**Pause and escalate if:**
- Team cannot be assembled within 8 weeks of program start
- Pilot pipeline SMEs are unavailable or uncommitted
- Network access to source systems is blocked (do not build infrastructure you cannot test against)
- Security review surfaces a blocker that cannot be resolved within a sprint

**Stop and reassess if:**
- Phase 1 exit criteria not met after 5 months (1 month buffer)
- Phase 2 production pipelines show data quality issues that cannot be reconciled
- Cost overrun exceeds 40% by end of Phase 2 (breakeven still holds; reassess scope)
- Key team members leave without replacement plan

---

## 6. What Good Looks Like at 18 Months

At program completion, the enterprise should be able to demonstrate:

| Outcome | Proof |
|---|---|
| 500+ pipelines migrated | Pipeline inventory with cutover dates and legacy retirement confirmation |
| $2M/year run cost | AWS Cost Explorer showing platform infrastructure + team costs |
| Informatica and ADF licenses retired | Contract termination confirmations |
| P0/P1 SLAs met | Grafana SLA dashboard showing 99.9%/99.5% over last 90 days |
| New pipeline in < 3 days | Pipeline delivery log showing YAML authoring → production time |
| Cloud portability proven | 10 pipelines running on GCP + AWS simultaneously |
| Team transferred to BAU | On-call roster, runbooks, trained BAU team operational |
| Engineering team using new platform | >80% of business domains authoring new pipelines in YAML |

---

## 7. The Alternative Paths (and Why They're Worse)

### Path A: Stay on Informatica
- Forced upgrade to IDMC in 2026: $500K–$1.5M migration cost + new licensing
- No cloud portability; blocks AWS-first strategy
- Informatica talent scarcity worsens year over year
- **5-year cost: $42.7M vs $25.2M for the proposed path**

### Path B: Adopt Apache SeaTunnel
- Java-centric; requires JVM expertise and Scala/Java connectors
- Supply chain origin concerns (majority community in China); enterprise security policy issues
- Limited enterprise governance layer (no PII, no tiering, no SIEM integration)
- No Informatica migration agent; manual migration remains 3–4 years
- **Verdict: Use SeaTunnel's design patterns as blueprint; do not adopt SeaTunnel itself**

### Path C: Adopt Airbyte OSS
- EL only (Extract + Load); no transformation capability
- Cannot handle SCD Type 2, complex lookups, expression-heavy business logic
- **Verdict: Potentially complementary for simple file/API ingestion; cannot replace Informatica**

### Path D: Migrate to Informatica Cloud Data Management (IDMC)
- Stays in the Informatica ecosystem; no vendor exit
- Higher per-connector costs than current PowerCenter
- No improvement in cloud portability; still Azure-preferred
- Migration effort is comparable to our proposal
- **Verdict: Pays migration cost without getting platform ownership benefit**

### Path E: Build on AWS Glue / Step Functions
- AWS-native managed services; lowest initial deployment effort
- Hard locks to AWS; defeats cloud portability requirement
- Glue Spark costs are significantly higher than self-managed EKS Spark
- No Informatica migration agent in Glue ecosystem
- **Verdict: Violates the portability hard constraint; creates AWS lock-in instead of Informatica lock-in**

---

## 8. Summary Recommendation

**Proceed with the proposed program.** All financial go-criteria are met. The technical approach is validated by SeaTunnel's design patterns. The organizational risks are manageable with strong executive sponsorship and proper governance. The external forcing functions (Informatica support deadline, ADF development freeze) mean migration is happening regardless — this program controls how it happens.

**The single most important success factor:** Executive sponsorship with authority to mandate pipeline owner participation. Technical excellence alone does not migrate 700 pipelines. Stakeholder commitment, enforced from the top, is the prerequisite for everything else.

**Start this week:**
1. Secure funding
2. Call Informatica procurement
3. Identify your architect

The rest follows.

---

## Appendix: Quick Reference — Key Numbers

| Metric | Value |
|---|---|
| Current combined ETL cost | $8.0M/year |
| Target steady-state cost | $2.0M/year |
| Annual saving at steady state | $6.7M/year |
| Program build investment | $3.5M (18 months) |
| 5-year net saving | $17.5M |
| Payback period | 26 months |
| ROI (5 years) | 69% |
| Pipelines to migrate | ~700 |
| Migration timeline | 12–14 months (agent-assisted) vs 36–48 months (manual) |
| Team size (build) | 8.5 FTE |
| Team size (steady state) | 10 FTE (down from 19 FTE today) |
| Agent auto-conversion rate | ≥85% simple / ≥70% complex |
| Cost per pipeline/year (current) | $11,481 |
| Cost per pipeline/year (target) | $2,857 |
| GCP migration effort (if needed) | < 4 months (not years) |
| Informatica support deadline | March 2026 (already passed) |
