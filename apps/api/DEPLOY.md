# Deploying the API (backend + PDF)

The backend runs as a persistent Node service, which is what lets Puppeteer
keep a warm Chromium and print in ~1-2s. Do **not** deploy it to a serverless
platform (Vercel functions, Cloudflare Workers) - Chromium does not fit and
there is no warm browser.

## Recommended: Render (Docker)

1. Push this repo to GitHub.
2. Render → **New → Blueprint**, select the repo. It reads `render.yaml`.
3. Set the two secrets it asks for:
   - `MONGODB_URI` - the MongoDB Atlas connection string
   - `ALLOWED_ORIGINS` - the frontend URL, e.g. `https://junaidi.vercel.app`
   (`JWT_SECRET` is generated for you.)
4. Deploy. First build takes several minutes (it downloads Chromium).
5. Check `https://<service>.onrender.com/api/health` — it must report
   `"chromium": "Chromium ready ..."`, not an error.

**Plan:** Starter ($7/mo), not Free. Free sleeps after 15 min idle and the next
request pays a ~50s cold start. Staff would hit that every morning.

## Seeding the database (once)

From a machine with the repo and `MONGODB_URI` pointing at Atlas:

```bash
cd apps/api
MONGODB_URI="<atlas-uri>" \
SEED_ADMIN_EMAIL="admin@junaidi.com" \
SEED_ADMIN_PASSWORD="<a-strong-password>" \
pnpm --filter @junaidi/db seed
```

This loads the date blocks, hotels, Mina tiers, services, the 1448 calendar and
placeholder rates, and creates the first admin. **Rates are placeholders — set
the real ones in the admin panel before quoting a customer.**

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `MONGODB_URI` | yes | Atlas connection string |
| `JWT_SECRET` | yes | ≥ 32 chars; the API refuses to start without it |
| `ALLOWED_ORIGINS` | yes | Comma-separated frontend origins for CORS |
| `PORT` | no | Render sets this; defaults to 10000 in Docker |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | seed only | first admin account |

## Building the image locally

```bash
# from the monorepo root (web/)
docker build -f apps/api/Dockerfile -t junaidi-api .
docker run -p 10000:10000 \
  -e MONGODB_URI="mongodb://host.docker.internal:27017/junaidi" \
  -e JWT_SECRET="at-least-32-characters-of-secret-value" \
  -e ALLOWED_ORIGINS="http://localhost:3000" \
  junaidi-api
```

## Why not cPanel

The client's cPanel is shared hosting: no root, so Chromium's system libraries
cannot be installed, and the memory ceiling is too low for it. PDF generation
will not run there. Host the backend on Render (or any VPS with Docker) and
point the frontend at it.

## Keeping it awake (optional)

On a plan that can idle, ping `GET /api/health?deep=false` every few minutes
from an uptime monitor so the first real request is never the cold one.
