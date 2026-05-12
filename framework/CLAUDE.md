# Generic ETL Framework — Implementation Reference

## Status: POC Complete (with renames needed) ✅

Core framework is implemented and all tests pass.
**Canonical naming refactor required** — see table below before implementing new transforms.
Full taxonomy: `docs/brainstorming/canonical-taxonomy.md`

---

## Canonical Name Refactor (do this before adding new plugins)

The POC used short names. The production system uses descriptive canonical names.

| POC Name | Canonical Name | Action |
|---|---|---|
| `filter` | `row_filter` | Rename file, class, entry-point, schema enum, tests |
| `expression` | `column_derive` | Rename file, class, entry-point, schema enum, tests |
| `lookup` | `lookup_enrich` | Rename file, class, entry-point, schema enum, tests |
| `scd_type_2` | `scd_type_2` | **No change** |
| `csv_file` | `csv` | Rename file, class, entry-point |
| `sqlite` | `sqlite` | **No change** |

**Rename steps (each transform):**
```bash
# 1. Rename Python file
mv framework/transformations/filter.py framework/transformations/row_filter.py

# 2. Rename class inside the file
# FilterTransformation → RowFilterTransformation

# 3. Update pyproject.toml entry-point
# filter = "..." → row_filter = "framework.transformations.row_filter:RowFilterTransformation"

# 4. Update schema.json enum: "filter" → "row_filter"

# 5. Update any test fixture config dicts: type: "filter" → type: "row_filter"

# 6. Reinstall and verify
pip install -e . && make test
```

---

## What Is Done (Canonical Names)

| Canonical Name | File | Status | Notes |
|---|---|---|---|
| **Transformations** | | | |
| `row_filter` | `transformations/row_filter.py` | ⚠️ Rename needed | Currently `filter.py` |
| `column_derive` | `transformations/column_derive.py` | ⚠️ Rename needed | Currently `expression.py` |
| `lookup_enrich` | `transformations/lookup_enrich.py` | ⚠️ Rename needed | Currently `lookup.py` |
| `scd_type_2` | `transformations/scd_type_2.py` | ⚠️ Stub | `apply()` raises `NotImplementedError` |
| **Connectors** | | | |
| `sqlite` | `connectors/sqlite.py` | ✅ Complete | Full read/write |
| `csv` | `connectors/csv.py` | ⚠️ Rename + stub | Currently `csv_file.py`; read/write not implemented |
| **Config** | | | |
| JSON Schema v1.0 | `config/schema.json` | ✅ Complete | Enum values need canonical names |
| Loader | `config/loader.py` | ✅ Complete | |
| Validator | `config/validator.py` | ✅ Complete | |
| **Execution** | | | |
| CLI entry point | `runner.py` | ✅ Complete | `etl-run run <yaml>` |
| Engine (pandas) | `execution/engine.py` | ✅ Complete | Source→Transform→Sink |
| Plugin registry | `connectors/__init__.py`, `transformations/__init__.py` | ✅ Complete | Entry-point loader |

---

## Phase 1 — Transforms to Implement (Sprint 1–2)

### `stream_join` — Join two input streams

```python
# framework/transformations/stream_join.py
class StreamJoinTransformation(BaseTransformation):
    """
    Join two DataFrames on specified key columns.
    Config keys: inputs (list of 2), join_type, join_keys [{left, right}]
    """
    def apply(self, dfs: dict[str, pd.DataFrame], config: dict) -> pd.DataFrame:
        left  = dfs[config["inputs"][0]]
        right = dfs[config["inputs"][1]]
        left_keys  = [jk["left"]  for jk in config["join_keys"]]
        right_keys = [jk["right"] for jk in config["join_keys"]]
        return left.merge(right, left_on=left_keys, right_on=right_keys,
                          how=config.get("join_type", "left"))
```

YAML:
```yaml
- id: joined
  type: stream_join
  inputs: [src_orders, src_customers]
  join_type: left             # inner | left | right | full
  join_keys:
    - left: customer_id
      right: cust_id
```

### `aggregate` — Group by + aggregate measures

```python
# framework/transformations/aggregate.py
class AggregateTransformation(BaseTransformation):
    """
    Group rows and compute aggregate functions.
    Config keys: group_by (list), measures (dict: output_col → pandas agg expr)
    """
    def apply(self, df: pd.DataFrame, config: dict) -> pd.DataFrame:
        result = df.copy()
        agg_map = {}
        for out_col, expr in config["measures"].items():
            fn, col = self._parse_measure(expr)  # e.g. "sum(amount)" → ("sum", "amount")
            agg_map[col] = (out_col, fn)
        return result.groupby(config["group_by"]).agg(**{v[0]: (k, v[1]) for k, v in agg_map.items()}).reset_index()
```

YAML:
```yaml
- id: agg_by_region
  type: aggregate
  input: src_sales
  group_by: [region, product_code]
  measures:
    total_sales: "sum(amount)"
    order_count: "count(order_id)"
    avg_value:   "mean(amount)"
```

---

## Phase 1 — Connectors to Implement (Sprint 2–3)

### `csv` — Complete the stub (`connectors/csv.py`)

```python
def read(self, config: dict) -> pd.DataFrame:
    opts = config.get("options", {})
    return pd.read_csv(
        config["file_path"],
        delimiter=opts.get("delimiter", ","),
        encoding=opts.get("encoding", "utf-8"),
        skiprows=opts.get("skip_rows", 0),
    )

def write(self, df: pd.DataFrame, config: dict) -> None:
    mode = "a" if config.get("if_exists") == "append" else "w"
    df.to_csv(config["file_path"], index=False,
              mode=mode, header=(mode == "w"))
```

### `postgres` — New connector

```python
# framework/connectors/postgres.py
import psycopg2
import pandas as pd
from framework.connectors.base import BaseConnector

class PostgresConnector(BaseConnector):
    def read(self, config: dict) -> pd.DataFrame:
        conn_str = self._resolve_connection(config["connection"])
        with psycopg2.connect(conn_str) as conn:
            return pd.read_sql(config.get("query") or f"SELECT * FROM {config['table']}", conn)

    def write(self, df: pd.DataFrame, config: dict) -> None:
        from sqlalchemy import create_engine
        engine = create_engine(self._resolve_connection(config["connection"]))
        df.to_sql(config["table"], engine,
                  if_exists=config.get("load_strategy", "append"),
                  index=False, chunksize=10_000)
```

### `sqlserver` — New connector

Same pattern as `postgres` but uses `pyodbc` driver:
```python
import pyodbc
conn_str = f"DRIVER={{ODBC Driver 18 for SQL Server}};{self._resolve_connection(config['connection'])}"
```

---

## scd_type_2 — Complete the Stub

Algorithm (from `docs/brainstorming/low-level-design.md` section 5):

```python
def apply(self, df: pd.DataFrame, config: dict) -> pd.DataFrame:
    # 1. Load current dimension from target connector
    sink_cfg = config["sink_connector"]
    connector = get_connector(sink_cfg["type"], sink_cfg)
    df_current = connector.read(sink_cfg)

    nat_key     = config["natural_key"]           # list of column names
    tracked     = config["tracked_columns"]
    eff_from    = config["effective_from_col"]
    eff_to      = config["effective_to_col"]
    cur_flag    = config["current_flag_col"]
    surr_key    = config["surrogate_key_col"]
    today       = pd.Timestamp.now().normalize()

    # 2. Match incoming vs current on natural key WHERE current_flag='Y'
    current_live = df_current[df_current[cur_flag] == "Y"]
    merged = df.merge(current_live, on=nat_key, how="left", suffixes=("", "_cur"))

    # 3a. New records (no match in current)
    new_records = merged[merged[surr_key + "_cur"].isna()].copy()
    new_records[eff_from] = today
    new_records[eff_to]   = pd.NaT
    new_records[cur_flag] = "Y"
    new_records[surr_key] = [str(uuid.uuid4()) for _ in range(len(new_records))]

    # 3b. Changed records (tracked column values differ)
    existing = merged[merged[surr_key + "_cur"].notna()].copy()
    changed_mask = (existing[tracked].values != existing[[c + "_cur" for c in tracked]].values).any(axis=1)
    changed = existing[changed_mask]

    # 3c. Expire old versions
    df_expire = current_live[current_live[nat_key[0]].isin(changed[nat_key[0]])].copy()
    df_expire[eff_to]   = today
    df_expire[cur_flag] = "N"

    # 3d. Insert new versions for changed
    df_insert = changed[df.columns].copy()
    df_insert[eff_from] = today
    df_insert[eff_to]   = pd.NaT
    df_insert[cur_flag] = "Y"
    df_insert[surr_key] = [str(uuid.uuid4()) for _ in range(len(df_insert))]

    return pd.concat([df_expire, new_records, df_insert], ignore_index=True)
```

---

## Plugin Pattern — Adding Any New Plugin

### New Transformation

1. Create `framework/transformations/<canonical_name>.py`:
   ```python
   class <CamelCase>Transformation(BaseTransformation):
       def apply(self, df: pd.DataFrame, config: dict) -> pd.DataFrame:
           result = df.copy()  # ALWAYS copy — never mutate input
           # implement
           return result.reset_index(drop=True)
   ```
2. Add to `pyproject.toml`:
   ```toml
   <canonical_name> = "framework.transformations.<canonical_name>:<CamelCase>Transformation"
   ```
3. Add conditional schema block to `config/schema.json` enum and `allOf` clause
4. Add tests in `tests/test_framework.py`
5. `pip install -e . && make test`

### New Connector

1. Create `framework/connectors/<canonical_name>.py`:
   ```python
   class <CamelCase>Connector(BaseConnector):
       def read(self, config: dict) -> pd.DataFrame: ...
       def write(self, df: pd.DataFrame, config: dict) -> None: ...
   ```
2. Add to `pyproject.toml`:
   ```toml
   <canonical_name> = "framework.connectors.<canonical_name>:<CamelCase>Connector"
   ```
3. Add tests
4. `pip install -e . && make test`

---

## Key Invariants — Never Break

- `apply()` is **pure** — never modify input df; return new one; `reset_index(drop=True)`
- `read()`/`write()` are **stateless** — connectors instantiated fresh per job
- ABCs (`BaseConnector`, `BaseTransformation`) are the plugin contract — never modify
- Schema.json type enum must contain every registered canonical name
- Canonical name in pyproject.toml == canonical name in schema.json == class entry-point key

---

## Test Commands

```bash
make test                           # all tests + coverage
pytest tests/test_framework.py -v   # framework only
pytest tests/test_end_to_end.py -v  # full pipeline
make demo                           # load data → agent convert → run
ruff check framework/               # lint
```

---

## YAML Config Reference (Canonical)

```yaml
version: "1.0"
job:
  name: load_dim_customer
  domain: customer
  owner: data-platform
  pipeline_tier: P1              # P0 / P1 / P2 / P3
sources:
  - id: src_customers
    connector: sqlserver          # canonical connector name
    connection: prod_crm_sql
    query: |
      SELECT customer_id, first_name, last_name, status
      FROM   dbo.customers
      WHERE  updated_dt > :last_run_dt
transformations:
  - id: fil_active
    type: row_filter              # canonical transform name
    input: src_customers
    condition: "status == 'ACTIVE'"
  - id: enrich_segment
    type: lookup_enrich
    input: fil_active
    lookup_source:
      connector: postgres
      connection: prod_dw_pg
      table: dim_segment
    join_keys:
      - left: segment_code
        right: code
    return_columns: [segment_name]
  - id: exp_fullname
    type: column_derive
    input: enrich_segment
    derivations:
      full_name: "first_name + ' ' + last_name"
targets:
  - id: tgt_dim_customer
    connector: postgres
    connection: prod_dw_pg
    table: public.dim_customer
    input: exp_fullname
    load_strategy: append
```

---

## Do NOT

- Add `print()` — use `logging.getLogger(__name__)`
- Hardcode paths — use `pathlib.Path`
- Skip type hints on any function
- Use Informatica names anywhere outside `agent/agents/parser/`
- Commit a transformation with `apply()` still raising `NotImplementedError`
- Forget to run `pip install -e .` after editing `pyproject.toml`
