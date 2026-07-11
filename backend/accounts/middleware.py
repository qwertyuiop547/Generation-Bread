"""Application-layer IP request throttle (anti-abuse / soft anti-DDoS)."""
from django.conf import settings
from django.core.cache import cache
from django.http import JsonResponse


def get_client_ip(request):
    """Prefer first X-Forwarded-For hop when behind Cloudflare / Render."""
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR") or "unknown"


class IPRateLimitMiddleware:
    """
    Limit total HTTP requests per client IP.

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
    )

    def __init__(self, get_response):
        self.get_response = get_response
        self.max_requests = int(getattr(settings, "RATE_LIMIT_IP_REQUESTS", 120))
        self.window = int(getattr(settings, "RATE_LIMIT_IP_WINDOW", 60))

    def __call__(self, request):
        path = request.path or ""
        if any(path.startswith(prefix) for prefix in self.SKIP_PREFIXES):
            return self.get_response(request)

        ip = get_client_ip(request)
        cache_key = f"rl:ip:{ip}"
        count = cache.get(cache_key)

        if count is None:
            cache.set(cache_key, 1, self.window)
        elif count >= self.max_requests:
            response = JsonResponse(
                {
                    "error": "Too many requests. Please slow down and try again shortly.",
                    "retry_after": self.window,
                },
                status=429,
            )
            response["Retry-After"] = str(self.window)
            return response
        else:
            try:
                cache.incr(cache_key)
            except ValueError:
                cache.set(cache_key, count + 1, self.window)

        return self.get_response(request)
