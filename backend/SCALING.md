# Scaling Generation Bread for ~50k concurrent customers

## Honest capacity note

A **single** local Daphne process + InMemory channel layer **cannot** serve 50,000
simultaneous users. That target needs **horizontal scale**:

| Layer | Role at 50k concurrent |
|-------|-------------------------|
| Cloudflare (or CDN/WAF) | Absorbs bots / DDoS, caches static Next.js assets |
| Load balancer | Spreads HTTP + WS across many API instances |
| Daphne / ASGI × N | ~1–3k WebSockets per instance (tune with RAM) |
| Redis | Shared cache, rate limits, **Channels pub/sub** |
| PostgreSQL + pooler | Orders / users; use PgBouncer or managed pool |
| Next.js (separate) | Static/SSR front; scale independently |

Rough math (WebSocket-heavy day):

- 50,000 open customer sockets ÷ **2,500** per process ≈ **20** API instances  
- Plus kitchen/admin sockets (small) and HTTP bursts for menu/order  
- Redis memory: plan **≥ 1–2 GB** for channel fan-out + cache  
- Postgres: start with connection pooler; **max_connections** must cover  
  `instances × DB_CONN_MAX_AGE pool` (keep `DB_CONN_MAX_AGE` modest, e.g. 60)

HTTP-only browsing (few WebSockets) needs fewer instances, but peak order
moments still spike DB writes — load-test before a campaign.

## What this repo now includes

1. **`REDIS_URL`** → Redis cache + `channels_redis` channel layer (multi-instance WS)
2. **DB** `CONN_MAX_AGE` + `CONN_HEALTH_CHECKS` + optional `DATABASE_URL`
3. **Order indexes** for user/status/payment/archive query paths
4. **Menu response cache** (~30s) to cut hot read load
5. **WS soft caps** per process + global (`WS_MAX_CONNECTIONS_*`)
6. **`GET /api/health/`** for load balancer probes
7. **`docker-compose.yml`** (Postgres + Redis + scalable API)
8. **`render.yaml`** Blueprint (web ×2 + Redis + Postgres) — raise counts for 50k

## Required production checklist

1. Set `REDIS_URL` (mandatory for >1 API instance).
2. Set `DJANGO_DEBUG=false`, strong `DJANGO_SECRET_KEY`, real `DATABASE_URL`.
3. Put **Cloudflare** in front of API + frontend.
4. Run **multiple** Daphne containers (`0.0.0.0:$PORT`).
5. Use a **Postgres plan** with enough IOPS/connections; add **PgBouncer** if needed.
6. Host Next.js separately (Vercel/Render) with CDN caching for static assets.
7. Load-test: k6/Locust against login, menu, place-order, and WS connect.

## Env knobs

```bash
REDIS_URL=redis://...
DATABASE_URL=postgres://...
DB_CONN_MAX_AGE=60
WS_MAX_CONNECTIONS_PER_PROCESS=2500
WS_MAX_CONNECTIONS_GLOBAL=60000
MENU_CACHE_SECONDS=30
RATE_LIMIT_IP_REQUESTS=300   # raise carefully behind shared cafe Wi‑Fi / NAT
CHANNEL_CAPACITY=5000
```

## Local smoke

```bash
docker compose up -d postgres redis
# backend/.env
# REDIS_URL=redis://127.0.0.1:6379/0
pip install -r backend/requirements.txt
python backend/manage.py migrate
daphne -b 0.0.0.0 -p 8000 spylt_backend.asgi:application
curl http://127.0.0.1:8000/api/health/
```

## What “50k concurrent” does *not* mean

- Not 50k orders/second — that is a different (much harder) write-throughput target.
- Not free-tier Render — expect paid compute + Redis + Postgres.
- Not “one coffee shop Wi‑Fi” — 50k is national/app-scale concurrency.

When you are ready for a campaign or launch day, run a staged load test and
scale instance count until p95 latency and error rate stay within budget.
