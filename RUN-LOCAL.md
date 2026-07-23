# Running locally

Everything is already set up on this machine — MongoDB is running, the database
is seeded, and the `.env.local` files exist. You only need two terminals.

## One-time (already done)

- MongoDB running on `localhost:27017` ✅
- Dependencies installed (`pnpm install`) ✅
- Database seeded with the 1448 season + an admin account ✅

## Every time — start the two servers

Open **two terminals**, both in `c:\Code\Junaidi\web`.

**Terminal 1 — the API (backend + PDF):**
```
pnpm dev:api
```
Runs on http://localhost:4000

**Terminal 2 — the web app:**
```
pnpm dev:web
```
Runs on http://localhost:3000

Then open **http://localhost:3000** in your browser.

## Log in

| | |
|---|---|
| Email | `admin@junaidi.local` |
| Password | `admin12345` |

## Notes

- The rates loaded are **placeholders**. Set the real ones in **Rates** before
  quoting anyone.
- Stop a server with `Ctrl + C` in its terminal.
- To wipe and re-seed the database (creates the admin again):
  ```
  pnpm seed
  ```
  (The admin is only created if it doesn't already exist.)

## If something doesn't work

- **Login fails / "cannot reach server"** → is Terminal 1 (`pnpm dev:api`)
  running? It must be up before the web app can talk to it.
- **MongoDB errors** → check the `MongoDB` service is running
  (Services app, or `Get-Service MongoDB` in PowerShell).
- **Port already in use** → an old server is still running; close it or restart
  the machine.
