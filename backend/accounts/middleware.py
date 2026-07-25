"""Application-layer IP request throttle (anti-abuse / soft anti-DDoS)."""
import logging

from django.conf import settings
from django.core.cache import cache
from django.http import JsonResponse

logger = logging.getLogger(__name__)


def get_client_ip(request):
    """Prefer real client IP when behind Cloudflare / Render."""
    cf = request.META.get("HTTP_CF_CONNECTING_IP")
    if cf:
        return cf.strip()
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR") or "unknown"


class IPRateLimitMiddleware:
    """
    Limit total HTTP requests per client IP (anonymous / public traffic).

    Authenticated JWT requests are exempt — admin/staff dashboards poll heavily
    and mobile carrier CGNAT would otherwise false-positive with 429s.
    Abuse on auth'd routes is still covered by DRF UserRateThrottle.

    Defaults (overridable via settings):
      RATE_LIMIT_IP_REQUESTS = 1200
      RATE_LIMIT_IP_WINDOW = 60  (seconds)
    """

    SKIP_PREFIXES = (
        "/static/",
        "/media/",
        "/favicon.ico",
        "/health",
        "/healthz",
        "/api/health",
        # Auth must stay reachable from mobile (CORS preflight + login).
        "/api/auth/jwt/login/",
        "/api/auth/token/refresh/",
        "/api/auth/google/",
        "/api/auth/register/",
        "/api/auth/verify-email/",
        "/api/auth/resend-code/",
        "/api/auth/logout/",
        "/api/auth/orders",
        # Customer checkout path — cart/menu/ETA must stay reachable on shared mobile IPs.
        "/api/auth/cart",
        "/api/auth/menu",
        "/api/auth/eta",
        # Staff shift actions must not get blocked by kitchen/dashboard polling noise.
        "/api/auth/shift/",
        # Admin APIs are already JWT/role-gated.
        "/api/auth/admin/",
        "/api/auth/me/",
    )

    def __init__(self, get_response):
        self.get_response = get_response
        self.max_requests = int(getattr(settings, "RATE_LIMIT_IP_REQUESTS", 1200))
        self.window = int(getattr(settings, "RATE_LIMIT_IP_WINDOW", 60))

    def __call__(self, request):
        # Never throttle CORS preflight — browsers treat OPTIONS 429 as "Failed to fetch".
        if request.method == "OPTIONS":
            return self.get_response(request)

        # JWT sessions (admin/staff/customer) — do not compete on shared carrier IPs.
        auth = request.META.get("HTTP_AUTHORIZATION") or ""
        if auth.startswith("Bearer "):
            return self.get_response(request)

        path = request.path or ""
        if any(path.startswith(prefix) for prefix in self.SKIP_PREFIXES):
            return self.get_response(request)

        ip = get_client_ip(request)
        cache_key = f"rl:ip:{ip}"

        # First request in the window — set atomically.
        if cache.add(cache_key, 1, self.window):
            return self.get_response(request)

        try:
            count = cache.incr(cache_key)
        except ValueError:
            cache.set(cache_key, 1, self.window)
            count = 1

        if count > self.max_requests:
            logger.warning("ip_rate_limited ip=%s path=%s count=%s", ip, path, count)
            response = JsonResponse(
                {
                    "error": "Too many requests. Please slow down and try again shortly.",
                    "retry_after": self.window,
                },
                status=429,
            )
            response["Retry-After"] = str(self.window)
            return response

        return self.get_response(request)
