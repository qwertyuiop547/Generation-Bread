"""Scoped DRF throttle classes for abuse-sensitive endpoints."""
from rest_framework.throttling import AnonRateThrottle, SimpleRateThrottle


class LoginRateThrottle(AnonRateThrottle):
    scope = "login"


class RegisterRateThrottle(AnonRateThrottle):
    scope = "register"


class ResendCodeRateThrottle(AnonRateThrottle):
    scope = "resend_code"


class OrderCreateRateThrottle(AnonRateThrottle):
    scope = "order_create"

    def allow_request(self, request, view):
        if getattr(request, "method", None) != "POST":
            return True
        return super().allow_request(request, view)


class PaymentRateThrottle(AnonRateThrottle):
    scope = "payment"


class VerifyEmailRateThrottle(AnonRateThrottle):
    scope = "resend_code"


class LoginScopedThrottle(SimpleRateThrottle):
    """Used on SimpleJWT token views (class-based)."""

    scope = "login"

    def get_cache_key(self, request, view):
        ident = self.get_ident(request)
        return self.cache_format % {"scope": self.scope, "ident": ident}
