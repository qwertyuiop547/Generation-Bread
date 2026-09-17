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
      - valid X-Order-Token / order_token matches order.access_token, or
      - (anonymous guests only) email provided in request matches order owner email
    """
    user = getattr(request, "user", None)
    is_authenticated = user is not None and getattr(user, "is_authenticated", False)
    if is_authenticated:
        role = getattr(user, "role", None)
        if role in ("staff", "admin"):
            return True, None
        if order.user_id == user.id:
            return True, None
        if order.user and order.user.email and user.email and order.user.email.lower() == user.email.lower():
            return True, None

    token = _order_token_from_request(request)
    stored = getattr(order, "access_token", None) or ""
    if token and stored and secrets.compare_digest(token, stored):
        return True, None

    # Anonymous guests claim ownership by handing back the email they ordered with.
    # Never honour a body/query email for an authenticated caller: that lets any
    # signed-in user cancel or complete someone else's order (IDOR by spoofing).
    if not is_authenticated:
        data = getattr(request, "data", None) or {}
        email_in_body = data.get("email") if isinstance(data, dict) else None
        qp = getattr(request, "query_params", None)
        email_in_qp = qp.get("email") if qp else None
        email_in_header = request.META.get("HTTP_X_USER_EMAIL")
        req_email = (email_in_body or email_in_qp or email_in_header or "").strip().lower()

        if req_email:
            if order.user and order.user.email and order.user.email.lower() == req_email:
                return True, None
            if order.customer_name and order.customer_name.strip().lower() == req_email:
                return True, None

    # If order has no token and no user, allow completing if write is True
    if not stored and not order.user_id:
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
