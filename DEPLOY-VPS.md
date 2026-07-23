# Deploying to a single Contabo VPS

Frontend, backend and database — all three on one VPS.

This runbook targets a fresh **Ubuntu 22.04 or 24.04** Contabo VPS. Everything is
served behind one domain: nginx sends `/api/...` to the backend and everything
else to the frontend, so there is no cross-origin (CORS) complication.

```
                    ┌────────────────────────────────────────────┐
   Internet ──443──▶│ nginx (reverse proxy, SSL)                  │
                    │   /api/*  ─▶ 127.0.0.1:4000  (backend, PDF) │
                    │   /*      ─▶ 127.0.0.1:3000  (frontend)     │
                    │                 backend ─▶ 127.0.0.1:27017  │
                    │                            (MongoDB, local) │
                    └────────────────────────────────────────────┘
```

What runs where:

| Piece | Port | Notes |
|---|---|---|
| Frontend (`apps/web`) | 3000 | Next.js. Talks to the API in the browser. |
| Backend (`apps/api`) | 4000 | Next.js API + Puppeteer/Chromium for PDFs. |
| MongoDB | 27017 | Bound to localhost only — never exposed. |

**Minimum server:** 2 vCPU / 4 GB RAM. Chromium is the memory hog; below 2 GB
PDF rendering gets killed under load. Most Contabo VPS plans exceed this easily.

> **Before you start**, point a domain (e.g. `quote.junaidi.com`) at the VPS
> IP with an **A record**. SSL needs it. If you have no domain yet you can use
> the raw IP over plain HTTP — see the note in Part 8.

Throughout, replace:
- `quote.junaidi.com` → your domain
- `deploy` → your Linux username
- passwords/secrets → your own

---

## Part 1 — Log in and secure the box

SSH in as root (Contabo emails you the IP and root password):

```bash
ssh root@YOUR_VPS_IP
```

Update, then create a non-root user with sudo (don't run the app as root):

```bash
apt update && apt -y upgrade
adduser deploy
usermod -aG sudo deploy
```

Firewall — allow SSH and web only. **Do not** open 3000, 4000 or 27017; they
stay on localhost behind nginx:

```bash
apt -y install ufw
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw --force enable
```

If the VPS has less than 4 GB RAM, add 2 GB of swap so a Chromium spike never
OOM-kills the process:

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile
mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

From here on, work as `deploy`:

```bash
su - deploy
```

---

## Part 2 — Install Node 22 and pnpm

The project needs **Node ≥ 22.17** and **pnpm 9** (lockfile v9).

```bash
# Node 22 from NodeSource
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt -y install nodejs

# pnpm via corepack (ships with Node)
sudo corepack enable
corepack prepare pnpm@9 --activate

node -v      # v22.x
pnpm -v      # 9.x
```

---

## Part 3 — Install MongoDB (with a password)

```bash
# MongoDB 7.0 official repo
curl -fsSL https://pgp.mongodb.com/server-7.0.asc | \
  sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu $(lsb_release -cs)/mongodb-org/7.0 multiverse" | \
  sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt update
sudo apt -y install mongodb-org

sudo systemctl enable --now mongod
```

Create an application user (choose a strong password):

```bash
mongosh
```

```javascript
use admin
db.createUser({
  user: "junaidiApp",
  pwd: "CHANGE_ME_strong_db_password",
  roles: [{ role: "readWrite", db: "junaidi" }]
})
exit
```

Turn on authentication — edit `/etc/mongod.conf` and add (or uncomment):

```yaml
security:
  authorization: enabled
```

`net.bindIp` should stay `127.0.0.1` (the default) so Mongo is never reachable
from the internet. Then restart:

```bash
sudo systemctl restart mongod
```

Your connection string (used in the next part) is:

```
mongodb://junaidiApp:CHANGE_ME_strong_db_password@127.0.0.1:27017/junaidi?authSource=admin
```

---

## Part 4 — Install Chromium's system libraries

Puppeteer downloads its **own** Chromium during `pnpm install`, but that
Chromium still needs shared libraries present on the OS. Missing these is the
classic "works locally, prints nothing on the server" failure.

**Ubuntu 22.04:**

```bash
sudo apt -y install \
  ca-certificates fonts-liberation \
  libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
  libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
  libgbm1 libpango-1.0-0 libcairo2 libasound2 libatspi2.0-0 libx11-6 \
  libxcb1 libxext6 libxi6 libglib2.0-0
```

**Ubuntu 24.04:** same command, but replace `libasound2` with `libasound2t64`.

We verify Chromium actually works later, via the health check.

---

## Part 5 — Get the code onto the VPS

The repo lives in the `web/` folder of the project. Put it at
`/home/deploy/junaidi`.

**Option A — from your Git remote** (recommended if you keep the source in a
private repo):

```bash
cd ~
git clone git@github.com:YOU/junaidi.git junaidi
```

**Option B — copy from your machine** (run this on your PC, not the VPS):

```bash
# from the folder that contains "web/"
rsync -av --exclude node_modules --exclude .next \
  ./web/  deploy@YOUR_VPS_IP:/home/deploy/junaidi/web/
```

Either way you should end up with the monorepo at
`/home/deploy/junaidi/web` (containing `apps/`, `packages/`, `pnpm-workspace.yaml`).

---

## Part 6 — Configuration (.env files)

Two files. **Order matters:** the frontend bakes its API URL in at *build* time,
so this must be set before Part 7.

Generate a JWT secret first:

```bash
openssl rand -base64 48
```

**Backend** — `/home/deploy/junaidi/web/apps/api/.env.local`:

```ini
MONGODB_URI=mongodb://junaidiApp:CHANGE_ME_strong_db_password@127.0.0.1:27017/junaidi?authSource=admin
JWT_SECRET=paste-the-openssl-output-here-at-least-32-chars
ALLOWED_ORIGINS=https://quote.junaidi.com

# Used only by the seed command in Part 8:
SEED_ADMIN_EMAIL=admin@junaidi.com
SEED_ADMIN_PASSWORD=CHANGE_ME_strong_admin_password
```

**Frontend** — `/home/deploy/junaidi/web/apps/web/.env.local`:

```ini
# Same origin as the site: nginx routes /api to the backend, so no CORS.
NEXT_PUBLIC_API_URL=https://quote.junaidi.com
```

> Using the IP instead of a domain? Set both to `http://YOUR_VPS_IP` here, and
> follow the HTTP-only note in Part 8.

---

## Part 7 — Install, build, seed

```bash
cd /home/deploy/junaidi/web

pnpm install --frozen-lockfile     # also downloads Chromium
pnpm build                         # builds all packages + both apps
```

The web build inlines `NEXT_PUBLIC_API_URL`, which is why the `.env.local` had
to exist first. If you ever change that URL, you must rebuild the frontend.

---

## Part 8 — Seed the database (once)

Loads the date blocks, hotels, Mina tiers, services, the 1448 calendar and
**placeholder** rates, and creates the first admin from the `SEED_ADMIN_*`
values in `apps/api/.env.local`:

```bash
cd /home/deploy/junaidi/web
pnpm --filter @junaidi/db seed
```

You should see counts printed and `adminEmail` set to your admin email.

> **Rates are placeholders.** Log in as admin and set the real negotiated block
> rates (and flight fares) on the Rates and Flights pages before quoting a real
> customer.

---

## Part 9 — Run both apps with pm2

pm2 keeps both Next apps alive and restarts them on reboot.

```bash
sudo npm install -g pm2
```

Create `/home/deploy/junaidi/web/ecosystem.config.js`:

```javascript
module.exports = {
  apps: [
    {
      name: "junaidi-api",
      cwd: "/home/deploy/junaidi/web/apps/api",
      script: "pnpm",
      args: "start",
      env: { NODE_ENV: "production", PORT: "4000" },
    },
    {
      name: "junaidi-web",
      cwd: "/home/deploy/junaidi/web/apps/web",
      script: "pnpm",
      args: "start",
      env: { NODE_ENV: "production", PORT: "3000" },
    },
  ],
};
```

Start them, then make it survive reboots:

```bash
cd /home/deploy/junaidi/web
pm2 start ecosystem.config.js
pm2 save
pm2 startup            # prints one `sudo ...` line — run it
```

Quick local check (still on the VPS):

```bash
curl -s http://127.0.0.1:4000/api/health
```

It must report `"chromium": "Chromium ready ..."`. If it shows a Chromium error
instead, jump to **Troubleshooting** below before going further.

---

## Part 10 — nginx reverse proxy

```bash
sudo apt -y install nginx
```

Create `/etc/nginx/sites-available/junaidi`:

```nginx
server {
    listen 80;
    server_name quote.junaidi.com;

    # PDF rendering can take a few seconds; give the proxy room.
    proxy_read_timeout 90s;
    proxy_send_timeout 90s;
    client_max_body_size 10m;

    # Backend: everything under /api goes to the API service.
    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Frontend: everything else.
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable it:

```bash
sudo ln -s /etc/nginx/sites-available/junaidi /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

At this point `http://quote.junaidi.com` should load the login page.

> **No domain / IP only:** put `server_name _;` in the config, skip Part 11, and
> reach the app at `http://YOUR_VPS_IP`. Remember the two `.env.local` URLs must
> then be `http://YOUR_VPS_IP`, and the frontend rebuilt (`pnpm --filter
> @junaidi/web build` + `pm2 restart junaidi-web`).

---

## Part 11 — HTTPS with Let's Encrypt

```bash
sudo apt -y install certbot python3-certbot-nginx
sudo certbot --nginx -d quote.junaidi.com
```

Certbot edits the nginx config to add SSL and sets up auto-renewal. Choose
"redirect HTTP to HTTPS" when asked.

---

## Part 12 — Final verification

1. **Health** (from anywhere):
   ```bash
   curl -s https://quote.junaidi.com/api/health
   ```
   Expect `"ok": true`, `"database": "connected"`, `"chromium": "Chromium ready ..."`.

2. Open `https://quote.junaidi.com`, log in with the seeded admin.

3. Build a quotation and download its **PDF** — this exercises Chromium end to
   end. If the PDF downloads, the whole stack is live.

---

## Updating later

After changing the code:

```bash
cd /home/deploy/junaidi/web
git pull                       # or rsync again
pnpm install --frozen-lockfile
pnpm build
pm2 restart junaidi-api junaidi-web
```

If you only changed the backend, restarting `junaidi-api` is enough. Any change
to `NEXT_PUBLIC_API_URL` requires a frontend rebuild.

---

## Troubleshooting

**Health shows a Chromium error / PDF fails.** A shared library is missing. Find
which one:

```bash
CHROME=$(find ~/.cache/puppeteer -name chrome -type f | head -1)
ldd "$CHROME" | grep "not found"
```

`apt install` the package that provides each missing `.so`, then
`pm2 restart junaidi-api`.

**`pnpm install` fails unzipping Chromium.** Install an extractor and retry:
`sudo apt -y install unzip`.

**API won't start, logs mention JWT_SECRET.** It must be ≥ 32 characters. Check
`apps/api/.env.local`, then `pm2 restart junaidi-api`.

**502 Bad Gateway.** A Next app isn't up. `pm2 status`, then
`pm2 logs junaidi-api` / `pm2 logs junaidi-web`.

**Login works but every API call fails with a CORS error.** `ALLOWED_ORIGINS`
in `apps/api/.env.local` doesn't match the site origin exactly (scheme + host).
Fix it and `pm2 restart junaidi-api`. (With the single-domain nginx setup above,
requests are same-origin and this shouldn't happen.)

**Watch resource use** while a PDF renders: `pm2 monit`. Sustained OOM kills mean
add more swap or a bigger plan.

---

## Backups (recommended)

A nightly dump, kept 14 days:

```bash
mkdir -p /home/deploy/backups
crontab -e
```

```cron
0 2 * * * mongodump --uri="mongodb://junaidiApp:CHANGE_ME_strong_db_password@127.0.0.1:27017/junaidi?authSource=admin" --archive=/home/deploy/backups/junaidi-$(date +\%F).gz --gzip && find /home/deploy/backups -name 'junaidi-*.gz' -mtime +14 -delete
```

Copy these off the VPS periodically (they hold every quotation and rate).
