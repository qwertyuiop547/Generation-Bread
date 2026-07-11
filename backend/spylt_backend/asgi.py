import os

from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.security.websocket import AllowedHostsOriginValidator

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'spylt_backend.settings')

django_asgi_app = get_asgi_application()

import accounts.routing
from accounts.ws_auth import JwtAuthMiddlewareStack

application = ProtocolTypeRouter({
    "http": django_asgi_app,
    "websocket": AllowedHostsOriginValidator(
        JwtAuthMiddlewareStack(
            URLRouter(
                accounts.routing.websocket_urlpatterns
            )
        )
    ),
})
