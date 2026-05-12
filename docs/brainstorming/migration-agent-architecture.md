# Migration Agent — Heterogeneous Multi-Agent Architecture

**Document Type:** Agent Design — Deep-Dive  
**Version:** 1.0  
**Date:** 2026-05-11  
**Classification:** Internal — Engineering Review

---

## Why Heterogeneous?

A single monolithic LLM cannot reliably perform every step of ETL migration. Each stage demands a fundamentally different capability profile:

| Stage | What you need | Wrong tool for it |
|---|---|---|
| XML/JSON parsing | Deterministic, schema-aware | LLM (hallucination risk) |
| Complexity scoring | Reproducible heuristic | LLM (inconsistent) |
| Expression translation | High accuracy, auditable | Rule-only (coverage gap) |
| YAML generation | Zero creativity, 100% schema-correct | LLM (format drift) |
| Test generation | AST-aware, fixture-correct | Rules-only (too rigid) |
| Business summary | Fluent natural language | Rules-only (unreadable) |
| Validation | Code execution, row counts | LLM (cannot run code) |

A **heterogeneous agent** system assigns each stage to the right tool — deterministic code, small specialized LLM, or frontier model — and wires them together through a typed state machine. No agent has to be universally capable; each only has to be locally correct.

---

## Agent Taxonomy — Heterogeneous Cyclic Workflow

The workflow is not a linear pipeline. Every tier has feedback paths — failed validation loops back to translation, human rejection loops back to generation, and every approved output feeds the long-term memory that makes the next cycle cheaper and faster.

```mermaid
flowchart TD
    %% ── Entry ──────────────────────────────────────────────────────────
    ARTIFACT(["🗂️ Vendor Artifact\nInformatica XML · ADF JSON"])

    %% ── Tier 1: Parse ───────────────────────────────────────────────────
    subgraph PARSE_TIER["① Parse Tier — Deterministic · No LLM"]
        PA["Parser Agent\nlxml / jsonpath → IR\nSchema-validated"]
        DA["Dependency Agent\nMapping DAG builder\ngraph-topological order"]
        PA --> DA
    end

    %% ── Tier 2: Analysis ────────────────────────────────────────────────
    subgraph ANALYSIS_TIER["② Analysis Tier — Rule-first · Haiku on edge cases"]
        CA["Complexity Agent\nHeuristic score 1–5\n+Haiku for embedded SQL"]
        CLA["Classifier Agent\nEmbedding similarity\npgvector ANN search"]
        CA --> CLA
    end

    %% ── Tier 3: Translation ─────────────────────────────────────────────
    subgraph TRANSLATE_TIER["③ Translation Tier — Rule → LLM escalation"]
        RA["Rules Agent\n200+ deterministic patterns\n≥80% coverage · $0 LLM"]
        LA["LLM Translator\nClaude Sonnet + RAG\nfew-shot from pgvector"]
        CS["Confidence Scorer\nper-expression 0.0–1.0"]
        RA -- "unmatched\nexpression" --> LA
        LA --> CS
        RA --> CS
    end

    %% ── Tier 4: Generation ──────────────────────────────────────────────
    subgraph GEN_TIER["④ Generation Tier — Deterministic Templates · Haiku for prose"]
        YG["YAML Generator\nJinja2 → schema-validated"]
        DG["DAG Generator\nAirflow Python AST"]
        TG["Test Generator\npytest fixture builder"]
        SG["Summary Generator\nClaude Haiku · SME-readable"]
    end

    %% ── Tier 5: Validation ──────────────────────────────────────────────
    subgraph VAL_TIER["⑤ Validation Tier — Code Execution · No LLM"]
        SV["Syntax Validator\nT1: YAML load · DAG import\nT2: JSON Schema strict"]
        UV["Unit Test Runner\nT3: pytest 100 sample rows\nT4: etl-runner 1K rows"]
        RV["Reconciliation Agent\nT5: shadow run · full diff\nP0/P1 only"]
        SV --> UV --> RV
    end

    %% ── Tier 6: Review ──────────────────────────────────────────────────
    subgraph REVIEW_TIER["⑥ Review Tier — Claude Sonnet + Human Gate"]
        PRG["PR Generator\nGitHub PR · confidence table\nSME checklist · reviewer Qs"]
        HG["🔐 Human Gate\nBlocking approval\ncannot be bypassed"]
        PRG --> HG
    end

    %% ── Long-Term Memory ────────────────────────────────────────────────
    subgraph MEMORY["♾️ Long-Term Memory — grows with every approved migration"]
        VEC[("pgvector\nTranslation examples\nEmbedded IR fingerprints")]
        RULES[("Rules YAML\nHand-curated\n+ auto-promoted patterns")]
        AUDIT[("Audit Log\nEvery decision\n+ human action")]
    end

    %% ── Happy path (forward flow) ───────────────────────────────────────
    ARTIFACT --> PARSE_TIER
    PARSE_TIER --> ANALYSIS_TIER
    ANALYSIS_TIER --> TRANSLATE_TIER
    TRANSLATE_TIER --> GEN_TIER
    GEN_TIER --> VAL_TIER
    VAL_TIER --> REVIEW_TIER
    REVIEW_TIER --> PROD(["✅ Production\nLegacy retired"])

    %% ── Feedback cycle 1: Low confidence → Manual Queue ────────────────
    CS -- "confidence < 0.7\nany expression" --> MQ["🟡 Manual Queue\nhuman edits IR\n2-day SLA"]
    MQ -- "corrected IR\n+ retry signal" --> TRANSLATE_TIER

    %% ── Feedback cycle 2: Validation fail → Regenerate ─────────────────
    SV -- "T1/T2 fail\n+ error context" --> GEN_TIER
    UV -- "T3/T4 fail\n+ diff report" --> TRANSLATE_TIER

    %% ── Feedback cycle 3: Human rejects PR → Revise ─────────────────────
    HG -- "rejected\n+ review comments" --> TRANSLATE_TIER

    %% ── Feedback cycle 4: Shadow run fail → Manual ──────────────────────
    RV -- "T5 reconciliation fail\nrow delta > 0.01%" --> MQ

    %% ── Learning cycle: Approved output → Memory ─────────────────────────
    PROD -- "approved translation\nconfidence ≥ 0.9" --> VEC
    PROD -- "pattern seen 5×\nauto-promote proposal" --> RULES
    HG -- "every decision\n+ confidence + actor" --> AUDIT

    %% ── Memory feeds back into Analysis + Translation ────────────────────
    VEC -- "RAG retrieval\nfew-shot examples" --> LA
    VEC -- "ANN similarity\npattern match" --> CLA
    RULES -- "updated rule set\nnext batch" --> RA

    %% ── Parse hard fail → no retry ──────────────────────────────────────
    PA -- "parse error\nno retry" --> FAIL(["🔴 Parse Failed\nescalate to\nmanual migration"])

    %% ── Styles ───────────────────────────────────────────────────────────
    style PARSE_TIER    fill:#0d2a1a,stroke:#27ae60,color:#fff
    style ANALYSIS_TIER fill:#1a2a3a,stroke:#2e86c1,color:#fff
    style TRANSLATE_TIER fill:#2a1a3a,stroke:#9b59b6,color:#fff
    style GEN_TIER      fill:#0d1b2a,stroke:#3498db,color:#fff
    style VAL_TIER      fill:#2a1a0a,stroke:#e67e22,color:#fff
    style REVIEW_TIER   fill:#3a1a1a,stroke:#e74c3c,color:#fff
    style MEMORY        fill:#1a1a0d,stroke:#f1c40f,color:#fff
    style MQ            fill:#2a1a0a,stroke:#f39c12,color:#fff
    style PROD          fill:#0d3b2e,stroke:#27ae60,color:#fff
    style FAIL          fill:#3b0d0d,stroke:#e74c3c,color:#fff
```

### Reading the Diagram

| Arrow type | Meaning |
|---|---|
| Solid downward | Happy-path forward flow |
| `→ Manual Queue` | Low confidence or reconciliation failure — human corrects IR and retries |
| `→ Translation Tier` (from Validation) | Test failure feeds error context back for re-translation |
| `→ Translation Tier` (from Human Gate) | Reviewer rejection with comments triggers a targeted retranslation |
| `→ pgvector / Rules` | Every approved migration strengthens future runs — the learning cycle |
| `pgvector / Rules →` agents | Memory feeds Classification and Translation on every run |

### Why Cycles Matter

A purely linear pipeline fails at scale. The cycles are what make the system self-correcting:

- **Validation → Translation feedback loop**: when pytest catches a wrong expression, the error diff is injected into the LLM Translator's next prompt as negative context — "previous attempt produced X, which failed because Y." The model corrects without human involvement.
- **Human rejection → Translation feedback loop**: a reviewer's PR comment ("this SCD logic doesn't handle NULL surrogate keys") is parsed and appended to the IR as a structured correction hint before the retranslation pass.
- **Learning cycle**: the more pipelines migrate, the denser the pgvector store becomes. After 200 migrations, the Classifier finds near-exact matches for 70%+ of new mappings — the LLM Translator is barely invoked. After 500 migrations, the Rules Agent receives auto-promoted patterns covering 93%+ of expressions.

The system does not plateau — each wave makes the next wave faster and cheaper.

---

## Supervisor → Worker Control Flow

The Supervisor Agent is the sole router. It never does work itself — it reads the typed `AgentState` after each worker completes and decides what runs next. Workers never call each other directly. Every handoff goes through the Supervisor, which is what makes the system observable, resumable, and auditable.

```mermaid
flowchart LR
    %% ── Central Supervisor ──────────────────────────────────────────────
    SUP(["🧠 Supervisor Agent\nReads AgentState\nDecides next worker\nNo LLM — pure routing logic"])

    %% ── Worker Nodes ────────────────────────────────────────────────────
    W1["① Parser\nXML/JSON → IR"]
    W2["② Complexity\nScore 1–5"]
    W3["③ Classifier\npgvector match"]
    W4["④ Rules Agent\nDeterministic translate"]
    W5["⑤ LLM Translator\nClaude Sonnet + RAG"]
    W6["⑥ Generator\nYAML · DAG · Tests · Docs"]
    W7["⑦ Validator\nT1→T5 execution"]
    W8["⑧ PR Generator\nClaude Sonnet · GitHub"]

    %% ── Blocking Gates ──────────────────────────────────────────────────
    G2["🔐 Gate 2\nEngineering review\nHuman approval"]
    G5["🔐 Gate 5\nProduction cutover\nHuman approval"]

    %% ── Terminal States ─────────────────────────────────────────────────
    MQ["🟡 Manual Queue\nHuman edits IR"]
    PROD["✅ Production"]

    %% ── Shared State Bus ────────────────────────────────────────────────
    STATE[("AgentState\nTypedDict\nimmutable per step\npersisted to PostgreSQL")]

    %% ── Supervisor dispatches to each worker ────────────────────────────
    SUP -- "dispatch" --> W1
    SUP -- "dispatch" --> W2
    SUP -- "dispatch" --> W3
    SUP -- "dispatch" --> W4
    SUP -- "dispatch" --> W5
    SUP -- "dispatch" --> W6
    SUP -- "dispatch" --> W7
    SUP -- "dispatch" --> W8

    %% ── Every worker returns updated state to Supervisor ─────────────────
    W1 -- "ir populated" --> SUP
    W2 -- "complexity_score set" --> SUP
    W3 -- "pattern_id + similarity" --> SUP
    W4 -- "translated / unmatched" --> SUP
    W5 -- "translated + confidence" --> SUP
    W6 -- "artifacts generated" --> SUP
    W7 -- "validation_results[]" --> SUP
    W8 -- "pr_url created" --> SUP

    %% ── Supervisor routing decisions ─────────────────────────────────────
    SUP -- "score ≤ 2 → rules-first" --> W4
    SUP -- "unmatched expression" --> W5
    SUP -- "confidence < 0.7" --> MQ
    SUP -- "T1/T2 fail → regenerate" --> W6
    SUP -- "T3/T4 fail → retranslate" --> W5
    SUP -- "all tiers pass" --> W8
    SUP -- "PR ready" --> G2
    G2 -- "approved" --> W7
    G2 -- "rejected + comments\n→ inject feedback" --> W5
    W7 -- "shadow pass" --> G5
    G5 -- "approved" --> PROD
    MQ -- "human corrects IR\n→ retry signal" --> SUP

    %% ── State shared between all workers ─────────────────────────────────
    STATE -. "read before dispatch" .-> SUP
    SUP -. "checkpoint after each step" .-> STATE

    %% ── Styles ───────────────────────────────────────────────────────────
    style SUP   fill:#1a1a2a,stroke:#8e44ad,color:#fff
    style STATE fill:#1a2a1a,stroke:#f1c40f,color:#fff
    style G2    fill:#3a1a1a,stroke:#e74c3c,color:#fff
    style G5    fill:#3a1a1a,stroke:#e74c3c,color:#fff
    style MQ    fill:#2a1a0a,stroke:#f39c12,color:#fff
    style PROD  fill:#0d3b2e,stroke:#27ae60,color:#fff
    style W1    fill:#0d2a1a,stroke:#27ae60,color:#ddd
    style W2    fill:#0d2a1a,stroke:#27ae60,color:#ddd
    style W3    fill:#1a2a3a,stroke:#2e86c1,color:#ddd
    style W4    fill:#2a1a3a,stroke:#9b59b6,color:#ddd
    style W5    fill:#2a1a3a,stroke:#9b59b6,color:#ddd
    style W6    fill:#0d1b2a,stroke:#3498db,color:#ddd
    style W7    fill:#2a1a0a,stroke:#e67e22,color:#ddd
    style W8    fill:#3a1a1a,stroke:#e74c3c,color:#ddd
```

### Control Flow Rules

| Rule | Detail |
|---|---|
| **Supervisor reads state, never skips** | After every worker completes, control unconditionally returns to the Supervisor before any next step |
| **Workers are stateless** | A worker reads from `AgentState`, does its job, writes result back — no worker holds memory between calls |
| **State is persisted at every checkpoint** | `AgentState` is written to PostgreSQL after each step — crash anywhere = resume from last checkpoint |
| **Gates are not workers** | Human gates are `interrupt_before` points in LangGraph — execution halts and resumes only on external signal (PR approval webhook) |
| **Manual Queue re-enters via Supervisor** | A human editing the IR posts a resume signal; the Supervisor re-reads state and routes back to the appropriate worker |
| **No worker-to-worker calls** | W4 cannot call W5 directly — it marks expressions `unmatched=true` in state and returns to Supervisor, which then dispatches W5 |

### Why This Pattern?

The hub-and-spoke control topology (Supervisor as the hub) is a deliberate choice over a peer-to-peer mesh:

- **Observability**: every transition is logged at the Supervisor. You always know which worker has the token.
- **Replaceability**: swap any worker (e.g. replace Claude Sonnet with a fine-tuned model) — Supervisor routing logic is unchanged.
- **Rate limiting**: the Supervisor enforces concurrency limits per worker type — LLM Translator capped at 10 concurrent calls, Validator capped at 5 shadow runs.
- **Human gate enforcement**: only the Supervisor can advance past a gate — no worker can route around it.

---

## Intermediate Representation (IR) — The Common Language

Every agent speaks IR. No agent passes raw Informatica XML or YAML strings to another. This decouples agents completely — you can replace any agent without touching the others.

```mermaid
flowchart LR
    subgraph INPUT["Vendor Artifacts"]
        XML["Informatica XML"]
        ADF["ADF JSON"]
        OTH["Future: SSIS · ODI · Talend"]
    end

    subgraph IR_BOX["Canonical IR  (JSON Schema v1.0)"]
        direction TB
        META["metadata\nname · version · source_tool · complexity"]
        SOURCES["sources[]\nconnector · query · watermark_col · tier"]
        TRANSFORMS["transforms[]\ntype · params · expression_ast · confidence"]
        SINKS["sinks[]\nconnector · strategy · target_table"]
        LINEAGE["lineage\ncolumn-level map · source→target"]
        AUDIT["audit\nparser_version · parse_ts · warnings[]"]
    end

    subgraph OUTPUT["Generated Artifacts"]
        YAML["YAML Job Config"]
        DAG["Airflow DAG"]
        TESTS["pytest fixtures"]
        DOCS["Business Summary"]
    end

    XML --> IR_BOX
    ADF --> IR_BOX
    OTH -.-> IR_BOX
    IR_BOX --> YAML
    IR_BOX --> DAG
    IR_BOX --> TESTS
    IR_BOX --> DOCS

    style IR_BOX fill:#0d1b2a,stroke:#f1c40f,color:#fff
    style INPUT fill:#2a1a1a,stroke:#e74c3c,color:#ddd
    style OUTPUT fill:#0d2a1a,stroke:#27ae60,color:#ddd
```

### IR Contract (abridged JSON Schema)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema",
  "title": "ETL Intermediate Representation",
  "version": "1.0",
  "required": ["metadata", "sources", "transforms", "sinks"],
  "properties": {
    "metadata": {
      "required": ["name", "source_tool", "complexity_score"],
      "properties": {
        "name":             { "type": "string" },
        "source_tool":      { "enum": ["informatica", "adf", "ssis", "unknown"] },
        "complexity_score": { "type": "integer", "minimum": 1, "maximum": 5 },
        "auto_convertible": { "type": "boolean" }
      }
    },
    "transforms": {
      "type": "array",
      "items": {
        "required": ["id", "type"],
        "properties": {
          "id":             { "type": "string" },
          "type":           { "enum": ["filter","lookup","expression","scd_type_2","joiner","aggregator","router"] },
          "expression_ast": { "description": "Parsed AST — null if type != expression" },
          "confidence":     { "type": "number", "minimum": 0.0, "maximum": 1.0 },
          "needs_review":   { "type": "boolean" }
        }
      }
    }
  }
}
```

---

## LangGraph State Machine

The Supervisor Agent is a **LangGraph** graph with typed state. Each node is one specialist agent. Edges are routing decisions — no LLM decides routing; only typed state fields do.

```mermaid
stateDiagram-v2
    [*] --> INGESTED : artifact submitted

    INGESTED --> PARSED : Parser Agent success
    INGESTED --> PARSE_FAILED : lxml / schema error

    PARSED --> DEPENDENCY_MAPPED : Dependency Agent
    DEPENDENCY_MAPPED --> COMPLEXITY_SCORED : Complexity Agent
    COMPLEXITY_SCORED --> CLASSIFIED : Classifier Agent

    CLASSIFIED --> AUTO_TRACK : complexity ≤ 2 AND pattern_known
    CLASSIFIED --> REVIEW_TRACK : complexity 3–4 OR confidence < 0.85
    CLASSIFIED --> MANUAL_TRACK : complexity 5 OR unsupported_pattern

    AUTO_TRACK --> RULES_TRANSLATED : Rules Agent (all expressions matched)
    AUTO_TRACK --> LLM_TRANSLATE : Rules Agent (partial match)
    REVIEW_TRACK --> LLM_TRANSLATE
    MANUAL_TRACK --> MANUAL_QUEUE

    LLM_TRANSLATE --> CONFIDENCE_CHECKED
    RULES_TRANSLATED --> CONFIDENCE_CHECKED

    CONFIDENCE_CHECKED --> GENERATED : all confidence ≥ 0.7
    CONFIDENCE_CHECKED --> MANUAL_QUEUE : any confidence < 0.7

    GENERATED --> SYNTAX_VALIDATED
    SYNTAX_VALIDATED --> UNIT_TESTED : pass
    SYNTAX_VALIDATED --> GENERATED : fail → regenerate (max 3)

    UNIT_TESTED --> GATE_2 : pass
    UNIT_TESTED --> LLM_TRANSLATE : fail + feedback loop

    GATE_2 --> SHADOW_RUN : human approved
    GATE_2 --> LLM_TRANSLATE : rejected with comments

    SHADOW_RUN --> RECONCILED : row delta < 0.01%
    SHADOW_RUN --> MANUAL_QUEUE : reconciliation fail

    RECONCILED --> GATE_5
    GATE_5 --> PRODUCTION : human approved
    PRODUCTION --> LEGACY_RETIRED : cutover complete
    LEGACY_RETIRED --> [*]

    MANUAL_QUEUE --> LLM_TRANSLATE : human edits IR + retry
    PARSE_FAILED --> [*] : escalate to manual migration
```

---

## Agent Designs — Detailed

### 1. Parser Agent (Deterministic)

**Role:** Convert raw vendor artifacts → validated IR JSON.  
**No LLM.** Failures are hard errors — no guessing allowed at this stage.

```mermaid
flowchart LR
    subgraph PARSER_A["Parser Agent"]
        direction TB
        FETCH["Fetch artifact\nfrom S3 / Git / file"]
        DETECT["Detect format\nmagic bytes + schema sniff"]
        subgraph DISPATCH["Format Dispatcher"]
            direction LR
            INF_P["Informatica Plugin\nlxml XPath extraction\nMapping · Source · Target · Xform"]
            ADF_P["ADF Plugin\njsonpath extraction\nActivity · LinkedService · Dataset"]
        end
        VALIDATE["Validate IR\nJSON Schema strict"]
        ENRICH["Enrich\nadd parse_ts · source_tool · warnings"]
        FETCH --> DETECT --> DISPATCH --> VALIDATE --> ENRICH
    end

    INPUT["Raw Artifact"] --> PARSER_A --> IR["Validated IR JSON"]
```

**Tools available:**
- `fs_read(path)` — S3 / local file access
- `xml_parse(content)` — lxml document
- `json_parse(content)` — strict JSON
- `ir_validate(ir_dict)` — JSON Schema validation
- `emit_warning(msg)` — append to `ir.audit.warnings[]`

**Failure modes handled:**
- Malformed XML → `PARSE_FAILED` state, emit structured error
- Unknown mapping type → `ir.metadata.auto_convertible = false`, continue
- Missing source definition → emit warning, mark transform `needs_review = true`

---

### 2. Complexity Agent (Heuristic + Haiku)

**Role:** Score each mapping 1–5 and decide routing track.

**Scoring rubric (deterministic first pass):**

| Signal | Points |
|---|---|
| Number of transformations > 10 | +1 |
| SCD Type 2 present | +1 |
| Joiner with > 3 inputs | +1 |
| Custom expression count > 5 | +1 |
| Mainframe / EBCDIC source | +1 |
| Unsupported transform type | +2 |

Score ≤ 2 → **Auto track**. Score 3–4 → **Review track**. Score ≥ 5 → **Manual track**.

**Haiku is invoked only** when the mapping contains free-form SQL or embedded scripts not covered by the rubric. Haiku's task is solely to classify whether the embedded SQL is "standard ANSI" or "vendor-specific." The routing decision is always made by code, never by the LLM.

```python
class ComplexityAgent:
    def run(self, ir: IRDocument) -> IRDocument:
        score = self._heuristic_score(ir)
        if self._has_embedded_sql(ir):
            sql_class = self._haiku_classify_sql(ir)  # "ansi" | "vendor_specific"
            if sql_class == "vendor_specific":
                score += 1
        ir.metadata.complexity_score = min(score, 5)
        ir.metadata.auto_convertible = score <= 2
        return ir
```

---

### 3. Classifier Agent (Embedding Similarity)

**Role:** Match the IR against known migration patterns in the vector store. High similarity → use existing translation template. Low similarity → flag for LLM + human.

```mermaid
flowchart LR
    subgraph CLASSIFIER_A["Classifier Agent"]
        direction TB
        EMBED["Embed IR fingerprint\ntext2vec · transform types + config"]
        SEARCH["pgvector ANN search\nTop-5 nearest patterns"]
        SCORE["Similarity score\ncosine 0.0 – 1.0"]
        ATTACH["Attach matched pattern\nto IR for Translator Agent"]
        EMBED --> SEARCH --> SCORE --> ATTACH
    end

    IR["IR JSON"] --> CLASSIFIER_A --> IR2["IR + pattern_id + similarity_score"]
    VEC[("pgvector\nPattern Library\n~2,000 known patterns")] --> SEARCH
```

**Pattern library grows over time:** every human-approved migration adds its IR + generated YAML as a new example. The RAG store is the system's long-term memory.

---

### 4. Rules Agent (Deterministic, Zero LLM Cost)

**Role:** Translate Informatica / ADF expressions to Python/pandas using a hand-curated rule table. Target ≥ 80% coverage of common patterns. No LLM invoked — zero cost, fully auditable.

```mermaid
flowchart TB
    subgraph RULES_A["Rules Agent"]
        LEXER["Expression Lexer\nTokenize DSL"]
        PARSER_E["Expression Parser\nPratt parser → AST"]
        subgraph MATCH["Pattern Matcher"]
            direction LR
            R1["IIF(cond, a, b)\n→ np.where(cond, a, b)"]
            R2["TRUNC(date, 'MM')\n→ pd.Timestamp.replace(day=1)"]
            R3["LPAD(str, n, pad)\n→ str.zfill(n)"]
            R4["TO_DATE(str, fmt)\n→ pd.to_datetime(str, format=fmt)"]
            R5["... 200+ rules ..."]
        end
        EMIT["Emit translated expression\n+ confidence = 1.0 (rule-matched)"]
        UNMATCHED["Emit untranslated AST\n+ confidence = null\n→ LLM Translator"]
        LEXER --> PARSER_E --> MATCH
        MATCH -- "matched" --> EMIT
        MATCH -- "no match" --> UNMATCHED
    end
```

**Rule format (YAML-driven, not hardcoded):**

```yaml
rules:
  - id: iif_to_np_where
    pattern: "IIF({cond}, {a}, {b})"
    output: "np.where({cond}, {a}, {b})"
    confidence: 1.0
    notes: "Informatica conditional — direct map"

  - id: trunc_date_month
    pattern: "TRUNC({col}, 'MM')"
    output: "{col}.dt.to_period('M').dt.to_timestamp()"
    confidence: 1.0
```

New rules are added as human-reviewed translations accumulate — the rule table grows with each migration wave.

---

### 5. LLM Translator Agent (Claude Sonnet + RAG)

**Role:** Handle expressions not covered by rules. Uses Claude Sonnet with few-shot examples retrieved from pgvector. Returns a translated expression + confidence score.

**Only invoked for unmatched expressions** — typical invocation rate after rules coverage: ~15–20% of expressions, ~5% of total tokens.

```mermaid
sequenceDiagram
    autonumber
    participant RA as Rules Agent
    participant LA as LLM Translator
    participant VEC as pgvector (RAG)
    participant CL as Claude Sonnet API

    RA->>LA: unmatched AST node + source_tool context
    LA->>VEC: embed(expression_text) → ANN search top-3 examples
    VEC-->>LA: 3 similar (source_expr, translated_expr, confidence) pairs
    LA->>CL: system_prompt + 3-shot examples + expression to translate
    Note over CL: Prompt includes: source tool DSL reference,<br/>target framework pandas API ref,<br/>instruction to return JSON {translated, confidence, reasoning}
    CL-->>LA: {translated: "...", confidence: 0.87, reasoning: "..."}
    LA->>LA: parse + validate output structure
    LA->>VEC: store new example if confidence ≥ 0.9 (auto-learn)
    LA-->>RA: translated expression + confidence score
```

**Prompt structure:**

```
SYSTEM:
You are an ETL expression translator. Convert the given {source_tool} expression 
to a Python/pandas expression that runs inside the Generic ETL Framework.

Rules:
- Return ONLY valid JSON: {"translated": "<expr>", "confidence": 0.0-1.0, "reasoning": "<one sentence>"}
- confidence < 0.7 means you are not sure — do not guess
- Use only pandas, numpy, and Python builtins
- Do not import anything

FEW-SHOT EXAMPLES:
{rag_examples}  ← 3 nearest from pgvector

USER:
Source tool: {source_tool}
Expression: {raw_expression}
Column context: {col_types}
```

---

### 6. YAML Generator Agent (Deterministic, Jinja2)

**Role:** Render the translated IR into a validated YAML job config. No LLM — templates are version-controlled and schema-validated at render time.

```mermaid
flowchart LR
    IR["IR JSON\n(fully translated)"] --> SELECT["Select template\nby source_tool + transform_types"]
    SELECT --> RENDER["Jinja2 render\nframework YAML schema v{n}"]
    RENDER --> VALIDATE["jsonschema.validate()\nstrict mode — fail fast"]
    VALIDATE -- "valid" --> YAML_OUT["job_config.yaml\nready for etl-runner"]
    VALIDATE -- "invalid" --> PATCH["Auto-patch known issues\n(e.g. missing default tier)"]
    PATCH --> VALIDATE
```

**Key design rule:** If the YAML fails schema validation after 3 auto-patch attempts, the job is sent to `MANUAL_QUEUE` — the Generator never emits invalid YAML to downstream agents.

---

### 7. Validation Agent (Code Execution)

**Role:** Gate keeper before any human review. Five validation tiers executed in order — each failure short-circuits and sends the job back for regeneration.

```mermaid
flowchart TB
    subgraph VAL["Validation Agent — 5 Tiers"]
        direction TB
        T1["Tier 1 — Syntactic\nYAML load · DAG import\n~50ms · zero infra"]
        T2["Tier 2 — Schema\nJSONSchema strict\nall refs resolve · types match\n~100ms"]
        T3["Tier 3 — Unit Tests\npytest generated fixtures\nsample rows 100 · expected output\n~5s"]
        T4["Tier 4 — Sample Run\netl-runner --dry-run on 1,000 rows\nrow-count check ±0%\n~30s"]
        T5["Tier 5 — Shadow Run\nfull load in shadow env\nreconcile vs legacy output\n~hours · P0/P1 only"]

        T1 -- "pass" --> T2
        T2 -- "pass" --> T3
        T3 -- "pass" --> T4
        T4 -- "pass" --> T5
        T1 -- "fail" --> REGEN["Feedback → Generator\nwith error context"]
        T2 -- "fail" --> REGEN
        T3 -- "fail" --> REGEN
        T4 -- "fail" --> REGEN
        T5 -- "fail" --> MANUAL_Q["Manual Queue\nhuman reconciliation"]
    end

    T5 -- "pass (P0/P1)" --> APPROVED
    T4 -- "pass (P2/P3)" --> APPROVED
    APPROVED["Approved IR\n→ PR Generator"]
```

**Tier 5 is only run for P0 and P1 pipelines** — running full shadow execution for 700 pipelines is not practical. P2/P3 proceed after Tier 4.

---

### 8. PR Generator + Reviewer Agent (Claude Sonnet)

**Role:** Draft a GitHub PR that a human engineer and business SME can actually review — not a raw YAML dump. Surfaces confidence scores, flags expressions that need SME sign-off, and generates plain-language business description.

```mermaid
flowchart LR
    IR_FINAL["Final IR\n+ translated expressions\n+ confidence scores"] --> PRG

    subgraph PRG["PR Generator Agent"]
        direction TB
        DIFF["Compute diff\nInformatica XML vs generated YAML"]
        SME_SUM["Claude Sonnet\nGenerate SME summary\n'This pipeline loads customer data…'"]
        ENG_SUM["Claude Sonnet\nGenerate engineering notes\nflagged expressions, confidence scores"]
        QS_GEN["Claude Sonnet\nGenerate reviewer questions\nfor expressions with confidence < 0.9"]
        PR_BODY["Assemble PR body\nMarkdown: summary + diff + questions + checklist"]
    end

    PRG --> GH["GitHub PR\nauto-created\nlabeled: needs-sme-review OR auto-approved"]
```

**PR body sections (auto-generated):**
1. **What changed** — plain English description of the mapping
2. **Confidence summary** — table of all expressions with scores
3. **Expressions needing review** — only those below 0.9
4. **SME checklist** — business logic questions requiring domain sign-off
5. **Test results** — Tier 1–4 pass/fail summary
6. **Rollback plan** — how to revert if production issues occur

---

## Agent Coordination — Message Bus

Agents do not call each other directly. All state passes through the LangGraph `AgentState` typed dict. The Supervisor reads state after each node and routes to the next node — or halts at a human gate.

```mermaid
flowchart TB
    subgraph STATE["AgentState  (TypedDict — immutable per step)"]
        direction LR
        S1["artifact_path: str"]
        S2["ir: IRDocument | None"]
        S3["track: 'auto' | 'review' | 'manual'"]
        S4["confidence_scores: dict[str, float]"]
        S5["validation_results: list[ValidationResult]"]
        S6["generated_artifacts: GeneratedArtifacts"]
        S7["gate_status: dict[GateId, 'pending'|'approved'|'rejected']"]
        S8["error_log: list[AgentError]"]
        S9["retry_count: dict[NodeId, int]"]
    end

    subgraph GRAPH["LangGraph Graph"]
        direction TB
        N1["parser_node"] --> N2["dependency_node"] --> N3["complexity_node"]
        N3 --> N4{"route_by_track"}
        N4 -- "auto" --> N5["rules_node"]
        N4 -- "review/manual" --> N6["llm_translate_node"]
        N5 --> N7{"unmatched?"}
        N7 -- "yes" --> N6
        N7 -- "no" --> N8["generator_node"]
        N6 --> N8
        N8 --> N9["validator_node"]
        N9 --> N10{"gate_2_node\nHUMAN INTERRUPT"}
        N10 --> N11["shadow_run_node"]
        N11 --> N12{"gate_5_node\nHUMAN INTERRUPT"}
        N12 --> N13["production_node"]
    end

    STATE -.->|"read/write"| GRAPH

    style STATE fill:#1a2a3a,stroke:#2e86c1,color:#fff
    style GRAPH fill:#0d1b2a,stroke:#8e44ad,color:#fff
```

**Human gates as LangGraph interrupts:**

```python
# Gate 2 — Engineering Review
graph.add_node("gate_2", gate_node(gate_id="GATE_2"))
graph.add_edge("validator", "gate_2")

# LangGraph interrupt — execution pauses here until human approves via API
graph.compile(interrupt_before=["gate_2", "gate_5"])
```

When a gate fires:
- State is persisted to PostgreSQL
- GitHub PR is opened (if not already)
- Slack notification sent to reviewer queue
- Execution resumes only when `/approve` or `/reject` is posted in the PR

---

## Parallelization Strategy

Many pipelines are independent. The Supervisor launches multiple LangGraph runs in parallel — up to 50 concurrent — across the pipeline batch. Within a single mapping run, some agents can also parallelize.

```mermaid
flowchart LR
    subgraph BATCH["Migration Batch  (e.g. 50 mappings)"]
        direction TB
        subgraph WAVE1["Wave 1 — Parse + Analyze  (all 50 in parallel)"]
            direction LR
            J1["mapping_001"] & J2["mapping_002"] & J3["..."] & J50["mapping_050"]
        end
        subgraph WAVE2["Wave 2 — Translate  (auto-track only in parallel)"]
            direction LR
            JA1["auto_001"] & JA2["auto_002"] & JR1["review → sequential"]
        end
        subgraph WAVE3["Wave 3 — Generate + Validate  (parallel per mapping)"]
            direction LR
            YAML_GEN["YAML Gen"] & DAG_GEN["DAG Gen"] & TEST_GEN["Test Gen"]
        end
    end

    WAVE1 --> WAVE2 --> WAVE3
```

**Within a single mapping, generation is parallel:**

```python
async def generate_all(ir: IRDocument) -> GeneratedArtifacts:
    yaml_task  = asyncio.create_task(yaml_generator.run(ir))
    dag_task   = asyncio.create_task(dag_generator.run(ir))
    test_task  = asyncio.create_task(test_generator.run(ir))
    summary_task = asyncio.create_task(summary_generator.run(ir))
    return GeneratedArtifacts(
        yaml    = await yaml_task,
        dag     = await dag_task,
        tests   = await test_task,
        summary = await summary_task,
    )
```

---

## LLM Cost Management

The system is designed to minimize LLM calls. The vast majority of work is deterministic.

```mermaid
quadrantChart
    title Agent LLM Usage vs Volume
    x-axis Low Invocation Volume --> High Invocation Volume
    y-axis Cheap Model (Haiku) --> Expensive Model (Sonnet/Opus)
    quadrant-1 Avoid — redesign as rules
    quadrant-2 Acceptable — review carefully
    quadrant-3 Ideal — scale freely
    quadrant-4 Acceptable — optimize with caching

    SQL Classifier (Haiku): [0.3, 0.15]
    Summary Generator (Haiku): [0.7, 0.1]
    PR Generator (Sonnet): [0.4, 0.7]
    LLM Translator (Sonnet + cache): [0.5, 0.65]
    Complexity (rules-first): [0.2, 0.1]
    YAML Generator (no LLM): [0.05, 0.05]
    Validator (no LLM): [0.05, 0.05]
```

**Cost model per pipeline (estimated):**

| Component | Model | Avg tokens | Cost/pipeline |
|---|---|---|---|
| SQL classifier | Haiku | ~500 | $0.0001 |
| Expression translation (20% hit rate) | Sonnet | ~2,000 | $0.006 |
| PR + SME summary | Sonnet | ~3,000 | $0.009 |
| Prompt cache savings (~60% hit rate) | — | — | −$0.005 |
| **Total per pipeline** | | | **~$0.01** |

700 pipelines × $0.01 = **~$7 total LLM cost** for the full migration. Dominated by human time, not LLM spend.

---

## Memory Architecture

```mermaid
flowchart LR
    subgraph SHORT["Short-Term Memory — per run"]
        direction TB
        LG_STATE["LangGraph AgentState\nIn-memory TypedDict\ncleared after run"]
    end

    subgraph MEDIUM["Medium-Term Memory — per session"]
        direction TB
        PG_RUN["PostgreSQL\nagent_runs table\nall state snapshots\nresumable after crash"]
    end

    subgraph LONG["Long-Term Memory — cumulative"]
        direction TB
        VEC_STORE["pgvector\nTranslation examples\nGrows with each migration"]
        RULE_TABLE["Rules YAML\nHand-curated + auto-promoted\nVersioned in Git"]
        AUDIT_LOG["PostgreSQL\naudit_log table\nEvery decision + confidence + human action"]
    end

    SHORT -- "checkpoint on gate" --> MEDIUM
    MEDIUM -- "approved translations" --> LONG
    LONG -- "RAG retrieval" --> SHORT
```

**Auto-learning loop:** When a human approves a translation that came from the LLM Translator with confidence ≥ 0.9, the system automatically:
1. Adds it to the pgvector store (improves future RAG retrieval)
2. If the same pattern appears 5+ times, proposes a new rule to the Rules YAML (human-reviewed PR)

Over 18 months and 700 pipelines, the rule coverage is expected to grow from 80% → 95%+, and LLM invocation rate to drop proportionally.

---

## Failure Handling and Retry Topology

```mermaid
flowchart TB
    subgraph RETRY["Retry Policy per Agent"]
        direction LR
        PARSE_E["Parser\nNo retry\nHard fail → PARSE_FAILED"]
        TRANS_E["Rules Translator\nNo retry\nDeterministic"]
        LLM_E["LLM Translator\nRetry ×2 with backoff\nDifferent temperature on retry 2"]
        GEN_E["Generator\nRetry ×3 with error feedback\nError injected into prompt context"]
        VAL_E["Validator\nRetry = regenerate\nFeedback loop to Generator"]
    end

    subgraph DLQ["Dead Letter Queue"]
        MANUAL["Manual Queue\nHuman-assigned\nSLA: 2 business days"]
    end

    PARSE_E -- "max retries" --> DLQ
    LLM_E -- "max retries" --> DLQ
    GEN_E -- "max retries" --> DLQ
    VAL_E -- "Tier 5 fail" --> DLQ
```

---

## Implementation — File Layout

```
agent/
├── cli.py                        # Entry point — batch or single mapping
├── state.py                      # AgentState TypedDict + IRDocument dataclasses
├── graph.py                      # LangGraph graph definition + compile()
├── agents/
│   ├── parser/
│   │   ├── informatica.py        # lxml XPath extraction
│   │   ├── adf.py                # jsonpath extraction
│   │   └── base.py               # BaseParser ABC
│   ├── analysis/
│   │   ├── complexity.py         # Heuristic scoring + Haiku SQL classifier
│   │   └── classifier.py         # pgvector ANN search
│   ├── translation/
│   │   ├── rules_agent.py        # Lexer + Pratt parser + rule matching
│   │   ├── rules/
│   │   │   └── informatica.yaml  # 200+ rule definitions
│   │   ├── llm_translator.py     # Claude Sonnet + RAG prompt
│   │   └── confidence.py         # Per-expression scoring + routing
│   ├── generation/
│   │   ├── yaml_generator.py     # Jinja2 templates → validated YAML
│   │   ├── dag_generator.py      # Airflow Python AST builder
│   │   ├── test_generator.py     # pytest fixture builder
│   │   └── summary_generator.py  # Claude Haiku plain-language summary
│   ├── validation/
│   │   ├── syntax_validator.py   # Tier 1–2
│   │   ├── unit_test_runner.py   # Tier 3 — subprocess pytest
│   │   └── reconciliation.py     # Tier 4–5 — row count + sample diff
│   └── review/
│       └── pr_generator.py       # GitHub PR + Claude Sonnet PR body
├── memory/
│   ├── vector_store.py           # pgvector client + embed + ANN search
│   └── audit_log.py              # PostgreSQL write + read
└── gates/
    └── human_gate.py             # LangGraph interrupt + Slack notify + resume
```

---

## Key Design Principles

1. **LLM is the last resort, not the first** — rules, heuristics, and templates handle 80%+ of the work deterministically. LLMs fill the gap.
2. **IR is the contract** — agents are loosely coupled through typed JSON. Any agent can be replaced without touching others.
3. **Humans gate the irreversible** — no agent can promote a pipeline to production. The five gate checkpoints are code-enforced LangGraph interrupts.
4. **Confidence is first-class** — every translated expression carries a score. Low confidence surfaces immediately to human reviewers rather than being buried in a YAML file.
5. **The system learns** — every human-approved translation improves future recall via pgvector. The more pipelines migrated, the cheaper and faster subsequent migrations become.

---

*For the platform-level architecture see [`enterprise-architecture-diagram.md`](./enterprise-architecture-diagram.md). For the executive overview see [`executive-presentation.tsx`](./executive-presentation.tsx).*
