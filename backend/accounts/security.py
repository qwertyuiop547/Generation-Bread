"""Login lockout helpers (failed attempts by email + IP)."""
from django.conf import settings
from django.core.cache import cache

from .middleware import get_client_ip


def _lockout_max_attempts():
    return int(getattr(settings, "LOGIN_LOCKOUT_MAX_ATTEMPTS", 5))


def _lockout_window():
    return int(getattr(settings, "LOGIN_LOCKOUT_WINDOW", 900))  # 15 minutes


def _attempt_key(email, ip):
    return f"login:fail:{email.strip().lower()}:{ip}"


def _lock_key(email, ip):
    return f"login:lock:{email.strip().lower()}:{ip}"


def is_login_locked(request, email):
    if not email:
        return False, 0
    ip = get_client_ip(request)
    lock_key = _lock_key(email, ip)
    if not cache.get(lock_key):
        return False, 0
    remaining = None
    ttl_fn = getattr(cache, "ttl", None)
    if callable(ttl_fn):
        try:
            remaining = ttl_fn(lock_key)
        except Exception:
            remaining = None
    return True, max(int(remaining or _lockout_window()), 1)


def record_login_failure(request, email):
    if not email:
        return False, 0
    ip = get_client_ip(request)
    window = _lockout_window()
    key = _attempt_key(email, ip)
    count = cache.get(key)
    if count is None:
        cache.set(key, 1, window)
        count = 1
    else:
        try:
            count = cache.incr(key)
        except ValueError:
            count = count + 1
            cache.set(key, count, window)

    if count >= _lockout_max_attempts():
        cache.set(_lock_key(email, ip), True, window)
        cache.delete(key)
        return True, window
    return False, 0


def clear_login_failures(request, email):
    if not email:
        return
    ip = get_client_ip(request)
    cache.delete(_attempt_key(email, ip))
    cache.delete(_lock_key(email, ip))
