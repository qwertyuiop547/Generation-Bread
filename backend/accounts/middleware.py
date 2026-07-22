"""Application-layer IP request throttle (anti-abuse / soft anti-DDoS)."""
import logging

from django.conf import settings
from django.core.cache import cache
from django.http import JsonResponse

logger = logging.getLogger(__name__)


def get_client_ip(request):
    """Prefer first X-Forwarded-For hop when behind Cloudflare / Render."""
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR") or "unknown"


class IPRateLimitMiddleware:
    """
    Limit total HTTP requests per client IP.

    Uses cache.add + incr so counters stay mostly race-safe under concurrency.
    Defaults (overridable via settings):
      RATE_LIMIT_IP_REQUESTS = 120
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
        "/api/auth/admin/orders",
        "/api/auth/orders",
        # Staff shift actions must not get blocked by kitchen/dashboard polling noise.
        "/api/auth/shift/",
    )

    def __init__(self, get_response):
        self.get_response = get_response
        self.max_requests = int(getattr(settings, "RATE_LIMIT_IP_REQUESTS", 120))
        self.window = int(getattr(settings, "RATE_LIMIT_IP_WINDOW", 60))

    def __call__(self, request):
        # Never throttle CORS preflight — browsers treat OPTIONS 429 as "Failed to fetch".
        if request.method == "OPTIONS":
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
