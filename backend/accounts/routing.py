from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(
        r"ws/orders/(?P<email>[\w.%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/$",
        consumers.OrderConsumer.as_asgi(),
    ),
    re_path(r"ws/staff-orders/$", consumers.StaffOrderConsumer.as_asgi()),
]
