#!/bin/sh
# Container entrypoint: wait for Postgres, apply migrations, seed demo data, then serve.
# A database hiccup must never crash-loop the whole service — /api/health/ already
# reports "degraded" when the database is unreachable.
set -u

PORT="${PORT:-8000}"
WAIT_ATTEMPTS="${DB_WAIT_ATTEMPTS:-10}"
WAIT_DELAY="${DB_WAIT_DELAY:-3}"

db_reachable() {
  python - <<'PY'
import os
import sys

import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'spylt_backend.settings')
try:
    django.setup()
    from django.db import connection

    connection.ensure_connection()
except Exception as exc:  # noqa: BLE001 - surface any connection problem
    print('database not ready: %s: %s' % (exc.__class__.__name__, exc), file=sys.stderr)
    sys.exit(1)
PY
}

attempt=1
ready=0
while [ "$attempt" -le "$WAIT_ATTEMPTS" ]; do
  if db_reachable; then
    ready=1
    echo "==> database reachable (attempt $attempt/$WAIT_ATTEMPTS)"
    break
  fi
  echo "==> database not reachable yet (attempt $attempt/$WAIT_ATTEMPTS); retrying in ${WAIT_DELAY}s"
  attempt=$((attempt + 1))
  sleep "$WAIT_DELAY"
done

if [ "$ready" -eq 1 ]; then
  if python manage.py migrate --noinput; then
    echo "==> migrations applied"
  else
    echo "!! migrate failed — starting the server anyway so /api/health/ can report degraded" >&2
  fi
else
  echo "!! database unreachable after ${WAIT_ATTEMPTS} attempts — starting the server anyway" >&2
fi

# Demo accounts/menu are convenience data: never let them take the service down.
if [ "${RUN_SEED_ON_BOOT:-1}" = "1" ]; then
  python seed_users.py || echo "!! seed_users failed (non-fatal)" >&2
  python seed_menu.py || echo "!! seed_menu failed (non-fatal)" >&2
fi

# `python -m daphne` avoids relying on the console-script shim being executable.
exec python -m daphne -b 0.0.0.0 -p "$PORT" spylt_backend.asgi:application
