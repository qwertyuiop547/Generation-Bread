"""JWT auth for Channels WebSockets (query ?token=)."""
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from django.contrib.auth.models import AnonymousUser
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.tokens import AccessToken

from .models import CustomUser


@database_sync_to_async
def user_from_jwt(token: str):
    if not token:
        return AnonymousUser()
    try:
        access = AccessToken(token)
        user_id = access.get("user_id")
        return CustomUser.objects.get(id=user_id)
    except (InvalidToken, TokenError, CustomUser.DoesNotExist, Exception):
        return AnonymousUser()


class JwtAuthMiddleware(BaseMiddleware):
    """Populate scope['user'] from ?token=<access_jwt> on the WebSocket URL."""

    async def __call__(self, scope, receive, send):
        query = parse_qs((scope.get("query_string") or b"").decode())
        raw = query.get("token") or query.get("access_token") or [None]
        token = raw[0] if raw else None
        scope["user"] = await user_from_jwt(token)
        return await super().__call__(scope, receive, send)


def JwtAuthMiddlewareStack(inner):
    return JwtAuthMiddleware(inner)
