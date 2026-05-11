# Migration Agent — Detailed Enterprise Design

**Document Type:** Technical Design Document (TDD)
**Status:** Draft v1.0
**Audience:** Enterprise Architecture, AI/ML Platform, Data Engineering Leadership
**Classification:** Internal — Architecture Review
**Related Documents:** Consolidated ETL Framework — Detailed Design

---

## 1. Executive Summary

The Migration Agent is an **AI-assisted, multi-source, semi-autonomous tooling platform** that converts legacy ETL artifacts (Informatica, Azure Data Factory, future: SSIS, Talend) into the target form consumed by the Consolidated ETL Framework — namely YAML job configurations, Airflow DAG files, dbt models, and validation tests.

### Key Properties
- **Source-pluggable:** Pluggable front-ends per legacy ETL technology
- **AI-assisted, not AI-autonomous:** Human-in-the-loop at defined gates
- **Deterministic where possible, AI where necessary:** XML/JSON parsing is deterministic; expression translation uses AI
- **Reproducible:** Same input produces same output; agent runs are auditable
- **Decoupled from runtime:** Failure of agent does not affect Framework operations

### Strategic Outcomes
- Compress migration timeline from 18–24 months (manual) to 10–14 months
- Reduce migration headcount requirements by ~30%
- Establish a reusable enterprise capability for ETL consolidation
- Standardize migration outputs (no per-engineer drift)
- Generate auditable migration evidence for regulatory compliance

### Important Boundary Statement
**The Framework operates fully without the Agent.** The Agent is a productivity accelerator. If the Agent fails to convert a job, that job can be hand-authored against the Framework. There is no architectural dependency from Framework to Agent.

---

## 2. Scope

### 2.1 In Scope

- Ingestion of legacy ETL artifacts (Informatica XML, ADF JSON)
- Parsing into vendor-neutral Intermediate Representation (IR)
- AI-assisted translation of expressions and transformation logic
- Generation of Framework-compliant YAML configs, Airflow DAGs, dbt models, tests
- Validation and reconciliation harness
- Human-in-the-loop review workflow with PR generation
- Migration progress tracking and reporting
- Multi-source plugin architecture (Informatica, ADF; extensible to SSIS, Talend, etc.)

### 2.2 Out of Scope

- Execution of converted jobs (Framework's responsibility)
- Source-system database migration (separate program)
- Change management for legacy ETL retirement
- End-user training on Framework
- Real-time conversion of streaming pipelines

### 2.3 Explicit Non-Goals

- **Full autonomy:** Agent does not deploy converted jobs to production without human approval
- **100% automation:** Complex jobs (≥30% of typical estate) require human engineering
- **Framework modification:** Agent never modifies Framework code; if Framework lacks a capability, that's a Framework backlog item, not an Agent workaround
- **Source-system reverse engineering:** Agent works only on documented, exportable artifacts

---

## 3. Enterprise Standards Compliance

### 3.1 Security Standards
| Standard | Compliance Approach |
|---|---|
| ENT-SEC-001: No credentials in artifacts | Connection details stripped from IR; only references retained |
| ENT-SEC-009: AI service governance | LLM usage governed by enterprise AI policy; no PII or credentials in prompts |
| ENT-SEC-010: Approved AI providers only | LLM calls routed through enterprise AI gateway with approved models |
| ENT-SEC-011: Output validation | All AI-generated artifacts pass syntactic and policy validation before commit |
| ENT-SEC-005: Audit logging | Every agent run, prompt, response, and human approval logged immutably |

### 3.2 AI/ML Governance Standards
| Standard | Compliance Approach |
|---|---|
| ENT-AI-001: Model approval | Only enterprise-approved foundation models (e.g., Claude, GPT via approved gateway) |
| ENT-AI-002: Prompt versioning | All prompts version-controlled in Git; changes require review |
| ENT-AI-003: Output explainability | Each AI conversion includes confidence score and reasoning summary |
| ENT-AI-004: Bias and quality monitoring | Drift detection on conversion accuracy over time |
| ENT-AI-005: Cost tracking | LLM token usage tracked per run; budget controls enforced |
| ENT-AI-006: Hallucination guardrails | Multi-tier validation; LLM outputs never accepted without deterministic checks |

### 3.3 Software Engineering Standards
| Standard | Compliance Approach |
|---|---|
| ENT-OPS-001: GitOps | All artifacts produced as PRs; no direct branch commits |
| ENT-OPS-002: SemVer | Agent versioned; prompt versions tracked |
| ENT-OPS-006: Test coverage | Minimum 80% coverage on deterministic components |
| ENT-OPS-007: Code review | All agent-generated PRs require human reviewer per RACI |

### 3.4 Data Privacy Standards
| Standard | Compliance Approach |
|---|---|
| ENT-DG-006: No PII in LLM prompts | IR scrubbed of sample data before LLM submission; metadata only |
| ENT-DG-007: Source-system data isolation | Agent never reads production source data; metadata-only operation |

### 3.5 Regulatory Compliance
| Regulation | Compliance Approach |
|---|---|
| EU AI Act (Risk Tier: Limited) | Transparency in AI-generated artifacts; human oversight mandatory |
| SOX | Migration evidence retained per retention policy; auditable trail |
| GDPR | No personal data in agent processing; DPIA filed for agent operations |
| Telecom regulatory (e.g., CALEA, regional) | Migration of regulated pipelines flagged for additional human review |

---

## 4. Architecture

### 4.1 Architectural Principles

1. **Determinism first, AI second** — use AI only where determinism is impractical
2. **Fail closed** — uncertain conversions go to human queue, never silently produce wrong output
3. **Pluggable sources, shared core** — IR and downstream stages reused across all source ETLs
4. **Human gates are non-negotiable** — defined approval points cannot be bypassed
5. **Reproducibility** — same input + same agent version + same prompts = same output
6. **Audit everything** — full provenance of every artifact
7. **Independent deployability** — agent failures never impact running Framework jobs

### 4.2 Multi-Stage Pipeline Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                     MIGRATION AGENT PIPELINE                         │
│                                                                      │
│   ┌──────────────┐                                                   │
│   │ INGESTION    │  Source-specific (Informatica/ADF/...)            │
│   │ (Det.)       │  Pull artifacts, build inventory, dependency graph│
│   └──────┬───────┘                                                   │
│          ▼                                                           │
│   ┌──────────────┐                                                   │
│   │ PARSER       │  Source-specific                                  │
│   │ (Det.)       │  XML/JSON → Intermediate Representation (IR)      │
│   └──────┬───────┘                                                   │
│          ▼                                                           │
│   ┌──────────────┐                                                   │
│   │ ANALYZER     │  Source-aware, AI-assisted                        │
│   │ (AI)         │  Complexity scoring, pattern classification, risk │
│   └──────┬───────┘                                                   │
│          ▼                                                           │
│   ┌──────────────┐                                                   │
│   │ TRANSLATOR   │  Source-aware, hybrid (rules + AI)                │
│   │ (Hybrid)     │  Expression translation, semantic upgrades        │
│   └──────┬───────┘                                                   │
│          ▼                                                           │
│   ┌──────────────┐                                                   │
│   │ GENERATOR    │  Shared, deterministic                            │
│   │ (Det.)       │  IR + translations → YAML, DAG, dbt, tests        │
│   └──────┬───────┘                                                   │
│          ▼                                                           │
│   ┌──────────────┐                                                   │
│   │ VALIDATOR    │  Shared, mostly deterministic                     │
│   │ (Hybrid)     │  Syntactic, unit, sample-run, reconciliation      │
│   └──────┬───────┘                                                   │
│          ▼                                                           │
│   ┌──────────────┐                                                   │
│   │ REVIEWER     │  Shared, AI-assisted                              │
│   │ (AI)         │  PR generation, business summary, flag concerns   │
│   └──────┬───────┘                                                   │
│          ▼                                                           │
│   ┌──────────────────────────────────────────────────────────────┐   │
│   │                  HUMAN REVIEW GATES                          │   │
│   │   Gate 1: Analysis sample review (calibration)               │   │
│   │   Gate 2: Translation engineering review                     │   │
│   │   Gate 3: SME business logic validation                      │   │
│   │   Gate 4: Reconciliation sign-off                            │   │
│   │   Gate 5: Production cutover approval                        │   │
│   └─────────────────────────┬────────────────────────────────────┘   │
│                             │                                        │
│                             ▼                                        │
│   ┌──────────────────────────────────────────────────────────────┐   │
│   │            ORCHESTRATOR (state machine)                      │   │
│   │   Manages pipeline state, retries, gates, batch progress     │   │
│   └──────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
```

### 4.3 Plugin Architecture for Multi-Source Support

```
agent/
├── core/                           # Shared across all sources
│   ├── ir/
│   │   ├── schema.py               # Canonical IR definition
│   │   └── validator.py
│   ├── translator/
│   │   ├── expression_engine.py    # Shared translation framework
│   │   └── target_patterns.py      # SQL/Python output patterns
│   ├── generator/
│   │   ├── yaml_generator.py
│   │   ├── dag_generator.py
│   │   ├── dbt_generator.py
│   │   └── test_generator.py
│   ├── validator/
│   │   ├── syntactic.py
│   │   ├── unit_runner.py
│   │   └── reconciliation.py
│   ├── reviewer/
│   │   └── pr_builder.py
│   ├── orchestrator/
│   │   └── state_machine.py
│   └── ai/
│       ├── llm_client.py           # Enterprise AI gateway integration
│       ├── prompts/
│       └── rag/                    # Retrieval-augmented few-shot store
├── sources/
│   ├── informatica/
│   │   ├── ingestion.py
│   │   ├── parser.py               # XML → IR
│   │   ├── expressions.py          # Informatica DSL → AST
│   │   ├── analyzer_rules.py
│   │   └── translator_patterns.py
│   ├── adf/
│   │   ├── ingestion.py
│   │   ├── parser.py               # JSON → IR
│   │   ├── expressions.py          # ADF expression DSL → AST
│   │   ├── analyzer_rules.py
│   │   └── translator_patterns.py
│   └── (future: ssis/, talend/, glue/, etc.)
└── interfaces/
    ├── cli.py
    ├── api.py
    └── ui/                         # Web UI for review queues
```

---

## 5. Detailed Stage Design

### 5.1 Ingestion Stage

#### 5.1.1 Responsibilities
- Connect to source repository (Informatica via `pmrep`, ADF via Azure DevOps Git or ADF REST API)
- Export all artifacts to a normalized staging area
- Build artifact inventory with metadata (last modified, owner, downstream usage)
- Construct dependency graph (which sessions invoke which mappings, which pipelines call which datasets)
- Tag artifacts with business domain and pipeline tier from enterprise metadata sources

#### 5.1.2 Source-Specific Implementations

**Informatica Ingestion**
- Method: `pmrep` CLI export, or PowerCenter REST API (newer versions)
- Outputs: mapping XMLs, session XMLs, workflow XMLs, parameter files, mapplet definitions, reusable transformations
- Dependency resolution: parse session→mapping references, workflow→session references

**ADF Ingestion**
- Method: Azure DevOps Git pull (preferred), or ADF REST API export
- Outputs: pipeline JSONs, dataflow JSONs, dataset JSONs, linked service JSONs (credentials redacted), trigger JSONs
- Dependency resolution: parse `ExecutePipeline` activities, dataset references in activities

#### 5.1.3 Output Contract
```json
{
  "ingestion_run_id": "uuid",
  "source_type": "informatica | adf | ...",
  "source_version": "string",
  "artifacts": [
    {
      "id": "natural-key from source",
      "type": "mapping | session | workflow | pipeline | dataflow | ...",
      "raw_content_path": "s3://staging/...",
      "metadata": { "owner": "...", "last_modified": "...", "tier": "...", ... },
      "dependencies": ["artifact_ids"]
    }
  ],
  "graph": { "nodes": [...], "edges": [...] }
}
```

### 5.2 Parser Stage

#### 5.2.1 Responsibilities
- Convert source-specific raw artifact (XML, JSON) into the **canonical Intermediate Representation (IR)**
- Preserve all semantic information; lose no business logic
- Validate IR against schema
- Flag artifacts that fail to parse cleanly

#### 5.2.2 Canonical IR Schema (Excerpt)

```json
{
  "ir_version": "1.0",
  "source_origin": {
    "type": "informatica | adf | ...",
    "artifact_id": "string",
    "exported_at": "ISO-8601"
  },
  "job": {
    "id": "string",
    "name": "string",
    "description": "string",
    "domain": "string"
  },
  "sources": [
    {
      "id": "string",
      "system_type": "sqlserver | oracle | ...",
      "connection_ref": "string (no credentials)",
      "extraction": {
        "type": "table | query | file | api",
        "spec": { ... }
      },
      "incremental": true,
      "watermark_ref": "string"
    }
  ],
  "transformations": [
    {
      "id": "string",
      "type": "filter | lookup | expression | joiner | aggregator | ...",
      "inputs": ["id"],
      "config": { ... },
      "expressions": [
        {
          "name": "output_field",
          "source_dialect": "informatica | adf",
          "source_expression": "raw expression text",
          "ast": { ... },                         // parsed expression tree
          "translated": {
            "sql": "...",
            "python": "...",
            "confidence": 0.0-1.0
          }
        }
      ]
    }
  ],
  "targets": [
    {
      "id": "string",
      "system_type": "string",
      "connection_ref": "string",
      "load_strategy": "append | overwrite | upsert | scd_type_2"
    }
  ],
  "parameters": [...],
  "dependencies": {
    "upstream_jobs": [...],
    "downstream_jobs": [...]
  },
  "complexity": {
    "score": 1-5,
    "factors": ["transformation_count", "expression_complexity", ...]
  },
  "warnings": [...],
  "ai_notes": [...]
}
```

#### 5.2.3 Source Plugin Contract

```python
class SourceParser(ABC):
    @abstractmethod
    def supported_artifact_types(self) -> List[str]: ...

    @abstractmethod
    def parse(self, raw_artifact_path: str) -> IR: ...

    @abstractmethod
    def parse_expression(self, expr: str, context: dict) -> ExpressionAST: ...
```

This plugin interface is **stable** — adding a new source means implementing this contract.

### 5.3 Analyzer Stage (AI-Assisted)

#### 5.3.1 Responsibilities
- Score complexity (1–5)
- Classify into known migration patterns
- Identify risk flags
- Recommend conversion strategy (auto-convert, auto-with-review, manual)
- Estimate effort

#### 5.3.2 AI Usage
- Input: IR (no source data)
- Output: structured JSON analysis
- Multiple models for cross-validation on high-stakes jobs
- All prompts and responses logged

#### 5.3.3 Pattern Library

Known patterns with deterministic recognition + AI fallback for novel patterns:

| Pattern | Recognition | Confidence |
|---|---|---|
| Simple table copy | Single source, single target, no transforms | High |
| Filtered copy | + filter transform | High |
| Lookup enrichment | + lookup transform | High |
| Aggregation rollup | aggregator + group_by | High |
| SCD Type 1 load | upsert with no history | High |
| SCD Type 2 load | natural key + tracked columns + effective dates | High |
| Fact load with multi-dim lookups | multiple lookups + insert | High |
| File ingest | file source + parse + load | High |
| Mainframe ingest | EBCDIC source + parse + load | High |
| File-based outbound feed | source + format + file target | High |
| Conditional routing | router with multiple branches | Medium |
| Dynamic schema | runtime schema resolution | Low (often manual) |
| Custom Python/Java | embedded code execution | Always manual |
| Stored procedure heavy | SP-driven business logic | Always manual |

### 5.4 Translator Stage (Hybrid)

#### 5.4.1 Responsibilities
- Translate source-dialect expressions to target dialects (SQL or Python)
- Apply semantic upgrades (e.g., recognize SCD2 pattern and emit `scd_type_2` transformation)
- Detect Informatica/ADF anti-patterns and rewrite cleanly
- Maintain confidence scores for downstream review routing

#### 5.4.2 Hybrid Strategy

```
Expression in source dialect
        │
        ▼
┌─────────────────┐
│ Lexer/Parser    │  Deterministic; converts to AST
│ (source-aware)  │
└────────┬────────┘
         ▼
┌─────────────────┐
│ Pattern Matcher │  Try known deterministic patterns first
│ (rule-based)    │
└────────┬────────┘
         │
   ┌─────┴──────┐
   │ Match?     │
   └─┬────────┬─┘
     │ Yes    │ No
     ▼        ▼
┌─────────┐  ┌──────────────────┐
│ Emit    │  │ LLM Translation  │
│ pattern │  │ with few-shot    │
└────┬────┘  │ examples (RAG)   │
     │       └──────────┬───────┘
     │                  ▼
     │       ┌──────────────────┐
     │       │ Validation:      │
     │       │ - parse output   │
     │       │ - test against   │
     │       │   sample inputs  │
     │       └──────────┬───────┘
     │                  ▼
     └──────►   Translated expression
                   + confidence
                   + alternative translations considered
                   + semantic notes
```

#### 5.4.3 Expression Pattern Coverage Targets

| Confidence Source | Target Coverage |
|---|---|
| Deterministic patterns | ≥80% of expressions |
| AI translation, validated by tests | 15% |
| AI translation, flagged for human review | 5% |

#### 5.4.4 RAG (Retrieval-Augmented Generation) Pattern

A vector store of approved past conversions accelerates accuracy:

```
For each new translation request:
   1. Compute IR feature vector (transformation type, expression shape, dialect)
   2. Retrieve top-K similar past conversions from vector store
   3. Include retrieved examples as few-shot in LLM prompt
   4. After human approval, add new conversion to vector store

Effect: Accuracy improves over time as corpus grows.
```

### 5.5 Generator Stage (Deterministic)

#### 5.5.1 Responsibilities
- Produce Framework-compliant YAML config from IR
- Produce Airflow DAG file from workflow IR
- Produce dbt models for SQL-suitable transformations
- Produce unit tests with sample input/output derived from IR
- Produce business logic markdown summary for SME review

#### 5.5.2 Output Artifact Contract

For each migrated job, the Generator produces:
```
migrations/<wave>/<job_name>/
├── jobs/<job_name>.yaml             # Framework job config
├── dags/<workflow_name>.py          # Airflow DAG
├── dbt/models/<model>.sql           # If SQL-friendly
├── tests/<job_name>_test.yaml       # Validation tests
├── docs/<job_name>.md               # Business logic summary
└── migration_metadata.json          # Source ref, confidence, etc.
```

#### 5.5.3 Idempotency Guarantee

Same IR + same Generator version + same Translator outputs ⇒ byte-identical artifacts. This guarantee is enforced via golden-output regression tests in CI.

### 5.6 Validator Stage

#### 5.6.1 Validation Tiers

| Tier | What It Validates | Required For |
|---|---|---|
| Syntactic | YAML parses; DAG compiles; dbt builds | All conversions |
| Schema | YAML matches Framework schema; refs resolve | All conversions |
| Unit | Generated tests pass on sample data | All conversions |
| Sample-run | Job runs against sampled data; row counts match | Auto-conversions |
| Shadow-run | Full parallel run vs Informatica/ADF; reconciliation passes | Pre-cutover |

#### 5.6.2 Reconciliation Framework

For each shadow-run:
- Row count match (per stage)
- Column-level checksums (hash all values per column, compare)
- Sample diff (for mismatches, identify specific rows)
- Business rule tests (declared invariants)
- Performance comparison (legacy vs Framework runtime)

Reconciliation results stored in audit database; required for cutover sign-off.

### 5.7 Reviewer Stage

#### 5.7.1 Responsibilities
- Generate PR with structured description
- Produce business logic summary for SME review (plain language, no technical jargon)
- List specific reviewer questions surfaced during conversion
- Compute and attach overall confidence score
- Tag PR with appropriate reviewers based on domain and complexity

#### 5.7.2 PR Template

```markdown
# Migration: <source artifact name> → <Framework job name>

## Summary
Converted from: <Informatica/ADF/...>
Source artifact ID: <id>
Confidence: <0.0-1.0>
Pattern: <recognized pattern>
Complexity: <1-5>

## Business Logic Summary (for SME Review)
<plain-language description>

## Conversion Details
- Sources: <list>
- Transformations: <list with brief>
- Targets: <list>
- Watermark strategy: <description>

## Known Differences from Source
<any semantic deltas the agent introduced or detected>

## Reviewer Questions
1. <specific question, e.g., "Original mapping had hardcoded date filter '> 2020-01-01'. Should this be parameterized?">
2. ...

## Validation Results
- Syntactic: ✓
- Schema: ✓
- Unit tests: ✓ (12 passed)
- Sample run: ⚠ row count differs by 3 (investigate)

## Files Changed
- jobs/load_dim_customer.yaml (new)
- dags/daily_customer_load.py (new)
- ...

## Reviewers
- Engineering: @data-eng-team
- SME: @customer-domain-sme
- Data Quality: @dq-team (P1 pipeline)
```

### 5.8 Orchestrator (State Machine)

#### 5.8.1 Job Conversion State Machine

```
   INGESTED
       │
       ▼
   PARSED  ──────────► PARSE_FAILED (queue: human-fix)
       │
       ▼
   ANALYZED ─────────► ANALYZER_FLAGGED (queue: complex-review)
       │
       ▼
   TRANSLATED ───────► TRANSLATION_LOW_CONFIDENCE (queue: expert-review)
       │
       ▼
   GENERATED
       │
       ▼
   VALIDATED ────────► VALIDATION_FAILED (queue: human-fix)
       │
       ▼
   REVIEWED
       │
       ▼
   PR_OPEN ──────────► PR_REJECTED (back to TRANSLATED with comments)
       │
       ▼
   PR_APPROVED
       │
       ▼
   SHADOW_RUN_START
       │
       ▼
   SHADOW_RUN_PASS ──► SHADOW_RUN_FAIL (queue: investigate)
       │
       ▼
   CUTOVER_APPROVED
       │
       ▼
   PRODUCTION
       │
       ▼
   LEGACY_RETIRED
```

#### 5.8.2 Implementation Technology

- **LangGraph** as the state machine engine (durable, supports HITL primitives)
- State persisted to PostgreSQL for audit and resumability
- Each transition logged with timestamp, actor, and any LLM calls

---

## 6. Cross-Validation Against Enterprise Migration Patterns

### 6.1 Pattern: Multi-Stage Pipeline with Determinism + AI Hybrid

**Industry Evidence:** Successful enterprise AI deployments (Microsoft Copilot for Security, Google Vertex AI Agent Builder, JPMorgan IndexGPT) all use multi-stage pipelines with deterministic boundaries. Failed pure-LLM systems (early experiments at Air Canada chatbot, lawyer ChatGPT incidents) demonstrate the risk of unbounded AI generation.

**Design Validation:** ✅ Deterministic parsing/generation; AI bounded to translation and analysis with structured input/output.

### 6.2 Pattern: Intermediate Representation as Stable Backbone

**Industry Evidence:** LLVM (compiler ecosystem), Apache Calcite (SQL parsing), MLIR (ML compiler infrastructure) — all major translation systems anchor on a stable IR. The IR is the most strategically important artifact in any translation system.

**Design Validation:** ✅ Canonical IR defined first; all sources targeting the same IR; downstream stages source-agnostic.

**Risk if violated:** Per-source ad-hoc handling creates exponential complexity as source count grows. Observed in failed cross-tool migration tools.

### 6.3 Pattern: Human-in-the-Loop at Defined Gates

**Industry Evidence:** EU AI Act, NIST AI RMF, ISO/IEC 23894 all mandate meaningful human oversight for consequential AI decisions. Enterprise deployments at Goldman, JPM, BBVA explicitly design HITL gates.

**Design Validation:** ✅ Five named gates; each cannot be bypassed; each has defined approver roles.

### 6.4 Pattern: RAG for Domain Specialization

**Industry Evidence:** RAG outperforms fine-tuning for domain-specific tasks per multiple published evaluations (Lewis et al. 2020, subsequent enterprise case studies). Used in production by Bloomberg (BloombergGPT context), Morgan Stanley (advisor support), and many others.

**Design Validation:** ✅ Vector store of approved conversions used as few-shot context; corpus grows with each approval.

### 6.5 Pattern: Reconciliation as Migration Quality Bar

**Industry Evidence:** All large-scale data platform migrations (Capital One Cloud Migration, Disney+ launch, FedNow) include parallel-run reconciliation as cutover criteria. This is industry standard.

**Design Validation:** ✅ Shadow-run + reconciliation mandatory; quantitative criteria for cutover.

### 6.6 Pattern: Idempotent, Reproducible Generation

**Industry Evidence:** Compiler theory; Bazel/Buck reproducible builds; generated-code best practices (gRPC, OpenAPI generators). Reproducibility is essential for audit and trust.

**Design Validation:** ✅ Idempotency guarantee; golden regression tests in CI.

### 6.7 Pattern: Plugin Architecture for Source Extensibility

**Industry Evidence:** Compiler frontends (GCC, LLVM), database migration tools (AWS SCT, Liquibase), data movement tools (Airbyte connectors) all use plugin patterns for source extensibility.

**Design Validation:** ✅ SourceParser interface; new sources are plugins, not core changes.

### 6.8 Pattern: Confidence-Based Routing

**Industry Evidence:** Standard in production ML systems (autonomous vehicle perception stacks, medical imaging AI, fraud detection). High-confidence outputs auto-process; low-confidence routed to humans.

**Design Validation:** ✅ Confidence scores at translator stage drive routing; thresholds configurable per pipeline tier.

### 6.9 Pattern: Auditable AI Operations

**Industry Evidence:** EU AI Act requires logging of high-risk AI system operations. Financial services (FFIEC) require model risk management. All major regulated industries require this.

**Design Validation:** ✅ Every prompt, response, decision, approval logged immutably in audit database.

### 6.10 Anti-Patterns Avoided

| Anti-Pattern | Why It Fails | Mitigation |
|---|---|---|
| **End-to-end LLM** (raw XML → final code) | Inconsistent, unreviewable, low-accuracy | Multi-stage with deterministic boundaries |
| **Auto-deploy without HITL** | Production incidents, regulatory exposure | Mandatory human gates |
| **Source-specific monolith per ETL tool** | N tools = N tools to maintain | Plugin pattern + shared core |
| **Trust LLM output without validation** | Hallucinations enter production | Multi-tier validation framework |
| **Treat agent as a one-off project** | Re-built per migration program; no reuse | Build as durable internal product |
| **Ignore long tail of edge cases** | "Last 20% takes 80% of effort" surprises everyone | Explicit triage; complex jobs go to manual queue |
| **No reproducibility** | Can't audit, can't regression test | Idempotency guaranteed; golden tests |

---

## 7. Non-Functional Requirements

### 7.1 Performance Targets

| Metric | Target |
|---|---|
| Parse + analyze single mapping | <60 seconds |
| Full conversion (parse → PR) for typical mapping | <10 minutes |
| Batch throughput | 50 mappings/hour during active migration |
| LLM cost per conversion | <$2 (governed by budget controls) |
| Reconciliation runtime | Within 2x source ETL runtime |

### 7.2 Quality Targets

| Metric | Target |
|---|---|
| First-pass auto-conversion rate (simple jobs) | ≥85% by end of pilot |
| First-pass auto-conversion rate (medium jobs) | ≥70% |
| Reconciliation pass rate on auto-conversions | ≥98% |
| False-positive rate on validations (jobs flagged as failing that are actually correct) | <2% |
| False-negative rate on validations (jobs marked passing that have defects) | <0.5% |

### 7.3 Availability

- Agent does not require high availability (it's a tool, not a runtime)
- Target: 99% during business hours; planned downtime acceptable
- Long-running conversions checkpointed; resumable across restarts

### 7.4 Auditability

- Every agent run produces a tamper-evident audit record
- Records retained per enterprise records retention policy (typically 7 years for SOX scope)
- Records queryable for regulatory reviews

---

## 8. Security Design

### 8.1 Threat Model

| Threat | Mitigation |
|---|---|
| LLM prompt injection via source artifact contents | Sanitize all source content before LLM submission; instruction-vs-data separation in prompts |
| Credential leak via source artifact (Informatica often has them) | Strip credentials at parser stage; never include in IR or prompts |
| PII in source data leaking to LLM | Agent operates on metadata only; no source data in prompts |
| Generated code containing malicious payload | Generated code passes static analysis (bandit, semgrep); allow-list of imports |
| Unauthorized agent invocation | RBAC on agent CLI/API/UI; only authorized engineers can run conversions |
| Tampered agent output | All outputs Git-committed via signed commits; PR review mandatory |
| AI service outage | Agent degrades gracefully; deterministic patterns continue working |
| LLM cost runaway | Per-run and per-day budget caps; alert + halt at threshold |

### 8.2 Data Handling

- **Source artifacts:** Stored in approved enterprise storage, encrypted at rest, access-logged
- **IR:** No source data; only metadata and structure. Stored alongside source artifacts
- **LLM prompts:** Logged in audit DB; never contain credentials or PII
- **LLM responses:** Logged in audit DB; reviewed for sensitive content leakage

---

## 9. Implementation Plan

### 9.1 Phased Delivery

**Phase 1 — Foundation (Months 1–3)**
- Canonical IR schema design
- Informatica ingestion + parser
- Hand-build Generator (deterministic, template-based)
- Build basic Validator (syntactic, schema)
- 10 reference conversions hand-validated

**Phase 2 — Translator + AI (Months 4–6)**
- Informatica expression translator (deterministic patterns + LLM fallback)
- Enterprise AI gateway integration
- Prompt versioning, RAG vector store
- Validator (unit, sample-run tiers)
- 30 pilot Informatica conversions

**Phase 3 — Reviewer + Orchestrator (Months 6–8)**
- Reviewer agent (PR generation, business summaries)
- LangGraph orchestrator with state machine
- Web UI for review queues
- Audit logging infrastructure
- 50+ Informatica jobs in production

**Phase 4 — Production Hardening (Months 8–10)**
- Performance optimization, batch processing
- Comprehensive test suite, golden regressions
- Disaster recovery, backup of audit DB
- 100+ Informatica jobs in production
- Wave migration capability

**Phase 5 — Multi-Source Extension (Months 10–13)**
- ADF source plugin (ingestion + parser + translator patterns)
- Pilot 30 ADF conversions
- Refine shared core based on second-source learnings

**Phase 6 — Scale (Months 13+)**
- Full Informatica + ADF wave migrations
- Add SSIS/Talend plugins as needed
- Continuous accuracy improvement via RAG corpus growth

### 9.2 Team Structure

| Role | Headcount | Responsibility |
|---|---|---|
| Agent Engineering Lead | 1 | Architecture, AI strategy |
| Senior Backend Engineers | 3 | Parsers, translators, generators |
| ML/AI Engineer | 1 | Prompt engineering, RAG, evaluation |
| QA / Test Engineer | 1 | Validation framework, regression suite |
| Domain Engineer (Informatica/ADF) | 1 | Source-system expertise |
| Frontend Engineer | 0.5 | Review UI |
| Technical Writer | 0.5 | Prompts, runbooks, training |

### 9.3 Governance

- **AI Steering Committee** approval for model choices, prompt strategy
- **Architecture Review Board** sign-off on IR schema versions
- **Security Review** on all data handling changes
- **Data Governance Council** review of how PII is handled in source artifacts

---

## 10. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| LLM accuracy below targets | Medium | High | Deterministic-first design; multi-model cross-check; continuous evaluation |
| LLM provider API changes | Medium | Medium | Abstract via internal AI gateway; multi-provider support |
| Source artifact quirks not anticipated | High | Medium | Triage system; manual escape hatch; growing pattern library |
| Cost overrun on LLM usage | Medium | Medium | Per-run budgets; alerts; deterministic-first reduces calls |
| Reviewer bandwidth becomes bottleneck | High | High | Tiered review (P0 strict, P3 lighter); automation of low-risk reviews |
| Agent becomes monolith despite plugin design | Medium | High | Plugin contract enforced via interfaces; integration tests for new sources |
| Hallucinations slip through validation | Low | Critical | Multi-tier validation; reconciliation as final gate |
| AI/regulatory landscape shifts (EU AI Act enforcement, etc.) | Medium | Medium | Design for explainability and audit from Day 1 |
| Framework evolves faster than agent | Medium | Low | Generator targets versioned schema; backward compatibility in Framework |

---

## 11. Cost Model

### 11.1 Build Cost (Phases 1–4)

- Engineering: ~$2.5M (8 FTE × 10 months × loaded cost)
- AI infrastructure: ~$200K (gateway, RAG vector store, monitoring)
- LLM token costs during build: ~$50K
- **Total build: ~$2.75M**

### 11.2 Run Cost (per 100 mappings)

- LLM tokens: ~$200
- Compute (containers, vector DB): ~$50
- Engineering review: ~40 hours (cost varies by org)
- **Total per 100 mappings: ~$5K (including engineering review)**

### 11.3 Comparison vs. Manual Migration

For a 500-mapping migration:
- Manual: ~18 months, 8 engineers, ~$5M total
- Agent-assisted: ~10 months, 5 engineers, ~$2.5M migration + agent build
- **Net savings: ~$2.5M, plus agent is reusable for future migrations**

Caveat: agent build cost is fully amortized only if subsequent migrations occur. For a one-time 500-job migration, manual + Copilot-in-IDE may be more cost-effective. Agent investment justified at >800 total jobs across the migration program lifetime.

---

## 12. Open Questions

1. **Multi-LLM strategy** — single approved model or multi-model with consensus? Recommendation: start single, add cross-check for high-risk in Phase 4.
2. **Closed-source vs open-source LLMs** — enterprise gateway likely supports multiple; recommendation: Claude or GPT-4 class for translation, possibly Llama for analysis.
3. **Plugin contributions from source-system vendors** — should we accept community plugins for SSIS, Talend? Recommendation: internal-only Phase 1; revisit when platform stable.
4. **Self-service vs centralized** — should each migration team run their own agent instance? Recommendation: centralized service with multi-tenancy.
5. **Integration with existing ALM tools** — JIRA tickets per migration? Recommendation: yes, automate JIRA creation per PR.

---

## 13. Glossary

| Term | Definition |
|---|---|
| Agent | The Migration Agent system as a whole |
| Source ETL | Legacy ETL technology being migrated from (Informatica, ADF, etc.) |
| IR (Intermediate Representation) | Vendor-neutral semantic model of a job |
| Plugin | Source-specific component implementing IR generation |
| RAG | Retrieval-Augmented Generation (using vector store as few-shot context) |
| HITL | Human-in-the-Loop |
| Conversion | The process of transforming one source artifact into Framework artifacts |
| Reconciliation | Comparing legacy and Framework job outputs for parity |
| Cutover | Switching production traffic from legacy to Framework job |

---

## 14. Approvals

| Role | Name | Date | Signature |
|---|---|---|---|
| Enterprise Architect | | | |
| Head of Data Engineering | | | |
| Chief Information Security Officer | | | |
| Head of AI/ML Platform | | | |
| Data Governance Lead | | | |
| Agent Engineering Lead | | | |

---

**Document History**

| Version | Date | Author | Changes |
|---|---|---|---|
| 0.1 | TBD | Agent Eng | Initial draft |
| 1.0 | TBD | Agent Eng | First review version |
