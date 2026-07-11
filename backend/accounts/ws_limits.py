"""WebSocket connection accounting for high-concurrency soft caps."""
from asgiref.sync import sync_to_async
from django.conf import settings
from django.core.cache import cache

_process_connections = 0


def _process_limit():
    return int(getattr(settings, "WS_MAX_CONNECTIONS_PER_PROCESS", 2500))


def _global_limit():
    return int(getattr(settings, "WS_MAX_CONNECTIONS_GLOBAL", 60000))


def reserve_ws_slot_sync():
    """Return True if connection is allowed; increments counters."""
    global _process_connections
    if _process_connections >= _process_limit():
        return False

    global_key = "ws:connections:global"
    current = cache.get(global_key)
    if current is None:
        cache.set(global_key, 0, timeout=None)
        current = 0
    if int(current) >= _global_limit():
        return False

    try:
        cache.incr(global_key)
    except ValueError:
        cache.set(global_key, int(current) + 1, timeout=None)

    _process_connections += 1
    return True


def release_ws_slot_sync():
    global _process_connections
    if _process_connections > 0:
        _process_connections -= 1
    global_key = "ws:connections:global"
    try:
        val = cache.decr(global_key)
        if val < 0:
            cache.set(global_key, 0, timeout=None)
    except ValueError:
        pass


reserve_ws_slot = sync_to_async(reserve_ws_slot_sync, thread_sensitive=True)
release_ws_slot = sync_to_async(release_ws_slot_sync, thread_sensitive=True)
