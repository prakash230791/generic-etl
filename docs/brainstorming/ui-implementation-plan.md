# UI Implementation Plan — Agent + Framework

**Version:** 1.0 | **Date:** 2026-05-14
**Audience:** Engineering Team, Executive Sponsors
**Companion docs:**
- `langgraph-agent-implementation.md` — LG-0 through LG-7 (agent sessions)
- `framework-hardening-plan.md` — FH-CON/TX/EX/ORC sessions
- `control-table-and-framework-v2.md` — FW-V2 sessions

---

## 1. Do We Need a UI? (Executive Answer)

### Agent UI — YES, essential for exec demo and human-in-the-loop gate

| Without UI | With UI |
|---|---|
| CLI black box: `python cli_batch.py input.zip` | Drag-drop ZIP → watch 8 nodes animate live |
| No visibility into what the agent is doing | See parse → analyze → classify → translate in real-time |
| Human review = editing YAML files in a text editor | Side-by-side diff: original ADF config vs generated YAML |
| Migration progress = spreadsheet | Live dashboard: 67/700 pipelines, 92% automation rate, $2.1M saved |

**Executive moment:** drop a real Informatica XML onto the screen, watch it convert in 4 seconds, click Approve — that's the $6M cost-reduction story made tangible.

### Framework UI — YES, for operator self-service and exec demo continuity

| Without UI | With UI |
|---|---|
| Data engineers need SSH + CLI to run jobs | Pick YAML from catalog → fill params → one-click run |
| No visibility into running jobs | Live log stream, row count counter, duration timer |
| Debugging = digging through K8s pod logs | Filter by connector, status, date — click into any run |

**Executive moment (continuation):** after the agent approves the YAML, switch to the Framework UI, hit Run — watch the row counter tick up from 0 to 500,000.

---

## 2. The Executive Demo Script (5-minute live demo)

```
Act 1 — "Here's the legacy problem"  (30 sec)
  Show Informatica XML / ADF ZIP on screen
  "700 of these. $8.7M/year. 4 admins to maintain them."

Act 2 — Agent converts in real-time  (90 sec)
  Drag the ZIP onto the Upload page
  Watch the 8 nodes light up: [parse] [analyze] [classify] [translate] [generate] [validate] [report] [gate]
  "94% confidence — AUTO APPROVED → YAML generated"

Act 3 — Human review gate  (60 sec)
  One pipeline shows human_queue badge
  Open review page: left = ADF JSON, right = generated YAML, bottom = manual_queue items
  Engineer reviews 2 items, clicks Approve
  "The AI handles 90%+ automatically. Engineers focus on the 10% that needs judgment."

Act 4 — Framework runs the YAML  (60 sec)
  Switch to Framework UI → Job Catalog → click the approved job
  Hit Run → watch live log: "source read: 450,000 rows" → "transform: row_filter" → "sink wrote: 448,231 rows"
  "Same result as Informatica. Zero license cost."

Act 5 — Migration dashboard  (60 sec)
  Show: 67 pipelines migrated, 92% automation rate, $840K Informatica dev licenses decommissioned
  "Month 6. On track for $5.5M savings by Month 18."
```

---

## 3. Tech Stack Recommendation

**Streamlit** — Python-only, zero frontend expertise, exec-demo-ready in hours.

| Requirement | Streamlit Feature |
|---|---|
| File upload (ZIP, XML) | `st.file_uploader(accept_multiple_files=True)` |
| Real-time agent progress | `st.status()` + `graph.stream()` iteration |
| YAML preview + syntax highlight | `st.code(yaml_str, language="yaml")` |
| Side-by-side diff | Two `st.columns()` with code blocks |
| Pipeline gallery table | `st.dataframe()` with color-coded status column |
| KPI metrics | `st.metric("Pipelines migrated", 67, delta="+12 this week")` |
| Charts | `st.plotly_chart()` — confidence distribution, migration progress |
| Live log streaming | `st.empty()` updated in a loop |
| Edit YAML in browser | `st_ace` component (Streamlit ACE editor) |

**Why not React/FastAPI?** — 3× more sessions, requires JS/CSS expertise, not token-efficient. Streamlit gives 80% of the demo value in 20% of the time.

**Why not Gradio?** — Streamlit multi-page apps are better structured for a real product; Gradio is better for single ML model demos.

---

## 4. File Layout

```
ui/
├── agent_app.py              Entry point: streamlit run ui/agent_app.py
├── framework_app.py          Entry point: streamlit run ui/framework_app.py
├── shared/
│   ├── __init__.py
│   ├── state_store.py        Lightweight SQLite-backed run history (no Redis needed)
│   └── styles.py             Custom CSS (status badge colors, layout tweaks)
├── agent_pages/
│   ├── 01_upload.py          Upload ZIP/XML + trigger agent graph
│   ├── 02_gallery.py         Pipeline gallery: all runs with status + confidence
│   ├── 03_review.py          Human review: diff + manual queue + approve/reject
│   └── 04_dashboard.py       Migration progress dashboard (KPIs + charts)
└── framework_pages/
    ├── 05_catalog.py         Job catalog: all YAML configs
    ├── 06_runner.py          Job runner: pick YAML → params → run → stream logs
    └── 07_history.py         Job run history: filter, sort, inspect
```

**pyproject.toml additions:**
```toml
[project.optional-dependencies]
ui = ["streamlit>=1.35", "plotly>=5.20", "streamlit-ace>=0.1"]
```

**Run commands:**
```bash
streamlit run ui/agent_app.py       # agent UI on :8501
streamlit run ui/framework_app.py  # framework UI on :8502
```

---

## 5. Agent UI — Page Designs

### Page 1: Upload

```
┌─────────────────────────────────────────────────────────┐
│  🔄 ETL Migration Agent                                  │
│                                                          │
│  Drop your pipeline files here                           │
│  ┌──────────────────────────────────────────────────┐   │
│  │  📁 Drag & drop  ADF .zip  /  Informatica .xml  │   │
│  │     or click to browse                           │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ☑ Enable LLM translation    Output dir: [output/   ]   │
│                                                          │
│  [  Convert  ]                                           │
│                                                          │
│  ── Live progress ──────────────────────────────────    │
│  ✓ [parse]    IR loaded: VPFLookups_sync_PLE            │
│  ✓ [analyze]  complexity: 6/15  connectors: sqlserver   │
│  ✓ [classify] route: AUTO                               │
│  ✓ [translate] 8/8 expressions resolved (rules)        │
│  ✓ [generate] job_config.yaml written                   │
│  ✓ [validate] schema valid ✅                            │
│  ✓ [report]   migration_report.md written               │
│  ✓ [gate]     ✅ AUTO APPROVED  confidence: 94%         │
└─────────────────────────────────────────────────────────┘
```

### Page 2: Pipeline Gallery

```
┌────────────────────────────────────────────────────────────────┐
│  Pipeline Gallery  [All ▾]  [Search...]  [Export CSV]          │
│                                                                │
│  Artifact               Source  Route        Confidence  Status│
│  ─────────────────────────────────────────────────────────── │
│  VPFLookups_sync_PLE    ADF     auto         94%    ✅ APPROVED│
│  m_LOAD_CUSTOMERS       Infor.  auto         91%    ✅ APPROVED│
│  wf_ETL_ORDERS_FULL     Infor.  human_review 78%    👁 REVIEW  │
│  wf_LEGACY_COBOL_TRANS  SSIS    manual       42%    ✋ MANUAL  │
│                                                                │
│  Total: 4    Auto: 2    Review: 1    Manual: 1                 │
└────────────────────────────────────────────────────────────────┘
```

### Page 3: Human Review

```
┌──────────────────────────────────────────────────────────────────┐
│  Review: wf_ETL_ORDERS_FULL   confidence: 78%   ⚠ HUMAN REVIEW  │
│                                                                  │
│  ┌── Original ADF JSON ──┐   ┌── Generated YAML ───────────┐   │
│  │ "type": "Copy",       │   │ version: "2.0"              │   │
│  │ "preCopyScript": ...  │   │ job:                        │   │
│  │ "sqlReaderQuery": ... │   │   name: wf_etl_orders_full  │   │
│  └───────────────────────┘   └──────────────────────────── ┘   │
│                                                                  │
│  ── Manual Queue (2 items requiring review) ──────────────────  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ 1. @activity('CheckRowCount').output.firstRow.cnt        │   │
│  │    Reason: activity output reference not supported       │   │
│  │    Suggestion: replace with assert_row_count transform   │   │
│  │                                                          │   │
│  │ 2. Custom C# script in Script Task                       │   │
│  │    Reason: imperative code — manual rewrite required     │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Notes: [________________________________]                       │
│  [  ✅ Approve  ]   [  ✏ Edit YAML  ]   [  ❌ Reject  ]        │
└──────────────────────────────────────────────────────────────────┘
```

### Page 4: Migration Dashboard

```
┌──────────────────────────────────────────────────────────┐
│  Migration Progress — Week 8                             │
│                                                          │
│  67/700     92%          $840K         18 months         │
│  Pipelines  Automation   Savings       to full decom.    │
│  migrated   rate         realized                        │
│                                                          │
│  ── Progress by source ──────────────────────────────── │
│  Informatica  ████████░░░░  42/500  (8%)                 │
│  ADF          ██████░░░░░░  22/160  (14%)                │
│  SSIS         ███░░░░░░░░░   3/40   (8%)                 │
│                                                          │
│  ── Confidence distribution ─────── ── Pipeline queue ─ │
│  [histogram: most at 0.9–1.0]        Auto:    56         │
│                                       Review:   8         │
│                                       Manual:   3         │
└──────────────────────────────────────────────────────────┘
```

---

## 6. Framework UI — Page Designs

### Page 5: Job Catalog

```
┌───────────────────────────────────────────────────────────────┐
│  Job Catalog   [connector: all ▾]  [status: all ▾]  [Search] │
│                                                               │
│  Job Name                Connector  Last Run   Status   Rows  │
│  ──────────────────────────────────────────────────────────  │
│  load_fact_orders        sqlserver  2 hrs ago  ✅ OK   448K   │
│  load_dim_customer       azure_sql  1 day ago  ✅ OK    23K   │
│  load_dim_product        postgres   3 days ago ✅ OK     8K   │
│  wf_etl_orders_full      azure_sql  Never      ⬜ NEW    —    │
│                                                               │
│  [▶ Run selected]  [👁 View YAML]  [🔍 Test Connection]       │
└───────────────────────────────────────────────────────────────┘
```

### Page 6: Job Runner

```
┌────────────────────────────────────────────────────────────┐
│  Run Job: load_fact_orders                                  │
│                                                            │
│  Parameters                                                │
│  env:          [prod        ▾]                             │
│  source_table: [dbo.orders   ]                             │
│  batch_date:   [2026-05-14   ]                             │
│                                                            │
│  [  ▶ Run  ]   [🔌 Test Connection First]                  │
│                                                            │
│  ── Live Output ────────────────────────────────────────── │
│  14:32:01  INFO  starting pipeline: load_fact_orders       │
│  14:32:02  INFO  source read: 450,000 rows (3 columns)     │
│  14:32:03  INFO  row_filter: 448,231 rows                  │
│  14:32:05  INFO  lookup_enrich: 448,231 rows               │
│  14:32:08  INFO  sink wrote: 448,231 rows ✅               │
│  14:32:08  INFO  watermark updated: 2026-05-14T14:32:08    │
│                                                            │
│  Duration: 7.2s   Rows written: 448,231   Status: ✅ OK   │
└────────────────────────────────────────────────────────────┘
```

---

## 7. Implementation Sessions

All sessions use Streamlit. Each prompt is intentionally compact to save tokens.

---

### Session UI-0 — Setup + Shared Layout (prerequisite)

**Duration:** ~20 min | **Files:** `pyproject.toml`, `ui/shared/state_store.py`, `ui/shared/styles.py`

#### Prompt

```
Set up the Streamlit UI scaffold for the ETL platform.

Read: #file:pyproject.toml  #file:docs/brainstorming/ui-implementation-plan.md (section 4)

1. Add to pyproject.toml optional-dependencies:
   ui = ["streamlit>=1.35", "plotly>=5.20", "streamlit-ace>=0.1"]

2. Create ui/shared/state_store.py:
   SQLite-backed store for run history (no external service).
   class StateStore:
     save_run(run_id, artifact_id, source_type, gate_status, confidence,
              yaml_path, report_path, started_at, completed_at) -> None
     get_runs(limit=100) -> list[dict]
     get_run(run_id) -> dict | None
     update_run(run_id, **kwargs) -> None
   Use a single table: etl_ui_runs. Auto-create on first call.
   Default db path: ui/data/runs.db (create dir if absent).

3. Create ui/shared/styles.py — inject_css() function:
   Status badge colors:
     auto_approved → green background
     human_queue   → amber
     manual        → red
     error         → dark red
     pending       → grey
   def status_badge(status: str) -> str:
       returns HTML span with color-coded background.

Test: python -c "from ui.shared.state_store import StateStore; s=StateStore(); print('ok')"
```

---

### Session UI-AG-1 — Upload Page + Live Agent Progress

**Duration:** ~50 min | **Files:** `ui/agent_app.py`, `ui/agent_pages/01_upload.py`

#### Prompt

```
Build the agent Upload page in Streamlit with live LangGraph node progress.

Read:
  #file:agent/graph.py
  #file:agent/state.py
  #file:agent/config.py
  #file:ui/shared/state_store.py
  #file:docs/brainstorming/ui-implementation-plan.md  (section 5, Page 1 wireframe)

1. Create ui/agent_app.py:
   st.set_page_config(page_title="ETL Migration Agent", layout="wide")
   sidebar: logo, nav links to all 4 pages, llm_enabled toggle
   Import and run the upload page as default.

2. Create ui/agent_pages/01_upload.py:

   UI elements:
   - st.file_uploader("Drop pipeline files", type=["zip","xml","dtsx"],
                       accept_multiple_files=True)
   - st.toggle("Enable LLM translation", value=False)
   - st.text_input("Output directory", value="output")
   - st.button("Convert")

   On Convert click:
   a. Save each uploaded file to a temp dir (tempfile.mkdtemp())
   b. Build AgentConfig(llm_enabled=toggle_value, output_dir=output_dir)
   c. For each file, run graph.stream(make_initial_state(path, config))
   d. Show live progress using st.status():
        with st.status("Converting...", expanded=True) as status_box:
            for chunk in graph.stream(initial_state):
                node_name = list(chunk.keys())[0]
                node_state = chunk[node_name]
                icon = "✓" if not node_state.get("parse_errors") else "✗"
                st.write(f"{icon} [{node_name}]  {_node_summary(node_state, node_name)}")
            status_box.update(label="Done", state="complete")
   e. After all files: st.success / st.error summary
   f. Save each run to StateStore

   def _node_summary(state, node_name) -> str:
     Returns a one-line human-readable summary for each node:
       parse    → "IR loaded: {artifact_id}  source: {source_type}"
       analyze  → "complexity: {score}/15  connectors: {connector_types}"
       classify → "route: {route.upper()}"
       translate→ "{n} expressions resolved ({pct}% by rules)"
       generate → "job_config.yaml written" or "skipped (manual route)"
       validate → "schema valid ✅" or "ERRORS: {errors[0]}"
       report   → "migration_report.md written"
       gate     → "✅ AUTO APPROVED  confidence: {pct}%" or "👁 HUMAN QUEUE  confidence: {pct}%"

Test: streamlit run ui/agent_app.py
      Upload sample_informatica/m_LOAD_CUSTOMERS.xml — all 8 nodes should appear.
```

---

### Session UI-AG-2 — Pipeline Gallery

**Duration:** ~30 min | **Files:** `ui/agent_pages/02_gallery.py`

#### Prompt

```
Build the Pipeline Gallery page — shows all past agent runs with status badges.

Read:
  #file:ui/shared/state_store.py
  #file:ui/shared/styles.py
  #file:docs/brainstorming/ui-implementation-plan.md  (section 5, Page 2 wireframe)

Create ui/agent_pages/02_gallery.py:

Columns: artifact_id, source_type, route, confidence (%), gate_status (badge),
         started_at, yaml_path (link), report_path (link)

UI:
- st.selectbox filter: All / auto_approved / human_queue / manual / error
- st.text_input search by artifact_id
- st.dataframe with color formatting:
    gate_status column → use st.column_config.TextColumn with custom formatting
    confidence → st.column_config.ProgressColumn (0.0–1.0)
- Row click → st.session_state.selected_run = run_id → navigate to Review page
- Summary row: counts by status + average confidence

def load_runs(filter_status, search_term) -> pd.DataFrame:
    runs = StateStore().get_runs()
    df = pd.DataFrame(runs)
    if filter_status != "All":
        df = df[df.gate_status == filter_status]
    if search_term:
        df = df[df.artifact_id.str.contains(search_term, case=False)]
    return df

Test: streamlit run ui/agent_app.py  → navigate to Gallery
      Confirm runs from Upload page appear here.
```

---

### Session UI-AG-3 — Human Review Page

**Duration:** ~55 min | **Files:** `ui/agent_pages/03_review.py`

#### Prompt

```
Build the Human Review page — side-by-side original vs generated YAML, manual queue, approve/reject.

Read:
  #file:ui/shared/state_store.py
  #file:agent/state.py
  #file:docs/brainstorming/ui-implementation-plan.md  (section 5, Page 3 wireframe)

Create ui/agent_pages/03_review.py:

Layout: full-width, 3 sections

Section 1 — Header bar:
  artifact_id | source_type | confidence badge | route badge | gate_status badge
  If gate_status is already auto_approved: show read-only banner, no approve buttons.

Section 2 — Side-by-side diff (only for human_queue pipelines):
  col1, col2 = st.columns(2)
  col1: st.subheader("Original config")
        Load original: if ADF, read the pipeline JSON from output/<id>/ir.json["raw"]
        st.code(json.dumps(original, indent=2), language="json")
  col2: st.subheader("Generated YAML")
        Load yaml_path from StateStore run record
        yaml_content = Path(yaml_path).read_text()
        st.code(yaml_content, language="yaml")
        st.download_button("Download YAML", yaml_content, file_name=f"{artifact_id}.yaml")

Section 3 — Manual queue + actions:
  Load manual_queue from output/<id>/migration_report.json
  if manual_queue:
      st.warning(f"{len(manual_queue)} items need manual review")
      for i, item in enumerate(manual_queue):
          with st.expander(f"Item {i+1}: {item['expression'][:60]}..."):
              st.write(f"**Reason:** {item['reason']}")
              st.write(f"**Suggested approach:** {item['suggested_approach']}")

  notes = st.text_area("Review notes (saved to report)")
  col_a, col_b, col_c = st.columns(3)
  with col_a:
      if st.button("✅ Approve", type="primary"):
          StateStore().update_run(run_id, gate_status="approved_by_human",
                                   review_notes=notes, reviewed_at=now())
          st.success("Approved — YAML is ready to deploy.")
  with col_b:
      if st.button("✏ Edit YAML"):
          st.session_state.edit_mode = True
  with col_c:
      if st.button("❌ Reject"):
          StateStore().update_run(run_id, gate_status="rejected", review_notes=notes)
          st.error("Rejected — pipeline returned to manual queue.")

  Edit mode: replace col2 st.code with streamlit_ace editor (ACE editor):
      from streamlit_ace import st_ace
      edited = st_ace(value=yaml_content, language="yaml", theme="monokai", height=400)
      if st.button("Save edits"):
          Path(yaml_path).write_text(edited)
          st.success("YAML saved.")

Test: streamlit run ui/agent_app.py → Gallery → click a human_queue run → Review page
```

---

### Session UI-AG-4 — Migration Dashboard

**Duration:** ~35 min | **Files:** `ui/agent_pages/04_dashboard.py`

#### Prompt

```
Build the Migration Dashboard with KPIs and charts.

Read:
  #file:ui/shared/state_store.py
  #file:docs/brainstorming/ui-implementation-plan.md  (section 5, Page 4 wireframe)
  #file:docs/architecture/08-migration-playbook.md    (section 2 triage tiers)

Create ui/agent_pages/04_dashboard.py:

KPI row (st.metric):
  col1: "Pipelines migrated" = count(gate_status in [auto_approved, approved_by_human])
  col2: "Automation rate" = count(auto_approved) / total * 100  (delta vs last week)
  col3: "Human queue" = count(human_queue)
  col4: "Avg confidence" = mean(overall_confidence) of all runs

Progress by source (st.progress bars):
  group runs by source_type → count migrated vs total
  Total pipeline targets from constants: {informatica: 500, adf: 160, ssis: 40}
  For each source:
      pct = migrated / target
      st.write(f"{source_type}  {migrated}/{target}  ({pct:.0%})")
      st.progress(pct)

Confidence distribution (Plotly histogram):
  import plotly.express as px
  fig = px.histogram(df, x="overall_confidence", nbins=20,
                     title="Confidence Score Distribution",
                     color_discrete_sequence=["#2196F3"])
  fig.add_vline(x=0.90, line_dash="dash", annotation_text="Auto-approve threshold")
  st.plotly_chart(fig, use_container_width=True)

Pipeline status breakdown (Plotly donut):
  fig2 = px.pie(status_counts, values="count", names="status", hole=0.5,
                color_discrete_map={"auto_approved":"green","human_queue":"orange",
                                    "manual":"red","error":"darkred"})
  st.plotly_chart(fig2, use_container_width=True)

Migration timeline (Plotly line):
  group runs by date, cumulative count
  st.plotly_chart(cumulative line chart, use_container_width=True)

Test: streamlit run ui/agent_app.py → Dashboard
      Seed test data via StateStore.save_run() with varied statuses.
```

---

### Session UI-FW-1 — Job Catalog Page

**Duration:** ~30 min | **Files:** `ui/framework_app.py`, `ui/framework_pages/05_catalog.py`

#### Prompt

```
Build the Framework UI Job Catalog page.

Read:
  #file:framework/config/loader.py
  #file:ui/shared/state_store.py
  #file:docs/brainstorming/ui-implementation-plan.md  (section 6, Page 5 wireframe)

1. Create ui/framework_app.py:
   st.set_page_config(page_title="ETL Framework", layout="wide")
   sidebar: config dir path input (default: configs/), nav links to 3 pages

2. Create ui/framework_pages/05_catalog.py:

def scan_configs(config_dir: str) -> list[dict]:
    """Scan directory for .yaml files, load job metadata + last run from StateStore."""
    jobs = []
    for f in Path(config_dir).glob("*.yaml"):
        try:
            cfg = load_config(f)
            last_run = StateStore().get_last_run_for_job(cfg["job"]["name"])
            jobs.append({
                "name": cfg["job"]["name"],
                "connector": _primary_connector(cfg),
                "schedule": cfg["job"].get("schedule", "—"),
                "tier": cfg["job"].get("execution_tier", "pandas"),
                "last_run": last_run.get("completed_at", "Never") if last_run else "Never",
                "last_status": last_run.get("status", "⬜ NEW") if last_run else "⬜ NEW",
                "last_rows": last_run.get("rows_written", "—") if last_run else "—",
                "_path": str(f),
            })
        except Exception as e:
            jobs.append({"name": f.stem, "last_status": f"❌ INVALID: {e}"})
    return jobs

UI:
- Filter row: connector selectbox, status selectbox, text search
- st.dataframe with columns: name, connector, schedule, tier, last_run, last_status, last_rows
- Action buttons below table:
    [▶ Run selected]  → navigate to Runner page with selected job pre-filled
    [👁 View YAML]    → st.code(yaml content, language="yaml") in modal expander
    [🔌 Test Connection] → run ConnectionTester.test_all(config), show results inline

Add get_last_run_for_job(job_name) to StateStore.

Test: streamlit run ui/framework_app.py
      Put a couple of YAML configs in configs/ → confirm they appear.
```

---

### Session UI-FW-2 — Job Runner + Live Log Streaming

**Duration:** ~50 min | **Files:** `ui/framework_pages/06_runner.py`

#### Prompt

```
Build the Job Runner page with parameter inputs and live log streaming.

Read:
  #file:framework/runner.py
  #file:framework/config/loader.py
  #file:framework/config/resolver.py
  #file:ui/shared/state_store.py
  #file:docs/brainstorming/ui-implementation-plan.md  (section 6, Page 6 wireframe)

Create ui/framework_pages/06_runner.py:

Step 1 — Job selection:
  If st.session_state has selected_job (from Catalog page): pre-select it.
  Otherwise: st.selectbox to pick from scanned configs.
  Show YAML preview in expander below selector.

Step 2 — Parameter inputs:
  Load config["parameters"] block (dict of param_name → default_value).
  For each parameter: st.text_input(label=param_name, value=default_value)
  Collect as params dict.

Step 3 — Run controls:
  col1, col2 = st.columns([1, 4])
  with col1: run_btn = st.button("▶ Run", type="primary")
  with col2: test_btn = st.button("🔌 Test Connection First")

  On test_btn:
      config = load_config(yaml_path)
      results = ConnectionTester().test_all(config)
      for r in results:
          icon = "✅" if r.ok else "❌"
          st.write(f"{icon} {r.role}  {r.connector_type}  {r.connection_ref}  "
                   f"{r.latency_ms}ms" if r.ok else f"  ERROR: {r.error}")

  On run_btn:
      run_id = str(uuid4())
      log_placeholder = st.empty()
      metric_cols = st.columns(4)
      # Add a custom log handler that pushes to a queue
      log_queue = queue.Queue()
      handler = QueueLogHandler(log_queue)
      logging.getLogger("framework").addHandler(handler)

      def run_in_thread():
          try:
              config = load_and_resolve(yaml_path, params)
              engine = ExecutionEngine(config)
              engine.run()
          except Exception as e:
              log_queue.put(("ERROR", str(e)))
          finally:
              log_queue.put(("DONE", None))

      thread = threading.Thread(target=run_in_thread, daemon=True)
      thread.start()

      log_lines = []
      rows_written = 0
      while True:
          try:
              level, msg = log_queue.get(timeout=0.1)
              if level == "DONE": break
              log_lines.append(f"{datetime.now():%H:%M:%S}  {level:<6}  {msg}")
              log_placeholder.code("\n".join(log_lines[-50:]))   # last 50 lines
              if "sink wrote:" in msg:
                  rows_written = int(re.search(r"(\d+) rows", msg).group(1))
                  metric_cols[0].metric("Rows written", f"{rows_written:,}")
          except queue.Empty:
              continue

      StateStore().save_job_run(run_id, job_name, params, rows_written, status)

class QueueLogHandler(logging.Handler):
    def __init__(self, q): super().__init__(); self.q = q
    def emit(self, record): self.q.put((record.levelname, self.format(record)))

Test: streamlit run ui/framework_app.py → Catalog → select a job → Runner
      Fill params, click Run — live logs should appear.
```

---

### Session UI-FW-3 — Job History

**Duration:** ~25 min | **Files:** `ui/framework_pages/07_history.py`

#### Prompt

```
Build the Job History page.

Read:
  #file:ui/shared/state_store.py
  #file:docs/brainstorming/ui-implementation-plan.md  (section 6, Page 7)

Add to StateStore:
  save_job_run(run_id, job_name, params, rows_written, status, duration_sec,
               started_at, completed_at) -> None
  get_job_runs(job_name=None, limit=200) -> list[dict]

Create ui/framework_pages/07_history.py:

Filters: job_name selectbox, status selectbox (OK/FAILED/RUNNING), date range
Table columns: run_id (truncated), job_name, status badge, started_at,
               duration_sec, rows_written, params (JSON expander)

On row click: show full log (if stored) in expander below table.

Summary metrics at top:
  Total runs | Success rate | Avg rows/run | Avg duration

Plotly chart: daily run count × success/fail stacked bar.

Test: streamlit run ui/framework_app.py → History
      Confirm runs from Runner page appear here.
```

---

## 8. Session Order & Estimated Time

| Session | UI | Files | Time | Status |
|---|---|---|---|---|
| **UI-0** | Both | shared/state_store.py, shared/styles.py | 20 min | 🔲 |
| **UI-AG-1** | Agent | agent_app.py, 01_upload.py | 50 min | 🔲 |
| **UI-AG-2** | Agent | 02_gallery.py | 30 min | 🔲 |
| **UI-AG-3** | Agent | 03_review.py | 55 min | 🔲 |
| **UI-AG-4** | Agent | 04_dashboard.py | 35 min | 🔲 |
| **UI-FW-1** | Framework | framework_app.py, 05_catalog.py | 30 min | 🔲 |
| **UI-FW-2** | Framework | 06_runner.py | 50 min | 🔲 |
| **UI-FW-3** | Framework | 07_history.py | 25 min | 🔲 |
| **Total** | | | **~5.5 hrs** | |

**Prerequisite:** LangGraph sessions (LG-0 through LG-7) must be complete before UI-AG-1
so `agent.graph.build_graph()` is importable.

---

## 9. Executive Demo Checklist

Before showing to execs, verify these work end-to-end:

```
□ Upload page: drag a real ADF ZIP → all 8 nodes complete → gate shows AUTO APPROVED
□ Gallery page: run appears with green badge, correct confidence %
□ Review page: upload a borderline pipeline (complexity > 8) → human_queue appears
□ Review page: edit YAML in ACE editor → save → approve → status updates
□ Dashboard: KPIs update after a few uploads
□ Job catalog: shows your migrated YAML configs
□ Job runner: Test Connection → all green → Run → rows appear in log
□ Job history: run record appears with correct row count
□ Both UIs: no browser errors in console during demo
□ Demo machine: both streamlit processes running on :8501 and :8502
```

---

## 10. Token Efficiency Notes for GHCP Sessions

Keep prompts under 400 tokens by:
1. Reference `#file:` for code context — don't copy-paste file contents into prompt
2. State only the new code, not what already exists
3. Use one-line descriptions for each method — GHCP fills in the implementation
4. Give the test command — GHCP writes tests to make it pass
5. Each session touches ONE page file — no multi-file sessions except UI-0
