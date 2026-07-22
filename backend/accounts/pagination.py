"""Lightweight offset pagination helpers for list endpoints."""
from __future__ import annotations

from typing import Any


def parse_limit_offset(
    request,
    *,
    default_limit: int = 100,
    max_limit: int = 300,
) -> tuple[int, int]:
    try:
        limit = int(request.query_params.get("limit", default_limit))
    except (TypeError, ValueError):
        limit = default_limit
    try:
        offset = int(request.query_params.get("offset", 0))
    except (TypeError, ValueError):
        offset = 0
    limit = max(1, min(limit, max_limit))
    offset = max(0, offset)
    return limit, offset


def paginate_queryset(queryset, request, *, default_limit: int = 100, max_limit: int = 300):
    """Return (page_qs, meta dict)."""
    limit, offset = parse_limit_offset(
        request, default_limit=default_limit, max_limit=max_limit
    )
    total = queryset.count()
    page = queryset[offset : offset + limit]
    meta = {
        "count": total,
        "limit": limit,
        "offset": offset,
        "has_more": (offset + limit) < total,
    }
    return page, meta


def paginated_response(serializer_data: list[Any], meta: dict) -> dict:
    return {
        "results": serializer_data,
        "count": meta["count"],
        "limit": meta["limit"],
        "offset": meta["offset"],
        "has_more": meta["has_more"],
    }
