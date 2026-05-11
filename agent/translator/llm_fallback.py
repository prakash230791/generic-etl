"""LLM fallback translator — uses the Anthropic API for complex expressions."""

from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)

_SYSTEM = (
    "You are an ETL migration expert. "
    "Translate Informatica PowerCenter expressions to Python expressions "
    "where column names are pandas Series local variables. "
    "Return ONLY the translated expression — no explanation, no markdown fences."
)

_FEW_SHOT = """Examples:
  CONCAT(first_name, ' ', last_name)  →  first_name + ' ' + last_name
  IIF(score > 90, 'A', 'B')           →  ('A' if score > 90 else 'B')
  TRIM(email)                          →  email.str.strip()
  UPPER(status)                        →  status.str.upper()
"""


def llm_translate_expression(expr: str) -> str:
    """Ask Claude to translate an Informatica expression to Python/pandas.

    Requires the ``ANTHROPIC_API_KEY`` environment variable.  Returns *expr*
    unchanged (with a warning) if the key is absent or the API call fails.

    Args:
        expr: Informatica expression string that rule-based translation could
              not handle.

    Returns:
        Python expression string, or the original *expr* on failure.
    """
    if not os.environ.get("ANTHROPIC_API_KEY"):
        logger.warning("ANTHROPIC_API_KEY not set — skipping LLM fallback for: %s", expr)
        return expr

    try:
        import anthropic

        client = anthropic.Anthropic()
        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=256,
            system=_SYSTEM,
            messages=[
                {
                    "role": "user",
                    "content": f"{_FEW_SHOT}\nTranslate: {expr}",
                }
            ],
        )
        translated = message.content[0].text.strip()
        logger.info("LLM translated '%s' → '%s'", expr, translated)
        return translated

    except Exception as exc:
        logger.warning("LLM fallback failed (%s) — keeping original: %s", exc, expr)
        return expr
