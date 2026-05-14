# Cost Model & ROI Analysis

**Document:** 05 of 8
**Audience:** CFO, Engineering Director, Program Sponsors
**Version:** 1.0 | **Date:** 2026-05-14

---

## 1. Current State Cost Breakdown

### 1.1 Annual Licensing Costs (Estimated)

| Tool | Type | Annual Cost |
|---|---|---|
| Informatica PowerCenter | Enterprise license (per CPU) | $3,500,000 |
| Informatica maintenance & support | 20% of license | $700,000 |
| Azure Data Factory (ADF) | Pay-per-use (compute + orchestration) | $1,200,000 |
| ADF linked services (enterprise connectors) | Premium connectors | $300,000 |
| Informatica cloud add-ons (IICS, MDM connectors) | SaaS modules | $600,000 |
| **TOTAL LICENSING** | | **$6,300,000** |

### 1.2 Infrastructure Costs (Current)

| Item | Annual Cost |
|---|---|
| Informatica PowerCenter servers (on-prem, 8 cores each × 12) | $240,000 |
| Oracle / SQL Server licenses for ETL databases | $420,000 |
| Azure compute for ADF integration runtime | $180,000 |
| Azure storage (staging, archives) | $96,000 |
| **TOTAL INFRASTRUCTURE** | | **$936,000** |

### 1.3 People Costs (Current, ETL Platform Operations)

| Role | Count | Annual (loaded) |
|---|---|---|
| Informatica administrators | 3 | $540,000 |
| ADF pipeline developers | 4 | $640,000 |
| ETL support engineers | 2 | $300,000 |
| **TOTAL PEOPLE (current platform)** | | **$1,480,000** |

### 1.4 Total Current Annual Cost

```
Licensing:        $6,300,000
Infrastructure:     $936,000
People:           $1,480,000
────────────────────────────
TOTAL:            $8,716,000  (~$8.7M/year)
```

---

## 2. Target State Cost Model

### 2.1 Infrastructure (Year 1 — Phase 0+1, 50 pipelines)

| Item | Monthly | Annual |
|---|---|---|
| AWS EKS cluster (5 c5.4xlarge nodes, on-demand) | $2,720 | $32,640 |
| AWS RDS PostgreSQL db.r6g.xlarge (audit, pgvector) | $520 | $6,240 |
| AWS S3 (configs, IR files, staging, ~10TB) | $230 | $2,760 |
| HashiCorp Vault HCP (Plus tier) | $500 | $6,000 |
| Grafana Cloud (Pro, 10 users) | $300 | $3,600 |
| GitHub Enterprise (15 seats) | $1,050 | $12,600 |
| AWS MSK Kafka (3 brokers, kafka.m5.large, Phase 2) | $800 | $9,600 |
| **TOTAL INFRASTRUCTURE (Year 1)** | | **$73,440** |

### 2.2 Infrastructure (Year 2 — Phase 2, 300 pipelines)

| Item | Monthly | Annual |
|---|---|---|
| AWS EKS cluster (20 nodes, mix of c5.4xlarge + r5.4xlarge) | $9,500 | $114,000 |
| AWS EMR Spark (on-demand, ~200hr/month cluster time) | $3,000 | $36,000 |
| AWS RDS PostgreSQL db.r6g.2xlarge | $1,040 | $12,480 |
| AWS S3 (100TB data + archives) | $2,300 | $27,600 |
| HashiCorp Vault HCP | $500 | $6,000 |
| Grafana Cloud Enterprise | $800 | $9,600 |
| GitHub Enterprise | $1,050 | $12,600 |
| **TOTAL INFRASTRUCTURE (Year 2)** | | **$218,280** |

### 2.3 LLM API Costs (Migration Agent)

| Model | Use Case | Est. Tokens/month | Cost/1M tokens | Monthly Cost |
|---|---|---|---|---|
| Claude Haiku | Complexity classification | 50M | $0.25 | $12.50 |
| Claude Sonnet | Expression translation | 20M | $3.00 | $60.00 |
| Claude Sonnet | PR body generation | 5M | $3.00 | $15.00 |
| Cached system prompts | 80% cache hit rate on Sonnet | | -60% | -$45.00 |
| **TOTAL LLM** | | | | **~$42/month** |

Optimizations:
- Prompt caching on Sonnet system prompts: ~60% token reduction
- Haiku for 80% of expressions (classification → deterministic rules)
- Sonnet only for the remaining 20% (untranslatable expressions)
- pgvector RAG reduces LLM calls by additional 30% (cached translations)

### 2.4 People Costs (New Platform, Year 2)

| Role | Count | Annual (loaded) |
|---|---|---|
| Principal Architect | 1 | $325,000 |
| Tech Leads | 2 | $520,000 |
| Senior Backend Engineers | 2 | $468,000 |
| Backend Engineers | 3 | $585,000 |
| SRE / Platform Engineer | 1 | $260,000 |
| Data Engineers (migration) | 2 | $364,000 |
| Product Manager | 1 | $260,000 |
| **TOTAL PEOPLE (new platform)** | 12 | **$2,782,000** |

---

## 3. Cost Comparison & ROI

### 3.1 Year-by-Year Cost Comparison

| Cost Category | Current (Yr 0) | Year 1 | Year 2 | Year 3 |
|---|---|---|---|---|
| Informatica license | $4,200,000 | $2,100,000¹ | $0 | $0 |
| ADF compute/license | $1,500,000 | $1,500,000 | $750,000² | $0 |
| Other legacy licensing | $1,000,000 | $500,000 | $0 | $0 |
| New platform infrastructure | $0 | $73,000 | $218,000 | $280,000 |
| New platform people | $1,480,000 | $2,782,000³ | $2,782,000 | $1,500,000⁴ |
| LLM API costs | $0 | $504 | $504 | $504 |
| **TOTAL** | **$8,180,000** | **$6,956,000** | **$3,750,000** | **$1,780,000** |
| **YoY Savings** | Baseline | $1.2M | $4.4M | $6.4M |

Notes:
¹ Partial decommission: keep 50% of Informatica while migrating (risk mitigation)
² ADF: keep event-trigger pipelines; decommission batch
³ Investment phase: larger team for build + migration
⁴ Steady-state operations team (4 engineers): savings from reduced headcount

### 3.2 Total 3-Year ROI

```
3-Year Total Cost (Current):       $24,540,000
3-Year Total Cost (New Platform):  $12,486,000
                                   ───────────
3-Year Net Savings:                $12,054,000
ROI:                               97% (net savings / investment)
Break-even:                        Month 18
```

---

## 4. Cost Optimization Strategies

### 4.1 Compute Optimization

**AWS Spot Instances for Non-Critical Jobs**
```yaml
# Job config: allow spot execution (P2/P3 pipelines only)
job:
  name: load_archive_table
  execution_tier: pandas
  kubernetes:
    spot_eligible: true    # use spot instances; restart on interruption
    spot_max_price: "0.50" # $/hour max; fall back to on-demand if unavailable
```

Savings: 60–80% vs on-demand for batch workloads
Risk: Job restarts on spot interruption → ensure idempotent writes (`if_exists: replace`)

**KEDA Scale-to-Zero**
- Pandas worker pods scale to 0 when job queue is empty
- Only pay for compute when jobs are running
- Estimated savings: 40–60% vs always-on node group

**Compute Savings Summary**

| Optimization | Est. Monthly Saving | Risk |
|---|---|---|
| Spot instances (P2/P3 jobs) | $1,800 | Low (idempotent jobs) |
| KEDA scale-to-zero | $1,200 | Very Low |
| Reserved instances (control plane) | $800 | Very Low (1-year commitment) |
| Right-sizing pods (actual usage vs limits) | $600 | Low |
| **Total compute savings** | **$4,400/month** | |

### 4.2 LLM Cost Optimization

**Tiered Model Selection**
```python
# agent/agents/translation/llm_translator.py
# Tier 0: deterministic rules (free)
# Tier 1: Claude Haiku (cheap — classify/simple translations)
# Tier 2: Claude Sonnet (medium — complex expressions)
# Tier 3: Manual queue (free — unresolved; human reviews)

def translate(self, expression: str) -> TranslationResult:
    # Tier 0: try rule engine first
    result = self.rules_agent.translate(expression)
    if result.confidence >= 0.95:
        return result   # deterministic, free

    # Tier 1: Haiku for simple expressions (avg $0.001 per call)
    complexity = self._assess_complexity_haiku(expression)  # 1 Haiku call
    if complexity == "simple":
        return self._translate_haiku(expression)            # 1 Haiku call

    # Tier 2: Sonnet for complex (avg $0.01 per call)
    if complexity in ("medium", "complex"):
        # Check pgvector cache first
        cached = self.vector_store.search(expression, threshold=0.95)
        if cached:
            return cached   # free (cache hit)
        return self._translate_sonnet(expression)           # 1 Sonnet call

    # Tier 3: Manual queue (no LLM cost)
    return TranslationResult(confidence=0, method="manual_queue")
```

**Prompt Caching** (60% token reduction on Sonnet system prompts)
```python
# Cache the 2000-token system prompt across all Sonnet calls
messages = [
    {
        "role": "user",
        "content": [
            {
                "type": "text",
                "text": SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"}  # cache for 5 min
            },
            {
                "type": "text",
                "text": f"Translate: {expression}"
            }
        ]
    }
]
```

**pgvector Translation Cache**
```sql
-- Every successful Sonnet translation stored in vector DB
-- Before calling Sonnet: ANN search (cosine similarity > 0.95)
SELECT translated_expr, confidence
FROM translation_cache
WHERE source_type = 'informatica'
  AND embedding <=> $1::vector < 0.05  -- cosine distance threshold
ORDER BY embedding <=> $1::vector
LIMIT 1;
```

After 1000 migrations, expected cache hit rate: 40–60% (most enterprise expressions repeat).
At 60% cache hit: Sonnet cost reduces from $60/month to $24/month.

### 4.3 Storage Optimization

| Data | Current | Optimized | Saving |
|---|---|---|---|
| Job config YAMLs (Git + S3) | S3 Standard | S3 Standard-IA (accessed monthly) | 45% on storage |
| Audit logs > 30 days | RDS PostgreSQL | S3 Standard → Glacier after 90 days | 90% on storage |
| IR JSON files (migration) | S3 Standard | S3 Intelligent-Tiering | 30–50% |
| pgvector translations | RDS PostgreSQL | Keep (hot data for agent) | No change |

### 4.4 Build vs. Buy Analysis

| Component | Build Cost | Buy/SaaS Cost | Decision | Rationale |
|---|---|---|---|---|
| ETL execution engine | $500K (this project) | Informatica $4.2M/yr | **Build** | Core differentiator |
| Secrets management | 2 weeks integration | Vault HCP $6K/yr | **Buy** | Mission critical; mature product |
| Monitoring (Prometheus/Grafana) | 1 week integration | Grafana Cloud $3.6K/yr | **Buy** | Open-source + hosted option |
| Orchestration (Airflow) | 2 weeks integration | Astronomer $50K/yr | **Self-host** (MWAA $18K/yr) | MWAA managed service cheaper |
| Data catalog | 3 weeks integration | Collibra $200K/yr | **Self-host Apache Atlas** | OSS sufficient for Phase 1–2 |
| Data quality | 2 weeks integration | Great Expectations Cloud $40K/yr | **Self-host GE** | OSS tier sufficient |
| Vector database | 1 week integration | Pinecone $70/mo | **Self-host pgvector** | Existing RDS; avoid another service |
| LLM (translation) | N/A | Anthropic API ~$42/mo | **Buy** | No viable build option |

---

## 5. Cost Governance

### 5.1 Cost Allocation Tags

All cloud resources tagged for cost allocation:
```
Environment: dev | test | prod
Team: etl-platform
Project: generic-etl
Pipeline: <job_name>        # for per-pipeline cost tracking
Phase: 0 | 1 | 2 | 3
```

### 5.2 Budget Alerts

| Threshold | Alert Recipient | Action |
|---|---|---|
| Monthly infra > $15,000 | Engineering Director | Review; identify unexpected costs |
| Monthly LLM > $500 | Tech Lead — Agent | Audit translation calls; improve cache hit rate |
| Single job > $50 compute | Job owner | Flag for Spark tier review |
| Monthly total > budget + 20% | CFO + CTO | Emergency cost review |

### 5.3 FinOps Dashboard (Grafana)

```
Panels:
  - Monthly infra cost (AWS Cost Explorer API)
  - Cost per pipeline (per job_name tag)
  - Cost per connector type (ec2 tag)
  - LLM spend by model (Claude API usage)
  - Compute utilization (CPU/Memory actual vs requested)
  - Idle node-hours wasted
  - Spot savings vs on-demand equivalent
```

---

## 6. License Decommission Plan

| System | Current Annual Cost | Decommission Month | Savings Realized |
|---|---|---|---|
| Informatica dev/test environments | $840,000 | Month 6 | $840,000/year |
| Informatica prod (50% reduction) | $2,100,000 | Month 12 | $2,100,000/year |
| Informatica prod (full) | $2,100,000 | Month 18 | $4,200,000/year |
| ADF batch pipelines | $900,000 | Month 18 | $900,000/year |
| ADF event triggers | $600,000 | Keep indefinitely | $0 |
| Oracle ETL server licenses | $420,000 | Month 14 | $420,000/year |

**Total license savings by Month 18: $5,520,000/year**

---

## 7. Risk-Adjusted Cost Model

### Scenario Analysis

| Scenario | Probability | 3-Year Cost | Notes |
|---|---|---|---|
| **Base case** (target met, Month 18 decommission) | 50% | $12.5M | As planned |
| **Optimistic** (fast migration, Month 15 decommission) | 20% | $11.2M | Agent > 85% automation rate |
| **Conservative** (Month 24, partial decommission) | 25% | $15.8M | Complex pipelines slow migration |
| **Pessimistic** (Month 30, keep 30% Informatica) | 5% | $19.2M | Significant manual intervention |

**Expected 3-Year Cost (probability-weighted):** $13.1M vs $24.5M current = **$11.4M expected savings**

### Key Cost Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Informatica vendor lock-in on complex transforms | +$1–2M/year (delayed decommission) | Start with simple pipelines; build confidence |
| Team attrition during migration | +$500K (recruiting, ramp-up) | Competitive comp; documentation culture |
| Cloud egress costs (unexpected) | +$200K/year | Network architecture review; VPC endpoints |
| LLM API price increase | +$10–50K/year (small) | Prompt caching; rule engine expansion |
| Open-source dependency goes commercial | Unknown | Pin versions; fork if necessary |
