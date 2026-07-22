"""JWT auth that ignores bad/expired tokens instead of forcing 401.

AllowAny endpoints (e.g. order create) otherwise fail when the browser still
sends an expired Bearer token — DRF raises AuthenticationFailed before the view.
"""
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework.exceptions import AuthenticationFailed


class OptionalJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
        header = self.get_header(request)
        if header is None:
            return None
        try:
            return super().authenticate(request)
        except (InvalidToken, TokenError, AuthenticationFailed):
            return None
