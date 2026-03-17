# SpacerQuest v4.0 — Railway Deployment Runbook

## Architecture Overview

Railway hosts four services from one project:

| Service | Type | Purpose |
|---|---|---|
| **spacerquest-app** | Docker (your Dockerfile) | Fastify API + React SPA + WebSocket on port 3000 |
| **spacerquest-worker** | Docker (same image, different CMD) | Background jobs: daily tick, encounters, missions |
| **PostgreSQL** | Railway plugin | Game database (managed, auto-backups) |
| **Redis** | Railway plugin | Pub/sub for real-time events |

The Dockerfile produces a single image that serves both the API and the pre-built React frontend as static files. The worker reuses the same image with an overridden start command.

---

## Prerequisites

1. A [Railway](https://railway.app) account (GitHub-linked recommended)
2. Railway CLI installed: `npm i -g @railway/cli`
3. Logged in: `railway login`

---

## Step 1: Create the Railway Project

```bash
cd spacerquest-web

# Create a new Railway project
railway init
# Name it: spacerquest
```

---

## Step 2: Add PostgreSQL and Redis

From the Railway dashboard (or CLI):

```bash
# Add managed PostgreSQL
railway add --plugin postgresql

# Add managed Redis
railway add --plugin redis
```

Railway automatically injects `DATABASE_URL` and `REDIS_URL` into your services.

---

## Step 3: Configure Environment Variables

In the Railway dashboard, go to your **app service** → Variables tab. Set:

```
NODE_ENV=production
PORT=3000
JWT_SECRET=<generate a 64-char random string>

# OAuth — see "OAuth Setup" section below
BBS_PORTAL_CLIENT_ID=<your-client-id>
BBS_PORTAL_CLIENT_SECRET=<your-client-secret>
BBS_PORTAL_AUTH_URL=<provider-authorize-url>
BBS_PORTAL_TOKEN_URL=<provider-token-url>
BBS_PORTAL_CALLBACK_URL=https://<your-railway-domain>/auth/callback
BBS_PORTAL_USERINFO_URL=<provider-userinfo-url>
```

Generate a JWT secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Railway auto-provides `DATABASE_URL` and `REDIS_URL` from the plugins — do not set these manually.

---

## Step 4: Deploy the App Service

```bash
# Link to the app service
railway link

# Deploy (builds Dockerfile, runs migrations on startup, starts server)
railway up
```

The Dockerfile CMD runs `npx prisma migrate deploy` before starting the server, so schema migrations apply automatically on each deploy.

---

## Step 5: Deploy the Worker Service

In the Railway dashboard:
1. Click **+ New Service** → **From Repo** (same repo)
2. Name it `spacerquest-worker`
3. Set the **Start Command** override to:
   ```
   sh -c "npx prisma migrate deploy && node dist/jobs/worker.js"
   ```
4. Add the same env vars (Railway lets you reference shared variables from the plugins)
5. Deploy

The worker runs three scheduled jobs:
- **Daily tick** (midnight UTC): trip resets, port income, NPC bulletin posts
- **Encounter generation** (every 5 min): bot combats, alliance takeover attempts
- **Mission generation** (every 6 hours): patrol missions, nemesis offers

---

## Step 6: Seed the Database (First Deploy Only)

After the first deploy, seed the 28 star systems and NPC roster:

```bash
# Open a shell in the running app service
railway run npx prisma db seed
```

This populates `StarSystem` (28 systems) and `NpcRoster` (65+ NPCs).

---

## Step 7: Generate a Public Domain

```bash
railway domain
```

This gives you a `*.up.railway.app` URL. Update `BBS_PORTAL_CALLBACK_URL` to match:
```
https://spacerquest-app-production.up.railway.app/auth/callback
```

You can also add a custom domain in the Railway dashboard under Settings → Domains.

---

## OAuth Setup

The app uses generic OAuth 2.0. Here are setup instructions for common providers:

### Option A: GitHub OAuth
1. Go to GitHub → Settings → Developer Settings → OAuth Apps → New
2. Set **Homepage URL**: `https://<your-railway-domain>`
3. Set **Authorization callback URL**: `https://<your-railway-domain>/auth/callback`
4. Copy Client ID and Client Secret
5. Set env vars:
   ```
   BBS_PORTAL_CLIENT_ID=<github-client-id>
   BBS_PORTAL_CLIENT_SECRET=<github-client-secret>
   BBS_PORTAL_AUTH_URL=https://github.com/login/oauth/authorize
   BBS_PORTAL_TOKEN_URL=https://github.com/login/oauth/access_token
   BBS_PORTAL_CALLBACK_URL=https://<your-railway-domain>/auth/callback
   BBS_PORTAL_USERINFO_URL=https://api.github.com/user
   ```

> **Note**: The auth callback (`src/app/routes/auth.ts`) expects userinfo to return `{ id, email, displayName }`. GitHub returns `{ id, email, login }`. You may need to map `login` → `displayName` in the auth route, or use a different provider whose userinfo response matches. See the "Provider Compatibility" section below.

### Option B: Skip OAuth for Now (Demo Mode)
For initial testing, set `NODE_ENV=development` (or omit the `BBS_PORTAL_*` vars) and the app uses mock OAuth with auto-generated dev users. The `/auth/dev-login` endpoint provides instant access.

### Provider Compatibility
The auth callback at `src/app/routes/auth.ts` expects the userinfo endpoint to return:
```json
{ "id": "unique-id", "email": "user@example.com", "displayName": "User Name" }
```
If your OAuth provider returns different field names, update the destructuring in the auth callback to map them.

---

## Post-Deploy Verification

```bash
# Health check
curl https://<your-railway-domain>/health
# Expected: {"status":"ok","timestamp":"...","version":"4.0.0"}

# API docs
open https://<your-railway-domain>/docs

# Check logs
railway logs
```

---

## Monitoring & Operations

### Viewing Logs

```bash
# App logs
railway logs -s spacerquest-app

# Worker logs
railway logs -s spacerquest-worker
```

### Database Access

```bash
# Open a psql shell
railway connect postgresql

# Or run Prisma Studio (local, connects to Railway DB)
DATABASE_URL=$(railway variables get DATABASE_URL) npx prisma studio
```

### Backups

Railway's managed PostgreSQL includes automatic daily backups. For manual backups:

```bash
# Dump the database
railway run pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql

# Restore from backup
railway run psql $DATABASE_URL < backup-20260317.sql
```

### Scaling

Railway supports horizontal scaling via replicas in the dashboard:
- **App**: Can run multiple replicas (stateless HTTP + WebSocket with Redis pub/sub)
- **Worker**: Run only **one** replica to avoid duplicate job execution
- **PostgreSQL**: Scales vertically (Railway manages this)
- **Redis**: Scales vertically (Railway manages this)

---

## Redeploying

```bash
# From spacerquest-web directory
railway up
```

Or connect your GitHub repo in Railway dashboard for automatic deploys on push.

---

## Rollback

Railway keeps deploy history. To rollback:
1. Go to the Railway dashboard → your service → Deployments tab
2. Click the previous successful deployment
3. Click **Redeploy**

---

## Cost Estimate

Railway pricing (as of 2026):
- **Starter plan**: $5/month includes $5 of usage credit
- **App + Worker**: ~$5–10/month combined (low traffic)
- **PostgreSQL**: ~$5/month (512MB)
- **Redis**: ~$2/month (minimal usage — pub/sub only)
- **Total estimate**: ~$12–22/month for a small deployment

---

## Troubleshooting

| Issue | Fix |
|---|---|
| `prisma migrate deploy` fails | Check `DATABASE_URL` is set. Run `railway run npx prisma migrate status` to diagnose. |
| WebSocket won't connect | Ensure Railway domain uses HTTPS. Socket.IO auto-upgrades `wss://`. |
| Worker not running jobs | Check worker logs: `railway logs -s spacerquest-worker`. Verify `REDIS_URL` is set. |
| OAuth callback fails | Verify `BBS_PORTAL_CALLBACK_URL` matches your Railway domain exactly. |
| Static files 404 | Ensure `NODE_ENV=production` so Fastify serves `dist/public/`. |
| Health check fails | App may still be starting. Increase Railway health check start period in settings. |
