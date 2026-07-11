from channels.generic.websocket import AsyncWebsocketConsumer
import json

from .ws_limits import release_ws_slot, reserve_ws_slot


class OrderConsumer(AsyncWebsocketConsumer):
    """Per-customer order updates (dashboard / track). Requires JWT ?token=."""

    async def connect(self):
        user = self.scope.get("user")
        route_email = (self.scope.get("url_route") or {}).get("kwargs", {}).get("email") or ""
        route_email = route_email.strip().lower()

        if not user or not getattr(user, "is_authenticated", False):
            await self.close(code=4401)
            return

        user_email = (getattr(user, "email", None) or "").strip().lower()
        if not user_email or user_email != route_email:
            await self.close(code=4403)
            return

        if not await reserve_ws_slot():
            await self.close(code=1013)  # Try again later
            return
        self._ws_slot_held = True

        self.user_email = user_email
        self.group_name = f"user_orders_{user_email.replace('@', '_').replace('.', '_')}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        if getattr(self, "_ws_slot_held", False):
            await release_ws_slot()
            self._ws_slot_held = False
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def order_status_update(self, event):
        await self.send(
            text_data=json.dumps(
                {
                    "type": "order_status_update",
                    "order_id": event["order_id"],
                    "status": event["status"],
                    "rating": event.get("rating"),
                }
            )
        )

    async def order_payment_update(self, event):
        await self.send(
            text_data=json.dumps(
                {
                    "type": "order_payment_update",
                    "order_id": event["order_id"],
                    "payment_method": event.get("payment_method"),
                    "payment_status": event.get("payment_status"),
                    "status": event.get("status"),
                }
            )
        )


class StaffOrderConsumer(AsyncWebsocketConsumer):
    """Shared kitchen board for admin + staff — requires staff/admin JWT."""

    STAFF_GROUP = "orders"

    async def connect(self):
        user = self.scope.get("user")
        if not user or not getattr(user, "is_authenticated", False):
            await self.close(code=4401)
            return
        if getattr(user, "role", None) not in ("admin", "staff"):
            await self.close(code=4403)
            return

        if not await reserve_ws_slot():
            await self.close(code=1013)
            return
        self._ws_slot_held = True

        await self.channel_layer.group_add(self.STAFF_GROUP, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        if getattr(self, "_ws_slot_held", False):
            await release_ws_slot()
            self._ws_slot_held = False
        await self.channel_layer.group_discard(self.STAFF_GROUP, self.channel_name)

    async def order_update(self, event):
        message = event.get("message") or {}
        await self.send(
            text_data=json.dumps(
                {
                    "type": "order_update",
                    **message,
                }
            )
        )

    async def order_status_update(self, event):
        await self.send(
            text_data=json.dumps(
                {
                    "type": "order_status_update",
                    "order_id": event["order_id"],
                    "status": event["status"],
                    "rating": event.get("rating"),
                }
            )
        )
