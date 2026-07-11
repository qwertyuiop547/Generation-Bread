# Deploy Generation Bread on Render

## Prerequisites
1. GitHub account + new empty repo (e.g. `generation-bread`)
2. Render account: https://dashboard.render.com
3. This project pushed to that GitHub repo (with `render.yaml` on `main`)

## One-time push (from this folder)

```powershell
cd "c:\Users\alice\OneDrive\Documents\Project Prototype"
git add render.yaml backend frontend docker-compose.yml
git commit -m "Add Render Blueprint for API, web, Postgres, and Redis"
git branch -M main
git remote add origin https://github.com/<YOUR_USER>/<YOUR_REPO>.git
git push -u origin main
```

(Skip files you do not want public: `.env`, secrets, large `tmp/` / `output/`.)

## Deploy Blueprint

1. Open:  
   `https://dashboard.render.com/blueprint/new?repo=https://github.com/<YOUR_USER>/<YOUR_REPO>`
2. Connect GitHub if prompted
3. Fill secrets marked **sync: false**:
   - **API:** `DJANGO_ALLOWED_HOSTS` (temporary: `*` then tighten), `CORS_ALLOWED_ORIGINS`, `CSRF_TRUSTED_ORIGINS`, optional email vars
   - After first deploy, set CORS/CSRF to your web URL, e.g. `https://generation-bread-web.onrender.com`
4. Click **Apply**

## After first deploy

1. Copy API URL → e.g. `https://generation-bread-api.onrender.com`
2. Copy Web URL → e.g. `https://generation-bread-web.onrender.com`
3. Set on **API** service:
   - `DJANGO_ALLOWED_HOSTS` = `generation-bread-api.onrender.com`
   - `CORS_ALLOWED_ORIGINS` = `https://generation-bread-web.onrender.com`
   - `CSRF_TRUSTED_ORIGINS` = `https://generation-bread-web.onrender.com`
4. Confirm `NEXT_PUBLIC_API_BASE_URL` on **web** points at the API URL
5. Hit `https://generation-bread-api.onrender.com/api/health/` → should return `ok`
6. Open the web URL and log in with your demo accounts

## Free plan notes
- Web services **spin down** after ~15 min idle (cold start)
- Free Postgres **expires after 30 days** — upgrade before production
- For real traffic / 50k path: upgrade API + Redis + Postgres (see `backend/SCALING.md`)

## Upgrade later
In Dashboard → change plans / instance count on `generation-bread-api`, Redis, and Postgres.
