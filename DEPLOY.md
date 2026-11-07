# Deploying Allowance to your VPS

Allowance is a Next.js server with a small JSON store in `.data/`. It needs a host that **runs Node
and keeps `.data/` on disk** (not stateless serverless). Two ways below — Docker is simplest.

> **Before you start**
> - Copy your `.env.local` to the server (via `scp`, never commit it). Set:
>   - `ALLOWANCE_MODE=live`
>   - `ALLOWANCE_BASE_URL=https://your-domain` ← your real public URL
>   - `ALLOWANCE_ADMIN_TOKEN=…` (required in live; `openssl rand -hex 32`)
>   - plus the Tatum / wallet / Walrus keys you already have.
> - Point a domain at the VPS and put TLS in front (Caddy or nginx). Public = real money, so the
>   admin token on the POST routes is what stops anyone approving payments.

## Option A — Docker (recommended)

```bash
# on the VPS, in the repo
docker build -t allowance .
docker volume create allowance-data          # persists .data across restarts/redeploys

docker run -d --name allowance \
  --env-file .env.local \
  -e ALLOWANCE_DATA_DIR=/app/.data \
  -e ALLOWANCE_BASE_URL=https://your-domain \
  -v allowance-data:/app/.data \
  -p 127.0.0.1:3000:3000 \
  --restart unless-stopped \
  allowance

docker logs -f allowance                      # watch it boot
```

Then reverse-proxy `https://your-domain` → `127.0.0.1:3000`. With Caddy it's one line:

```
your-domain { reverse_proxy 127.0.0.1:3000 }
```

Redeploy: `git pull && docker build -t allowance . && docker rm -f allowance && docker run …` (the
named volume keeps your `.data`).

## Option B — No Docker (Node + pm2)

```bash
# Node 22+ on the VPS
npm ci
npm run build

# standalone output needs static + public copied beside the server
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public

npm i -g pm2
ALLOWANCE_DATA_DIR=$PWD/.data \
  pm2 start .next/standalone/server.js --name allowance \
  --node-args="--env-file=$PWD/.env.local"
pm2 save && pm2 startup           # restart on reboot
```

Reverse-proxy to port 3000 the same way.

## Verify it's live

```bash
curl https://your-domain/api/health        # { ok:true, tatum:"…", walrus:{…}, agent:"0x…" }
curl -i https://your-domain/api/vendors/chainlens/wallet-report?address=0x0000000000000000000000000000000000000000000000000000000000000001
# → HTTP 402 with the Sui USDC requirement — your paywall is live on the internet.
```

Open `https://your-domain`, enter the admin token when prompted, and the dashboard is live. An
external agent can now pay your 402 endpoint over real HTTP, settling USDC on Sui, verified via Tatum.

## Notes

- **Back up `.data/`** (or the `allowance-data` volume) — it mirrors your Walrus memories for fast UI;
  the source of truth is Walrus, but the volume holds local request/payment history.
- Keep the agent wallet funded (a little SUI for gas, a few $ USDC). `npm run check:live` still works
  on the server to confirm Tatum + Walrus.
- The Telegram bot (`npm run telegram`) runs as its own process; point it at the public URL with
  `ALLOWANCE_BASE_URL` and the same `ALLOWANCE_ADMIN_TOKEN`.
