# Enterprise Hardening Plan — Generic ETL Platform

**Document Type:** Engineering Deep-Dive & Implementation Plan
**Version:** 1.0
**Date:** 2026-05-13
**Audience:** Platform Engineers, Data Engineers, Migration Team
**Companion docs:** `canonical-taxonomy.md`, `implementation-prompts.md`, `migration-agent-architecture.md`

---

## 1. Scope and Goals

The POC proved the end-to-end pipeline. This document defines what is needed to handle the **full enterprise estate**:

- ~700 Informatica PowerCenter pipelines
- ~120 Azure Data Factory pipelines
- ~80 SSIS packages (not covered in POC or existing docs)
- Source/target databases: Oracle, SQL Server, Azure SQL MI, Snowflake, ADLS, S3

### What This Document Adds

| Category | POC / Existing | Added Here |
|---|---|---|
| ETL Sources | Informatica, ADF | **SSIS packages** (new) |
| Transforms | 6 types (Phase 1) | **+15 transforms** completing the catalog |
| Connectors | SQLite, CSV stub | **Oracle, Azure SQL MI, SQL Server, Excel, Fixed-width, XML** hardened |
| Expression rules | ~5 Informatica rules | **60+ expressions** across Informatica, ADF, SSIS |
| Agent parsers | Informatica XML | **+SSIS parser, +ADF hardening** |
| Agent expression engine | Basic rule-based | **Full rule YAML + AST translator + LLM fallback tiers** |
| Sprint plan | 4 sprints | **14 sprints (28 weeks)** |

---

## 2. Gap Analysis — Current vs Enterprise

### 2.1 Transformation Coverage

| Canonical Name | POC | Phase | Covers |
|---|---|---|---|
| `row_filter` | ✅ Done (rename needed) | 1 | Informatica Filter, ADF Filter, SSIS Conditional Split (first branch) |
| `column_derive` | ✅ Done (rename needed) | 1 | Informatica Expression, ADF Derived Column, SSIS Derived Column |
| `lookup_enrich` | ✅ Done (rename needed) | 1 | Informatica Lookup, ADF Lookup, SSIS Lookup |
| `stream_join` | ⚠️ Stub | 1 | Informatica Joiner, ADF Join, SSIS Merge Join |
| `aggregate` | ⚠️ Stub | 1 | Informatica Aggregator, ADF Aggregate, SSIS Aggregate |
| `scd_type_2` | ⚠️ Stub | 1 | Informatica Update Strategy (SCD2), SSIS SCD Wizard |
| `column_select` | ❌ Missing | 2 | Informatica port selection, ADF Select, SSIS Copy Column |
| `union_all` | ❌ Missing | 2 | Informatica Union, ADF Union, SSIS Union All / Merge |
| `row_sort` | ❌ Missing | 2 | Informatica Sorter, ADF Sort, SSIS Sort |
| `route_split` | ❌ Missing | 2 | Informatica Router, ADF Conditional Split, SSIS Conditional Split |
| `scd_type_1` | ❌ Missing | 2 | Informatica Update Strategy (overwrite), SSIS SCD Wizard (type 1) |
| `row_deduplicate` | ❌ Missing | 2 | Custom / SSIS Sort (remove duplicates) |
| `data_convert` | ❌ Missing | 2 | **SSIS Data Conversion Transform** (no direct equiv. in others) |
| `sequence_generate` | ❌ Missing | 3 | Informatica Sequence Generator |
| `rank` | ❌ Missing | 3 | Informatica Rank, ADF Window (RANK) |
| `window_fn` | ❌ Missing | 3 | ADF Window, SSIS Script Component (window) |
| `pivot` | ❌ Missing | 3 | ADF Pivot |
| `unpivot` | ❌ Missing | 3 | Informatica Normalizer, ADF Unpivot, SSIS Unpivot |
| `flatten_json` | ❌ Missing | 3 | ADF Flatten |
| `mask_pii` | ❌ Missing | 3 | Custom (all sources) |
| `data_validate` | ❌ Missing | 3 | Custom (all sources) |
| `python_fn` | ❌ Missing | 3 | ADF Script, SSIS Script Component, Informatica Java |
| `fuzzy_match` | ❌ Missing | 3 | **SSIS Fuzzy Lookup / Fuzzy Grouping** |
| `row_count` | ❌ Missing | 3 | **SSIS Row Count** (observability) |
| `xml_parse` | ❌ Missing | 3 | **SSIS XML Source / XML Task** |

### 2.2 Connector Coverage

| Canonical Name | POC | Phase | Status |
|---|---|---|---|
| `sqlite` | ✅ Complete | 1 | Dev/test only |
| `csv` | ⚠️ Stub | 1 | Needs implementation |
| `postgres` | ❌ Missing | 1 | Implement |
| `sqlserver` | ❌ Missing | 1 | Implement (pyodbc + Azure AD) |
| `oracle` | ❌ Missing | 1 | Implement (python-oracledb) |
| `s3` | ❌ Missing | 1 | Implement (boto3 + fsspec) |
| `parquet` | ❌ Missing | 1 | Implement (pandas + pyarrow) |
| `azure_sql` | ❌ Missing | 2 | Azure SQL MI (pyodbc + MSI) |
| `snowflake` | ❌ Missing | 2 | snowflake-connector-python |
| `adls` | ❌ Missing | 2 | adlfs + azure-storage-file-datalake |
| `kafka` | ❌ Missing | 2 | confluent-kafka |
| `mysql` | ❌ Missing | 2 | mysql-connector-python |
| `excel` | ❌ Missing | 2 | **SSIS Excel Source** → openpyxl |
| `fixed_width` | ❌ Missing | 2 | **SSIS Flat File (fixed width)** → pandas.read_fwf |
| `xml_file` | ❌ Missing | 3 | **SSIS XML Source** → lxml |
| `sftp` | ❌ Missing | 3 | paramiko |
| `http_api` | ❌ Missing | 3 | requests / httpx |

### 2.3 Agent Coverage

| Capability | POC | Status |
|---|---|---|
| Informatica XML parser | Basic | Needs hardening for all transform types |
| ADF JSON parser | ❌ Missing | New — full implementation needed |
| **SSIS package parser** | ❌ Missing | **New — not in any existing doc** |
| Expression rule engine | 5 rules | Needs 60+ rules (see Section 5) |
| LLM expression fallback | Basic | Needs tiered confidence + retry |
| Complexity scoring | Basic heuristic | Extend for SSIS patterns |
| YAML generator | ✅ Done | Minor hardening for all transform types |
| Validation | ✅ Done | Extend schema for all transforms |
| PR generator | ✅ Done | Add SSIS-specific PR template |

---

## 3. SSIS Coverage (New — Not in POC)

### 3.1 SSIS Package Architecture

SSIS packages are `.dtsx` files (XML). Each package has two planes:

```
Package (.dtsx XML)
├── Control Flow                    # Task orchestration (sequential/parallel)
│   ├── Data Flow Task              # Container for all ETL logic
│   ├── Execute SQL Task            # Pre/post SQL (truncate, merge, etc.)
│   ├── ForEach Loop Container      # Iterate files or rows
│   ├── Sequence Container          # Group tasks
│   └── Script Task                 # C# code
│
└── Data Flow Task (inner XML)      # Maps to our Source→Transform→Sink model
    ├── Sources                     # OLE DB, Flat File, Excel, XML, ADO.NET
    ├── Transformations             # All data transforms (see 3.2)
    └── Destinations                # OLE DB, Flat File, Excel, SQL Server
```

**Key difference from Informatica/ADF:** SSIS has two levels — the Control Flow orchestrates tasks, and the Data Flow contains the ETL logic. Our framework models only the Data Flow. Control Flow pre/post SQL becomes `pre_sql`/`post_sql` in the target connector config.

### 3.2 SSIS Data Flow Components → Canonical Mapping

```python
# agent/agents/parser/ssis.py

SSIS_COMPONENT_MAP: dict[str, str | None] = {
    # ComponentClassID / name → canonical IR type
    # Sources (handled as connectors, not transforms)
    "Microsoft.OLEDBSource":            None,   # → source connector
    "Microsoft.FlatFileSource":         None,   # → csv / fixed_width connector
    "Microsoft.ExcelSource":            None,   # → excel connector
    "Microsoft.XMLSource":              None,   # → xml_file connector
    "Microsoft.ADONETSource":           None,   # → connector

    # Transformations
    "Microsoft.ConditionalSplit":       "route_split",      # also used as row_filter (first branch)
    "Microsoft.DerivedColumn":          "column_derive",
    "Microsoft.Lookup":                 "lookup_enrich",
    "Microsoft.MergeJoin":              "stream_join",       # requires sorted inputs
    "Microsoft.Merge":                  "union_all",         # ordered union (sorted)
    "Microsoft.UnionAll":               "union_all",         # unordered
    "Microsoft.Aggregate":              "aggregate",
    "Microsoft.Sort":                   "row_sort",
    "Microsoft.DataConversion":         "data_convert",      # SSIS-specific: cast columns
    "Microsoft.CopyColumn":             "column_select",     # duplicate/project columns
    "Microsoft.CharacterMap":           "column_derive",     # case/char transform → column_derive
    "Microsoft.RowCount":               "row_count",
    "Microsoft.FuzzyLookup":            "fuzzy_match",
    "Microsoft.FuzzyGrouping":          "fuzzy_match",
    "Microsoft.Unpivot":                "unpivot",
    "Microsoft.Pivot":                  "pivot",
    "Microsoft.SlowlyChangingDimension": "scd_type_2",      # detect type from ColumnType attribute
    "Microsoft.ScriptComponent":        "python_fn",         # C# → manual review
    "Microsoft.TermExtraction":         None,                # NLP — manual queue
    "Microsoft.TermLookup":             None,                # NLP — manual queue
    "Microsoft.DQSCleansing":           None,                # DQS — manual queue

    # Destinations (handled as target connectors)
    "Microsoft.OLEDBDestination":       None,
    "Microsoft.FlatFileDestination":    None,
    "Microsoft.ExcelDestination":       None,
    "Microsoft.ADONETDestination":      None,
    "Microsoft.SQLServerDestination":   None,
}

SSIS_CONNECTION_MAP: dict[str, str | None] = {
    # SSIS Connection Manager CreationName → canonical connector name
    "OLEDB":        "sqlserver",    # most OLEDB in SSIS = SQL Server; override on config
    "FLATFILE":     "csv",
    "EXCEL":        "excel",
    "FILE":         "fixed_width",  # generic file — inspect format
    "ADO.NET":      "sqlserver",
    "ODBC":         "sqlserver",
    "ORACLE":       "oracle",
    "ORACLESE":     "oracle",
    "SMO":          None,           # SMO = SQL Management Objects — no ETL equiv
    "SMTP":         None,
    "FTP":          "sftp",
    "HTTP":         "http_api",
    "MSOLAP100":    None,           # SSAS — manual queue
}
```

### 3.3 SSIS Package Structure (XML)

```xml
<!-- .dtsx file skeleton — what the parser must navigate -->
<DTS:Executable DTS:ExecutableType="Microsoft.Package">
  <!-- Package-level variables (become parameters in IR) -->
  <DTS:Variables>
    <DTS:Variable DTS:Name="SourceSchema">
      <DTS:VariableValue>dbo</DTS:VariableValue>
    </DTS:Variable>
  </DTS:Variables>

  <!-- Connection Managers (become connector configs in IR) -->
  <DTS:ConnectionManagers>
    <DTS:ConnectionManager DTS:CreationName="OLEDB" DTS:Name="SRC_CONN">
      <DTS:ObjectData>
        <connection connectionString="Data Source=myserver;Initial Catalog=mydb;..." />
      </DTS:ObjectData>
    </DTS:ConnectionManager>
  </DTS:ConnectionManagers>

  <!-- Control Flow -->
  <DTS:Executables>
    <!-- Pre-load SQL (Execute SQL Task) -->
    <DTS:Executable DTS:ExecutableType="Microsoft.ExecuteSQLTask">
      <SQLTask:SqlTaskData SQLTask:SqlStatementSource="TRUNCATE TABLE stg.dim_customer" />
    </DTS:Executable>

    <!-- Data Flow Task — this is the ETL logic -->
    <DTS:Executable DTS:ExecutableType="Microsoft.Pipeline">
      <DTS:ObjectData>
        <pipeline>
          <components>
            <!-- Source component -->
            <component componentClassID="Microsoft.OLEDBSource" name="src_customers">
              <properties>
                <property name="SqlCommand">SELECT * FROM dbo.customers WHERE status='ACTIVE'</property>
              </properties>
            </component>
            <!-- Transform -->
            <component componentClassID="Microsoft.DerivedColumn" name="derive_fullname">
              <inputs><input name="Derived Column Input" /></inputs>
              <outputs>
                <output name="Derived Column Output">
                  <outputColumns>
                    <outputColumn name="full_name"
                                  expression="TRIM([first_name]) + &quot; &quot; + TRIM([last_name])" />
                  </outputColumns>
                </output>
              </outputs>
            </component>
          </components>
          <!-- Data paths (wiring between components) -->
          <paths>
            <path startId="src_customers.Output" endId="derive_fullname.Input" />
          </paths>
        </pipeline>
      </DTS:ObjectData>
    </DTS:Executable>
  </DTS:Executables>
</DTS:Executable>
```

**Parser algorithm for SSIS:**
1. Find all `ConnectionManager` elements → build `SSIS_CONNECTION_MAP` connector dict
2. Find all `Execute SQL Task` before the Data Flow Task → capture as `pre_sql` on target
3. Find the `Microsoft.Pipeline` task → parse its inner `<pipeline>` element
4. For each `<component>` → map `componentClassID` via `SSIS_COMPONENT_MAP`
5. Parse `<paths>` → build DAG (same topological sort as Informatica parser)
6. Parse `<DTS:Variables>` → add as `parameters` in IR

### 3.4 SSIS Expression Syntax

SSIS expressions use C#-like syntax with cast operators. The expression translator must handle:

```
SSIS Expression                          →  Python (pandas column_derive)
─────────────────────────────────────────────────────────────────────────
TRIM([column_name])                      →  df['column_name'].str.strip()
LTRIM(RTRIM([col]))                      →  df['col'].str.strip()
UPPER([col])                             →  df['col'].str.upper()
LOWER([col])                             →  df['col'].str.lower()
LEN([col])                               →  df['col'].str.len()
SUBSTRING([col],1,5)                     →  df['col'].str[0:5]   # 1-indexed
FINDSTRING([col],"search",1)             →  df['col'].str.find("search")
REPLACE([col],"old","new")               →  df['col'].str.replace("old","new")
LEFT([col],3)                            →  df['col'].str[:3]
RIGHT([col],3)                           →  df['col'].str[-3:]
(DT_STR, 50, 1252)[col]                  →  df['col'].astype(str)
(DT_I4)[col]                             →  df['col'].astype('Int64')
(DT_R8)[col]                             →  df['col'].astype(float)
(DT_DATE)[col]                           →  pd.to_datetime(df['col'])
(DT_DBTIMESTAMP)[col]                    →  pd.to_datetime(df['col'])
(DT_NUMERIC, 18, 2)[col]                 →  df['col'].round(2).astype(float)
GETDATE()                                →  pd.Timestamp.now()
DATEADD("day", 7, [col])                 →  df['col'] + pd.Timedelta(days=7)
DATEDIFF("day", [start], [end])          →  (df['end'] - df['start']).dt.days
YEAR([col])                              →  df['col'].dt.year
MONTH([col])                             →  df['col'].dt.month
DAY([col])                               →  df['col'].dt.day
ISNULL([col])                            →  df['col'].isna()
[col1] == NULL                           →  df['col1'].isna()
NULL(DT_STR, 10, 1252)                   →  None
[col] > 0 ? "positive" : "other"         →  numpy.where(df['col'] > 0, "positive", "other")
[a] && [b]                               →  df['a'] & df['b']
[a] || [b]                               →  df['a'] | df['b']
![col]                                   →  ~df['col']
@[User::VariableName]                    →  config['parameters']['VariableName']
```

---

## 4. Extended Transformation Catalog — All New Transforms

### 4.1 Phase 2 Transforms (implement Sprint 2–4)

#### `column_select` — Project, rename, drop columns

```python
# framework/transformations/column_select.py
class ColumnSelectTransformation(BaseTransformation):
    def apply(self, df: pd.DataFrame, config: dict) -> pd.DataFrame:
        """Map {output_name: input_name}. Columns not in map are dropped."""
        col_map = config["columns"]  # {output_col: input_col}
        result = df[[v for v in col_map.values() if v in df.columns]].copy()
        result.columns = [k for k, v in col_map.items() if v in df.columns]
        return result.reset_index(drop=True)
```

```yaml
type: column_select
columns:
  customer_id: customer_id      # keep as-is
  customer_name: full_name      # rename
  status_code: status
  # unlisted columns are dropped
```

| Source | Syntax |
|---|---|
| Informatica | Port selection in Expression Transformation (no-op expression) |
| ADF | Select Activity: `mappings: [{name: customer_id, type: Integer}]` |
| SSIS | Copy Column / derived column with identity expressions |

---

#### `union_all` — Concatenate multiple streams

```python
class UnionAllTransformation(BaseTransformation):
    def apply(self, dfs: dict[str, pd.DataFrame], config: dict) -> pd.DataFrame:
        """Stack all input DataFrames. Column alignment by name, not position."""
        frames = [dfs[inp] for inp in config["inputs"]]
        return pd.concat(frames, ignore_index=True).reset_index(drop=True)
```

```yaml
type: union_all
inputs: [stream_a, stream_b, stream_c]
align_columns: true     # fill missing columns with NaN (default: true)
```

| Source | Notes |
|---|---|
| Informatica | Union Transformation — aligns by port name |
| ADF | Union Activity — aligns by column name |
| SSIS | Union All component — aligns by column name; Merge requires sorted inputs |

---

#### `row_sort` — Order rows

```python
class RowSortTransformation(BaseTransformation):
    def apply(self, df: pd.DataFrame, config: dict) -> pd.DataFrame:
        keys = [k["column"] for k in config["keys"]]
        ascending = [k.get("direction", "asc") == "asc" for k in config["keys"]]
        return df.sort_values(by=keys, ascending=ascending).reset_index(drop=True)
```

```yaml
type: row_sort
keys:
  - column: region
    direction: asc
  - column: sale_date
    direction: desc
```

| Source | Notes |
|---|---|
| Informatica | Sorter Transformation — `SORTKEY` attribute per port |
| ADF | Sort Activity — `conditions: [{name: col, partitionKind: Hash, order: Ascending}]` |
| SSIS | Sort Transform — `SortColumnID` per input column |

---

#### `route_split` — Conditional branching

```python
class RouteSplitTransformation(BaseTransformation):
    def apply(self, df: pd.DataFrame, config: dict) -> dict[str, pd.DataFrame]:
        """Returns dict of named branch DataFrames instead of a single DataFrame."""
        result: dict[str, pd.DataFrame] = {}
        remaining = df.copy()
        for route_name, condition in config["routes"].items():
            if condition == "__default__":
                continue
            mask = remaining.eval(condition)
            result[route_name] = remaining[mask].copy().reset_index(drop=True)
            remaining = remaining[~mask]
        # default catch-all
        default_key = next((k for k, v in config["routes"].items() if v == "__default__"), None)
        if default_key:
            result[default_key] = remaining.reset_index(drop=True)
        return result
```

```yaml
type: route_split
routes:
  active:   "status == 'ACTIVE'"
  inactive: "status == 'INACTIVE'"
  other:    "__default__"
```

**Note:** `route_split` returns a `dict[str, DataFrame]` not a single DataFrame. The engine must handle this: downstream steps reference `route_split_id.active`, `route_split_id.inactive` etc.

---

#### `scd_type_1` — Overwrite existing dimension row

```python
class ScdType1Transformation(BaseTransformation):
    def apply(self, df: pd.DataFrame, config: dict) -> pd.DataFrame:
        """Upsert: incoming row replaces existing row on natural key match."""
        nat_key = config["natural_key"]
        # Load current dimension (same pattern as scd_type_2)
        sink_cfg = config["sink_connector"]
        connector = get_connector(sink_cfg["type"])
        df_current = connector.read(sink_cfg)

        # Merge: incoming wins on all non-key columns
        merged = df_current.merge(df, on=nat_key, how="outer",
                                  suffixes=("_old", ""), indicator=True)
        # For matched rows: use incoming values; for unmatched: keep current
        for col in df.columns:
            if col in nat_key:
                continue
            if f"{col}_old" in merged.columns:
                merged[col] = merged[col].combine_first(merged[f"{col}_old"])
                merged.drop(columns=[f"{col}_old"], inplace=True)
        return merged.drop(columns=["_merge"], errors="ignore").reset_index(drop=True)
```

```yaml
type: scd_type_1
natural_key: [customer_id]
# All non-key columns are overwritten on match; new rows are inserted
sink_connector:
  type: sqlserver
  connection: prod_dw
  table: dim_customer
```

---

#### `row_deduplicate` — Remove duplicate rows

```python
class RowDeduplicateTransformation(BaseTransformation):
    def apply(self, df: pd.DataFrame, config: dict) -> pd.DataFrame:
        key_cols = config.get("key_columns")    # None = all columns
        keep = config.get("keep", "first")      # first | last
        return df.drop_duplicates(subset=key_cols, keep=keep).reset_index(drop=True)
```

```yaml
type: row_deduplicate
key_columns: [customer_id, email]   # deduplicate on these columns only
keep: first                         # first | last
```

| Source | Notes |
|---|---|
| Informatica | No built-in; usually a Sorter + custom expression |
| ADF | No built-in; Script Activity or workaround |
| SSIS | Sort Transform → "Remove rows with duplicate sort values" checkbox |

---

#### `data_convert` — Column type casting (SSIS-specific)

```python
class DataConvertTransformation(BaseTransformation):
    """Map SSIS DataConversion component: cast columns to target types."""
    _SSIS_TYPE_MAP = {
        "DT_STR": str, "DT_WSTR": str, "DT_I1": "Int8", "DT_I2": "Int16",
        "DT_I4": "Int32", "DT_I8": "Int64", "DT_R4": "float32",
        "DT_R8": "float64", "DT_NUMERIC": "float64", "DT_DECIMAL": "float64",
        "DT_DATE": "datetime64[ns]", "DT_DBTIMESTAMP": "datetime64[ns]",
        "DT_BOOL": bool, "DT_BYTES": bytes,
    }

    def apply(self, df: pd.DataFrame, config: dict) -> pd.DataFrame:
        result = df.copy()
        for col, target_type in config["conversions"].items():
            pandas_type = self._SSIS_TYPE_MAP.get(target_type, target_type)
            result[col] = result[col].astype(pandas_type)
        return result.reset_index(drop=True)
```

```yaml
type: data_convert
conversions:
  order_id:    DT_I4
  order_date:  DT_DBTIMESTAMP
  amount:      DT_NUMERIC
  status_code: DT_STR
```

---

### 4.2 Phase 3 Transforms (implement Sprint 5–8)

#### `sequence_generate`

```yaml
type: sequence_generate
output_column: surrogate_key
start: 1
increment: 1
# Generates monotonic integer key; production uses a DB sequence or Redis counter
```

```python
def apply(self, df: pd.DataFrame, config: dict) -> pd.DataFrame:
    result = df.copy()
    start = config.get("start", 1)
    increment = config.get("increment", 1)
    result[config["output_column"]] = range(start, start + len(result) * increment, increment)
    return result.reset_index(drop=True)
```

#### `rank`

```yaml
type: rank
partition_by: [region]
order_by:
  - column: sale_amount
    direction: desc
output_column: rank_num
method: dense    # min | max | first | dense
```

#### `window_fn`

```yaml
type: window_fn
partition_by: [customer_id]
order_by: [{column: event_date, direction: asc}]
functions:
  row_num: "ROW_NUMBER()"
  prev_status: "LAG(status, 1)"
  next_event: "LEAD(event_date, 1)"
  running_total: "SUM(amount)"
```

#### `pivot`

```yaml
type: pivot
index: [customer_id, region]
columns: quarter          # values in this column become new columns
values: sales_amount
agg_fn: sum              # sum | mean | count
```

#### `unpivot`

```yaml
type: unpivot
id_columns: [customer_id, region]  # columns to keep as-is
value_columns:                     # columns to melt into rows
  - Q1_sales
  - Q2_sales
  - Q3_sales
  - Q4_sales
variable_name: quarter
value_name: sales_amount
```

#### `mask_pii`

```yaml
type: mask_pii
columns:
  email:       hash_sha256
  phone:       redact            # replace with "REDACTED"
  full_name:   mask_partial      # "John Smith" → "J*** S****"
  ssn:         hash_sha256
  credit_card: last_four         # keep last 4 digits only
```

#### `data_validate`

```yaml
type: data_validate
rules:
  - column: customer_id
    check: not_null
  - column: email
    check: regex
    pattern: "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$"
  - column: age
    check: range
    min: 0
    max: 150
on_failure: route_to_dead_letter    # raise | route_to_dead_letter | warn
dead_letter_target: tgt_rejected
```

#### `python_fn` — Escape hatch

```yaml
type: python_fn
module: "etl_custom.transforms.customer_score"
function: "compute_risk_score"
# Function signature: (df: pd.DataFrame, config: dict) -> pd.DataFrame
```

---

## 5. Expression Translation Engine — Complete Reference

### 5.1 Informatica Expression Rules (60+ functions)

File: `agent/agents/translation/rules/informatica.yaml`

```yaml
# Format: informatica_fn → python_template
# {col} = column name, {args} = positional args, {df} = dataframe ref

string_functions:
  SUBSTR:
    pattern: "SUBSTR({col}, {start}, {length})"
    python: "df['{col}'].str[{start_0}:{end_0}]"   # convert 1-indexed to 0-indexed
    notes: "Informatica SUBSTR is 1-indexed; Python is 0-indexed"

  INSTR:
    pattern: "INSTR({col}, {search})"
    python: "df['{col}'].str.find({search})"
    notes: "Returns -1 if not found (Python) vs 0 (Informatica) — adjust if needed"

  LENGTH:     { python: "df['{col}'].str.len()" }
  LTRIM:      { python: "df['{col}'].str.lstrip()" }
  RTRIM:      { python: "df['{col}'].str.rstrip()" }
  TRIM:       { python: "df['{col}'].str.strip()" }
  UPPER:      { python: "df['{col}'].str.upper()" }
  LOWER:      { python: "df['{col}'].str.lower()" }
  INITCAP:    { python: "df['{col}'].str.title()" }
  LPAD:       { python: "df['{col}'].str.ljust({length}, {pad_char})" }
  RPAD:       { python: "df['{col}'].str.rjust({length}, {pad_char})" }
  CONCAT:     { python: "df['{col1}'] + df['{col2}']" }
  REG_EXTRACT: { python: "df['{col}'].str.extract(r'{pattern}')" }
  REG_REPLACE: { python: "df['{col}'].str.replace(r'{pattern}', '{replace}', regex=True)" }
  REG_MATCH:  { python: "df['{col}'].str.match(r'{pattern}')" }

numeric_functions:
  ABS:        { python: "df['{col}'].abs()" }
  ROUND:      { python: "df['{col}'].round({places})" }
  TRUNC:      { python: "df['{col}'].apply(lambda x: int(x) if pd.notna(x) else x)" }
  CEIL:       { python: "df['{col}'].apply(np.ceil)" }
  FLOOR:      { python: "df['{col}'].apply(np.floor)" }
  MOD:        { python: "df['{col}'] % {divisor}" }
  POWER:      { python: "df['{col}'] ** {exp}" }
  SQRT:       { python: "df['{col}'].apply(np.sqrt)" }
  EXP:        { python: "df['{col}'].apply(np.exp)" }
  LOG:        { python: "df['{col}'].apply(np.log)" }
  LOG10:      { python: "df['{col}'].apply(np.log10)" }

date_functions:
  TO_DATE:
    pattern: "TO_DATE({col}, {format})"
    python: "pd.to_datetime(df['{col}'], format='{py_format}')"
    format_map:         # Informatica → Python strptime format codes
      "MM/DD/YYYY": "%m/%d/%Y"
      "YYYY-MM-DD": "%Y-%m-%d"
      "DD-MON-YYYY": "%d-%b-%Y"
      "MM/DD/YYYY HH24:MI:SS": "%m/%d/%Y %H:%M:%S"

  TO_CHAR:
    pattern: "TO_CHAR({col}, {format})"
    python: "df['{col}'].dt.strftime('{py_format}')"

  TRUNC_DATE:
    pattern: "TRUNC({col})"
    python: "df['{col}'].dt.normalize()"

  ADD_TO_DATE:
    pattern: "ADD_TO_DATE({col}, {part}, {amount})"
    python_map:
      "DD":  "df['{col}'] + pd.to_timedelta({amount}, unit='D')"
      "MM":  "df['{col}'] + pd.DateOffset(months={amount})"
      "YYYY": "df['{col}'] + pd.DateOffset(years={amount})"
      "HH":  "df['{col}'] + pd.to_timedelta({amount}, unit='h')"
      "MI":  "df['{col}'] + pd.to_timedelta({amount}, unit='min')"
      "SS":  "df['{col}'] + pd.to_timedelta({amount}, unit='s')"

  DATE_DIFF:
    pattern: "DATE_DIFF({part}, {date1}, {date2})"
    python_map:
      "DD":  "(df['{date2}'] - df['{date1}']).dt.days"
      "MM":  "((df['{date2}'].dt.year - df['{date1}'].dt.year) * 12 + (df['{date2}'].dt.month - df['{date1}'].dt.month))"
      "YYYY": "(df['{date2}'].dt.year - df['{date1}'].dt.year)"

  GET_DATE_PART:
    pattern: "GET_DATE_PART({part}, {col})"
    python_map:
      "YEAR":    "df['{col}'].dt.year"
      "MONTH":   "df['{col}'].dt.month"
      "DAY":     "df['{col}'].dt.day"
      "HOUR":    "df['{col}'].dt.hour"
      "MINUTE":  "df['{col}'].dt.minute"
      "SECOND":  "df['{col}'].dt.second"
      "QUARTER": "df['{col}'].dt.quarter"
      "WEEK":    "df['{col}'].dt.isocalendar().week"

  SYSDATE:    { python: "pd.Timestamp.now()" }
  SYSTIMESTAMP: { python: "pd.Timestamp.now()" }

conditional_functions:
  IIF:
    pattern: "IIF({condition}, {true_val}, {false_val})"
    python: "np.where({py_condition}, {true_val}, {false_val})"

  DECODE:
    pattern: "DECODE({col}, {val1}, {res1}, ..., {default})"
    python: |
      pd.Series(np.select(
          [{py_col} == {val1}, {py_col} == {val2}],
          [{res1}, {res2}],
          default={default}
      ))

  ISNULL:     { python: "df['{col}'].isna()" }
  NVL:        { python: "df['{col}'].fillna({default})" }
  NVL2:       { python: "np.where(df['{col}'].notna(), {not_null}, {null_val})" }

  IN:
    pattern: "IN({col}, {val1}, {val2}, ...)"
    python: "df['{col}'].isin([{vals}])"

type_conversion:
  TO_INTEGER:  { python: "df['{col}'].astype('Int64')" }
  TO_FLOAT:    { python: "df['{col}'].astype(float)" }
  TO_DECIMAL:  { python: "df['{col}'].round({scale}).astype(float)" }
  TO_CHAR_NUM: { python: "df['{col}'].astype(str)" }

security_hashing:
  MD5:         { python: "df['{col}'].apply(lambda x: hashlib.md5(str(x).encode()).hexdigest())" }
  SHA256:      { python: "df['{col}'].apply(lambda x: hashlib.sha256(str(x).encode()).hexdigest())" }
```

### 5.2 ADF Wrangling Expression Rules

File: `agent/agents/translation/rules/adf.yaml`

```yaml
# ADF Data Flow expression language → Python/pandas

string_functions:
  toString:     { python: "df['{col}'].astype(str)" }
  toInteger:    { python: "df['{col}'].astype('Int64')" }
  toDecimal:    { python: "df['{col}'].round({scale}).astype(float)" }
  toDate:       { python: "pd.to_datetime(df['{col}'], format='{format}')" }
  toTimestamp:  { python: "pd.to_datetime(df['{col}'])" }
  left:         { python: "df['{col}'].str[:{n}]" }
  right:        { python: "df['{col}'].str[-{n}:]" }
  substring:    { python: "df['{col}'].str[{start}-1:{start}-1+{length}]" }
  upper:        { python: "df['{col}'].str.upper()" }
  lower:        { python: "df['{col}'].str.lower()" }
  trim:         { python: "df['{col}'].str.strip()" }
  ltrim:        { python: "df['{col}'].str.lstrip()" }
  rtrim:        { python: "df['{col}'].str.rstrip()" }
  length:       { python: "df['{col}'].str.len()" }
  locate:       { python: "df['{col}'].str.find('{search}')" }
  concat:       { python: "df['{col1}'] + df['{col2}']" }
  replace:      { python: "df['{col}'].str.replace('{old}', '{new}')" }
  regexMatch:   { python: "df['{col}'].str.match(r'{pattern}')" }
  regexExtract: { python: "df['{col}'].str.extract(r'{pattern}')[{group}]" }
  split:        { python: "df['{col}'].str.split('{delimiter}')" }
  pad:          { python: "df['{col}'].str.pad({length}, fillchar='{char}')" }

numeric_functions:
  abs:     { python: "df['{col}'].abs()" }
  floor:   { python: "df['{col}'].apply(np.floor)" }
  ceil:    { python: "df['{col}'].apply(np.ceil)" }
  round:   { python: "df['{col}'].round({places})" }
  power:   { python: "df['{col}'] ** {exp}" }
  sqrt:    { python: "df['{col}'].apply(np.sqrt)" }
  mod:     { python: "df['{col}'] % {divisor}" }
  random:  { python: "pd.Series(np.random.random(len(df)))" }

date_functions:
  currentDate:      { python: "pd.Timestamp.now().normalize()" }
  currentTimestamp: { python: "pd.Timestamp.now()" }
  year:    { python: "df['{col}'].dt.year" }
  month:   { python: "df['{col}'].dt.month" }
  dayOfMonth: { python: "df['{col}'].dt.day" }
  hour:    { python: "df['{col}'].dt.hour" }
  minute:  { python: "df['{col}'].dt.minute" }
  second:  { python: "df['{col}'].dt.second" }
  quarter: { python: "df['{col}'].dt.quarter" }
  weekOfYear: { python: "df['{col}'].dt.isocalendar().week" }
  addDays:    { python: "df['{col}'] + pd.to_timedelta({n}, unit='D')" }
  addMonths:  { python: "df['{col}'] + pd.DateOffset(months={n})" }
  addYears:   { python: "df['{col}'] + pd.DateOffset(years={n})" }
  dateDiff:
    python_map:
      "day":    "(df['{d2}'] - df['{d1}']).dt.days"
      "month":  "((df['{d2}'].dt.year - df['{d1}'].dt.year)*12 + (df['{d2}'].dt.month - df['{d1}'].dt.month))"

conditional_functions:
  iif:       { python: "np.where({condition}, {true_val}, {false_val})" }
  coalesce:  { python: "df['{c1}'].combine_first(df['{c2}'])" }
  isNull:    { python: "df['{col}'].isna()" }
  isNaN:     { python: "df['{col}'].apply(np.isnan)" }
  isString:  { python: "df['{col}'].apply(lambda x: isinstance(x, str))" }
  isInteger: { python: "df['{col}'].apply(lambda x: isinstance(x, int))" }
  case:
    pattern: "case(condition1, val1, condition2, val2, ..., default)"
    python: "pd.Series(np.select([{cond_list}], [{val_list}], default={default}))"

security:
  md5:    { python: "df['{col}'].apply(lambda x: hashlib.md5(str(x).encode()).hexdigest())" }
  sha1:   { python: "df['{col}'].apply(lambda x: hashlib.sha1(str(x).encode()).hexdigest())" }
  sha2:   { python: "df['{col}'].apply(lambda x: hashlib.sha256(str(x).encode()).hexdigest())" }
  uuid:   { python: "pd.Series([str(uuid.uuid4()) for _ in range(len(df))])" }
```

### 5.3 SSIS Expression Rules

File: `agent/agents/translation/rules/ssis.yaml`

```yaml
# SSIS C#-like expression syntax → Python
# Key quirk: SSIS uses [column_name] with square brackets; we strip these first

pre_processing:
  - pattern: "\\[([A-Za-z0-9_]+)\\]"
    replace: "df['\\1']"        # [col_name] → df['col_name']
  - pattern: "@\\[User::([A-Za-z0-9_]+)\\]"
    replace: "config['parameters']['\\1']"    # SSIS variables
  - pattern: "@\\[System::([A-Za-z0-9_]+)\\]"
    replace: "config['system']['\\1']"

cast_operators:
  # (DT_TYPE, args)expr → type conversion
  - pattern: "\\(DT_STR,\\s*\\d+,\\s*\\d+\\)(.+)"
    python: "{expr}.astype(str)"
  - pattern: "\\(DT_WSTR,\\s*\\d+\\)(.+)"
    python: "{expr}.astype(str)"
  - pattern: "\\(DT_I1\\)(.+)"
    python: "{expr}.astype('Int8')"
  - pattern: "\\(DT_I2\\)(.+)"
    python: "{expr}.astype('Int16')"
  - pattern: "\\(DT_I4\\)(.+)"
    python: "{expr}.astype('Int32')"
  - pattern: "\\(DT_I8\\)(.+)"
    python: "{expr}.astype('Int64')"
  - pattern: "\\(DT_R4\\)(.+)"
    python: "{expr}.astype('float32')"
  - pattern: "\\(DT_R8\\)(.+)"
    python: "{expr}.astype(float)"
  - pattern: "\\(DT_NUMERIC,\\s*\\d+,\\s*(\\d+)\\)(.+)"
    python: "{expr}.round({scale}).astype(float)"
  - pattern: "\\(DT_DATE\\)(.+)"
    python: "pd.to_datetime({expr})"
  - pattern: "\\(DT_DBTIMESTAMP\\)(.+)"
    python: "pd.to_datetime({expr})"
  - pattern: "\\(DT_BOOL\\)(.+)"
    python: "{expr}.astype(bool)"
  - pattern: "NULL\\(DT_\\w+.*?\\)"
    python: "None"

string_functions:
  SUBSTRING:    { python: "{col}.str[{s}-1:{s}-1+{l}]" }   # 1-indexed
  LEN:          { python: "{col}.str.len()" }
  TRIM:         { python: "{col}.str.strip()" }
  LTRIM:        { python: "{col}.str.lstrip()" }
  RTRIM:        { python: "{col}.str.rstrip()" }
  UPPER:        { python: "{col}.str.upper()" }
  LOWER:        { python: "{col}.str.lower()" }
  REPLACE:      { python: "{col}.str.replace('{old}', '{new}')" }
  LEFT:         { python: "{col}.str[:{n}]" }
  RIGHT:        { python: "{col}.str[-{n}:]" }
  FINDSTRING:   { python: "{col}.str.find('{search}')" }
  REVERSE:      { python: "{col}.str[::-1]" }
  REPLICATE:    { python: "'{char}' * {n}" }
  SPACE:        { python: "' ' * {n}" }
  TOKEN:        { python: "{col}.str.split('{delim}').str[{idx}-1]" }  # 1-indexed

numeric_functions:
  ABS:     { python: "{col}.abs()" }
  ROUND:   { python: "{col}.round({n})" }
  FLOOR:   { python: "{col}.apply(np.floor)" }
  CEILING: { python: "{col}.apply(np.ceil)" }
  SQRT:    { python: "{col}.apply(np.sqrt)" }
  EXP:     { python: "{col}.apply(np.exp)" }
  LOG:     { python: "{col}.apply(np.log)" }
  LOG10:   { python: "{col}.apply(np.log10)" }
  SIGN:    { python: "{col}.apply(np.sign)" }
  POWER:   { python: "{col} ** {exp}" }
  MODULO:  { python: "{col} % {div}" }
  SQUARE:  { python: "{col} ** 2" }
  HEX:     { python: "{col}.apply(hex)" }

date_functions:
  GETDATE:    { python: "pd.Timestamp.now()" }
  DATEADD:
    python_map:
      '"day"':    "{col} + pd.to_timedelta({n}, unit='D')"
      '"month"':  "{col} + pd.DateOffset(months={n})"
      '"year"':   "{col} + pd.DateOffset(years={n})"
      '"hour"':   "{col} + pd.to_timedelta({n}, unit='h')"
      '"minute"': "{col} + pd.to_timedelta({n}, unit='min')"
      '"second"': "{col} + pd.to_timedelta({n}, unit='s')"
  DATEDIFF:
    python_map:
      '"day"':    "({d2} - {d1}).dt.days"
      '"month"':  "(({d2}.dt.year - {d1}.dt.year)*12 + ({d2}.dt.month - {d1}.dt.month))"
      '"year"':   "({d2}.dt.year - {d1}.dt.year)"
  YEAR:    { python: "{col}.dt.year" }
  MONTH:   { python: "{col}.dt.month" }
  DAY:     { python: "{col}.dt.day" }
  DATEPART:
    python_map:
      '"yy"': "{col}.dt.year"
      '"mm"': "{col}.dt.month"
      '"dd"': "{col}.dt.day"
      '"hh"': "{col}.dt.hour"
      '"mi"': "{col}.dt.minute"
      '"ss"': "{col}.dt.second"

conditional_functions:
  ISNULL:   { python: "{col}.isna()" }
  # SSIS ternary: condition ? trueVal : falseVal
  ternary:
    pattern: "({condition}) ? ({true_val}) : ({false_val})"
    python: "np.where({condition}, {true_val}, {false_val})"

logical_operators:
  "&&":   "and"    # in numpy.where context use & not and
  "||":   "or"     # use | not or
  "!":    "~"
  "==":   "=="
  "!=":   "!="
```

### 5.4 LLM Fallback Tiers for Expression Translation

When a rule-based match fails, the translator escalates through three tiers:

```
Tier 0: Rule match (0ms, 0 cost) — confidence = 1.0 if exact match
Tier 1: Haiku classification + rule selection (50ms, ~$0.00002) — confidence = 0.7–0.9
Tier 2: Sonnet full translation (200ms, ~$0.001) — confidence = 0.5–0.95
Tier 3: Manual queue (confidence < 0.5 from Sonnet) — human review flag
```

---

## 6. Connector Hardening — Implementation Reference

### 6.1 Oracle Connector (`framework/connectors/oracle.py`)

```python
import oracledb                # python-oracledb (thin mode — no Oracle Client needed)
import pandas as pd
from pathlib import Path
from framework.connectors.base import BaseConnector

class OracleConnector(BaseConnector):
    """Oracle Database connector using python-oracledb (thin mode)."""

    def read(self, config: dict) -> pd.DataFrame:
        conn_str = self._resolve_connection(config["connection"])
        # conn_str format: "user/password@host:port/service_name"
        query = config.get("query") or f"SELECT * FROM {config['table']}"
        with oracledb.connect(conn_str) as conn:
            return pd.read_sql(query, conn, params=config.get("params", {}))

    def write(self, df: pd.DataFrame, config: dict) -> None:
        from sqlalchemy import create_engine
        # SQLAlchemy Oracle URL: oracle+oracledb://user:pass@host:port/?service_name=svc
        engine = create_engine(self._resolve_connection(config["connection"]))
        df.to_sql(
            config["table"],
            engine,
            if_exists=config.get("load_strategy", "append"),
            index=False,
            chunksize=config.get("chunk_size", 10_000),
        )
```

**Connection string format:**
```yaml
# In secrets resolver (never hardcoded):
connection: prod_oracle_erp

# Resolved to env var: ETL_CONN_PROD_ORACLE_ERP
# Value: user/password@oracle-host.internal:1521/ERPDB
```

**Oracle-specific edge cases to handle:**
- `CLOB`/`BLOB` columns: `outputtypehandler` to read as string/bytes
- `DATE` type in Oracle is a TIMESTAMP (not just date) — cast to `datetime64[ns]`
- `NUMBER` without precision → defaults to `float64` in pandas; add `oracle_to_pandas_type` map
- `CHAR(n)` columns have trailing spaces — add `.str.rstrip()` post-read option
- Schema-qualified tables: `config["schema"] + "." + config["table"]`
- Connection pooling: use `oracledb.create_pool()` for production; single connection for jobs

---

### 6.2 Azure SQL MI Connector (`framework/connectors/azure_sql.py`)

```python
import pyodbc
import pandas as pd
from framework.connectors.base import BaseConnector

class AzureSqlConnector(BaseConnector):
    """Azure SQL Managed Instance connector supporting MSI and SQL auth."""

    _DRIVER = "ODBC Driver 18 for SQL Server"

    def _build_conn_str(self, config_ref: str) -> str:
        raw = self._resolve_connection(config_ref)
        # Support two formats:
        # 1. "server=...;database=...;uid=...;pwd=..."  (SQL auth)
        # 2. "server=...;database=...;authentication=ActiveDirectoryMsi" (MSI)
        if "authentication=ActiveDirectoryMsi" in raw.lower():
            return f"DRIVER={{{self._DRIVER}}};{raw};Encrypt=yes;TrustServerCertificate=no;"
        return f"DRIVER={{{self._DRIVER}}};{raw};Encrypt=yes;TrustServerCertificate=no;"

    def read(self, config: dict) -> pd.DataFrame:
        conn_str = self._build_conn_str(config["connection"])
        query = config.get("query") or f"SELECT * FROM {config['table']}"
        with pyodbc.connect(conn_str) as conn:
            return pd.read_sql(query, conn, params=config.get("params", {}))

    def write(self, df: pd.DataFrame, config: dict) -> None:
        from sqlalchemy import create_engine
        import urllib
        raw = self._resolve_connection(config["connection"])
        params = urllib.parse.quote_plus(f"DRIVER={{{self._DRIVER}}};{raw};Encrypt=yes;")
        engine = create_engine(f"mssql+pyodbc:///?odbc_connect={params}", fast_executemany=True)
        df.to_sql(
            config["table"],
            engine,
            if_exists=config.get("load_strategy", "append"),
            index=False,
            chunksize=config.get("chunk_size", 10_000),
            schema=config.get("schema", "dbo"),
        )
```

**Connection string examples:**
```bash
# SQL Auth (secrets manager):
ETL_CONN_PROD_AZURE_SQL="Server=mi.database.windows.net;Database=DW;UID=etl_svc;PWD=xxx"

# Managed Identity (preferred for Azure-hosted runner):
ETL_CONN_PROD_AZURE_SQL="Server=mi.database.windows.net;Database=DW;Authentication=ActiveDirectoryMsi"
```

**Azure SQL MI edge cases:**
- `fast_executemany=True` on SQLAlchemy engine: 10–50x write speed improvement
- Max 2GB parameter batch: use `chunksize=5000` for wide tables
- `TrustServerCertificate=no` required for MI public endpoint
- Schema must be explicit — MI does not default to `dbo` for non-sa users
- Bulk insert alternative: use `BULK INSERT` via `bcp` subprocess for >10M row loads

---

### 6.3 SQL Server Connector (`framework/connectors/sqlserver.py`)

```python
import pyodbc
import pandas as pd
from framework.connectors.base import BaseConnector

class SqlServerConnector(BaseConnector):
    """SQL Server connector (on-premises, RDS, and Azure SQL DB)."""

    _DRIVER = "ODBC Driver 18 for SQL Server"

    def read(self, config: dict) -> pd.DataFrame:
        conn_str = self._build_conn_str(config["connection"])
        query = config.get("query") or f"SELECT * FROM {config.get('schema','dbo')}.{config['table']}"
        # Watermark parameter injection
        params = {}
        if "watermark_param" in config:
            params[config["watermark_param"]] = config.get("last_run_dt", "1900-01-01")
        with pyodbc.connect(conn_str) as conn:
            return pd.read_sql(query, conn, params=list(params.values()) or None)

    def write(self, df: pd.DataFrame, config: dict) -> None:
        strategy = config.get("load_strategy", "append")
        if strategy == "bulk":
            self._bulk_insert(df, config)
        else:
            from sqlalchemy import create_engine
            import urllib
            raw = self._resolve_connection(config["connection"])
            params = urllib.parse.quote_plus(f"DRIVER={{{self._DRIVER}}};{raw};Encrypt=yes;")
            engine = create_engine(f"mssql+pyodbc:///?odbc_connect={params}", fast_executemany=True)
            df.to_sql(config["table"], engine, schema=config.get("schema", "dbo"),
                      if_exists=strategy, index=False, chunksize=5_000)

    def _bulk_insert(self, df: pd.DataFrame, config: dict) -> None:
        """Use BCP utility for high-volume loads (>1M rows)."""
        import subprocess, tempfile
        with tempfile.NamedTemporaryFile(suffix=".csv", delete=False, mode="w") as f:
            df.to_csv(f, index=False)
            tmp_path = f.name
        # BCP command: requires bcp CLI installed on runner
        raw = self._resolve_connection(config["connection"])
        table = f"{config.get('schema','dbo')}.{config['table']}"
        subprocess.run(
            ["bcp", table, "in", tmp_path, "-c", "-t,", "-f", "-T", "-S", raw],
            check=True
        )
```

---

### 6.4 Excel Connector (`framework/connectors/excel.py`)

```python
import pandas as pd
from pathlib import Path
from framework.connectors.base import BaseConnector

class ExcelConnector(BaseConnector):
    """Excel file connector (SSIS Excel Source/Destination)."""

    def read(self, config: dict) -> pd.DataFrame:
        opts = config.get("options", {})
        return pd.read_excel(
            config["file_path"],
            sheet_name=opts.get("sheet_name", 0),
            header=opts.get("header_row", 0),
            skiprows=opts.get("skip_rows", 0),
            dtype=opts.get("dtype"),
            engine="openpyxl",
        )

    def write(self, df: pd.DataFrame, config: dict) -> None:
        opts = config.get("options", {})
        df.to_excel(
            config["file_path"],
            sheet_name=opts.get("sheet_name", "Sheet1"),
            index=False,
            engine="openpyxl",
        )
```

```yaml
- id: src_monthly_report
  connector: excel
  file_path: "s3://data-bucket/reports/monthly_{{ date }}.xlsx"
  options:
    sheet_name: "Data"
    header_row: 2      # header is on row 3 (0-indexed = 2)
    skip_rows: 0
```

---

### 6.5 Fixed-Width Connector (`framework/connectors/fixed_width.py`)

```python
import pandas as pd
from framework.connectors.base import BaseConnector

class FixedWidthConnector(BaseConnector):
    """Fixed-width text file connector (SSIS Flat File with fixed widths, mainframe files)."""

    def read(self, config: dict) -> pd.DataFrame:
        """Config must provide column specs: [{name, start, width, type}]"""
        specs = config["columns"]
        colspecs = [(c["start"], c["start"] + c["width"]) for c in specs]
        names = [c["name"] for c in specs]
        df = pd.read_fwf(
            config["file_path"],
            colspecs=colspecs,
            names=names,
            encoding=config.get("encoding", "utf-8"),
            skiprows=config.get("skip_rows", 0),
        )
        # Apply type casts from column spec
        for col_spec in specs:
            if col_spec.get("type") == "date":
                df[col_spec["name"]] = pd.to_datetime(
                    df[col_spec["name"]], format=col_spec.get("format", "%Y%m%d")
                )
        return df.reset_index(drop=True)

    def write(self, df: pd.DataFrame, config: dict) -> None:
        specs = config["columns"]
        lines = []
        for _, row in df.iterrows():
            line = ""
            for spec in specs:
                val = str(row.get(spec["name"], ""))[:spec["width"]]
                line += val.ljust(spec["width"])
            lines.append(line)
        Path(config["file_path"]).write_text("\n".join(lines),
                                             encoding=config.get("encoding", "utf-8"))
```

```yaml
- id: src_mainframe_extract
  connector: fixed_width
  file_path: "sftp://mainframe-gw/extracts/CUSTMAST.TXT"
  encoding: "cp037"       # EBCDIC
  skip_rows: 1            # skip header record
  columns:
    - { name: customer_id, start: 0,  width: 10, type: string }
    - { name: first_name,  start: 10, width: 25, type: string }
    - { name: last_name,   start: 35, width: 25, type: string }
    - { name: birth_date,  start: 60, width: 8,  type: date, format: "%Y%m%d" }
    - { name: balance,     start: 68, width: 12, type: decimal }
```

---

### 6.6 PostgreSQL, Snowflake, ADLS, Parquet, S3 — Implementation Patterns

```python
# postgres.py
import psycopg2
class PostgresConnector(BaseConnector):
    def read(self, config):
        with psycopg2.connect(self._resolve_connection(config["connection"])) as conn:
            return pd.read_sql(config.get("query") or f"SELECT * FROM {config['table']}", conn)
    def write(self, df, config):
        from sqlalchemy import create_engine
        engine = create_engine(self._resolve_connection(config["connection"]))
        df.to_sql(config["table"], engine, if_exists=config.get("load_strategy","append"),
                  index=False, chunksize=10_000, schema=config.get("schema","public"))

# parquet.py
class ParquetConnector(BaseConnector):
    def read(self, config):
        return pd.read_parquet(config["file_path"],
                               storage_options=self._storage_options(config))
    def write(self, df, config):
        df.to_parquet(config["file_path"], index=False,
                      storage_options=self._storage_options(config))
    def _storage_options(self, config):
        conn = config.get("connection")
        if not conn: return {}
        raw = self._resolve_connection(conn)
        return {"key": raw.split("|")[0], "secret": raw.split("|")[1]} if "|" in raw else {}

# s3.py — uses fsspec + s3fs
class S3Connector(BaseConnector):
    def read(self, config):
        fmt = config.get("format", "parquet")
        s3_path = config["file_path"]
        opts = {"key": ..., "secret": ...}  # from secrets resolver
        if fmt == "csv":
            return pd.read_csv(f"s3://{s3_path}", storage_options=opts)
        return pd.read_parquet(f"s3://{s3_path}", storage_options=opts)

# snowflake.py
import snowflake.connector
class SnowflakeConnector(BaseConnector):
    def read(self, config):
        import snowflake.connector.pandas_tools
        conn = snowflake.connector.connect(**self._resolve_snowflake_params(config))
        cursor = conn.cursor()
        cursor.execute(config.get("query") or f"SELECT * FROM {config['table']}")
        return cursor.fetch_pandas_all()
    def write(self, df, config):
        from snowflake.connector.pandas_tools import write_pandas
        conn = snowflake.connector.connect(**self._resolve_snowflake_params(config))
        write_pandas(conn, df, config["table"].upper(),
                     auto_create_table=config.get("auto_create", False))
```

---

## 7. Agent Enhancements

### 7.1 SSIS Parser — New Agent

**File:** `agent/agents/parser/ssis.py`

```python
# Key parsing steps (not a complete implementation — guides Session A11)
import xml.etree.ElementTree as ET
from pathlib import Path
from agent.state import AgentState

SSIS_NS = {"DTS": "www.microsoft.com/SqlServer/Dts", "pipeline": "..."}

def run(state: AgentState) -> dict:
    """Parse a .dtsx SSIS package into canonical IR."""
    tree = ET.parse(state["raw_artifact_path"])
    root = tree.getroot()

    ir = _make_empty_ir()
    ir["source_origin"] = {"type": "ssis", "artifact_id": state["artifact_id"]}

    # 1. Parse variables → ir["parameters"]
    _parse_variables(root, ir)

    # 2. Parse connection managers → ir["sources"] + ir["sinks"] connector refs
    _parse_connections(root, ir)

    # 3. Find Data Flow Task → parse inner pipeline element
    data_flow = _find_data_flow_task(root)
    if data_flow is None:
        ir["warnings"].append("No Data Flow Task found in package")
        return {"ir": ir}

    # 4. Parse components → ir["transforms"]
    _parse_components(data_flow, ir)

    # 5. Parse paths → topological ordering
    _build_dag(data_flow, ir)

    # 6. Find Execute SQL Tasks → pre_sql / post_sql on target
    _parse_execute_sql_tasks(root, ir)

    return {"ir": ir}
```

**Key challenges in SSIS parsing:**
- Namespace handling: SSIS XML uses multiple namespaces — use `ET.register_namespace`
- Encoded characters: `&quot;` in expressions must be decoded before translation
- Component inputs/outputs are connected via ID references — must build ID→name mapping first
- `Slowly Changing Dimension` wizard generates complex inner XML — detect type 1 vs type 2 from `ColumnType` attribute values: `FixedAttribute`=type1, `ChangingAttribute`=type2
- Variables as parameters: `@[User::SourceQuery]` means the SQL is parameterised — preserve as config parameter in IR

### 7.2 Enhanced Complexity Scoring for SSIS

```python
# Additional rules for SSIS in complexity.py

SSIS_COMPLEXITY_ADDITIONS = {
    "has_script_component": +2,     # C# → manual review almost certain
    "has_fuzzy_lookup": +1,         # approximate matching — hard to replicate
    "has_multiple_data_flows": +2,  # multiple DFT in one package
    "has_execute_package": +3,      # calls child packages — orchestration complexity
    "has_foreach_loop": +1,         # file iteration loop
    "has_variables_in_sql": +1,     # parameterised SQL via variables
    "has_dqs_cleansing": +3,        # DQS = Data Quality Services — manual
    "has_term_extraction": +3,      # NLP — manual
}
```

### 7.3 ADF Parser Hardening

**File:** `agent/agents/parser/adf.py`

ADF pipelines are stored as JSON. Key structure:

```json
{
  "name": "PL_LoadDimCustomer",
  "properties": {
    "activities": [
      {
        "name": "df_transform",
        "type": "ExecuteDataFlow",
        "typeProperties": {
          "dataflow": { "referenceName": "DF_CustomerTransform" }
        }
      }
    ]
  }
}
```

**Data Flows** (the ETL logic) are separate JSON files:

```json
{
  "name": "DF_CustomerTransform",
  "properties": {
    "type": "MappingDataFlow",
    "typeProperties": {
      "sources": [...],
      "transformations": [...],
      "sinks": [...],
      "script": "source(output(customer_id as integer, ...)) ~> src_customers\n..."
    }
  }
}
```

The ADF parser must:
1. Parse the pipeline JSON to find `ExecuteDataFlow` activities
2. Load the referenced Data Flow JSON
3. Parse the `script` property (ADF's own DSL) OR parse `sources`/`transformations`/`sinks` arrays
4. Map each transformation type via `ADF_ACTIVITY_MAP`
5. Handle `LinkedService` references → `ADF_LINKED_SERVICE_MAP` for connector names

### 7.4 AgentState Additions for Multi-Source Support

```python
# Additional fields needed in agent/state.py

class AgentState(TypedDict):
    # ... existing fields ...
    source_type: str    # "informatica" | "adf" | "ssis"  ← already exists
    
    # New fields for enterprise hardening:
    package_hierarchy: list[str]    # SSIS: parent → child package chain
    parameters: dict[str, Any]      # SSIS variables / ADF parameters
    pre_sql: list[str]              # SSIS Execute SQL before data flow
    post_sql: list[str]             # SSIS Execute SQL after data flow
    expression_translations: list[dict]  # per-expression translation results
    manual_review_items: list[dict]      # items requiring human review
    estimated_migration_hours: float     # for sprint planning
```

---

## 8. Sprint Plan — 14 Sprints (28 Weeks)

### Sprint 1 (Weeks 1–2): Canonical Rename + Phase 1 Complete

- [ ] Rename `filter` → `row_filter`, `expression` → `column_derive`, `lookup` → `lookup_enrich`, `csv_file` → `csv`
- [ ] Complete `stream_join` implementation + tests
- [ ] Complete `aggregate` implementation + tests
- [ ] Complete `scd_type_2` implementation + tests
- [ ] Complete `csv` connector read/write + tests
- [ ] **Exit criteria:** `make test` passes; `make demo` runs end-to-end

### Sprint 2 (Weeks 3–4): Phase 2 Transforms

- [ ] `column_select`
- [ ] `union_all`
- [ ] `row_sort`
- [ ] `route_split` (multi-output engine support required)
- [ ] `scd_type_1`
- [ ] Update `schema.json` enum for all above
- [ ] **Exit criteria:** All 12 transforms have tests; coverage ≥ 80%

### Sprint 3 (Weeks 5–6): Phase 1 Connectors

- [ ] `postgres` connector (psycopg2 + SQLAlchemy)
- [ ] `sqlserver` connector (pyodbc + fast_executemany)
- [ ] `oracle` connector (python-oracledb thin mode)
- [ ] `parquet` connector (pyarrow)
- [ ] `s3` connector (boto3 + fsspec)
- [ ] Add `pyproject.toml` dependencies + entry-points for all
- [ ] **Exit criteria:** Integration tests pass against local Docker DBs

### Sprint 4 (Weeks 7–8): Phase 2 Connectors + SSIS-specific Transforms

- [ ] `azure_sql` connector (pyodbc + MSI auth)
- [ ] `excel` connector (openpyxl)
- [ ] `fixed_width` connector
- [ ] `row_deduplicate`
- [ ] `data_convert` (SSIS Data Conversion)
- [ ] **Exit criteria:** All SSIS Phase 1 transforms have canonical equivalents

### Sprint 5 (Weeks 9–10): Expression Rule Engine — Informatica + ADF

- [ ] `agent/agents/translation/rules/informatica.yaml` — 60+ rules (Section 5.1)
- [ ] `agent/agents/translation/rules/adf.yaml` — 40+ rules (Section 5.2)
- [ ] `agent/agents/translation/rules_agent.py` — YAML rule loader + AST matcher
- [ ] Unit tests for every rule (parametrised pytest)
- [ ] **Exit criteria:** 95%+ of common Informatica expressions translate via rules

### Sprint 6 (Weeks 11–12): Expression Rule Engine — SSIS + LLM Fallback

- [ ] `agent/agents/translation/rules/ssis.yaml` — SSIS expression rules (Section 5.3)
- [ ] SSIS cast operator pre-processing (regex pipeline)
- [ ] Tiered LLM fallback (Haiku → Sonnet → manual queue)
- [ ] Confidence scoring per expression
- [ ] **Exit criteria:** Test set of 200 real expressions achieves ≥ 85% auto-translation

### Sprint 7 (Weeks 13–14): Informatica Parser Hardening

- [ ] `agent/agents/parser/informatica.py` — all 18 transform types in `INFORMATICA_TRANSFORM_MAP`
- [ ] Handle `Update Strategy` → detect SCD1 vs SCD2 from `UPDATEOVERRIDE` expression
- [ ] Handle multi-group Router → `route_split`
- [ ] Handle `Normalizer` (multi-output) → `unpivot`
- [ ] Parse all `TABLEATTRIBUTE` expressions for all transform types
- [ ] Tests: 20+ real Informatica XML fixtures
- [ ] **Exit criteria:** Parser handles 90%+ of estate without manual queue

### Sprint 8 (Weeks 15–16): SSIS Parser (New)

- [ ] `agent/agents/parser/ssis.py` — complete implementation (Section 7.1)
- [ ] `SSIS_COMPONENT_MAP` (25 component types)
- [ ] `SSIS_CONNECTION_MAP`
- [ ] Data Flow path DAG builder
- [ ] Control Flow pre/post SQL extraction
- [ ] Variable → parameter extraction
- [ ] Tests: 10+ real `.dtsx` fixtures
- [ ] **Exit criteria:** Parser handles 80% of SSIS estate without manual queue

### Sprint 9 (Weeks 17–18): ADF Parser Hardening

- [ ] `agent/agents/parser/adf.py` — full Data Flow JSON + script DSL parser
- [ ] `ADF_ACTIVITY_MAP` (18 activity types)
- [ ] `ADF_LINKED_SERVICE_MAP` (12 service types)
- [ ] Linked Service JSON → connector config
- [ ] Parameter handling (ADF pipeline parameters → IR parameters)
- [ ] Tests: 15+ real ADF pipeline JSON fixtures
- [ ] **Exit criteria:** ADF parser handles 90%+ of estate

### Sprint 10 (Weeks 19–20): Phase 3 Transforms

- [ ] `sequence_generate`
- [ ] `rank`
- [ ] `window_fn`
- [ ] `pivot`
- [ ] `unpivot`
- [ ] `flatten_json`
- [ ] `mask_pii`
- [ ] `data_validate` (with dead-letter routing)
- [ ] `python_fn` (escape hatch with sandboxed exec)
- [ ] **Exit criteria:** All Phase 3 transforms implemented and tested

### Sprint 11 (Weeks 21–22): Phase 3 Connectors + Performance

- [ ] `snowflake` connector
- [ ] `adls` connector (azure-storage-file-datalake + adlfs)
- [ ] `kafka` connector (confluent-kafka)
- [ ] `mysql` connector
- [ ] `sftp` connector (paramiko)
- [ ] `http_api` connector (httpx with retry/backoff)
- [ ] Connection pooling for high-throughput jobs (SQLAlchemy pool)
- [ ] **Exit criteria:** All 17 connectors implemented; perf baseline established

### Sprint 12 (Weeks 23–24): Observability + Governance

- [ ] Structured job logging (JSON log per step, metrics)
- [ ] Row count assertions (source vs target count check)
- [ ] `row_count` transform for SSIS Row Count equivalent
- [ ] Watermark management (read/write `last_run_dt` from control table)
- [ ] PII column detection (auto-flag columns matching patterns)
- [ ] Job metadata (run_id, source_row_count, target_row_count, duration_s)
- [ ] **Exit criteria:** Every job run produces structured log + row count report

### Sprint 13 (Weeks 25–26): Agent End-to-End Hardening

- [ ] Multi-source dispatcher (auto-detect format: `.xml` → Informatica, `.dtsx` → SSIS, `.json` → ADF)
- [ ] SSIS complexity scoring additions (Section 7.2)
- [ ] AgentState additions: `package_hierarchy`, `parameters`, `pre_sql`, `post_sql`
- [ ] `estimated_migration_hours` heuristic (used for sprint planning reports)
- [ ] Batch migration: process a folder of 50 pipelines end-to-end
- [ ] Human review portal hooks (webhook to Jira/Linear for manual queue items)
- [ ] **Exit criteria:** Agent converts a batch of 50 real pipelines; 85%+ auto-convert

### Sprint 14 (Weeks 27–28): Integration Testing + Hardening

- [ ] End-to-end integration test suite (20 real pipelines from estate sample)
- [ ] Performance test: 500-row, 1M-row, 100M-row benchmark per connector
- [ ] Chaos testing: missing columns, null values, type mismatches, connection failures
- [ ] Docker image for framework runner
- [ ] Helm chart / Kubernetes Job template
- [ ] CI/CD pipeline for generated YAML (lint → validate → test-run → PR)
- [ ] **Exit criteria:** 90%+ of test pipelines pass; Docker image published

---

## 9. Implementation Session Prompts (Enterprise Hardening)

Each session prompt is designed for one focused GHCP session. Reference files by path, not description.

---

### Framework Session F4 — `column_select`

**Scope:** Project, rename, and drop columns
**Duration:** 25 min
**Test:** `pytest tests/framework/test_column_select.py -v`

```
Implement `framework/transformations/column_select.py`.

Read `docs/brainstorming/enterprise-hardening-plan.md` section "column_select".
Read `framework/transformations/row_filter.py` as a style reference.

The `apply(self, df, config)` method must:
1. Accept config["columns"] as a dict {output_col_name: input_col_name}
2. Select only the listed input columns from df
3. Rename them to the output names
4. Drop all other columns
5. Reset index
6. Return the resulting DataFrame

Add to pyproject.toml entry-points and schema.json enum.

Write tests:
- test_select_and_rename: verify columns are renamed correctly
- test_unlisted_columns_dropped: verify columns not in map are absent
- test_missing_input_column_raises: verify KeyError if input col doesn't exist

Run: pip install -e . && make test
```

---

### Framework Session F5 — `union_all`

**Scope:** Concatenate multiple input streams
**Duration:** 25 min

```
Implement `framework/transformations/union_all.py`.

Read `docs/brainstorming/enterprise-hardening-plan.md` section "union_all".
Read `framework/execution/engine.py` to understand how multi-input transforms are invoked.

Note: union_all receives `dfs: dict[str, pd.DataFrame]` (not a single df) because it has
multiple inputs listed in config["inputs"]. The engine must pass all named frames.

The `apply(self, dfs, config)` method:
1. Read config["inputs"] — list of upstream step IDs
2. Pull each DataFrame from dfs dict
3. pd.concat with ignore_index=True
4. If config.get("align_columns", True): fill missing columns with NaN
5. Return reset_index(drop=True)

Write tests:
- test_union_two_frames: equal schemas, verify row count = sum of both
- test_union_column_alignment: frames have different columns; missing → NaN
- test_union_three_frames: verify all rows present
```

---

### Framework Session F6 — `row_sort`

**Scope:** Sort rows by one or more columns
**Duration:** 20 min

```
Implement `framework/transformations/row_sort.py`.

Read `docs/brainstorming/enterprise-hardening-plan.md` section "row_sort".

apply(self, df, config) must:
1. Read config["keys"] — list of {column, direction} dicts
2. Build sort columns list and ascending list
3. df.sort_values(by=cols, ascending=asc_flags, na_position="last")
4. Return reset_index(drop=True)

Write tests:
- test_sort_single_column_asc
- test_sort_single_column_desc
- test_sort_multi_column
- test_sort_with_nulls_last: NaN values appear after non-null values
```

---

### Framework Session F7 — `route_split`

**Scope:** Split stream into named conditional branches
**Duration:** 45 min — engine changes required

```
Implement `framework/transformations/route_split.py`.

Read `docs/brainstorming/enterprise-hardening-plan.md` section "route_split".
Read `framework/execution/engine.py` — you MUST modify the engine to handle dict return.

route_split is the only transform that returns dict[str, DataFrame] instead of DataFrame.
The engine step result for route_split must be stored as multiple named outputs:
  results["route_split_id.branch_name"] = branch_df

Steps:
1. Implement RouteSplitTransformation.apply() → returns dict[str, DataFrame]
2. Modify engine.py: after calling apply(), if result is dict, store each
   branch under "{step_id}.{branch_name}" in the results dict
3. Update schema.json: route_split step references by "{step_id}.{branch_name}"
   in downstream step inputs

Write tests:
- test_split_two_branches: 10 rows, 5 match each condition
- test_default_branch_catches_remaining: rows not matching any condition → "other"
- test_downstream_can_reference_branch: engine correctly routes branch to next step
```

---

### Framework Session F8 — `scd_type_1`

**Scope:** Type 1 SCD — overwrite existing row
**Duration:** 35 min

```
Implement `framework/transformations/scd_type_1.py`.

Read `docs/brainstorming/enterprise-hardening-plan.md` section "scd_type_1".
Read `framework/transformations/scd_type_2.py` as structural reference.

apply(self, df, config) must:
1. Load current dimension table via connector (same pattern as scd_type_2)
2. For rows matching natural_key: replace all non-key column values with incoming values
3. For new rows (no match): insert as-is
4. Return the merged DataFrame representing the full updated dimension

Write tests using SQLite in-memory connector:
- test_update_existing_row: incoming row updates non-key columns
- test_insert_new_row: row with new key is added
- test_multiple_updates: 5 updates + 2 inserts in one batch
```

---

### Framework Session F9 — `data_convert` + `row_deduplicate`

**Duration:** 40 min

```
Implement two transformations in this session:

1. `framework/transformations/data_convert.py`
   Read enterprise-hardening-plan.md section "data_convert".
   The _SSIS_TYPE_MAP must be a class-level dict as shown in the spec.
   apply() iterates config["conversions"] dict and casts each column.

2. `framework/transformations/row_deduplicate.py`
   Read enterprise-hardening-plan.md section "row_deduplicate".
   apply() uses df.drop_duplicates(subset=config.get("key_columns"), keep=config.get("keep","first"))

Add both to pyproject.toml and schema.json.

Write 3 tests for each. Run make test.
```

---

### Connector Session C1 — `postgres` + `parquet`

**Duration:** 45 min

```
Implement two connectors:

1. `framework/connectors/postgres.py`
   Read enterprise-hardening-plan.md section 6.6 (postgres pattern).
   Connection string format: standard libpq DSN → "postgresql://user:pass@host/db"
   Use psycopg2 for read, SQLAlchemy for write.

2. `framework/connectors/parquet.py`
   Read enterprise-hardening-plan.md section 6.6 (parquet pattern).
   read(): pd.read_parquet(file_path, storage_options=...)
   write(): df.to_parquet(file_path, index=False, ...)
   Add dependency: pyarrow to pyproject.toml

Add both to pyproject.toml entry-points. Run pip install -e . && make test.
```

---

### Connector Session C2 — `sqlserver`

**Duration:** 45 min

```
Implement `framework/connectors/sqlserver.py`.

Read enterprise-hardening-plan.md section 6.3 (full implementation shown).

Must implement:
- read(): pyodbc connection, pd.read_sql, watermark parameter injection
- write(): SQLAlchemy fast_executemany for standard loads
- _bulk_insert(): BCP subprocess for bulk strategy
- _build_conn_str(): add DRIVER, Encrypt=yes to raw connection string

Connection string format:
  "Server=myserver;Database=mydb;UID=user;PWD=pass"
  or "Server=myserver;Database=mydb;Trusted_Connection=yes"

Add dependency: pyodbc, sqlalchemy to pyproject.toml.

Write integration tests using mocked pyodbc (use unittest.mock.patch).
```

---

### Connector Session C3 — `oracle`

**Duration:** 45 min

```
Implement `framework/connectors/oracle.py`.

Read enterprise-hardening-plan.md section 6.1 (full implementation shown).

Use python-oracledb in thin mode (no Oracle Client required).
read(): oracledb.connect() → pd.read_sql()
write(): SQLAlchemy with oracle+oracledb dialect

Add dependency: oracledb, sqlalchemy to pyproject.toml.
Connection string: "user/password@host:port/service_name"

Edge cases to handle:
1. Oracle DATE is a TIMESTAMP — add dtype={"date_col": "datetime64[ns]"} option
2. CHAR(n) trailing spaces — add strip_char_columns: true option to rstrip after read
3. Schema-qualified table: f"{config.get('schema', 'schema_name')}.{config['table']}"

Write tests with mocked oracledb connections.
```

---

### Connector Session C4 — `azure_sql`

**Duration:** 45 min

```
Implement `framework/connectors/azure_sql.py`.

Read enterprise-hardening-plan.md section 6.2 (full implementation shown).

Two auth modes:
1. SQL auth: standard UID/PWD in connection string
2. Managed Identity: "Authentication=ActiveDirectoryMsi" in connection string

Must detect auth mode and build appropriate ODBC connection string.
write(): use fast_executemany=True on SQLAlchemy engine for 10-50x write speed.

Add dependency: pyodbc to pyproject.toml.

Write tests:
- test_sql_auth_connection_string: verify DRIVER and Encrypt=yes are added
- test_msi_connection_string: verify Authentication=ActiveDirectoryMsi present
- test_write_uses_fast_executemany: assert engine created with fast_executemany=True
```

---

### Connector Session C5 — `excel` + `fixed_width`

**Duration:** 40 min

```
Implement two SSIS-origin connectors:

1. `framework/connectors/excel.py`
   Read enterprise-hardening-plan.md section 6.4.
   Use openpyxl engine. Support sheet_name, header_row, skip_rows options.
   Add dependency: openpyxl.

2. `framework/connectors/fixed_width.py`
   Read enterprise-hardening-plan.md section 6.5.
   Use pd.read_fwf() with colspecs derived from column config.
   Support encoding (cp037 for EBCDIC, utf-8, latin-1).
   Apply date format conversion per column spec.
   write() produces fixed-width output with ljust padding.

Write 2 tests each using temp file fixtures in pytest.
```

---

### Agent Session A11 — SSIS Parser

**Scope:** `agent/agents/parser/ssis.py`
**Duration:** 90 min
**Test:** `pytest tests/agent/test_ssis_parser.py -v`

```
Implement `agent/agents/parser/ssis.py`.

Read these files before writing any code:
- `docs/brainstorming/enterprise-hardening-plan.md` sections 3.1–3.3
- `agent/agents/parser/informatica.py` (pattern reference — same run(state) → dict signature)
- `agent/CLAUDE.md` section "Vendor → Canonical Mapping Tables" for SSIS_COMPONENT_MAP

The parser must:
1. Parse the .dtsx XML file at state["raw_artifact_path"]
2. Handle SSIS XML namespaces (register them before parsing)
3. Extract ConnectionManagers → build connector refs (SSIS_CONNECTION_MAP)
4. Extract DTS:Variables → ir["parameters"]
5. Find the Microsoft.Pipeline executable → parse inner <pipeline> element
6. For each <component>: map componentClassID via SSIS_COMPONENT_MAP
7. Parse <paths> elements → build DAG (source/destination IDs)
8. Perform topological sort on DAG → ir["transforms"] order
9. Extract Execute SQL Tasks before/after data flow → ir["pre_sql"] / ir["post_sql"]
10. For unsupported components: add warning to ir["warnings"], set auto_convertible=False
11. Handle SSIS Slowly Changing Dimension: check ColumnType attributes to determine type 1 vs type 2

Return: {"ir": ir_dict}

Write tests using real .dtsx fixture files (create minimal ones in tests/fixtures/ssis/):
- test_parse_simple_dft: Source → DerivedColumn → Destination
- test_component_map_all_known: assert no unknown componentClassID for standard components
- test_script_component_routes_to_manual: ScriptComponent → warning + auto_convertible=False
- test_conditional_split_maps_to_route_split
- test_scd_wizard_detects_type: ColumnType=FixedAttribute → scd_type_1, ChangingAttribute → scd_type_2
- test_variables_become_parameters
- test_execute_sql_becomes_pre_sql
```

---

### Agent Session A12 — ADF Parser

**Scope:** `agent/agents/parser/adf.py`
**Duration:** 75 min
**Test:** `pytest tests/agent/test_adf_parser.py -v`

```
Implement `agent/agents/parser/adf.py`.

Read these files:
- `docs/brainstorming/enterprise-hardening-plan.md` section 7.3 (ADF JSON structure)
- `agent/CLAUDE.md` section "Vendor → Canonical Mapping Tables" (ADF_ACTIVITY_MAP)
- `agent/agents/parser/informatica.py` (same run() signature pattern)

ADF artifacts come as a folder of JSON files:
- Pipeline JSON: contains activities list (including ExecuteDataFlow references)
- Data Flow JSON: contains sources, transformations, sinks arrays + script property

The parser must:
1. Load pipeline JSON from state["raw_artifact_path"]
2. Find ExecuteDataFlow activities → load referenced Data Flow JSONs from same folder
3. Map each transformation type via ADF_ACTIVITY_MAP
4. Map each linked service type via ADF_LINKED_SERVICE_MAP
5. Build IR sources from Data Flow sources array
6. Build IR transforms from Data Flow transformations array in script order
7. Build IR sinks from Data Flow sinks array
8. Extract pipeline parameters → ir["parameters"]
9. Handle unknown activity types → warning + auto_convertible=False

Write tests using minimal ADF JSON fixtures in tests/fixtures/adf/:
- test_parse_simple_dataflow: source → derived_column → sink
- test_linked_service_maps_to_connector
- test_unknown_activity_emits_warning
- test_parameters_extracted
- test_execute_data_flow_loads_referenced_file
```

---

### Agent Session A13 — SSIS Expression Translator

**Scope:** `agent/agents/translation/rules/ssis.yaml` + translator updates
**Duration:** 60 min

```
Implement SSIS expression translation support.

Step 1: Create `agent/agents/translation/rules/ssis.yaml`
Read enterprise-hardening-plan.md section 5.3 for the complete YAML structure.
Include all pre_processing regex rules, cast_operators, string_functions, numeric_functions,
date_functions, conditional_functions, and logical_operators sections.

Step 2: Update `agent/agents/translation/rules_agent.py` to:
- Load ssis.yaml alongside informatica.yaml and adf.yaml
- Add SSIS-specific pre-processing step: run cast operator regexes BEFORE function matching
- Handle SSIS bracket syntax: [col_name] → df['col_name'] pre-processing
- Handle SSIS ternary operator: condition ? trueVal : falseVal → np.where(...)

Step 3: Write parametrised tests in `tests/agent/test_ssis_expression.py`:
Parametrize over these (input, expected_output) pairs:
  ("TRIM([first_name])",                   "df['first_name'].str.strip()")
  ("(DT_I4)[order_id]",                    "df['order_id'].astype('Int32')")
  ("(DT_DBTIMESTAMP)[order_date]",         "pd.to_datetime(df['order_date'])")
  ("YEAR([birth_date])",                   "df['birth_date'].dt.year")
  ("ISNULL([email])",                      "df['email'].isna()")
  ("LEN(TRIM([name]))",                    "df['name'].str.strip().str.len()")
  ("[status] == \"ACTIVE\" ? 1 : 0",       "np.where(df['status'] == 'ACTIVE', 1, 0)")
  ("@[User::SourceSchema]",               "config['parameters']['SourceSchema']")
```

---

### Agent Session A14 — Multi-Source Dispatcher

**Scope:** Auto-detect and route to correct parser
**Duration:** 30 min

```
Implement `agent/agents/parser/dispatcher.py`.

This module is the entry point for ALL parsing — it detects the artifact format and
calls the correct parser.

def run(state: AgentState) -> dict:
    path = Path(state["raw_artifact_path"])
    suffix = path.suffix.lower()
    content_hint = state.get("source_type", "")

    if suffix == ".dtsx" or content_hint == "ssis":
        from agent.agents.parser.ssis import run as ssis_run
        return ssis_run(state)
    elif suffix == ".json" or content_hint == "adf":
        from agent.agents.parser.adf import run as adf_run
        return adf_run(state)
    elif suffix == ".xml" or content_hint == "informatica":
        from agent.agents.parser.informatica import run as informatica_run
        return informatica_run(state)
    else:
        return {"error_log": state.get("error_log", []) + [f"Unknown artifact format: {suffix}"]}

Wire dispatcher.run into agent/graph.py as the "parse" node (replace the current
direct informatica parser reference).

Write tests:
- test_dispatch_dtsx_routes_to_ssis
- test_dispatch_json_routes_to_adf
- test_dispatch_xml_routes_to_informatica
- test_dispatch_unknown_logs_error
```

---

### Agent Session A15 — Expression Translation LLM Fallback (Tiered)

**Duration:** 60 min

```
Harden `agent/agents/translation/llm_translator.py` with tiered fallback.

Read agent/CLAUDE.md section "LLM Translator Agent".
Read enterprise-hardening-plan.md section 5.4 (Tier 0–3 ladder).

Current implementation does a single Sonnet call for all unmatched expressions.
Replace with this tier ladder:

Tier 0: Rule match — confidence = 1.0 (already done in rules_agent.py; skip here)

Tier 1: Haiku classification
  - System prompt (cached): "You are an ETL expression classifier. Given an expression
    and a list of rule templates, identify the closest matching template. Return JSON:
    {template_id: str, confidence: float}"
  - If confidence >= 0.7: apply template with Haiku-identified parameter extraction
  - Model: claude-haiku-4-5-20251001

Tier 2: Sonnet full translation
  - System prompt (cached): "You are an ETL expression translator. Translate the given
    expression to Python/pandas. Return JSON: {python_expr: str, confidence: float,
    explanation: str}. Use df['col'] for column references. Never use eval()."
  - If confidence >= 0.5: use result; add to state["expression_translations"]
  - Model: claude-sonnet-4-6

Tier 3: Manual queue
  - confidence < 0.5 from Sonnet OR Sonnet raises an error
  - Add to state["manual_review_items"]: {expression: ..., source_type: ..., reason: ...}
  - Set expression in IR to: "# TODO: manually translate: {original_expression}"

Security rules (enforce in all tiers):
- NEVER include data row values in any LLM prompt — only the expression string
- Assert: prompt does not contain any of state["ir"]["sources"][*]["query"] row values

Write tests:
- test_tier0_not_called_for_rules_match: Haiku not called when rule matches
- test_tier1_haiku_called_for_unknown: Haiku called first for unknown expression
- test_tier2_sonnet_called_on_low_haiku_confidence: Sonnet called when Haiku < 0.7
- test_tier3_manual_queue_on_low_sonnet_confidence: item added to manual_review_items
- test_no_data_rows_in_prompt: assert prompt does NOT contain actual row values
```

---

### Agent Session A16 — Batch Migration CLI

**Duration:** 45 min

```
Implement `agent/cli_batch.py` — process a folder of artifacts end-to-end.

The batch CLI must:
1. Accept a folder path containing .xml / .dtsx / .json artifacts
2. For each artifact: run the full agent graph (dispatcher → complexity → translate → generate → validate)
3. Output to --output-dir: one .yaml per successfully converted pipeline
4. Write a batch_report.json summarising:
   {
     "total": 50,
     "auto_converted": 38,
     "needs_review": 8,
     "manual_queue": 4,
     "by_source_type": {"informatica": 30, "ssis": 12, "adf": 8},
     "estimated_review_hours": 24.5,
     "failures": [{"artifact": "...", "error": "..."}]
   }
5. Write a manual_review_items.json listing all items needing human attention

CLI usage:
  etl-agent batch --input-dir ./informatica_exports/ --output-dir ./generated_yaml/ --source-type informatica

Write tests:
- test_batch_processes_folder: 3 fixtures → 3 yaml files output
- test_batch_report_counts: verify auto_converted + needs_review + manual_queue = total
- test_batch_report_by_source_type: verify source_type breakdown
```

---

### Agent Session A17 — Observability and Job Metrics

**Duration:** 40 min

```
Add structured observability to `framework/execution/engine.py`.

Read framework/CLAUDE.md section "Execution Engine".
Read enterprise-hardening-plan.md Sprint 12 for the metrics list.

Add to each job run:
1. run_id: str = str(uuid.uuid4()) — unique identifier for the run
2. Per-step metrics logged as structured JSON:
   {"step_id": "...", "step_type": "...", "input_rows": N, "output_rows": M, "duration_s": T}
3. Final job summary logged at INFO level:
   {"job_name": "...", "run_id": "...", "status": "success|failure",
    "total_rows_in": N, "total_rows_out": M, "duration_s": T}
4. After each sink write: assert target row count = DataFrame length (raise on mismatch)
5. All metrics via logging.getLogger("etl.metrics") — JSON format, not print()

Write tests:
- test_metrics_logged_per_step: capture log output, assert JSON per step
- test_run_id_consistent: same run_id appears in all step logs
- test_row_count_mismatch_raises: mock write to return wrong count → assertion error
```

---

### Agent Session A18 — Full Estate Integration Test

**Duration:** 60 min

```
Create `tests/integration/test_full_estate_sample.py`.

This test uses 5 real-world-representative fixtures (anonymised) that together cover:
- 1 Informatica mapping with row_filter + lookup_enrich + column_derive + scd_type_2
- 1 SSIS package with Data Conversion + Sort + Conditional Split + OLE DB source/dest
- 1 ADF pipeline with Derived Column + Aggregate + Join + Sink
- 1 SSIS package with SCD wizard (type 1 + type 2 columns mixed)
- 1 Informatica mapping with Router (multi-group) + Normalizer

For each fixture:
1. Run dispatcher.run() → assert IR produced with no Python exceptions
2. Run complexity_agent.run() → assert score and track assigned
3. Run rules_agent.run() → assert all expressions translated (confidence >= 0.7 for >80%)
4. Run yaml_generator.run() → assert valid YAML produced
5. Run syntax_validator.run() → assert no validation errors

Fixture files go in tests/fixtures/integration/ folder.
Parametrize the test over all 5 fixtures.
Mark as @pytest.mark.integration — skip in unit test runs (make test), run explicitly.

Run: pytest tests/integration/ -v -m integration
```

---

## 10. Updated Vendor Mapping Tables (Complete Enterprise Coverage)

Update `agent/CLAUDE.md` with these additions after this document is implemented.

### SSIS additions to `agent/agents/parser/ssis.py`

```python
# Extend existing maps with SSIS-specific entries
SSIS_COMPONENT_MAP: dict[str, str | None] = { ... }  # Section 3.2
SSIS_CONNECTION_MAP: dict[str, str | None] = { ... }  # Section 3.2
```

### Extended Informatica map (add to existing)

```python
# Additional entries beyond current INFORMATICA_TRANSFORM_MAP
"Rank":                     "rank",
"Sorter":                   "row_sort",
"Normalizer":               "unpivot",
"Router":                   "route_split",
"Union":                    "union_all",
"Sequence Generator":       "sequence_generate",
"Update Strategy":          "scd_type_1",   # override to scd_type_2 on UPDATEOVERRIDE parse
"XML Source Qualifier":     "xml_parse",
"XML Generator":            None,            # manual
"PowerExchange CDC":        None,            # CDC — manual
"Real-time Source":         None,            # streaming — manual
```

---

## 11. Dependencies to Add to `pyproject.toml`

```toml
[project.optional-dependencies]
oracle    = ["oracledb>=1.4"]
sqlserver = ["pyodbc>=5.0"]
postgres  = ["psycopg2-binary>=2.9", "sqlalchemy>=2.0"]
s3        = ["boto3>=1.34", "s3fs>=2024.1", "fsspec>=2024.1"]
adls      = ["azure-storage-file-datalake>=12.0", "adlfs>=2024.1"]
snowflake = ["snowflake-connector-python[pandas]>=3.6"]
kafka     = ["confluent-kafka>=2.3"]
parquet   = ["pyarrow>=14.0"]
excel     = ["openpyxl>=3.1"]
sftp      = ["paramiko>=3.4"]
http      = ["httpx>=0.27"]
all       = [
    "oracledb>=1.4", "pyodbc>=5.0", "psycopg2-binary>=2.9",
    "sqlalchemy>=2.0", "boto3>=1.34", "s3fs>=2024.1",
    "azure-storage-file-datalake>=12.0", "adlfs>=2024.1",
    "snowflake-connector-python[pandas]>=3.6", "confluent-kafka>=2.3",
    "pyarrow>=14.0", "openpyxl>=3.1", "paramiko>=3.4", "httpx>=0.27",
]

[project.scripts]
etl-run   = "framework.runner:main"
etl-agent = "agent.cli:main"
etl-batch = "agent.cli_batch:main"   # new

[project.entry-points."etl.transformations"]
row_filter         = "framework.transformations.row_filter:RowFilterTransformation"
column_derive      = "framework.transformations.column_derive:ColumnDeriveTransformation"
lookup_enrich      = "framework.transformations.lookup_enrich:LookupEnrichTransformation"
stream_join        = "framework.transformations.stream_join:StreamJoinTransformation"
aggregate          = "framework.transformations.aggregate:AggregateTransformation"
scd_type_2         = "framework.transformations.scd_type_2:ScdType2Transformation"
column_select      = "framework.transformations.column_select:ColumnSelectTransformation"
union_all          = "framework.transformations.union_all:UnionAllTransformation"
row_sort           = "framework.transformations.row_sort:RowSortTransformation"
route_split        = "framework.transformations.route_split:RouteSplitTransformation"
scd_type_1         = "framework.transformations.scd_type_1:ScdType1Transformation"
row_deduplicate    = "framework.transformations.row_deduplicate:RowDeduplicateTransformation"
data_convert       = "framework.transformations.data_convert:DataConvertTransformation"
sequence_generate  = "framework.transformations.sequence_generate:SequenceGenerateTransformation"
rank               = "framework.transformations.rank:RankTransformation"
window_fn          = "framework.transformations.window_fn:WindowFnTransformation"
pivot              = "framework.transformations.pivot:PivotTransformation"
unpivot            = "framework.transformations.unpivot:UnpivotTransformation"
flatten_json       = "framework.transformations.flatten_json:FlattenJsonTransformation"
mask_pii           = "framework.transformations.mask_pii:MaskPiiTransformation"
data_validate      = "framework.transformations.data_validate:DataValidateTransformation"
python_fn          = "framework.transformations.python_fn:PythonFnTransformation"
row_count          = "framework.transformations.row_count:RowCountTransformation"
fuzzy_match        = "framework.transformations.fuzzy_match:FuzzyMatchTransformation"

[project.entry-points."etl.connectors"]
sqlite      = "framework.connectors.sqlite:SqliteConnector"
csv         = "framework.connectors.csv:CsvConnector"
parquet     = "framework.connectors.parquet:ParquetConnector"
postgres    = "framework.connectors.postgres:PostgresConnector"
sqlserver   = "framework.connectors.sqlserver:SqlServerConnector"
oracle      = "framework.connectors.oracle:OracleConnector"
azure_sql   = "framework.connectors.azure_sql:AzureSqlConnector"
snowflake   = "framework.connectors.snowflake:SnowflakeConnector"
s3          = "framework.connectors.s3:S3Connector"
adls        = "framework.connectors.adls:AdlsConnector"
kafka       = "framework.connectors.kafka:KafkaConnector"
mysql       = "framework.connectors.mysql:MySqlConnector"
excel       = "framework.connectors.excel:ExcelConnector"
fixed_width = "framework.connectors.fixed_width:FixedWidthConnector"
sftp        = "framework.connectors.sftp:SftpConnector"
http_api    = "framework.connectors.http_api:HttpApiConnector"
```

---

*This document is the engineering reference for the enterprise hardening phase. Start with Sprint 1 (canonical rename) and follow the sprint order. Each sprint builds on the previous — do not skip ahead.*
