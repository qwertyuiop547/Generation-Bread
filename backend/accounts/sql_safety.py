"""
SQL injection defenses (defense-in-depth).

Django ORM already uses parameterized queries. This module:
1. Validates / normalizes user input before it hits the DB layer
2. Provides the ONLY approved helper for raw SQL (always with bound params)
3. Rejects obvious injection / control characters early
"""
from __future__ import annotations

import re
from typing import Any, Mapping, Sequence

from django.core.exceptions import ValidationError
from django.core.validators import validate_email

# Characters / patterns that must never appear in free-text filters.
_CONTROL_OR_NULL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_SQL_META_HINT = re.compile(
    r"(--|;/\*|\*/|\bunion\b.+\bselect\b|\bdrop\b.+\btable\b|"
    r"\binsert\b.+\binto\b|\bdelete\b.+\bfrom\b|\bupdate\b.+\bset\b|"
    r"\bexec(ute)?\b|\bxp_\w+|\binformation_schema\b)",
    re.IGNORECASE,
)


class UnsafeSQLError(ValueError):
    """Raised when raw SQL is used incorrectly (missing params / string concat)."""


def strip_control_chars(value: str) -> str:
    return _CONTROL_OR_NULL.sub("", value)


def looks_like_sql_injection(value: str) -> bool:
    """Heuristic only — never rely on this alone; always use ORM / params."""
    if not value:
        return False
    if "\x00" in value:
        return True
    return bool(_SQL_META_HINT.search(value))


def normalize_email(value: Any, *, max_length: int = 254) -> str | None:
    """Return a cleaned email or None if invalid / suspicious."""
    if value is None:
        return None
    email = strip_control_chars(str(value).strip().lower())
    if not email or len(email) > max_length:
        return None
    if looks_like_sql_injection(email):
        return None
    try:
        validate_email(email)
    except ValidationError:
        return None
    return email


def normalize_text(
    value: Any,
    *,
    max_length: int = 255,
    allow_empty: bool = True,
) -> str | None:
    """Safe free-text field (names, notes). Rejects null bytes and oversize input."""
    if value is None:
        return "" if allow_empty else None
    text = strip_control_chars(str(value).strip())
    if len(text) > max_length:
        return None
    if not allow_empty and not text:
        return None
    return text


def parse_positive_int(value: Any, *, default: int | None = None, max_value: int = 2_147_483_647) -> int | None:
    """Parse integers safely (IDs, limits). Rejects non-numeric / out-of-range."""
    if value is None or value == "":
        return default
    try:
        n = int(str(value).strip())
    except (TypeError, ValueError):
        return default
    if n < 0 or n > max_value:
        return default
    return n


def execute_parameterized(cursor, sql: str, params: Sequence[Any] | Mapping[str, Any] | None = None):
    """
    Approved raw-SQL entry point: always bind parameters.

    Never do: cursor.execute(f\"SELECT ... WHERE id={user_id}\")
    Always do: execute_parameterized(cursor, \"SELECT ... WHERE id=%s\", [user_id])
    """
    if not isinstance(sql, str) or not sql.strip():
        raise UnsafeSQLError("SQL must be a non-empty string.")
    # Block classic f-string / concat mistakes that leave literal values in the SQL.
    if re.search(r"'[^']*'|\"[^\"]*\"", sql) and ("%s" not in sql and "%(" not in sql):
        # Allow static DDL/admin scripts with no placeholders and no params.
        if params:
            raise UnsafeSQLError(
                "Do not mix literal string values in SQL with params; use placeholders."
            )
    bound = params if params is not None else ()
    if not isinstance(bound, (list, tuple, dict)):
        raise UnsafeSQLError("params must be a list, tuple, or dict.")
    # psycopg / Django: always pass params separately — never interpolate.
    cursor.execute(sql, bound)
    return cursor
