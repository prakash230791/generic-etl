# ETL Platform UI — Implementation Plan

**Version:** 2.0 | **Date:** 2026-05-15
**Audience:** Engineering Team, Executive Sponsors
**Scope:** Web UI for Migration Agent + Framework Executor → enterprise-grade ETL product
**Companion docs:**
- `langgraph-agent-implementation.md` — LG-0 through LG-7 (agent sessions)
- `framework-hardening-plan.md` — FH-CON/TX/EX/ORC sessions
- `control-table-and-framework-v2.md` — FW-V2 sessions

---

## 1. Executive Case: Why a UI Is Essential

The CLI tools are complete and correct. But for an 18-month, 700-pipeline migration program with executive governance, a UI is essential for three unavoidable reasons:

| Need | Without UI | With UI |
|---|---|---|
| Upload & convert 700 pipelines | Shell scripts, error-prone | Drag-drop, batch queue, progress |
| Human review gate | Edit YAML files in a text editor | Side-by-side diff, approve/reject button |
| Pause + resume | Kill process, lose state | Suspend run, reviewer edits, click Resume |
| Executive reporting | Read JSON files | Dashboard: 450/700 converted, 85% confidence |
| Framework execution | `etl-run run job.yaml` | Click Run, watch live logs, see row counts |

**Bottom line for executives:** "We upload our 700 Informatica XML files, AI converts them, a human reviews the flagged 15%, and we click Approve. Done."

---

## 2. Architecture Decision

### Option A — Streamlit (rejected)

Pros: fast to build. Cons: single-page, no WebSocket, no multi-user, not embeddable in enterprise portal.

### Option B — FastAPI + React (chosen)

```
Browser  (React + TypeScript + Tailwind + shadcn/ui)
           │   REST + WebSocket
           ▼
FastAPI   (api/)
  ├── POST /api/upload            → enqueue conversion job
  ├── GET  /api/runs              → list all conversion runs
  ├── GET  /api/runs/{id}         → run detail + state snapshot
  ├── WS   /ws/runs/{id}          → stream live node updates          ← LangGraph
  ├── POST /api/review/{id}       → submit approve / reject / edit
  ├── POST /api/resume/{id}       → resume after human gate
  ├── GET  /api/yamls             → list all generated YAMLs
  ├── POST /api/execute           → run a YAML job
  └── WS   /ws/execute/{id}       → stream framework execution logs   ← ExecutionEngine
           │
           ▼  (in-process Python calls)
  agent.graph.build_graph()       ← existing LangGraph graph
  framework.execution.engine.ExecutionEngine  ← existing engine
           │
           ▼
  SQLite   (ui_state.db)          ← job registry, human review queue, audit log
```

**Why FastAPI:** already installed, same process as agent+framework, WebSocket native, async compatible with LangGraph's `stream()`.

---

## 3. What the UI Delivers — Two Portals

### Portal A — Migration Workbench (Agent)

```
┌─────────────────────────────────────────────────────────────────┐
│  UPLOAD              │  QUEUE                │  REVIEW           │
│                      │                       │                   │
│  Drag & drop         │  Pipeline ID          │  IR tree          │
│  .zip .xml .dtsx     │  Status badge         │  YAML diff        │
│  Source type         │  Confidence %         │  Warnings         │
│  Multi-file          │  Route colour         │  Approve ✓        │
│                      │  Click → detail       │  Reject ✗         │
│                      │                       │  Edit YAML        │
│  LIVE RUN VIEW       │                       │  Resume ►         │
│                      │                       │                   │
│  ▶ parse    ●●●●● done  0.04s               │                   │
│  🔍 analyze  ●●●●● done  0.12s  PORTFOLIO   │                   │
│  ■ classify ●●●●● done  0.01s               │                   │
│  🔄 translate●○○○○ running…    450 / 700 ✓  │                   │
│  ⚙ generate ○○○○○ pending      38 in review │                   │
│  ✓ validate ○○○○○ pending      85% avg conf │                   │
│  ■ report   ○○○○○ pending      Complexity   │                   │
│  🚪 gate    ○○○○○ pending      dist         │                   │
└─────────────────────────────────────────────────────────────────┘
```

### Portal B — Framework Executor

```
┌─────────────────────────────────────────────────────────────────┐
│  YAML LIBRARY              │  LIVE EXECUTION                    │
│                            │                                    │
│  Filter: all / pending     │  Run ID: ab12…                    │
│                            │  YAML: load_vpf.yaml              │
│  ✓ load_vpf.yaml  auto     │  Status: running                  │
│  ■ load_cust.yaml review   │                                    │
│  ✗ load_ord.yaml  draft    │  [source]  read 4200              │
│                            │  [filter]  pass 3891              │
│  Click → YAML editor       │  [sink]    write…                 │
│  Param overrides           │                                    │
│  [▶ Run]  [🔍 Validate]    │  ████████░░  78%                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Directory Structure

```
generic-etl-master/
├── api/                          ← NEW: FastAPI backend
│   ├── main.py                   ← app factory, CORS, lifespan
│   ├── db.py                     ← SQLite schema + helpers (aiosqlite)
│   ├── models.py                 ← Pydantic request/response models
│   ├── routes/
│   │   ├── upload.py             ← POST /api/upload
│   │   ├── runs.py               ← GET /api/runs, GET /api/runs/{id}
│   │   ├── review.py             ← POST /api/review/{id}, /api/resume/{id}
│   │   ├── yamls.py              ← GET /api/yamls
│   │   └── execute.py            ← POST /api/execute
│   ├── ws/
│   │   ├── run_stream.py         ← WS /ws/runs/{id}  (LangGraph stream)
│   │   └── exec_stream.py        ← WS /ws/execute/{id}  (engine logs)
│   └── uploads/                  ← temp upload storage
│
├── ui/                           ← NEW: React frontend
│   ├── package.json
│   ├── vite.config.ts
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx               ← routing (react-router v6)
│   │   ├── api/
│   │   │   ├── client.ts         ← fetch wrapper + WS helper
│   │   │   └── types.ts          ← TypeScript types mirroring Pydantic models
│   │   ├── pages/
│   │   │   ├── UploadPage.tsx    ← drag-drop multi-file upload
│   │   │   ├── RunsPage.tsx      ← portfolio table
│   │   │   ├── RunDetailPage.tsx ← live 8-node progress
│   │   │   ├── ReviewPage.tsx    ← IR tree + YAML diff + approve/reject
│   │   │   ├── YamlsPage.tsx     ← YAML library browser
│   │   │   └── ExecutePage.tsx   ← framework job runner
│   │   ├── components/
│   │   │   ├── NodeProgressRow.tsx  ← single node row with icon/status/timer
│   │   │   ├── IrTreeView.tsx       ← collapsible IR JSON tree
│   │   │   ├── YamlDiffEditor.tsx   ← Monaco editor (read IR yaml vs editable)
│   │   │   ├── ConfidenceBadge.tsx  ← colour-coded % badge
│   │   │   └── LogStream.tsx        ← auto-scrolling log terminal
│   │   └── public/
│
├── agent/     (existing — unchanged)
├── framework/ (existing — unchanged)
└── pyproject.toml   ← add: fastapi, uvicorn, aiosqlite, python-multipart
```

---

## 5. Database Schema (SQLite — `ui_state.db`)

```sql
-- Conversion runs (one per uploaded artifact)
CREATE TABLE runs (
    id           TEXT PRIMARY KEY,    -- uuid4
    artifact_id  TEXT NOT NULL,
    filename     TEXT NOT NULL,
    source_type  TEXT,                -- adf | informatica | ssis
    status       TEXT NOT NULL,       -- queued | running | paused | done | failed
    route        TEXT,                -- auto | human_review | manual
    confidence   REAL,                -- 0.0 - 1.0
    complexity   INTEGER,
    yaml_type    TEXT,
    report_path  TEXT,
    ir_path      TEXT,
    error        TEXT,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    state_blob   BLOB                 -- JSON snapshot of final AgentState
);

-- Human review queue (one per run needing review)
CREATE TABLE reviews (
    id           TEXT PRIMARY KEY,
    run_id       TEXT NOT NULL REFERENCES runs(id),
    status       TEXT NOT NULL,       -- pending | approved | rejected | edited
    reviewer     TEXT,
    decision     TEXT,                -- approved | rejected
    edited_yaml  TEXT,                -- NULL unless reviewer edited the YAML
    notes        TEXT,
    created_at   TEXT NOT NULL,
    resolved_at  TEXT
);

-- Framework execution log (one per etl-run invocation)
CREATE TABLE executions (
    id           TEXT PRIMARY KEY,
    yaml_path    TEXT NOT NULL,
    params       TEXT,                -- JSON
    status       TEXT NOT NULL,       -- running | done | failed
    source_rows  INTEGER,
    sink_rows    INTEGER,
    duration_s   REAL,
    error        TEXT,
    created_at   TEXT NOT NULL
);
```

---

## 6. Session Implementation Plan

**Token-efficient prompt format used throughout:**
- `CONTEXT:` — files to open first (use `#file:` in GHCP)
- `SCOPE:` — exactly what to build, nothing more
- `DO:` — numbered steps
- `TEST:` — verification command

---

### B1 — FastAPI Scaffold + DB + Upload API

**Duration:** 45 min | **Files:** `api/main.py`, `api/db.py`, `api/models.py`, `api/routes/upload.py`
**Dependencies to add:** `fastapi>=0.111`, `uvicorn[standard]>=0.29`, `aiosqlite>=0.19`, `python-multipart>=0.0.9`

```
CONTEXT: #file:pyproject.toml  #file:agent/state.py

SCOPE: Create api/ package with FastAPI app, SQLite schema, and file upload endpoint.
Do NOT implement WebSocket or LangGraph yet.

DO:
1. Add to pyproject.toml dependencies:
     fastapi>=0.111, uvicorn[standard]>=0.29, aiosqlite>=0.19, python-multipart>=0.0.9
     Add script: etl-ui = "api.main:start"

2. Create api/db.py:
   - DB_PATH = Path("ui_state.db")
   - async get_db() → aiosqlite connection
   - async init_db() → CREATE TABLE IF NOT EXISTS for runs, reviews, executions
     (exact SQL from section 5 of ui-implementation-plan.md)
   - async insert_run(id, filename, source_type, artifact_id) → None
   - async get_run(id) → dict | None
   - async list_runs(limit=100) → list[dict]
   - async update_run(id, **kwargs) → None

3. Create api/models.py — Pydantic models:
   class RunStatus(str, Enum): queued running paused done failed
   class RunSummary(BaseModel): id artifact_id filename status route confidence complexity created_at
   class RunDetail(RunSummary): yaml_path report_path ir_path error state_blob

4. Create api/routes/upload.py:
   router = APIRouter(prefix="/api")
   POST /api/upload
   - Accept: multipart/form-data, fields: files=List[UploadFile], source_type=str|None
   - For each file: save to api/uploads/{uuid}_{filename}, insert_run(), enqueue background task
   - Background task: just set status="queued" for now (LangGraph wired in B2)
   - Return: List[RunSummary]

5. Create api/main.py:
   - FastAPI app with lifespan calling init_db()
   - Mount upload router
   - CORS: allow localhost:5173 (Vite dev server)
   - GET / → {"status": "ok", "version": "1.0"}
   - def start(): uvicorn.run("api.main:app", host="0.0.0.0", port=8000, reload=True)

TEST: uvicorn api.main:app --reload
  # Upload a file via POST /api/upload
  # Connect to ws://localhost:8000/ws/runs/{id} with wscat or browser console
  # Should receive 2 node update messages
```

---

### B2 — LangGraph WebSocket Streaming

**Duration:** 45 min | **Files:** `api/ws/run_stream.py`, `api/routes/runs.py`

```
CONTEXT: #file:agent/graph.py  #file:agent/state.py  #file:api/db.py  #file:api/models.py

SCOPE: Wire LangGraph graph.stream() to a WebSocket endpoint and a background task runner.
The background task converts queued runs; the WebSocket publishes each node update to browser.

DO:
1. Create api/ws/run_stream.py:
   - ConnectionManager class: dict[run_id, set[WebSocket]]
     methods: connect(run_id, ws), disconnect(run_id, ws), broadcast(run_id, msg: dict)
   - manager = ConnectionManager()  (module singleton)

2. Create api/routes/runs.py:
   router = APIRouter(prefix="/api")
   GET /api/runs → list_runs() from db → List[RunSummary]
   GET /api/runs/{id} → get_run(id) → RunDetail (404 if missing)

3. Add WS route to api/main.py:
   WS /ws/runs/{run_id}
   - ws.accept(), manager.connect(run_id, ws) immediately on connect
   - Send current state snapshot from db immediately
   - Receive loop: handle "ping" message, disconnect on close

4. Create api/tasks/convert.py:
   async def run_conversion(run_id: str, artifact_path: str, source_type: str | None):
       """Execute LangGraph graph for one artifact, streaming updates to WebSocket."""
       from agent.graph import build_graph
       import uuid, json
       from datetime import datetime, timezone

       await update_run(run_id, status="running")
       initial_state = {
           "run_id": run_id, "artifact_id": Path(artifact_path).stem,
           "source_type": source_type or "", "raw_artifact_path": artifact_path,
           "started_at": datetime.now(timezone.utc).isoformat(),
           "llm_enabled": False, "output_dir": f"output/ui/{run_id}",
           "error_log": [], "retry_count": {}, "confidence_scores": {},
           "complexity_dims": {}, "connector_types": [], "transform_types": [],
           "translated_expressions": {}, "manual_queue": [], "generated_artifacts": {},
           "validation_errors": [], "validation_warnings": [], "gate_status": {},
           "pre_steps": [], "post_steps": [],
           "translation_confidence": 0.0, "overall_confidence": 0.0,
       }
       compiled = build_graph()
       final = {}
       try:
           for chunk in compiled.stream(initial_state, stream_mode="updates"):
               for node_name, updates in chunk.items():
                   await manager.broadcast(run_id, {"node": node_name, "updates": updates})
               final.update(updates)
       except Exception as e:
           await update_run(run_id, status="failed", error=str(e))
           await manager.broadcast(run_id, {"node": "__error__", "error": str(e)})
           return

       gate = final.get("gate_status", {})
       needs_review = gate.get("overall_confidence", 1) < "human_review"
       status = "paused" if needs_review else "done"
       await update_run(run_id,
           status=status,
           route=final.get("route"),
           confidence=final.get("overall_confidence", 0),
           complexity=final.get("complexity_score", 0),
           yaml_path=final.get("yaml_path"),
           report_path=final.get("report_path"),
           state_blob=json.dumps(final, default=str),
       )
       if needs_review:
           await insert_review(run_id)
       await manager.broadcast(run_id, {"node": "__done__", "status": status})

5. Wire upload background task to call run_conversion (see BackgroundTasks).

TEST: uvicorn api.main:app --reload
  # Upload a file via POST /api/upload
  # Connect to ws://localhost:8000/ws/runs/{id} with wscat or browser console
  # Should receive 8 node update messages
```

---

### B3 — Human Review API

**Duration:** 30 min | **Files:** `api/routes/review.py`

```
CONTEXT: #file:api/db.py  #file:api/models.py  #file:api/tasks/convert.py

SCOPE: REST endpoints for listing the review queue, submitting a decision,
and resuming a paused run. No frontend yet.

DO:
1. Add to api/db.py:
   - async insert_review(run_id) → inserts reviews row, status="pending"
   - async get_pending_reviews() → list[dict]
   - async resolve_review(run_id, decision, edited_yaml, reviewer) → None

2. Create api/routes/review.py:
   router = APIRouter(prefix="/api")

   GET /api/review
   - get_pending_reviews() sorted by created_at
   - return list[{run_id, filename, confidence, warnings, yaml_path, ir_path}]

   GET /api/review/{run_id}
   - get_review_by_run
   - return {run: RunDetail, review: ReviewRow, ir: dict, yaml_path: str}
     read ir.json and job_config.yaml from disk and embed in response

   POST /api/review/{run_id}
   Body: {decision: "approved"|"rejected", edited_yaml: str|None, notes: str|None}
   - Validate decision value
   - If edited_yaml: write it back to yaml_path (overwrite)
   - resolve_review(...)
   - update_run(run_id, status="done" if approved else "rejected")
   - Return {status: "ok"}

   POST /api/resume/{run_id}
   - Load state_blob from runs table
   - Re-run ONLY the generate→validate→report→gate nodes
     (skip parse/analyze/classify/translate — use saved IR + yaml)
   - Actually: just set status="done", broadcast completion
     (full re-run is a Phase 2 feature)
   - Return {status: "ok", run_id: run_id}

TEST: uvicorn api.main:app --reload
  curl http://localhost:8000/api/review  # list pending
  curl -X POST http://localhost:8000/api/review/{id} \
    -H "Content-Type: application/json" \
    -d '{"decision":"approved","notes":"Looks good"}'
```

---

### B4 — Framework Execution API

**Duration:** 30 min | **Files:** `api/routes/yamls.py`, `api/routes/execute.py`, `api/ws/exec_stream.py`

```
CONTEXT: #file:framework/runner.py  #file:framework/execution/engine.py  #file:api/db.py

SCOPE: Endpoints to list generated YAMLs, run one via ExecutionEngine,
and stream execution logs over WebSocket.

DO:
1. Create api/routes/yamls.py:
   GET /api/yamls
   - Glob output/**/*.yaml (exclude *_draft*)
   - For each: read job.name, version from YAML header (pyyaml load first 5 keys only)
   - Return list[{path, name, version, size_bytes, modified_at, has_review}]
     has_review = run exists in db for this path with status != "rejected"

   GET /api/yamls/content?path=...
   - Read file, return {yaml: str, valid: bool}
   - valid = try validate_config(yaml.safe_load(content))

2. Create api/ws/exec_stream.py:
   - Same ConnectionManager pattern as run_stream.py
   - exec_manager = ConnectionManager()

3. Create api/routes/execute.py:
   GET /api/executions → list recent executions from db

4. Create api/tasks/run_framework.py:
   async def run_framework_job(exec_id, yaml_path, params):
   - Set up logging handler that broadcasts to exec_manager
   - Load and validate config (framework.config.loader + validator)
   - Call ExecutionEngine().run(config, params)
   - Capture source_rows, sink_rows from engine metrics
   - Update executions row: status=done/failed, source_rows, sink_rows, duration_s

   The log handler (LogCapture) intercepts Python logging records and
   calls asyncio.get_event_loop().call_soon_threadsafe(broadcast, exec_id, msg)

TEST: POST /api/execute with yaml_path from /api/yamls response
  Connect to ws://localhost:8000/ws/execute/{exec_id}
  Expect streaming log messages ending with __done__
```

---

### F1 — React App Scaffold

**Duration:** 30 min | **Files:** `ui/` (new directory)

```
SCOPE: Create React+TypeScript+Tailwind app with routing and layout shell.
Use Vite, react-router-dom v6, shadcn/ui, lucide-react icons.
No page logic yet — just placeholders.

DO:
cd ui && npm create vite@latest . -- --template react-ts
npm install react-router-dom @radix-ui/react-slot lucide-react tailwindcss postcss autoprefixer
npx tailwindcss init -p
npx shadcn@latest init  (select: slate theme, CSS vars, yes src/components/ui/)

Create src/App.tsx with BrowserRouter + Routes:
  /          → redirect to /runs
  /upload    → UploadPage
  /runs      → RunsPage
  /runs/:id  → RunDetailPage
  /review    → ReviewQueuePage
  /review/:id → ReviewPage
  /yamls     → YamlsPage
  /execute/:id → ExecutePage

Create src/components/Layout.tsx:
  Left sidebar nav with icons + labels:
    Upload · All Runs · Review Queue · YAML Library · Executions
  Top bar: "ETL Migration Platform" wordmark + env badge (dev/prod)

TEST: npm run dev → sidebar renders, routes navigate without 404
```

---

### F2 — Upload Page (drag-drop)

**Duration:** 35 min | **Files:** `ui/src/pages/UploadPage.tsx`

```
CONTEXT: #file:api/routes/upload.py  #file:ui/src/api/client.ts

SCOPE: Drag-drop multi-file upload that POSTs to /api/upload and navigates
to RunsPage on success. Source type selector. Upload progress per file.

DO:
1. Create ui/src/api/client.ts:
   - BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000"
   - apiPost(path, body) → fetch wrapper
   - wsConnect(path) → new WebSocket(BASE_URL.replace("http","ws") + path)

2. Create ui/src/api/types.ts:
   - Mirror RunSummary, RunDetail, ReviewRow from Pydantic models

3. Create UploadPage.tsx:
   - DropZone: accept .zip .xml .dtsx, multi-file
   - SourceType select: auto-detect | adf | informatica | ssis
   - On drop: POST /api/upload (FormData), show per-file progress bar
   - On success: navigate to /runs, toast "N runs queued"

TEST: Drop file → POST succeeds → /runs shows new row with status=queued
```

---

### F3 — Live Run Detail (8-node progress)

**Duration:** 45 min | **Files:** `ui/src/pages/RunDetailPage.tsx`, `ui/src/components/NodeProgressRow.tsx`

```
CONTEXT: #file:api/ws/run_stream.py  #file:ui/src/api/client.ts

SCOPE: RunDetailPage opens WS /ws/runs/{id} and animates 8 node rows
as messages arrive. Each row shows: icon, name, status dot, elapsed time.
Show confidence + route badge when gate node completes.

DO:
1. NodeProgressRow.tsx props: {name, status, elapsed_ms, icon}
   - status: pending | running | done | failed
   - Spinning loader when running, green check when done, red X when failed
   - Timer increments while status=running using useEffect + setInterval

2. RunDetailPage.tsx:
   - Load GET /api/runs/{id} on mount for initial state
   - Open WS /ws/runs/{id}, update node states on each message
   - Render 8 NodeProgressRow components in order
   - Right panel: confidence badge, route chip (auto/human_review/manual)
   - If status=paused: show "Awaiting Review" banner + link to /review/{id}
   - If status=done: show "View YAML" button linking to /yamls

TEST: Upload file → navigate to /runs/{id} → watch nodes animate live
```

---

### F4 — Human Review (IR tree + YAML diff)

**Duration:** 50 min | **Files:** `ui/src/pages/ReviewPage.tsx`, `ui/src/components/YamlDiffEditor.tsx`, `ui/src/components/IrTreeView.tsx`

```
CONTEXT: #file:api/routes/review.py  #file:ui/src/api/types.ts

SCOPE: ReviewPage loads GET /api/review/{id}, shows:
- Left: IrTreeView (collapsible JSON tree of IR)
- Centre: YamlDiffEditor (Monaco diff: original IR-based yaml vs current yaml)
- Right: warnings list + Approve/Reject/Edit buttons
On approve/reject: POST /api/review/{id} → navigate back to queue.

DO:
1. Install Monaco: npm install @monaco-editor/react

2. IrTreeView.tsx:
   - Recursive collapsible tree for IR JSON
   - Highlight connector_types and transform_types keys in colour

3. YamlDiffEditor.tsx:
   - Monaco DiffEditor (original=ir_yaml, modified=editable)
   - onChange captures edited content for submission

4. ReviewPage.tsx:
   - GET /api/review/{id} on mount
   - Three-panel layout (25% IR | 50% diff | 25% actions)
   - Actions panel: confidence badge, warnings list, notes textarea,
     [Approve] [Reject] [Edit + Approve] buttons
   - On submit: POST /api/review/{id} with decision + edited_yaml + notes
   - Navigate back to /review on success

TEST: Create a run with human_review route → open /review/{id}
  Edit YAML → click Approve → run status = done in /runs
```

---

### F5 — Framework Executor + Log Stream

**Duration:** 40 min | **Files:** `ui/src/pages/ExecutePage.tsx`, `ui/src/components/LogStream.tsx`

```
CONTEXT: #file:api/routes/execute.py  #file:api/ws/exec_stream.py

SCOPE: ExecutePage shows YAML name + param inputs, posts to /api/execute,
then streams logs from WS /ws/execute/{id} in LogStream component.

DO:
1. LogStream.tsx:
   - Scrollable terminal-style div, monospace font, dark bg
   - Auto-scroll to bottom on new message
   - Colour-code: ERROR=red, WARNING=yellow, INFO=white
   - Show row count badges if message matches "[source] read N" pattern

2. ExecutePage.tsx (routed as /execute/:id where id=yaml name):
   - Load YAML content from GET /api/yamls/content?path=...
   - Show read-only Monaco YAML preview
   - Param override inputs (key=value pairs from YAML params section)
   - [▶ Run] button: POST /api/execute → get exec_id → open WS /ws/execute/{exec_id}
   - Show LogStream below the YAML
   - On __done__: show summary card (source_rows, sink_rows, duration_s)

TEST: Navigate to /execute/load_vpf → run → see streaming logs → summary card
```

---

### F6 — Portfolio Dashboard

**Duration:** 35 min | **Files:** `ui/src/pages/RunsPage.tsx`

```
CONTEXT: #file:api/routes/runs.py  #file:ui/src/api/types.ts

SCOPE: RunsPage is the portfolio table showing all conversion runs.
KPI cards at top. Filterable table below. Click row → /runs/{id}.

DO:
1. KPI cards (4 across):
   - Total runs / Done (green) / In review (amber) / Failed (red)
   - Avg confidence % / Complexity distribution (P0/P1/P2/P3)

2. Filterable table columns:
   Filename | Source | Status badge | Route chip | Confidence | Created | Actions

3. Status badges (colour-coded):
   queued=grey, running=blue-pulse, paused=amber, done=green, failed=red

4. Route chips:
   auto=green, human_review=amber, manual=red

5. Click row → navigate to /runs/{id}
   Actions column: [View YAML] [Review] (conditional on status)

6. Polling: refetch GET /api/runs every 5 seconds while any run is "running"

TEST: Upload 3 files → RunsPage shows 3 rows with correct badges and KPI counts
```

---

## 7. Summary Session Map

| Phase | Session | What it builds | Duration | Exit test |
|---|---|---|---|---|
| Backend | B1 | FastAPI + DB + upload API | 45 min | `curl POST /api/upload → 200` |
| Backend | B2 | LangGraph WebSocket streaming | 45 min | `wscat receives 8 node msgs` |
| Backend | B3 | Human review API | 30 min | `curl POST /api/review → 200` |
| Backend | B4 | Framework execution API | 30 min | `WS streams execution logs` |
| Frontend | F1 | App scaffold + routing + layout | 30 min | `npm run dev → sidebar renders` |
| Frontend | F2 | Upload page (drag-drop) | 35 min | `Drop file → upload succeeds` |
| Frontend | F3 | Live run detail (8-node dashboard) | 45 min | `Nodes animate in real time` |
| Frontend | F4 | Human review (IR + YAML diff) | 50 min | `Edit YAML + approve → done` |
| Frontend | F5 | Framework executor + log stream | 40 min | `Run YAML → see live logs` |
| Frontend | F6 | Portfolio dashboard (exec view) | 35 min | `KPI cards + table + chart` |
| **Total** | | | **6.5 hr** | |

---

## 8. Token Budget Per Session

To keep each GHCP session under 4000 tokens:
- Open only the `CONTEXT:` files listed, nothing else
- Do not include test files in context unless fixing a test failure
- One session = one `api/*.py` or one `ui/src/pages/*.tsx` — never both
- Use `#file:` references instead of pasting code blocks

---

## 9. Prerequisites Before Starting B1

| Check | What to verify | Command |
|---|---|---|
| `agent/graph.py` | exports `build_graph() → CompiledGraph` | `python -c "from agent.graph import build_graph; g=build_graph(); print(type(g))"` |
| `agent/state.py` | `AgentState` TypedDict includes `error_log`, `retry_count`, `confidence_scores` | `python -c "from agent.state import AgentState; print(AgentState.__annotations__.keys())"` |
| `framework/execution/engine.py` | `ExecutionEngine().run(config, params)` call signature | `python -c "from framework.execution.engine import ExecutionEngine; help(ExecutionEngine.run)"` |
| Node names | 8 nodes match B2 initial_state keys | Check `build_graph()` node names in LangGraph |

---

## 10. Deployment Path (After POC)

| Stage | How |
|---|---|
| Dev (now) | `uvicorn api.main:app --reload` + `npm run dev` |
| Demo | `npm run build → api/static/`, FastAPI serves static files |
| Staging | Docker: `FROM python:3.12-slim + npm run build baked in` |
| Production | AWS ECS (API) + CloudFront (static) + RDS PostgreSQL (replace SQLite) |

---

## 11. Executive Demo Checklist (before exec review)

- [ ] `uvicorn api.main:app --reload` starts without errors
- [ ] `npm run dev` starts on :5173 without errors
- [ ] Drop 3 test files → all 3 appear in RunsPage within 2 seconds
- [ ] At least 1 auto-approved run completes and shows YAML
- [ ] At least 1 human_review run pauses and appears in Review Queue
- [ ] Review page loads IR tree, YAML diff, approve/reject buttons
- [ ] After approval, run status → done
- [ ] ExecutePage runs a YAML and streams logs in real time
- [ ] RunsPage KPI cards show correct counts
