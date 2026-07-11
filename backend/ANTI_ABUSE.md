# Anti-abuse / soft anti-DDoS

This project includes **application-layer** protections. They slow brute-force,
registration spam, and API floods so the origin stays usable.

They do **not** stop large volumetric DDoS (Gbps). For that, put **Cloudflare**
(or another CDN/WAF) in front of the Django/Daphne service on Render.

## What the app enforces

| Layer | Default | Notes |
|-------|---------|--------|
| IP request throttle | 120 requests / 60s per IP | Middleware; returns HTTP 429 + `Retry-After` |
| Anonymous API | 90 / min | DRF `AnonRateThrottle` |
| Authenticated API | 180 / min | DRF `UserRateThrottle` |
| Login / JWT token | 5 / min | `/jwt/login/`, `/login/`, `/token/`, `/token/refresh/` |
| Register | 5 / hour | `/register/` |
| Resend / verify code | 3 / hour | `/resend-code/`, `/verify-email/` |
| Order create | 20 / min | `POST /orders/` |
| Payment set | 30 / min | `PATCH .../payment/` |
| Login lockout | 5 failures / 15 min | By email + IP; cleared on success |

Overrides via environment:

- `RATE_LIMIT_IP_REQUESTS`, `RATE_LIMIT_IP_WINDOW`
- `LOGIN_LOCKOUT_MAX_ATTEMPTS`, `LOGIN_LOCKOUT_WINDOW`
- `REDIS_URL` — use Redis cache so limits work across multiple instances
- `SECURE_SSL=1` or `DJANGO_DEBUG=false` — enable production TLS cookie / HSTS headers

Without `REDIS_URL`, Django uses in-process `LocMemCache` (fine for a single
local Daphne process).

## Auth hardening (JWT)

Staff/admin HTTP APIs require:

```http
Authorization: Bearer <access_token>
```

Role checks use the JWT user (`staff` / `admin`). Do **not** trust `admin_email` alone.

WebSockets require the same access token as a query param:

```
ws://host/ws/staff-orders/?token=<access_token>
ws://host/ws/orders/<email>/?token=<access_token>
```

Customer sockets only accept a token whose user email matches the URL email.
Kitchen sockets only accept `staff` or `admin` tokens.

## Production secrets

Copy `backend/.env.example` → `backend/.env` (gitignored). On Render, set the same
keys in the dashboard. Use `DJANGO_DEBUG=false` and a strong `DJANGO_SECRET_KEY`
in production. Rotate any secrets that were previously committed in source.

## Cloudflare (required for real DDoS)

1. Point the production domain to Cloudflare DNS (proxied / orange cloud).
2. Origin: Render web service running Daphne on `0.0.0.0:$PORT`.
3. Suggested rate-limit rules (Security → WAF / Rate limiting):
   - `/api/auth/jwt/login/`
   - `/api/auth/login/`
   - `/api/auth/register/`
   - `/api/auth/resend-code/`
   - `/api/auth/token/`
4. Enable Bot Fight Mode (Free) or Super Bot Fight (paid) if available.
5. Trust `X-Forwarded-For` / `X-Forwarded-Proto` (already handled when
   `SECURE_SSL` / production settings are on).

## Quick local check

```bash
# Burst login — expect 429 after throttle / lockout
for i in $(seq 1 8); do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:8000/api/auth/jwt/login/ \
    -H "Content-Type: application/json" \
    -d '{"email":"nobody@example.com","password":"wrong"}'
done
```

Normal staff/customer browsing should stay under the IP and anon limits.
