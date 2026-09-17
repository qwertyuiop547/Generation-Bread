"""Security event logging for ops / audit."""
from __future__ import annotations

import logging

logger = logging.getLogger("accounts.security")


def log_security_event(event_type: str, *, request=None, user=None, detail: str | None = None) -> None:
    ip = ""
    if request is not None:
        try:
            from .middleware import get_client_ip

            ip = get_client_ip(request)
        except Exception:
            ip = request.META.get("REMOTE_ADDR", "") if hasattr(request, "META") else ""
    user_label = ""
    if user is not None:
        user_label = getattr(user, "email", None) or str(getattr(user, "id", ""))
    logger.warning(
        "security_event type=%s ip=%s user=%s detail=%s",
        event_type,
        ip,
        user_label,
        (detail or "")[:200],
    )
    try:
        from .models import SecurityEvent

        SecurityEvent.objects.create(
            event_type=event_type[:64],
            detail=(detail or "")[:255],
            ip_address=ip or None,
            user=user if getattr(user, "pk", None) else None,
        )
    except Exception:
        # Never break the request path because audit write failed
        logger.exception("security_event_persist_failed type=%s", event_type)
