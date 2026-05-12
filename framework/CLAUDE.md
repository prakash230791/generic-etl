# Generic ETL Framework — Implementation Reference

## Status: POC Complete ✅

Core framework is implemented and all tests pass. This file is the reference for
extending the framework (new connectors, new transforms) and completing the two stubs.

---

## What Is Done

| File | Status |
|---|---|
| `runner.py` | ✅ CLI entry point (`etl-run` command) |
| `config/loader.py` | ✅ YAML load from file |
| `config/validator.py` | ✅ JSON Schema validation |
| `config/schema.json` | ✅ Schema v1.0 |
| `connectors/base.py` | ✅ `BaseConnector` ABC + registry |
| `connectors/sqlite.py` | ✅ Full read/write |
| `connectors/csv_file.py` | ⚠️ STUB — `read()`/`write()` raise `NotImplementedError` |
| `transformations/base.py` | ✅ `BaseTransformation` ABC + registry |
| `transformations/filter.py` | ✅ pandas `query()` |
| `transformations/lookup.py` | ✅ left-join enrichment |
| `transformations/expression.py` | ✅ safe eval sandbox |
| `transformations/scd_type_2.py` | ⚠️ STUB — `apply()` raises `NotImplementedError` |
| `execution/engine.py` | ✅ Source → Transform → Sink |

---

## Completing the Stubs

### CsvFileConnector (`connectors/csv_file.py`)

```python
# read() — return DataFrame from CSV file
def read(self, config: dict) -> pd.DataFrame:
    return pd.read_csv(config["file_path"])

# write() — write DataFrame to CSV file
def write(self, df: pd.DataFrame, config: dict) -> None:
    mode = "a" if config.get("if_exists") == "append" else "w"
    header = (mode == "w")
    df.to_csv(config["file_path"], index=False, mode=mode, header=header)
```

### ScdType2Transformation (`transformations/scd_type_2.py`)

Algorithm (from LLD section 5):
1. Load `df_current` from target using sink connector config
2. Match incoming rows on `natural_key` WHERE `current_flag_col = 'Y'`
3. Detect changed `tracked_columns`
4. Build `df_expire`: matched rows with `current_flag='N'`, `effective_end=today`
5. Build `df_insert`: new + changed rows with `current_flag='Y'`, `effective_end=NULL`, new surrogate key
6. Return `pd.concat([df_expire, df_insert])`

Config keys: `natural_key`, `tracked_columns`, `effective_start_col`, `effective_end_col`,
`current_flag_col`, `surrogate_key`, `sink_connector`

---

## Plugin Pattern — Adding a New Connector

1. Create `framework/connectors/<name>.py` implementing `BaseConnector`:
   ```python
   class MyConnector(BaseConnector):
       def read(self, config: dict) -> pd.DataFrame: ...
       def write(self, df: pd.DataFrame, config: dict) -> None: ...
   ```
2. Register in `pyproject.toml`:
   ```toml
   [project.entry-points."etl.connectors"]
   my_type = "framework.connectors.<name>:MyConnector"
   ```
3. Add tests in `tests/test_framework.py` following existing connector test patterns.

## Plugin Pattern — Adding a New Transformation

1. Create `framework/transformations/<name>.py` implementing `BaseTransformation`:
   ```python
   class MyTransformation(BaseTransformation):
       def apply(self, df: pd.DataFrame, config: dict) -> pd.DataFrame: ...
   ```
2. Register in `pyproject.toml`:
   ```toml
   [project.entry-points."etl.transformations"]
   my_type = "framework.transformations.<name>:MyTransformation"
   ```
3. Add tests in `tests/test_framework.py`.

---

## Key Invariants — Do Not Break

- `apply()` must be **pure** — never modify the input DataFrame, return a new one
- `read()` and `write()` must not store state — connectors are instantiated fresh per job
- `BaseConnector` and `BaseTransformation` ABCs must not be changed — they are the plugin contract
- `schema.json` changes: minor additions are backward-compatible; never remove required fields

---

## Test Commands

```bash
make test                          # all tests with coverage
pytest tests/test_framework.py -v  # framework only
pytest tests/test_end_to_end.py -v # full pipeline
make demo                          # load data → agent convert → run framework
```

---

## YAML Config Structure (v1.0)

```yaml
version: "1.0"
job:
  name: load_dim_customer        # snake_case, lowercase
  domain: customer
  owner: data-platform
  pipeline_tier: P1              # P0/P1/P2/P3
sources:
  - id: src_customers
    connector: sqlite             # must match entry-point key
    connection: src_sqlserver_prod
    table: customers
transformations:
  - id: fil_active
    type: filter
    input: src_customers
    condition: "status == 'ACTIVE'"
  - id: exp_fullname
    type: expression
    input: fil_active
    expressions:
      - target: full_name
        expr: "first_name + ' ' + last_name"
targets:
  - id: tgt_dim_customer
    connector: sqlite
    connection: tgt_sqlserver_prod
    table: dim_customer
    input: exp_fullname
    load_strategy: append
```

---

## Do NOT

- Add print statements — use `logging.getLogger(__name__)`
- Hardcode paths — use `pathlib.Path`
- Skip type hints on any function
- Catch bare `Exception` without re-raising or logging
- Import framework modules from agent code
