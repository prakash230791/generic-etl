# Transformation Mapping Guide

This document covers how Informatica PowerCenter transformation types map to the IR and then to framework YAML configs. It also documents expression translation rules.

---

## Transformation Type Mapping

### Filter

**Informatica:** `Filter` transformation with a `Filter Condition` attribute.

**IR:**
```json
{ "kind": "filter", "properties": { "condition": "status == 'ACTIVE'" } }
```

**Framework YAML:**
```yaml
- name: FIL_ACTIVE_ONLY
  type: filter
  config:
    condition: "status == 'ACTIVE'"
```

**How it executes:** `df.query(condition).reset_index(drop=True)`

**Expression translation applied to filter conditions:**

| Informatica | Python (framework) |
|---|---|
| `STATUS = 'ACTIVE'` | `status == 'ACTIVE'` |
| `AGE <> 0` | `age != 0` |
| `ISNULL(EMAIL)` | *(manual or LLM)* |

---

### Lookup

**Informatica:** `Lookup Procedure` transformation with `Lookup table name`, `Lookup DB Path`, `Lookup condition` attributes. OUTPUT-typed ports are the new columns.

**IR:**
```json
{
  "kind": "lookup",
  "properties": {
    "table": "segments",
    "db_name": "source.db",
    "join_on": ["segment_code"],
    "columns": ["segment_name"]
  }
}
```

**Framework YAML:**
```yaml
- name: LKP_SEGMENTS
  type: lookup
  config:
    lookup_source:
      type: sqlite
      config:
        db_path: sample_data/source.db
        table: segments
    join_on:
      - segment_code
    columns:
      - segment_name
```

**How it executes:** Left merge — `df.merge(lookup_df, on=join_on, how="left")`

**Notes:**
- `join_on` is parsed from the Informatica `Lookup condition` attribute (e.g., `segments.segment_code = customers.segment_code`)
- Only columns listed in `columns` are pulled from the lookup table (plus the join key)
- Rows with no match get `NaN` in the new columns (standard left-join behaviour)

---

### Expression

**Informatica:** `Expression` transformation. Each OUTPUT-typed `TRANSFORMFIELD` with an `EXPRESSION` attribute becomes an IR port.

**IR:**
```json
{
  "kind": "expression",
  "ports": [
    { "name": "full_name", "datatype": "varchar", "expression": "first_name + ' ' + last_name" }
  ]
}
```

**Framework YAML:**
```yaml
- name: EXP_DERIVE_FIELDS
  type: expression
  config:
    expressions:
      - target: full_name
        expr: "first_name + ' ' + last_name"
```

**How it executes:** Python's built-in `eval()` with column Series as local variables:
```python
col_ns = {col: result[col] for col in result.columns}
result[target] = eval(expr, _EVAL_GLOBALS, col_ns)
```

**Why not `df.eval()`?** `df.eval(engine='python')` fails on string literal concatenation in pandas 2.x. Python's `eval()` with Series locals broadcasts correctly.

---

### SCD Type 2

**Informatica:** Multiple transformations working together (Lookup + Expression + Router + Update Strategy).

**IR:**
```json
{
  "kind": "scd_type_2",
  "properties": {
    "natural_key": ["customer_id"],
    "tracked_columns": ["email", "segment_code"],
    "effective_date_col": "effective_from",
    "expiry_date_col": "effective_to",
    "current_flag_col": "is_current"
  }
}
```

**Framework YAML:**
```yaml
- name: SCD2_DIM_CUSTOMER
  type: scd_type_2
  config:
    natural_key:
      - customer_id
    tracked_columns:
      - email
      - segment_code
    effective_date_col: effective_from
    expiry_date_col: effective_to
    current_flag_col: is_current
```

**Status:** Framework stub exists (`framework/transformations/scd_type_2.py`); full implementation is post-POC.

---

## Expression Translation Rules

The agent applies rule-based translation before falling back to the LLM.

### String functions

| Informatica | Python / pandas |
|---|---|
| `CONCAT(a, b)` | `a + b` |
| `CONCAT(a, ' ', b)` | `a + ' ' + b` |
| `LTRIM(s)` | `s.str.lstrip()` |
| `RTRIM(s)` | `s.str.rstrip()` |
| `UPPER(s)` | `s.str.upper()` |
| `LOWER(s)` | `s.str.lower()` |
| `LENGTH(s)` | `s.str.len()` |
| `SUBSTR(s, n, m)` | `s.str[n-1:n-1+m]` |

### Numeric functions

| Informatica | Python / pandas |
|---|---|
| `TRUNC(x)` | `int(x)` |
| `TO_INTEGER(x)` | `int(x)` |
| `ABS(x)` | `abs(x)` |
| `MOD(x, y)` | `x % y` |

### Conditional functions

| Informatica | Python / pandas |
|---|---|
| `IIF(cond, true_val, false_val)` | `true_val if cond else false_val` |
| `DECODE(x, v1, r1, v2, r2, default)` | *(LLM fallback)* |

### Operators

| Informatica | Python |
|---|---|
| `=` | `==` |
| `<>` | `!=` |
| `AND` | `and` |
| `OR` | `or` |

### LLM fallback

If the translated expression still contains a pattern matching `^[A-Z_]{2,}\s*\(` (an Informatica-style function call), the agent calls `claude-haiku-4-5-20251001` with a structured prompt asking for the Python/pandas equivalent. The LLM response is used as-is. If the API call fails (no key, network error), the untranslated expression is used and a warning is logged.

---

## Transformation Ordering

Informatica defines the pipeline order via `<CONNECTOR>` elements inside `<MAPPING>`. Each connector has `FROMINSTANCE` and `TOINSTANCE` attributes. The parser:

1. Builds a `dict[str, str]` adjacency map: `{ from_name: to_name }`
2. Finds the `Source Qualifier` instance (entry point)
3. Walks the chain from Source Qualifier → Target Definition, collecting transformation names in order

This produces a topologically ordered list that directly maps to the `transformations` array in the YAML.

---

## Unsupported / Complex Patterns

These patterns require manual review and are flagged in the agent output:

| Pattern | Reason | Handling |
|---|---|---|
| Router (conditional split) | Framework currently supports linear pipelines only | Manual conversion to multiple jobs with filter transforms |
| Joiner (non-lookup joins) | Complex join conditions, multiple input streams | Manual conversion |
| Stored Procedure call | Requires database-specific execution | Manual conversion |
| Aggregator | GROUP BY semantics not yet in framework | Post-POC: add AggregateTransformation plugin |
| Sequence Generator | Auto-increment surrogate keys | Handled by target DB auto-increment or expression |
| Union | Multiple input streams | Post-POC: multi-source engine support |
