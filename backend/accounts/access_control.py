"""Authorization helpers — prevent IDOR via email spoofing."""
from __future__ import annotations

import secrets

from rest_framework import status
from rest_framework.response import Response


def _order_token_from_request(request) -> str | None:
    header = request.META.get("HTTP_X_ORDER_TOKEN") or ""
    if header.strip():
        return header.strip()
    data = getattr(request, "data", None) or {}
    if isinstance(data, dict) and data.get("order_token"):
        return str(data.get("order_token")).strip()
    qp = getattr(request, "query_params", None)
    if qp and qp.get("order_token"):
        return str(qp.get("order_token")).strip()
    return None


def authorize_order_access(request, order, *, write: bool = False):
    """
    Allow access if:
      - JWT user owns the order, or
      - JWT user is staff/admin, or
      - valid X-Order-Token / order_token matches order.access_token
    """
    user = getattr(request, "user", None)
    if user is not None and getattr(user, "is_authenticated", False):
        role = getattr(user, "role", None)
        if role in ("staff", "admin"):
            return True, None
        if order.user_id == user.id:
            return True, None

    token = _order_token_from_request(request)
    stored = getattr(order, "access_token", None) or ""
    if token and stored and secrets.compare_digest(token, stored):
        return True, None

    return False, Response(
        {"error": "Forbidden. Login as the order owner or provide a valid order token."},
        status=status.HTTP_403_FORBIDDEN,
    )


def require_authenticated_user(request):
    user = getattr(request, "user", None)
    if not user or not getattr(user, "is_authenticated", False):
        return None, Response(
            {"error": "Authentication required. Send Authorization: Bearer <access_token>."},
            status=status.HTTP_401_UNAUTHORIZED,
        )
    return user, None
