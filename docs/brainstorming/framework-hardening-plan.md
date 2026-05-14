# Framework Hardening Plan

**Version:** 1.0 | **Date:** 2026-05-14
**Audience:** Senior Engineers, Platform Team
**Companion docs:**
- `control-table-and-framework-v2.md` — Framework v2.0 foundation (FW-V2a through FW-V2f, implement first)
- `langgraph-agent-implementation.md` — Agent LangGraph sessions
- `docs/architecture/02-scalability.md` — Execution tier architecture
- `docs/architecture/04-extensibility.md` — Plugin contract reference

---

## 1. What Is "Framework Hardening"?

The current framework is a minimal POC: one source, one sink, four transforms, SQLite only, v1 schema. Hardening means:

| Dimension | POC State | Hardened State |
|---|---|---|
| Schema | v1: source/sink (singular), linear transforms | v2: sources[], targets[], pre_steps, parameters, watermark, control_table |
| Connectors | SQLite only (CSV stub) | SQLite, CSV, PostgreSQL, SQL Server, S3, Snowflake + connection tester |
| Transforms | 4 types (filter, expression, lookup, scd2 stub) | 15+ types covering all Informatica/ADF/SSIS patterns |
| Execution | Single source → linear chain → single sink | Multi-source DAG, conditional branching, ForEach, parallel |
| Orchestration | CLI only | CLI + Airflow DAG factory + dbt integration |
| Observability | `print()` statements | Structured logging + Prometheus metrics hooks |
| Testing | No connection test | `etl-run test-connection` pre-flight validation |

---

## 2. Q1: Do We Need Ability to Test Connectors?

**Yes — it is a production prerequisite.** Here's why and what it looks like.

### Why You Need It

| Scenario | Without Connection Test | With Connection Test |
|---|---|---|
| New YAML deployed | Job runs for 2hr, fails at write step | `test-connection` catches bad credentials in 2s |
| CI/CD pipeline | PR merged with wrong connection string | CI gate runs `test-connection`, blocks merge |
| 700-pipeline migration | Agent generates YAML; might have wrong ref | Agent calls `test_connection()` in ValidateNode |
| On-call at 3am | Alert fires: job failed — is it the DB? | `etl-run test-connection job.yaml` answers in 2s |
| Pre-decommission | "Is the old DB still accessible?" | `etl-run test-connection old_source.yaml` |

### Design

```
etl-run test-connection job.yaml
    │
    ├── Test all sources[]     → ConnectionTestResult per source
    ├── Test all targets[]     → ConnectionTestResult per target
    ├── Test watermark         → ConnectionTestResult
    └── Test control_table     → ConnectionTestResult

Output:
  ✓ source   sqlserver  @ ls://SrcDB          OK   latency: 23ms  rows_readable: yes
  ✓ target   postgres   @ ls://DW             OK   latency: 45ms  can_write: yes
  ✗ watermark sqlserver @ ls://ControlDB      FAIL error: Connection timeout (30s)
  → 2 passed, 1 FAILED

Exit code 0 = all pass. Exit code 1 = any failure. (CI-safe)
```

```
etl-run test-connection job.yaml --source-only    # only source connections
etl-run test-connection job.yaml --target-only    # only target connections
etl-run test-connection job.yaml --json           # machine-readable output for CI
```

### ConnectionTestResult Schema

```python
@dataclass
class ConnectionTestResult:
    connector_type: str        # "sqlserver", "postgres", etc.
    connection_ref: str        # "ls://SrcDB" (never raw credentials)
    role: str                  # "source" | "target" | "watermark" | "control_table"
    ok: bool
    latency_ms: int | None
    can_read: bool
    can_write: bool
    row_count: int | None      # SELECT COUNT(*) from first table found (if readable)
    schema_info: list[str]     # column names (no data) — confirms table exists
    error: str | None
```

### BaseConnector Extension

```python
# framework/connectors/base.py (hardened)
class BaseConnector(ABC):
    @abstractmethod
    def read(self) -> pd.DataFrame: ...
    @abstractmethod
    def write(self, df: pd.DataFrame) -> None: ...

    # NEW — every connector must implement
    @abstractmethod
    def test_connection(self) -> ConnectionTestResult:
        """Verify connectivity, auth, and basic read/write permission.
        Must complete in < 10 seconds. Must not read or write actual job data."""

    # OPTIONAL — override for connectors that support DDL
    def execute(self, sql: str) -> None:
        raise NotImplementedError(f"{self.connector_type} does not support execute()")

    def execute_procedure(self, name: str, params: dict) -> None:
        raise NotImplementedError(f"{self.connector_type} does not support stored procedures")

    def close(self) -> None:
        """Release connections. Called by engine after job completion."""
```

### Where test_connection() Is Called

1. `etl-run test-connection job.yaml` — explicit CLI invocation
2. `etl-run run job.yaml --preflight` — automatic pre-flight before every job run
3. `agent/nodes/validate.py` (ValidateNode) — agent tests generated YAML connections
4. CI/CD gate: `etl-run test-connection configs/*.yaml --json | jq '.failed | length'`

---

## 3. Q2: Transform Coverage — Enterprise ETL Tool Matrix

### 3.1 The Coverage Gap Today

We have 4 transforms. Enterprise ETL tools expect 20+. The gap = pipelines we cannot migrate.

| Transform | Informatica | ADF DataFlow | SSIS | dbt | Spark SQL | Framework | Priority |
|---|---|---|---|---|---|---|---|
| `row_filter` | Filter | Filter | Cond. Split | WHERE | filter() | ✅ done | — |
| `column_derive` | Expression | Derived Column | Derived Column | computed col | withColumn() | ✅ done | — |
| `lookup_enrich` | Lookup | Lookup | Lookup | ref() | broadcast join | ✅ done | — |
| `scd_type_2` | Update Strategy | — | SCD Wizard | snapshot | merge() | ⚠️ stub | **P0** |
| `stream_join` | Joiner | Join | Merge Join | — | join() | ❌ | **P0** |
| `aggregate` | Aggregator | Aggregate | Aggregate | group by | groupBy() | ❌ | **P0** |
| `union` | Union/UnionAll | Union | Union All | union() | union() | ❌ | **P0** |
| `conditional_load` | Router | Cond. Split | Cond. Split | — | when/CASE | ❌ | **P0** |
| `sort` | Sorter | Sort | Sort | order_by | orderBy() | ❌ | **P1** |
| `type_cast` | — | Cast | Data Convert | cast() | cast() | ❌ | **P1** |
| `rename_columns` | — | Select/Rename | — | alias() | withColumnRenamed | ❌ | **P1** |
| `assert_not_null` | — | Assert | — | not_null test | — | ❌ | **P1** |
| `assert_unique` | — | Assert | — | unique test | — | ❌ | **P1** |
| `assert_row_count` | — | Assert | — | — | count() | ❌ | **P1** |
| `window_function` | — | Window | — | window funcs | window() | ❌ | **P2** |
| `hash_dedup` | — | — | — | distinct | dropDuplicates | ❌ | **P2** |
| `mask_pii` | — | — | — | — | — | ❌ | **P2** |
| `pivot` | — | Pivot | Pivot | pivot_wider | pivot() | ❌ | **P2** |
| `unpivot` | Normalizer | Unpivot | Unpivot | pivot_longer | stack() | ❌ | **P2** |
| `custom_sql` | SQL Transform | Script | Script Comp. | raw() | sql() | ❌ | **P2** |
| `flatten` | — | Flatten | — | — | explode() | ❌ | **P3** |
| `rank` | — | Window/Rank | — | rank() | rank() | ❌ | **P3** |

**P0 = blocks >50% of pipeline migrations. P1 = data quality gate requirement. P2 = compliance + analytics. P3 = advanced use cases.**

### 3.2 Coverage by Completion Phase

| After Phase | Transform count | % of Informatica patterns | % of ADF patterns |
|---|---|---|---|
| Today (POC) | 4 | 35% | 30% |
| After P0 completes | 8 | 75% | 70% |
| After P1 completes | 13 | 88% | 85% |
| After P2 completes | 18 | 96% | 95% |
| After P3 completes | 22 | 100% | 100% |

### 3.3 Transform YAML Config Shapes (P0 set)

```yaml
# stream_join
- type: stream_join
  id: orders_with_customers
  left:  orders           # references source id or upstream transform id
  right: customers
  join_on: [customer_id]
  join_type: left         # left | inner | right | full
  columns:                # from right — empty means all non-key columns
    - customer_name
    - segment

# aggregate
- type: aggregate
  id: revenue_by_customer
  input: orders_with_customers
  group_by: [customer_id, customer_name]
  aggregations:
    total_revenue:  {col: revenue,    fn: sum}
    order_count:    {col: order_id,   fn: count}
    avg_order:      {col: revenue,    fn: mean}
    last_order_dt:  {col: order_date, fn: max}

# union  (stack two datasets with same schema)
- type: union
  id: all_orders
  inputs: [orders_us, orders_eu]
  deduplicate: false      # true → equivalent to UNION (distinct), false → UNION ALL

# conditional_load  (replaces Informatica Router / ADF Conditional Split)
- type: conditional_load
  input: enriched_orders
  branches:
    - id: high_value
      condition: "revenue > 10000"
      target: tgt_high_value
    - id: standard
      condition: "revenue <= 10000"
      target: tgt_standard
    - id: default          # catch-all if no condition matches (optional)
      condition: null
      target: tgt_other

# scd_type_2  (completes the stub)
- type: scd_type_2
  input: src_customers
  sink_connector: {type: sqlite, config: {db_path: ./target.db}}
  table: dim_customer
  business_key: [customer_id]
  tracked_columns: [name, email, segment]
  effective_start_col: effective_start_date
  effective_end_col:   effective_end_date
  current_flag_col:    is_current
  surrogate_key_col:   customer_sk     # optional; uses ROW_NUMBER if absent
```

---

## 4. Q3: How YAML Execution Works — Pandas, Airflow, dbt

### 4.1 The Execution Layers

```
 ┌─────────────────────────────────────────────────────────┐
 │                    YAML job config                       │  declarative definition
 │                 (source-agnostic data)                   │  (never mentions Airflow)
 └───────────────────────┬─────────────────────────────────┘
                         │
         ┌───────────────▼────────────────┐
         │        ExecutionEngine         │  framework/execution/engine.py
         │  (orchestrates the pipeline)   │  resolves plugins, runs transforms
         └───────────────┬────────────────┘
                         │
    ┌────────────────────┼─────────────────────┐
    ▼                    ▼                      ▼
  Pandas             Ray cluster           Spark/EMR
  (≤5GB, pod)        (5–500GB)            (500GB+)
    │                    │                      │
    └────────────────────┴──────────────────────┘
                         │
             ┌───────────▼───────────┐
             │   Orchestration layer │
             │  CLI / Airflow / cron │  (invokes etl-run; knows nothing about YAML internals)
             └───────────────────────┘
```

**Key principle:** The YAML never mentions Airflow, dbt, or pandas. The execution layer picks the right backend. The orchestration layer just invokes `etl-run run job.yaml`.

---

### 4.2 Pandas Execution (v2.0, hardened)

```
etl-run run load_fact_orders.yaml --param env=prod
              │
              ▼
  ┌─────────────────────────────────────────────────────┐
  │ 1. ConfigLoader.load(path)                          │
  │    → reads YAML, detects version (v1/v2)            │
  │    → auto-migrates v1 → v2 schema if needed         │
  │                                                     │
  │ 2. ParameterResolver.resolve(config, cli_params)    │
  │    → {{ parameters.env }} → "prod"                  │
  │    → {{ parameters.source_table }} → from CLI       │
  │    → ls://SrcDB → env-var or Vault lookup           │
  │                                                     │
  │ 3. StepExecutor.run_pre_steps(config.pre_steps)     │
  │    → sql: "TRUNCATE TABLE staging.orders"           │
  │    → stored_procedure: "sp_PrepareLoad"             │
  │    → dbt: "dbt run --select staging.stg_orders"     │
  │                                                     │
  │ 4. WatermarkManager.read()                          │
  │    → SELECT MAX(last_run_dt) FROM ETL_WATERMARK     │
  │    → injects :last_run_dt = "2026-05-13T00:00:00"   │
  │                                                     │
  │ 5. SourceRegistry.load_all()                        │
  │    → reads all sources[] (parallel if I/O-bound)    │
  │    → each source → named DataFrame in registry      │
  │                                                     │
  │ 6. ExecutionDAG.build(transforms)                   │
  │    → topological sort based on input/id references  │
  │    → detects parallelizable branches                │
  │                                                     │
  │ 7. ExecutionDAG.run()                               │
  │    → executes transforms in dependency order        │
  │    → passes named DataFrames between transforms     │
  │                                                     │
  │ 8. SinkWriter.write_all(targets[])                  │
  │    → writes to each target using its load_strategy  │
  │    → conditional_load branches to correct target    │
  │                                                     │
  │ 9. WatermarkManager.write()  ← only if step 8 OK   │
  │    → updates last_run_dt in watermark table         │
  │                                                     │
  │ 10. StepExecutor.run_post_steps(config.post_steps)  │
  │    → dbt: "dbt run --select marts.fact_orders+"     │
  │    → sql: "EXEC sp_RefreshStats"                    │
  └─────────────────────────────────────────────────────┘
```

---

### 4.3 Multi-Source Execution DAG (pandas, complex pipeline)

When a job has multiple sources and transforms that reference each other by `id`:

```yaml
sources:
  - {id: orders,    connector: sqlserver, query: "SELECT * FROM dbo.orders WHERE ..."}
  - {id: customers, connector: postgres,  table: dim_customer}
  - {id: products,  connector: sqlite,    table: dim_product}

transformations:
  - {type: row_filter,   id: active_orders,        input: orders,          condition: "status = 'ACTIVE'"}
  - {type: stream_join,  id: orders_enriched,       left: active_orders,    right: customers, join_on: [customer_id]}
  - {type: stream_join,  id: orders_full,           left: orders_enriched,  right: products,  join_on: [product_id]}
  - {type: column_derive, id: orders_final,         input: orders_full,     columns: [...]}
  - {type: aggregate,    id: daily_revenue,         input: orders_final,    group_by: [date]}

targets:
  - {id: tgt_detail,   input: orders_final,   connector: snowflake, table: fact_orders}
  - {id: tgt_daily,    input: daily_revenue,  connector: snowflake, table: fact_daily_revenue}
```

The `ExecutionDAG` resolves this to:

```
orders.read() ──────────────────────────────────────────────────────────┐
                                                                        │
customers.read() ───────────────────────────────────────────────────┐   │
                                                                    │   │
products.read() ────────────────────────────────────────────────┐   │   │
                                                                │   │   │
[PARALLEL reads: orders, customers, products run concurrently]  │   │   │
                                                                │   │   │
                           ┌── row_filter ─────────────────────┼───┘   │  (orders filtered)
                           │                                   │       │
                           └── stream_join(active_orders, ─────┘       │  (join 1)
                                           customers)          │
                                               │               │
                               stream_join(orders_enriched, ───┘        (join 2)
                                           products)
                                               │
                                       column_derive(orders_final)
                                               │
                              ┌────────────────┴────────────────┐
                              ▼                                  ▼
                         write(fact_orders)              aggregate(daily_revenue)
                                                               │
                                                       write(fact_daily_revenue)
```

Implementation: `ExecutionDAG` does a topological sort (Kahn's algorithm) on transform
`id` → `input` edges. Sources are always layer 0. Writes happen at the end.

---

### 4.4 Airflow + Pandas (Production Mode)

#### Sub-mode A: Airflow Calls YAML (Simple)

Each YAML job is a task. Airflow handles scheduling and dependency. YAML stays unchanged.

```python
# dags/etl_fleet.py  (Airflow DAG — hand-written or DAG factory generated)
from airflow.providers.cncf.kubernetes.operators.kubernetes_pod import KubernetesPodOperator
from datetime import datetime

with DAG("load_fact_orders", schedule="0 2 * * *", start_date=datetime(2026, 1, 1)) as dag:
    run = KubernetesPodOperator(
        task_id="run",
        image="generic-etl:2.1.0",
        cmds=["etl-run", "run", "/configs/load_fact_orders.yaml"],
        namespace="etl-pandas",
        env_vars={"ETL_ENV": "prod"},
        resources={"request_memory": "4Gi", "request_cpu": "2"},
        is_delete_operator_pod=True,
    )
```

The K8s pod runs Mode 1 (pandas execution) inside the container. Airflow only knows
"did the pod exit 0 or non-zero?" — it never touches YAML internals.

#### Sub-mode B: YAML → Airflow DAG Factory (Self-Service)

Every YAML in the Git repo generates its own Airflow DAG automatically.
No DAG code written by hand — data engineers only write YAML.

```yaml
# configs/load_fact_orders.yaml
job:
  name: load_fact_orders
  schedule: "0 2 * * *"         # Airflow cron expression
  depends_on:                    # Airflow task dependencies
    - load_dim_customer
    - load_dim_product
  execution_tier: pandas
  resources:
    memory_gb: 4
    cpu_cores: 2
    max_duration_min: 120
```

```python
# framework/airflow/dag_factory.py
# Airflow reads this file at scheduler startup; generates all DAGs from YAMLs.

from pathlib import Path
from airflow import DAG
from airflow.providers.cncf.kubernetes.operators.kubernetes_pod import KubernetesPodOperator

CONFIG_DIR = Path("/configs")

def _make_dag(config: dict) -> DAG:
    job = config["job"]
    with DAG(
        dag_id=job["name"],
        schedule_interval=job.get("schedule"),
        catchup=False,
        tags=["etl", job.get("execution_tier", "pandas")],
    ) as dag:
        task = KubernetesPodOperator(
            task_id="run",
            image="generic-etl:{{ var.value.etl_image_version }}",
            cmds=["etl-run", "run", f"/configs/{job['name']}.yaml"],
            namespace="etl-pandas",
        )
        dag.task_dict["run"] = task
    return dag

# One DAG object per YAML file — Airflow discovers them all
for yaml_file in CONFIG_DIR.glob("*.yaml"):
    config = load_config(yaml_file)
    globals()[config["job"]["name"]] = _make_dag(config)
```

**Cross-DAG dependencies** (depends_on resolves to ExternalTaskSensor):

```python
def _wire_dependencies(dag: DAG, config: dict, all_dags: dict[str, DAG]) -> None:
    for dep_name in config["job"].get("depends_on", []):
        sensor = ExternalTaskSensor(
            task_id=f"wait_for_{dep_name}",
            external_dag_id=dep_name,
            external_task_id="run",
            dag=dag,
        )
        dag.task_dict["run"].set_upstream(sensor)
```

Result: the entire ETL fleet is defined in YAML. Engineers never write Airflow DAG code.

#### Sub-mode C: ForEach (Control Table) in Airflow

**Option 1: All ForEach iterations in one pod** (simple, current approach)
```
Airflow task → K8s pod (etl-run run job.yaml)
    → ControlTableExecutor reads 50 rows from ETL_CONTROL
    → ThreadPoolExecutor(max_workers=8)
    → 8 concurrent pandas threads, all in one pod
    → One exit code for all rows
```

**Option 2: Dynamic task mapping** (Airflow 2.3+, for large ForEach)
```python
# In DAG factory — when YAML has control_table config:
@task
def get_control_rows() -> list[dict]:
    # Run query against control table, return rows as list
    return [{"source_table": "orders", "target_table": "fact_orders"}, ...]

@task
def run_one(params: dict) -> None:
    # Each mapped task runs one control table row
    subprocess.run(["etl-run", "run", "job.yaml",
                   "--param", f"source_table={params['source_table']}",
                   "--param", f"target_table={params['target_table']}"])

rows = get_control_rows()
run_one.expand(params=rows)    # one K8s pod per row — true parallelism at Airflow level
```

---

### 4.5 dbt Integration (Three Patterns)

dbt handles T (SQL transforms inside the warehouse). Framework handles EL. They compose naturally.

#### Pattern 1: Framework EL → dbt T (most common)

```
[Source DB] ──framework──► [Warehouse: raw layer]
                                      │
                               dbt run (post_step)
                                      ▼
                           [Warehouse: marts layer]
```

```yaml
# load_raw_orders.yaml
sources:
  - {id: src, connector: sqlserver, connection: ls://SrcDB, table: dbo.orders}
targets:
  - {id: raw, connector: snowflake, connection: ls://SnowflakeRaw, table: raw.orders,
     load_strategy: append}
post_steps:
  - type: dbt
    command: run
    select: "marts.fact_orders+"    # run fact_orders + all downstream models
    project_dir: /dbt/analytics
    profiles_dir: /dbt/profiles
    target: prod                    # dbt target (matches profiles.yml)
    vars:
      run_date: "{{ parameters.run_date }}"
```

Execution timeline:
```
T=0:00  framework reads 5M rows from SQL Server
T=1:30  framework writes to Snowflake raw.orders
T=1:31  post_step: dbt run --select marts.fact_orders+
T=3:45  dbt completes (staging.stg_orders → marts.fact_orders → marts.dim_customer)
T=3:45  watermark updated → job complete
```

#### Pattern 2: dbt pre-step (build staging before extract)

```
dbt run staging.stg_lookups  (pre_step — builds lookup tables in warehouse)
           ▼
Framework reads stg_lookups as lookup source
           ▼
Framework enriches and loads to target
```

```yaml
pre_steps:
  - type: dbt
    command: run
    select: "staging.stg_customer_segments"
    project_dir: /dbt/analytics

sources:
  - {id: src, connector: sqlserver, table: dbo.orders}
transformations:
  - type: lookup_enrich
    input: src
    lookup_source: {connector: snowflake, table: staging.stg_customer_segments}
    join_on: [customer_id]
    columns: [segment, tier]
targets:
  - {id: tgt, connector: snowflake, table: marts.fact_orders}
```

#### Pattern 3: dbt test gate (data quality before load)

```yaml
pre_steps:
  - type: dbt
    command: test
    select: "source:raw.orders"    # run dbt source tests before loading downstream
    fail_on_error: true            # abort entire job if dbt tests fail
```

#### StepExecutor dbt implementation

```python
# framework/execution/steps.py
def _execute_dbt_step(step: dict, params: dict) -> None:
    cmd = ["dbt", step["command"]]
    if "select" in step:
        cmd += ["--select", step["select"]]
    if "target" in step:
        cmd += ["--target", step["target"]]
    if "project_dir" in step:
        cmd += ["--project-dir", step["project_dir"]]
    if "profiles_dir" in step:
        cmd += ["--profiles-dir", step["profiles_dir"]]
    if step.get("vars"):
        import json
        cmd += ["--vars", json.dumps(step["vars"])]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=3600)
    if result.returncode != 0 and step.get("fail_on_error", True):
        raise RuntimeError(f"dbt step failed:\n{result.stderr}")
    logger.info("dbt step: %s", " ".join(cmd))
    if result.stdout:
        logger.debug("dbt output:\n%s", result.stdout)
```

---

### 4.6 Complex Pipeline Execution Summary

| Complexity Level | Pattern | How Engine Handles It |
|---|---|---|
| Simple | 1 source → transforms → 1 sink | Linear chain (current) |
| Multi-source | 2+ sources → join → sink | ExecutionDAG (topological sort) |
| Conditional | 1 source → filter → 2+ targets | conditional_load branches → SinkWriter routes by id |
| ForEach | 1 config × N parameter sets | ControlTableExecutor → ThreadPoolExecutor |
| Cross-job | Job A feeds Job B | Airflow ExternalTaskSensor (depends_on) |
| Hybrid EL+T | Framework load → dbt transform | post_steps with type: dbt |
| Data quality | Validate before/after load | assert transforms + pre/post dbt tests |

---

## 5. Implementation Sessions

### Phase A: Framework v2.0 Foundation
**(Already fully documented in `control-table-and-framework-v2.md` — implement those sessions first)**

| Session | File | Description |
|---|---|---|
| FW-V2a | `framework/config/schema.json` | Rewrite to v2.0 (parameters, sources[], targets[], pre_steps, watermark) |
| FW-V2b | `framework/config/resolver.py` | `ParameterResolver` — `{{ parameters.X }}` substitution |
| FW-V2c | `framework/execution/steps.py` | `StepExecutor` — sql / stored_procedure / dbt steps |
| FW-V2d | `framework/execution/watermark.py` | `WatermarkManager` — read/write watermark |
| FW-V2e | `framework/execution/control_table.py` | `ControlTableExecutor` — ForEach/parallel |
| FW-V2f | `framework/execution/engine.py` | Engine v2.0 rewrite + runner.py --param flag |

---

### Phase B: Connector Hardening

---

#### Session FH-CON-1 — BaseConnector: test_connection() + ConnectionTestResult

**Duration:** ~30 min | **Files:** `framework/connectors/base.py`, `framework/connectors/connection_test.py`
**Tests:** `pytest tests/test_framework.py::test_connector_test_connection -v`
**Depends on:** FW-V2c (execute() on base connector)

##### Session Prompt

```
Harden framework/connectors/base.py and create framework/connectors/connection_test.py.

Read FIRST:
  #file:framework/connectors/base.py
  #file:docs/brainstorming/framework-hardening-plan.md   (section 2)

1. Add to framework/connectors/base.py:

   @dataclass
   class ConnectionTestResult:
       connector_type: str
       connection_ref: str    # the ls:// or kv:// ref, never raw credentials
       role: str              # "source" | "target" | "watermark" | "control_table"
       ok: bool
       latency_ms: int | None = None
       can_read: bool = False
       can_write: bool = False
       row_count: int | None = None
       schema_info: list[str] = field(default_factory=list)
       error: str | None = None

   Add abstract method to BaseConnector:
       @abstractmethod
       def test_connection(self) -> ConnectionTestResult: ...

   Add optional (non-abstract) methods with default NotImplementedError:
       def execute(self, sql: str) -> None: ...
       def execute_procedure(self, name: str, params: dict) -> None: ...
       def close(self) -> None: ...

2. Implement test_connection() in SQLiteConnector (framework/connectors/sqlite.py):
   - Try to connect to the .db file
   - Run: SELECT COUNT(*) FROM sqlite_master WHERE type='table'
   - Record table_count in schema_info
   - Set latency_ms = round-trip time for the SELECT
   - Set can_read=True if SELECT worked, can_write=True if INSERT + ROLLBACK works

3. Create framework/connectors/connection_test.py:
   class ConnectionTester:
       def test_all(self, config: dict) -> list[ConnectionTestResult]:
           """Test all connections declared in a v2 YAML config dict."""
           results = []
           for src in config.get("sources", []):
               results.append(self._test_one(src, "source"))
           for tgt in config.get("targets", []):
               results.append(self._test_one(tgt, "target"))
           if wm := config.get("watermark"):
               results.append(self._test_one(wm, "watermark"))
           if ct := config.get("control_table"):
               results.append(self._test_one(ct, "control_table"))
           return results

       def print_results(self, results: list[ConnectionTestResult]) -> bool:
           """Print formatted results. Returns True if all passed."""

Tests:
  - test_sqlite_test_connection_ok  (valid db path → ok=True)
  - test_sqlite_test_connection_fail  (bad path → ok=False, error non-empty)
  - test_connection_tester_tests_all_sources
  - test_connection_tester_returns_false_on_any_failure

Run: pytest tests/test_framework.py -k "connection" -v
```

---

#### Session FH-CON-2 — CLI: etl-run test-connection

**Duration:** ~25 min | **Files:** `framework/runner.py`
**Tests:** `pytest tests/test_framework.py::test_runner_test_connection -v`
**Depends on:** FH-CON-1

##### Session Prompt

```
Add 'test-connection' subcommand to framework/runner.py.

Read FIRST:
  #file:framework/runner.py
  #file:framework/connectors/connection_test.py

Add a new Click command to the runner:

  @main.command("test-connection")
  @click.argument("config_path", type=click.Path(exists=True, path_type=Path))
  @click.option("--source-only", is_flag=True)
  @click.option("--target-only", is_flag=True)
  @click.option("--json-output", is_flag=True, help="Machine-readable output for CI")
  def test_connection(config_path, source_only, target_only, json_output):
      """Test all connections declared in CONFIG_PATH without running the job.

      Exit code 0 = all connections OK.
      Exit code 1 = one or more connections FAILED.
      """
      config = load_config(config_path)
      tester = ConnectionTester()
      results = tester.test_all(config)
      if source_only:
          results = [r for r in results if r.role == "source"]
      if target_only:
          results = [r for r in results if r.role == "target"]
      if json_output:
          import json
          click.echo(json.dumps([asdict(r) for r in results], indent=2))
      else:
          all_ok = tester.print_results(results)
      sys.exit(0 if all(r.ok for r in results) else 1)

Tests:
  - test_test_connection_exits_0_on_valid_config
  - test_test_connection_exits_1_on_bad_config
  - test_test_connection_json_output_is_parseable
  - test_test_connection_source_only_flag

Run: pytest tests/test_framework.py -k "test_connection" -v
Then: etl-run test-connection sample_data/job_config.yaml
```

---

#### Session FH-CON-3 — CSVFile Connector (complete stub + test_connection)

**Duration:** ~25 min | **Files:** `framework/connectors/csv_file.py`
**Tests:** `pytest tests/test_framework.py -k "csv" -v`
**Depends on:** FH-CON-1

##### Session Prompt

```
Complete the CSVFileConnector stub and add test_connection().

Read FIRST:
  #file:framework/connectors/csv_file.py
  #file:framework/connectors/sqlite.py    (reference implementation)
  #file:framework/connectors/base.py

Implement:
  def read(self) -> pd.DataFrame:
      path = Path(self.config["path"])
      return pd.read_csv(
          path,
          delimiter=self.config.get("delimiter", ","),
          encoding=self.config.get("encoding", "utf-8"),
          dtype=str if self.config.get("all_string", False) else None,
      )

  def write(self, df: pd.DataFrame) -> None:
      path = Path(self.config["path"])
      path.parent.mkdir(parents=True, exist_ok=True)
      mode = "a" if self.config.get("append", False) else "w"
      header = not (self.config.get("append", False) and path.exists())
      df.to_csv(path, index=False, mode=mode, header=header,
                delimiter=self.config.get("delimiter", ","),
                encoding=self.config.get("encoding", "utf-8"))

  def test_connection(self) -> ConnectionTestResult:
      # For read: check path exists and is readable (pd.read_csv first 5 rows)
      # For write: check parent directory is writable (temp file probe)
      # Return ConnectionTestResult with latency_ms

Tests:
  - test_csv_read_standard_file
  - test_csv_write_creates_file
  - test_csv_write_append_mode
  - test_csv_test_connection_ok
  - test_csv_test_connection_missing_file

Run: pytest tests/test_framework.py -k "csv" -v
```

---

#### Session FH-CON-4 — SCD Type 2 (complete the stub)

**Duration:** ~50 min | **Files:** `framework/transformations/scd_type_2.py`
**Tests:** `pytest tests/test_framework.py -k "scd" -v`
**Depends on:** FW-V2c (sink connector access from transform config)

##### Session Prompt

```
Complete the SCDType2Transformation stub.

Read FIRST:
  #file:framework/transformations/scd_type_2.py
  #file:framework/transformations/lookup.py         (reference for connector access)
  #file:framework/connectors/sqlite.py
  #file:docs/brainstorming/framework-hardening-plan.md  (section 3.3 SCD YAML shape)

Implement apply(df) using the full SCD Type 2 merge algorithm:

  Algorithm (pandas):
  1. Read existing dimension table via sink_connector (current records only: is_current=True)
  2. Merge incoming df with existing on business_key (outer join)
  3. For each matched row: compare tracked_columns values
     - No change → keep existing row (no action)
     - Changed → expire existing (set effective_end_col=today, current_flag_col=False)
               → insert new version (effective_start_col=today, effective_end_col=9999-12-31)
  4. For new rows (no match): insert with effective_start=today, effective_end=9999-12-31, current=True
  5. Write the updated dimension table back via sink_connector
     (full replace — TRUNCATE + INSERT, or MERGE if connector supports it)

  Use pd.Timestamp.now() for effective dates.
  Use pd.Timestamp("9999-12-31") as the "open" end date.

  Surrogate key: if surrogate_key_col is configured, generate using:
      df[surrogate_key_col] = range(start_key, start_key + len(new_rows))
      where start_key = existing_dim.shape[0] + 1

Tests (use SQLite as both source and dimension table):
  - test_scd2_inserts_new_rows
  - test_scd2_expires_changed_rows
  - test_scd2_keeps_unchanged_rows
  - test_scd2_generates_surrogate_key
  - test_scd2_multiple_versions_same_key

Run: pytest tests/test_framework.py -k "scd" -v
```

---

### Phase C: Transform Hardening (P0 Priority)

---

#### Session FH-TX-1 — stream_join

**Duration:** ~35 min | **Files:** `framework/transformations/stream_join.py`
**Tests:** `pytest tests/test_framework.py -k "join" -v`
**Depends on:** FW-V2f (engine v2 with named dataset registry)

##### Session Prompt

```
Implement framework/transformations/stream_join.py.

Read FIRST:
  #file:framework/transformations/base.py
  #file:framework/transformations/lookup.py   (reference for structure)
  #file:docs/brainstorming/framework-hardening-plan.md  (section 3.3 stream_join YAML)

class StreamJoinTransformation(BaseTransformation):
    transformation_type = "stream_join"

    Config keys:
      left:      str   — id of left dataset (source or upstream transform)
      right:     str   — id of right dataset
      join_on:   list  — column names present in both DataFrames
      join_type: str   — "left" | "inner" | "right" | "full" (default: "left")
      columns:   list  — columns to include from RIGHT df (empty = all)

  def apply_multi(self, datasets: dict[str, pd.DataFrame]) -> pd.DataFrame:
      """Join left and right DataFrames from the named dataset registry.
      Called by the engine instead of apply() for multi-input transforms."""
      left_df  = datasets[self.config["left"]]
      right_df = datasets[self.config["right"]]

      how = {"left": "left", "inner": "inner", "right": "right", "full": "outer"}
             .get(self.config.get("join_type", "left"), "left")

      if cols := self.config.get("columns", []):
          keep = self.config["join_on"] + [c for c in cols if c not in self.config["join_on"]]
          right_df = right_df[keep]

      result = left_df.merge(right_df, on=self.config["join_on"], how=how, suffixes=("", "_right"))
      # Drop duplicated columns from right (suffixed _right) unless explicitly kept
      drop_cols = [c for c in result.columns if c.endswith("_right")]
      return result.drop(columns=drop_cols)

  def apply(self, df: pd.DataFrame) -> pd.DataFrame:
      raise TypeError("stream_join requires apply_multi() — use multi-source engine")

Register in pyproject.toml:
  [project.entry-points."etl.transformations"]
  stream_join = "framework.transformations.stream_join:StreamJoinTransformation"

Tests:
  - test_stream_join_inner_join_drops_unmatched
  - test_stream_join_left_join_keeps_all_left
  - test_stream_join_columns_filter_from_right
  - test_stream_join_full_join
  - test_stream_join_raises_if_apply_called_directly

Run: pytest tests/test_framework.py -k "join" -v
```

---

#### Session FH-TX-2 — aggregate

**Duration:** ~35 min | **Files:** `framework/transformations/aggregate.py`
**Tests:** `pytest tests/test_framework.py -k "aggregate" -v`

##### Session Prompt

```
Implement framework/transformations/aggregate.py.

Read FIRST:
  #file:framework/transformations/base.py
  #file:docs/brainstorming/framework-hardening-plan.md  (section 3.3 aggregate YAML)

Config shape:
  group_by:      list[str]
  aggregations:  dict[str, {col: str, fn: str}]
    fn options: sum | count | mean | min | max | first | last | std | nunique

class AggregateTransformation(BaseTransformation):
    transformation_type = "aggregate"

    def apply(self, df: pd.DataFrame) -> pd.DataFrame:
        agg_spec = {}
        for out_col, spec in self.config["aggregations"].items():
            agg_spec[spec["col"]] = spec["fn"]
        result = df.groupby(self.config["group_by"], as_index=False).agg(agg_spec)
        # Rename columns to output names
        rename_map = {spec["col"]: out_col
                      for out_col, spec in self.config["aggregations"].items()
                      if out_col != spec["col"]}
        return result.rename(columns=rename_map)

Tests:
  - test_aggregate_sum
  - test_aggregate_count
  - test_aggregate_multi_group_by
  - test_aggregate_multiple_functions_on_same_column (two agg specs on same input col)
  - test_aggregate_preserves_group_by_columns

Run: pytest tests/test_framework.py -k "aggregate" -v
```

---

#### Session FH-TX-3 — union + conditional_load

**Duration:** ~45 min | **Files:** `framework/transformations/union.py`, `framework/transformations/conditional_load.py`
**Tests:** `pytest tests/test_framework.py -k "union or conditional" -v`

##### Session Prompt

```
Implement framework/transformations/union.py and conditional_load.py.

Read FIRST:
  #file:framework/transformations/base.py
  #file:docs/brainstorming/framework-hardening-plan.md  (section 3.3 union + conditional_load YAML)

=== union.py ===
Config: inputs: list[str], deduplicate: bool (default False)

class UnionTransformation(BaseTransformation):
    transformation_type = "union"

    def apply_multi(self, datasets: dict[str, pd.DataFrame]) -> pd.DataFrame:
        frames = [datasets[inp] for inp in self.config["inputs"]]
        # Align schemas — add missing columns as NaN
        all_cols = list(dict.fromkeys(col for f in frames for col in f.columns))
        aligned = [f.reindex(columns=all_cols) for f in frames]
        result = pd.concat(aligned, ignore_index=True)
        if self.config.get("deduplicate", False):
            result = result.drop_duplicates()
        return result

=== conditional_load.py ===
Config:
  input: str          — source dataset id
  branches: list of {id: str, condition: str | null, target: str}
  The branch with condition=null is the default (catch-all).

class ConditionalLoadTransformation(BaseTransformation):
    transformation_type = "conditional_load"

    def apply(self, df: pd.DataFrame) -> dict[str, pd.DataFrame]:
        """Returns a dict of target_id → DataFrame slice instead of a single DataFrame.
        Engine routes each slice to the correct target connector."""
        results = {}
        remaining = df.copy()
        for branch in self.config["branches"]:
            if branch.get("condition") is None:
                results[branch["target"]] = remaining
                break
            mask = remaining.eval(branch["condition"])
            results[branch["target"]] = remaining[mask].copy()
            remaining = remaining[~mask]
        return results

  Note: conditional_load.apply() returns dict, not DataFrame.
  The engine must check for this and route slices to the correct SinkConnector.

Register both in pyproject.toml.

Tests:
  - test_union_stacks_two_frames
  - test_union_deduplicates_when_flag_set
  - test_union_aligns_mismatched_schemas
  - test_conditional_load_splits_correctly
  - test_conditional_load_default_catches_remainder
  - test_conditional_load_empty_branch

Run: pytest tests/test_framework.py -k "union or conditional" -v
```

---

#### Session FH-TX-4 — Data Quality Transforms (assert_not_null, assert_unique, assert_row_count)

**Duration:** ~40 min | **Files:** `framework/transformations/data_quality.py`
**Tests:** `pytest tests/test_framework.py -k "assert" -v`

##### Session Prompt

```
Implement framework/transformations/data_quality.py with three assertion transforms.

Read FIRST:
  #file:framework/transformations/base.py
  #file:framework/transformations/filter.py

These transforms never modify data — they raise DataQualityError on failure
or warn (configurable via on_failure: "raise" | "warn" | "skip").

class DataQualityError(Exception): pass

class AssertNotNullTransformation(BaseTransformation):
    transformation_type = "assert_not_null"
    # Config: columns: list[str], on_failure: str (default "raise")
    def apply(self, df: pd.DataFrame) -> pd.DataFrame:
        for col in self.config["columns"]:
            null_count = df[col].isnull().sum()
            if null_count > 0:
                msg = f"assert_not_null failed: {col} has {null_count} null rows"
                self._handle_failure(msg)
        return df

class AssertUniqueTransformation(BaseTransformation):
    transformation_type = "assert_unique"
    # Config: columns: list[str], on_failure: str
    def apply(self, df: pd.DataFrame) -> pd.DataFrame:
        dupes = df.duplicated(subset=self.config["columns"]).sum()
        if dupes > 0:
            msg = f"assert_unique failed: {dupes} duplicate rows on {self.config['columns']}"
            self._handle_failure(msg)
        return df

class AssertRowCountTransformation(BaseTransformation):
    transformation_type = "assert_row_count"
    # Config: min_rows: int (default 0), max_rows: int (optional), on_failure: str
    def apply(self, df: pd.DataFrame) -> pd.DataFrame:
        count = len(df)
        if count < self.config.get("min_rows", 0):
            self._handle_failure(f"assert_row_count: got {count}, expected >= {self.config['min_rows']}")
        if "max_rows" in self.config and count > self.config["max_rows"]:
            self._handle_failure(f"assert_row_count: got {count}, expected <= {self.config['max_rows']}")
        return df

All three share:
  def _handle_failure(self, msg: str) -> None:
      mode = self.config.get("on_failure", "raise")
      if mode == "raise":   raise DataQualityError(msg)
      elif mode == "warn":  logger.warning(msg)
      elif mode == "skip":  pass

Register all three in pyproject.toml.

Tests (each transform × each on_failure mode):
  - test_assert_not_null_passes_clean_data
  - test_assert_not_null_raises_on_nulls
  - test_assert_not_null_warns_on_failure_warn
  - test_assert_unique_passes_unique_data
  - test_assert_unique_raises_on_duplicates
  - test_assert_row_count_min_enforced
  - test_assert_row_count_max_enforced
  - test_assert_row_count_passes_within_bounds

Run: pytest tests/test_framework.py -k "assert" -v
```

---

#### Session FH-TX-5 — mask_pii

**Duration:** ~40 min | **Files:** `framework/transformations/mask_pii.py`
**Tests:** `pytest tests/test_framework.py -k "pii" -v`

##### Session Prompt

```
Implement framework/transformations/mask_pii.py.

Read FIRST:
  #file:framework/transformations/base.py
  #file:docs/architecture/03-security.md    (mask_pii section)

Config:
  columns:
    - {name: email,      strategy: hash}        # sha256 hash
    - {name: phone,      strategy: redact}       # replace with "REDACTED"
    - {name: full_name,  strategy: pseudonymize} # deterministic fake name (hashlib seed)
    - {name: dob,        strategy: generalize,   precision: year}  # "1985" not "1985-03-15"
    - {name: ssn,        strategy: tokenize}     # replace with UUID (stored in lookup table)
  seed: 42  # for pseudonymize reproducibility

class MaskPIITransformation(BaseTransformation):
    transformation_type = "mask_pii"

    STRATEGIES = ["hash", "redact", "pseudonymize", "generalize", "tokenize"]

    def apply(self, df: pd.DataFrame) -> pd.DataFrame:
        result = df.copy()
        for col_cfg in self.config["columns"]:
            col = col_cfg["name"]
            strategy = col_cfg["strategy"]
            if col not in result.columns:
                logger.warning("mask_pii: column %s not found in DataFrame", col)
                continue
            result[col] = self._apply_strategy(result[col], strategy, col_cfg)
        return result

    def _apply_strategy(self, series, strategy, cfg):
        if strategy == "hash":
            import hashlib
            return series.apply(lambda v: hashlib.sha256(str(v).encode()).hexdigest()[:16]
                                           if pd.notna(v) else v)
        elif strategy == "redact":
            return series.apply(lambda v: "REDACTED" if pd.notna(v) else v)
        elif strategy == "generalize":
            precision = cfg.get("precision", "year")
            if precision == "year":
                return pd.to_datetime(series, errors="coerce").dt.year.astype(str)
        elif strategy == "tokenize":
            import uuid
            return series.apply(lambda v: str(uuid.uuid5(uuid.NAMESPACE_OID, str(v)))
                                           if pd.notna(v) else v)
        elif strategy == "pseudonymize":
            # Deterministic fake: hash → pick from name list using hash as index
            return series.apply(self._pseudonymize)
        return series

    def _pseudonymize(self, value):
        # Simple: use first 6 hex chars of sha256 as "fake" id
        import hashlib
        h = hashlib.sha256(f"{self.config.get('seed', 0)}{value}".encode()).hexdigest()
        return f"person_{h[:8]}"

CRITICAL test: verify no actual PII values appear in logged output during transform.

Tests:
  - test_mask_pii_hash_is_deterministic
  - test_mask_pii_redact_replaces_value
  - test_mask_pii_generalize_year_extracts_year
  - test_mask_pii_tokenize_produces_uuid
  - test_mask_pii_missing_column_warns_not_errors
  - test_mask_pii_no_pii_in_log_output   (capture log output, assert original values absent)

Run: pytest tests/test_framework.py -k "pii" -v
```

---

### Phase D: Multi-Source Execution DAG

---

#### Session FH-EX-1 — NamedDatasetRegistry + ExecutionDAG

**Duration:** ~60 min | **Files:** `framework/execution/dataset_registry.py`, `framework/execution/execution_dag.py`
**Tests:** `pytest tests/test_framework.py -k "dag or registry" -v`
**Depends on:** FW-V2f (engine v2 base), FH-TX-1 (stream_join)

##### Session Prompt

```
Implement framework/execution/dataset_registry.py and execution_dag.py.

Read FIRST:
  #file:framework/execution/engine.py
  #file:framework/transformations/base.py
  #file:framework/transformations/stream_join.py
  #file:docs/brainstorming/framework-hardening-plan.md   (section 4.3)

=== dataset_registry.py ===
class NamedDatasetRegistry:
    """Holds all named DataFrames produced by sources and transforms."""
    def __init__(self): self._store: dict[str, pd.DataFrame] = {}
    def put(self, name: str, df: pd.DataFrame) -> None: self._store[name] = df
    def get(self, name: str) -> pd.DataFrame: return self._store[name]
    def has(self, name: str) -> bool: return name in self._store

=== execution_dag.py ===
class ExecutionDAG:
    """Topological sort of transforms based on their input → id references."""

    def build(self, transforms: list[dict]) -> list[list[dict]]:
        """Return transforms sorted into execution layers.
        Layer 0 = transforms that only need sources (no transform inputs).
        Layer N = transforms whose inputs are all satisfied by layers 0..N-1.
        Transforms in the same layer can run in parallel."""

        # Build dependency graph: {transform_id: set of required input ids}
        deps: dict[str, set] = {}
        for t in transforms:
            t_id = t.get("id", t["type"])
            inputs = set()
            for key in ("input", "left", "right"):
                if key in t:
                    inputs.add(t[key])
            if "inputs" in t:
                inputs.update(t["inputs"])
            deps[t_id] = inputs

        # Kahn's algorithm for topological sort into layers
        available = set()  # source ids
        layers = []
        remaining = list(transforms)
        while remaining:
            layer = [t for t in remaining
                     if deps.get(t.get("id", t["type"]), set()).issubset(available)]
            if not layer:
                raise ValueError("Circular dependency in transforms or missing source id")
            layers.append(layer)
            for t in layer:
                available.add(t.get("id", t["type"]))
            remaining = [t for t in remaining if t not in layer]
        return layers

    def run(self, layers: list[list[dict]], registry: NamedDatasetRegistry,
            get_transform) -> None:
        """Execute each layer, storing results in the registry."""
        for layer in layers:
            for t_cfg in layer:
                xform = get_transform(t_cfg["type"], t_cfg.get("config", t_cfg))
                t_id = t_cfg.get("id", t_cfg["type"])
                if hasattr(xform, "apply_multi"):
                    result = xform.apply_multi(registry._store)
                else:
                    input_id = t_cfg.get("input")
                    result = xform.apply(registry.get(input_id))
                if isinstance(result, dict):
                    for target_id, df in result.items():
                        registry.put(target_id, df)
                else:
                    registry.put(t_id, result)

Update engine.py to use ExecutionDAG + NamedDatasetRegistry for all v2 jobs.

Tests:
  - test_dag_single_transform_no_deps
  - test_dag_sorts_join_after_both_sources
  - test_dag_detects_circular_dependency
  - test_dag_parallel_layer_when_independent
  - test_registry_stores_and_retrieves

Run: pytest tests/test_framework.py -k "dag or registry" -v
```

---

### Phase E: Orchestration Integrations

---

#### Session FH-ORC-1 — Airflow DAG Factory

**Duration:** ~50 min | **Files:** `framework/airflow/dag_factory.py`
**Tests:** `pytest tests/test_framework.py -k "dag_factory" -v`
**Depends on:** FW-V2a (v2 schema), FW-V2f (engine v2)

##### Session Prompt

```
Implement framework/airflow/dag_factory.py.

Read FIRST:
  #file:docs/brainstorming/framework-hardening-plan.md  (section 4.4 sub-mode B)
  #file:framework/config/loader.py

The DAG factory is imported by Airflow at scheduler startup. It scans a config directory
and generates one DAG per YAML file. No Airflow code needs to be written by data engineers.

Implement framework/airflow/dag_factory.py:

  CONFIG_DIR env var: ETL_CONFIG_DIR (default: /configs)

  def make_dag(config: dict) -> DAG:
      """Generate one Airflow DAG from a v2 YAML config dict."""
      job = config["job"]
      with DAG(
          dag_id=job["name"],
          schedule_interval=job.get("schedule"),
          default_args={"owner": "etl-platform", "retries": 2,
                        "retry_delay": timedelta(minutes=5)},
          catchup=False,
          max_active_runs=1,
          tags=["etl", job.get("execution_tier", "pandas"), f"tier:{job.get('priority', 'P2')}"],
      ) as dag:
          run_task = KubernetesPodOperator(
              task_id="run",
              image=Variable.get("etl_image_version", "generic-etl:latest"),
              cmds=["etl-run", "run", f"/configs/{job['name']}.yaml"],
              namespace="etl-pandas",
              env_vars={"ETL_ENV": Variable.get("etl_env", "prod")},
              resources=k8s.V1ResourceRequirements(
                  requests={"memory": f"{job.get('resources', {}).get('memory_gb', 4)}Gi",
                            "cpu": str(job.get('resources', {}).get('cpu_cores', 2))},
              ),
              is_delete_operator_pod=True,
          )
          # Wire ExternalTaskSensor for each depends_on
          for dep in job.get("depends_on", []):
              sensor = ExternalTaskSensor(
                  task_id=f"wait_{dep}",
                  external_dag_id=dep,
                  external_task_id="run",
                  timeout=7200,
              )
              run_task.set_upstream(sensor)
      return dag

  # Auto-discovery: generates all DAGs at module import
  def _autodiscover(config_dir: Path) -> dict[str, DAG]:
      dags = {}
      for yaml_file in config_dir.glob("*.yaml"):
          try:
              config = load_config(yaml_file)
              dags[config["job"]["name"]] = make_dag(config)
          except Exception as e:
              logger.warning("Skipping %s: %s", yaml_file.name, e)
      return dags

  if os.getenv("AIRFLOW_HOME"):  # only auto-discover in Airflow context
      _etl_dags = _autodiscover(Path(os.getenv("ETL_CONFIG_DIR", "/configs")))
      globals().update(_etl_dags)

Tests (mock airflow imports if not installed):
  - test_make_dag_sets_correct_dag_id
  - test_make_dag_sets_schedule
  - test_make_dag_wires_depends_on_as_sensors
  - test_autodiscover_skips_invalid_yamls

Run: pytest tests/test_framework.py -k "dag_factory" -v
```

---

#### Session FH-ORC-2 — dbt Step Integration

**Duration:** ~35 min | **Files:** `framework/execution/steps.py` (add dbt handler)
**Tests:** `pytest tests/test_framework.py -k "dbt" -v`
**Depends on:** FW-V2c (StepExecutor base)

##### Session Prompt

```
Add dbt step type to framework/execution/steps.py.

Read FIRST:
  #file:framework/execution/steps.py
  #file:docs/brainstorming/framework-hardening-plan.md   (section 4.5 — dbt patterns)

Add to StepExecutor._execute_one(step):

  elif step["type"] == "dbt":
      self._execute_dbt(step)

  def _execute_dbt(self, step: dict) -> None:
      cmd = ["dbt", step["command"]]
      if sel := step.get("select"):   cmd += ["--select", sel]
      if tgt := step.get("target"):   cmd += ["--target", tgt]
      if pd := step.get("project_dir"): cmd += ["--project-dir", pd]
      if prof := step.get("profiles_dir"): cmd += ["--profiles-dir", prof]
      if step.get("vars"):
          cmd += ["--vars", json.dumps(step["vars"])]
      if step.get("no_version_check", True):
          cmd += ["--no-version-check"]

      logger.info("running dbt: %s", " ".join(cmd))
      result = subprocess.run(cmd, capture_output=True, text=True,
                              timeout=step.get("timeout_seconds", 3600))
      if result.returncode != 0 and step.get("fail_on_error", True):
          raise StepExecutionError(f"dbt step failed (exit {result.returncode}):\n{result.stderr}")
      if result.stdout:
          for line in result.stdout.strip().split("\n"):
              logger.info("[dbt] %s", line)

  dbt step YAML shape:
    - type: dbt
      command: run            # run | test | seed | snapshot | compile
      select: "marts.fact+"
      project_dir: /dbt/project
      profiles_dir: /dbt/profiles
      target: prod
      fail_on_error: true
      timeout_seconds: 1800

Tests (mock subprocess.run for dbt calls):
  - test_dbt_run_step_calls_correct_command
  - test_dbt_test_step_fails_job_when_tests_fail
  - test_dbt_step_with_vars_serializes_to_json
  - test_dbt_step_fail_on_error_false_continues

Run: pytest tests/test_framework.py -k "dbt" -v
```

---

## 6. Session Order & Estimated Time

### Phase A: Framework v2.0 (prerequisite for everything below)

From `control-table-and-framework-v2.md` — implement FW-V2a → FW-V2f first (~4.5 hours).

### Phase B: Connector Hardening

| Session | Files | Time | Status |
|---|---|---|---|
| **FH-CON-1** | base.py + connection_test.py | 30 min | 🔲 |
| **FH-CON-2** | runner.py (test-connection CLI) | 25 min | 🔲 |
| **FH-CON-3** | csv_file.py (complete) | 25 min | 🔲 |
| **FH-CON-4** | scd_type_2.py (complete) | 50 min | 🔲 |

### Phase C: Transform Hardening

| Session | Files | Time | Status |
|---|---|---|---|
| **FH-TX-1** | stream_join.py | 35 min | 🔲 |
| **FH-TX-2** | aggregate.py | 35 min | 🔲 |
| **FH-TX-3** | union.py + conditional_load.py | 45 min | 🔲 |
| **FH-TX-4** | data_quality.py (assert*) | 40 min | 🔲 |
| **FH-TX-5** | mask_pii.py | 40 min | 🔲 |

### Phase D: Execution Engine Hardening

| Session | Files | Time | Status |
|---|---|---|---|
| **FH-EX-1** | dataset_registry.py + execution_dag.py | 60 min | 🔲 |

### Phase E: Orchestration

| Session | Files | Time | Status |
|---|---|---|---|
| **FH-ORC-1** | framework/airflow/dag_factory.py | 50 min | 🔲 |
| **FH-ORC-2** | steps.py (dbt handler) | 35 min | 🔲 |

### Grand Total

| Phase | Sessions | Time |
|---|---|---|
| A: Framework v2.0 (prerequisite) | 6 | ~4.5 hrs |
| B: Connector hardening | 4 | ~2.1 hrs |
| C: Transform hardening | 5 | ~3.3 hrs |
| D: Execution engine | 1 | ~1.0 hrs |
| E: Orchestration | 2 | ~1.4 hrs |
| **Total** | **18** | **~12.3 hrs** |

---

## 7. Test Coverage Targets

| Module | Current | Target |
|---|---|---|
| `framework/connectors/*` | 85% (sqlite only) | 90%+ all connectors |
| `framework/transformations/*` | 75% (4 transforms) | 90%+ all 12 transforms |
| `framework/execution/engine.py` | 95% | 95%+ (multi-source) |
| `framework/execution/steps.py` | 0% (new) | 85%+ |
| `framework/execution/watermark.py` | 0% (new) | 85%+ |
| `framework/execution/control_table.py` | 0% (new) | 85%+ |
| `framework/airflow/dag_factory.py` | 0% (new) | 80%+ |
| **Overall** | **79%** | **≥90%** |

---

## 8. Definition of Done (Hardened Framework)

```
□ etl-run test-connection job.yaml exits 0 for valid configs, 1 for bad ones
□ All 12 transforms implemented and tested (P0 set + SCD2)
□ CSVFile connector fully implemented (no NotImplementedError)
□ SCD Type 2 passes 5-scenario test (insert, expire, keep, surrogate key, multi-version)
□ Multi-source YAML with stream_join + aggregate executes correctly
□ conditional_load routes rows to correct targets
□ Data quality asserts (not_null, unique, row_count) block/warn correctly
□ mask_pii: no original PII values appear in any log output
□ Airflow DAG factory generates DAG from any valid v2 YAML
□ dbt pre_step and post_step execute (mock: subprocess)
□ Overall test coverage ≥ 90%
□ ruff check: zero violations
□ End-to-end: ADF ZIP → YAML → etl-run run → data in target → dbt post_step runs
```
