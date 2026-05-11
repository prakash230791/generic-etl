"""Rule-based translator for Informatica expression language → Python/pandas expressions."""

from __future__ import annotations

import re


# ── Public API ─────────────────────────────────────────────────────────────────

def translate_expression(expr: str) -> str:
    """Translate an Informatica expression string to a Python expression.

    Applies rule-based rewrites in priority order.  Falls back to the LLM
    translator for patterns not covered by the rules.

    Args:
        expr: Raw Informatica expression string, e.g. ``"CONCAT(a, ' ', b)"``.

    Returns:
        Python expression string compatible with the ExpressionTransformation
        eval sandbox (pandas column names as local variables).
    """
    result = expr.strip()

    result = _apply_rules(result)

    # If the expression still looks like an unknown Informatica function, use LLM.
    if re.search(r'^[A-Z_]{2,}\s*\(', result):
        try:
            from agent.translator.llm_fallback import llm_translate_expression
            result = llm_translate_expression(result)
        except Exception:
            pass  # keep best-effort rule output

    return result


def translate_filter_condition(condition: str) -> str:
    """Translate an Informatica filter condition to a pandas ``query()`` string.

    Args:
        condition: Informatica filter condition, e.g. ``"status = 'ACTIVE'"``.

    Returns:
        Pandas-query-compatible string, e.g. ``"status == 'ACTIVE'"``.
    """
    result = condition.strip()
    # <> → !=
    result = result.replace("<>", "!=")
    # Bare = → ==  (skip !=, >=, <=, ==)
    result = re.sub(r"(?<![<>!=])=(?!=)", "==", result)
    return result


# ── Rule table ──────────────────────────────────────────────────────────────────

def _apply_rules(expr: str) -> str:
    """Apply all registered rewrite rules until the expression stabilises."""
    for _ in range(10):  # cap iterations to prevent infinite loops
        rewritten = _one_pass(expr)
        if rewritten == expr:
            break
        expr = rewritten
    return expr


def _one_pass(expr: str) -> str:
    # CONCAT(a, b, ...) → a + b + ...
    expr = re.sub(r"CONCAT\(([^()]*)\)", _rewrite_concat, expr)
    # TRIM / LTRIM / RTRIM
    expr = re.sub(r"TRIM\(([^()]+)\)", r"\1.str.strip()", expr)
    expr = re.sub(r"LTRIM\(([^()]+)\)", r"\1.str.lstrip()", expr)
    expr = re.sub(r"RTRIM\(([^()]+)\)", r"\1.str.rstrip()", expr)
    # UPPER / LOWER
    expr = re.sub(r"UPPER\(([^()]+)\)", r"\1.str.upper()", expr)
    expr = re.sub(r"LOWER\(([^()]+)\)", r"\1.str.lower()", expr)
    # LENGTH / LEN
    expr = re.sub(r"(?:LENGTH|LEN)\(([^()]+)\)", r"\1.str.len()", expr)
    # TO_CHAR / TO_INTEGER / TO_FLOAT
    expr = re.sub(r"TO_CHAR\(([^()]+)\)", r"str(\1)", expr)
    expr = re.sub(r"TO_INTEGER\(([^()]+)\)", r"int(\1)", expr)
    expr = re.sub(r"TO_FLOAT\(([^()]+)\)", r"float(\1)", expr)
    # IS_NULL / ISNULL
    expr = re.sub(r"(?:IS_NULL|ISNULL)\(([^()]+)\)", r"(\1.isnull())", expr)
    return expr


def _rewrite_concat(match: re.Match) -> str:
    parts = _split_args(match.group(1))
    return " + ".join(p.strip() for p in parts)


def _split_args(s: str) -> list[str]:
    """Split comma-separated function arguments, respecting quoted strings."""
    args: list[str] = []
    current: list[str] = []
    in_quote = False
    quote_char = ""

    for ch in s:
        if ch in ('"', "'") and not in_quote:
            in_quote, quote_char = True, ch
            current.append(ch)
        elif ch == quote_char and in_quote:
            in_quote = False
            current.append(ch)
        elif ch == "," and not in_quote:
            args.append("".join(current))
            current = []
        else:
            current.append(ch)

    if current:
        args.append("".join(current))
    return args
