# Silkyway — Full System Setup Guide

This document covers everything needed to bring up the entire Silkyway system, whether locally for development or on a VPS for production. It assumes you're starting from a fresh clone.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Repository Overview](#repository-overview)
- [1. Solana Toolchain & Programs](#1-solana-toolchain--programs)
- [2. Database Setup](#2-database-setup)
- [3. Backend Setup](#3-backend-setup)
- [4. Devnet Bootstrap (setup-devnet)](#4-devnet-bootstrap-setup-devnet)
- [5. SDK Setup](#5-sdk-setup)
- [6. Frontend Setup](#6-frontend-setup)
- [7. Production Deployment](#7-production-deployment)
- [8. Multi-Cluster Architecture](#8-multi-cluster-architecture)
- [9. Scripts Reference](#9-scripts-reference)
- [10. Troubleshooting](#10-troubleshooting)

---

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 18+ | Runtime for backend, frontend, SDK |
| npm | 9+ | Comes with Node |
| PostgreSQL | 14+ | Backend database |
| Rust | 1.89.0 | Pinned in `anchor/rust-toolchain.toml` — installed automatically by rustup |
| Solana CLI (Agave) | v3.0.x stable | `sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"` |
| Anchor CLI | 0.32.1 | `cargo install --git https://github.com/coral-xyz/anchor avm && avm install 0.32.1 && avm use 0.32.1` |
| PM2 | Latest | Production process manager: `npm install -g pm2` |

Optional:
- **nginx** or **Caddy** — reverse proxy for production (routes domains to backend ports)
- **gh** (GitHub CLI) — for creating PRs

---

## Repository Overview

```
silkyway/
├── anchor/                  # Solana programs (Rust/Anchor)
│   ├── programs/handshake/  # Time-locked escrow transfers
│   ├── programs/silkysig/   # Managed accounts with operator delegation
│   ├── tests/               # Integration tests (ts-mocha)
│   └── Anchor.toml          # Anchor workspace config
├── apps/
│   ├── backend/             # NestJS API server
│   └── silk/                # Next.js frontend
├── packages/
│   └── sdk/                 # @silkyway/sdk — CLI + TypeScript client
├── scripts/
│   ├── setup-devnet.ts      # One-time devnet bootstrapper
│   ├── pack-sdk.sh          # Build + package SDK tarball
│   └── mints/               # Keypair for deterministic devnet USDC mint
└── docs/
```

---

## 1. Solana Toolchain & Programs

### Install the toolchain

```bash
# Rust (will pick up version from anchor/rust-toolchain.toml)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Solana CLI
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"

# Anchor CLI
cargo install --git https://github.com/coral-xyz/anchor avm --force
avm install 0.32.1
avm use 0.32.1
```

### Generate a Solana keypair (if you don't have one)

```bash
solana-keygen new -o ~/.config/solana/id.json
```

This keypair is your **system signer** — it pays for transactions, is the mint authority on devnet, and operates the Handshake pool.

### Build programs

```bash
cd anchor
anchor build
```

This produces:
- `target/deploy/handshake.so`
- `target/deploy/silkysig.so`
- IDLs at `target/idl/handshake.json` and `target/idl/silkysig.json`

If `Cargo.lock` fails with "lock file version 4 requires `-Znext-lockfile-bump`", delete `Cargo.lock` and rebuild.

### Deploy to devnet

```bash
solana config set --url devnet

# Fund your deployer
solana airdrop 4

# Deploy both programs
anchor deploy --program-name handshake --provider.cluster devnet
anchor deploy --program-name silkysig --provider.cluster devnet
```

Program IDs (same on both clusters):
- **Handshake:** `HZ8paEkYZ2hKBwHoVk23doSLEad9K5duASRTGaYogmfg`
- **Silkysig:** `8MDFar9moBycSXb6gdZgqkiSEGRBRkzxa7JPLddqYcKs`

### Deploy to mainnet

```bash
solana config set --url mainnet-beta

# Make sure your deployer has enough SOL (programs cost ~3-5 SOL to deploy)
# Transfer SOL to your deployer address first

anchor deploy --program-name handshake --provider.cluster mainnet
anchor deploy --program-name silkysig --provider.cluster mainnet
```

### Run program tests

Tests require a local validator (Anchor starts one automatically):

```bash
cd anchor
anchor test
```

---

## 2. Database Setup

The backend uses PostgreSQL via MikroORM. For multi-cluster, you need **two separate databases** — mainnet and devnet data must not mix.

### Local development

```bash
# Create databases
createdb silkyway_mainnet
createdb silkyway_devnet
```

### Create environment files

From `apps/backend/`:

```bash
cp .env.sample .env          # default for local dev
cp .env.sample .env.mainnet  # mainnet-specific overrides
cp .env.sample .env.devnet   # devnet-specific overrides
```

**.env.mainnet:**
```
DATABASE_NAME=silkyway_mainnet
DATABASE_USER=your_user
DATABASE_PASSWORD=your_password
DATABASE_HOST=localhost
DATABASE_PORT=5432
SOLANA_CLUSTER=mainnet-beta
RPC_URL=https://api.mainnet-beta.solana.com
USDC_MINT_ADDRESS=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
HANDSHAKE_POOL_NAME=usdc-mainnet
```

**.env.devnet:**
```
DATABASE_NAME=silkyway_devnet
DATABASE_USER=your_user
DATABASE_PASSWORD=your_password
DATABASE_HOST=localhost
DATABASE_PORT=5432
SOLANA_CLUSTER=devnet
RPC_URL=https://api.devnet.solana.com
USDC_MINT_ADDRESS=EdgRyTNhoroQnYhsyBYv1t22dZGcDPoywfcG68FpqmrS
HANDSHAKE_POOL_NAME=usdc-devnet
```

### Apply schema

```bash
cd apps/backend

# Apply to both databases
./updateschema mainnet
./updateschema devnet

# Or just the default .env:
./updateschema
```

The `updateschema` script runs `npx mikro-orm schema:update -r --fk-checks=true`. The argument (`mainnet`/`devnet`) loads the corresponding `.env.*` file to pick the right database.

---

## 3. Backend Setup

### Install dependencies

```bash
# From repo root — installs all workspaces
npm install
```

### Configure environment

The main `.env` file in `apps/backend/` is for local dev. Key variables:

| Variable | Description | Example |
|---|---|---|
| `PORT` | Server port | `3000` |
| `SOLANA_CLUSTER` | `mainnet-beta` or `devnet` | `devnet` |
| `RPC_URL` | Solana RPC endpoint | `https://api.devnet.solana.com` |
| `HANDSHAKE_PROGRAM_ID` | Handshake program ID | `HZ8paEkYZ2hKBwHoVk23doSLEad9K5duASRTGaYogmfg` |
| `SILKYSIG_PROGRAM_ID` | Silkysig program ID | `8MDFar9moBycSXb6gdZgqkiSEGRBRkzxa7JPLddqYcKs` |
| `SYSTEM_SIGNER_PRIVATE_KEY` | Path to Solana keypair JSON | `~/.config/solana/id.json` |
| `USDC_MINT_ADDRESS` | USDC token mint | Set after running `setup-devnet.ts` |
| `HANDSHAKE_POOL_NAME` | Pool identifier | `usdc-devnet` |
| `DATABASE_*` | PostgreSQL connection | See database section |
| `ALLOWED_ORIGINS` | CORS origins (comma-separated) | `http://localhost:8000` |
| `OPENCLAW_GATEWAY_URL` | OpenClaw agent gateway | `http://127.0.0.1:18789` |
| `OPENCLAW_AUTH_TOKEN` | OpenClaw auth token | (your token) |
| `OPENCLAW_AGENT_ID` | OpenClaw agent ID | `main` |

The chat system uses OpenClaw — assume an OpenClaw agent is already running and reachable at the configured gateway URL.

### Run in development

```bash
cd apps/backend
npm run start:dev
```

This starts the NestJS server with SWC and hot reload on port 3000 (or whatever `PORT` is set to).

### Build for production

```bash
cd apps/backend
npm run build
```

Produces `dist/` with compiled JavaScript.

---

## 4. Devnet Bootstrap (setup-devnet)

Before the backend can operate on devnet, you need a mock USDC mint and a Handshake pool. The `setup-devnet.ts` script does this in one shot.

### What it does

1. Loads your system signer keypair (from `SYSTEM_SIGNER_PRIVATE_KEY` or `~/.config/solana/id.json`)
2. Airdrops 2 SOL to the signer (for transaction fees)
3. Creates a fake USDC mint with 6 decimals (using the deterministic keypair at `scripts/mints/EdgRyTNhoroQnYhsyBYv1t22dZGcDPoywfcG68FpqmrS.json`)
4. Mints 1 billion test USDC to the signer's token account
5. Creates a Handshake pool on-chain for the mock USDC
6. Prints the env vars you need to configure

### Run it

```bash
# From repo root
npx ts-node scripts/setup-devnet.ts
```

Or, to point at a specific RPC:

```bash
RPC_URL=https://api.devnet.solana.com npx ts-node scripts/setup-devnet.ts
```

### Output

The script prints values to add to your `.env.devnet`:

```
SYSTEM_SIGNER_PRIVATE_KEY=~/.config/solana/id.json
USDC_MINT_ADDRESS=EdgRyTNhoroQnYhsyBYv1t22dZGcDPoywfcG68FpqmrS
HANDSHAKE_POOL_NAME=usdc-devnet
```

The script is idempotent — if the mint or pool already exist, it skips creation.

### Why a deterministic mint keypair?

The USDC mint keypair is checked into `scripts/mints/`. This ensures every developer (and every CI run) creates the same mint address on devnet. Without it, each dev would get a random mint address and nothing would interoperate.

### Mainnet pool setup

On mainnet, USDC already exists (`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`). You only need to create the Handshake pool. Use the same script with mainnet config:

```bash
RPC_URL=<mainnet-rpc> \
HANDSHAKE_POOL_NAME=usdc-mainnet \
USDC_MINT_ADDRESS=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v \
npx ts-node scripts/setup-devnet.ts
```

The script will skip the mint creation (it already exists) and just create the pool. Note: your system signer needs real SOL on mainnet for the pool creation transaction.

---

## 5. SDK Setup

### Build

```bash
cd packages/sdk
npm run build
```

### Install globally (for local testing)

```bash
cd packages/sdk
npm install -g .
```

Now `silk` is available as a CLI command.

### Package for distribution

```bash
./scripts/pack-sdk.sh
```

This builds the SDK, creates a `.tgz` tarball, and places it at `apps/backend/public/sdk/silkyway-sdk-0.1.0.tgz`. The backend serves static files from `public/`, so the SDK becomes installable via:

```bash
npm install -g https://your-domain.com/sdk/silkyway-sdk-0.1.0.tgz
```

### SDK configuration

The SDK stores config at `~/.config/silk/config.json`. Key settings:

```bash
# Set cluster (determines which API backend to hit)
silk config set-cluster devnet         # → https://devnet.silkyway.ai
silk config set-cluster mainnet-beta   # → https://api.silkyway.ai

# Override API URL directly (for local dev)
silk config set-api-url http://localhost:3000

# Check current config
silk config get-cluster
silk config get-api-url
```

### Quick test

```bash
silk wallet create
silk config set-cluster devnet
silk wallet fund        # gets devnet SOL + test USDC
silk balance
```

---

## 6. Frontend Setup

### Install dependencies

Already done if you ran `npm install` from the repo root (workspaces).

### Configure environment

```bash
cd apps/silk
cp .env.sample .env.local
```

Edit `.env.local` for local development:

```
NEXT_PUBLIC_DEVNET_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_DEVNET_API_URL=http://localhost:3000
```

For local dev you typically only need devnet configured. The frontend has sensible defaults for all four variables.

| Variable | Description | Default |
|---|---|---|
| `NEXT_PUBLIC_MAINNET_RPC_URL` | Mainnet Solana RPC | `https://api.mainnet-beta.solana.com` |
| `NEXT_PUBLIC_MAINNET_API_URL` | Mainnet backend | `https://api.silkyway.ai` |
| `NEXT_PUBLIC_DEVNET_RPC_URL` | Devnet Solana RPC | `https://api.devnet.solana.com` |
| `NEXT_PUBLIC_DEVNET_API_URL` | Devnet backend | `https://devnet.silkyway.ai` |

### Run in development

```bash
cd apps/silk
npm run dev
```

Opens on `http://localhost:8000`. The header has a Mainnet/Devnet toggle pill — cluster selection persists in localStorage.

### Build for production

```bash
cd apps/silk
npm run build
```

---

## 7. Production Deployment

### Backend — PM2 with two processes

The backend runs as two PM2 processes from the same build, differentiated by environment variables. See `apps/backend/ecosystem.config.js`.

#### Step by step

1. **Build:**
   ```bash
   cd apps/backend
   npm run build
   ```

2. **Create env files** (`.env.mainnet` and `.env.devnet`) with full config including database credentials, RPC URLs, USDC mints, OpenClaw config, etc.

3. **Update ecosystem.config.js** with your actual values (or use `env_file`):
   ```js
   {
     name: 'silkyway-mainnet',
     script: 'dist/main.js',
     env_file: '.env.mainnet',
   },
   {
     name: 'silkyway-devnet',
     script: 'dist/main.js',
     env_file: '.env.devnet',
   },
   ```

4. **Start both:**
   ```bash
   cd apps/backend
   pm2 start ecosystem.config.js
   ```

5. **Save PM2 config** (survives reboots):
   ```bash
   pm2 save
   pm2 startup
   ```

6. **Verify:**
   ```bash
   pm2 status
   pm2 logs silkyway-mainnet
   pm2 logs silkyway-devnet
   ```

Mainnet runs on port 3000, devnet on port 3001.

#### Reverse proxy

Set up nginx or Caddy to route:
- `api.silkyway.ai` → `localhost:3000`
- `devnet.silkyway.ai` → `localhost:3001`

Example nginx config:

```nginx
server {
    server_name api.silkyway.ai;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    server_name devnet.silkyway.ai;
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Add SSL with certbot: `sudo certbot --nginx -d api.silkyway.ai -d devnet.silkyway.ai`

### Frontend — Static hosting

The Next.js app is a single deployment. Build and deploy to Vercel, Netlify, or self-host with `next start`.

Set all four `NEXT_PUBLIC_*` env vars in your hosting platform. The client-side toggle handles the rest.

### SDK distribution

After `./scripts/pack-sdk.sh`, the tarball is at `apps/backend/public/sdk/`. Since the backend serves `public/` as static files, it's automatically available at `https://api.silkyway.ai/sdk/silkyway-sdk-0.1.0.tgz` (or the devnet equivalent).

---

## 8. Multi-Cluster Architecture

The system supports mainnet and devnet simultaneously. See `docs/design/multi-cluster.md` for the full design document.

**TL;DR:**
- **Backend:** Same codebase, two PM2 processes with different env vars. `SOLANA_CLUSTER` controls Solscan links, agent.json network field, and display text.
- **SDK:** `cluster` field in config maps to the correct API URL. Default: `mainnet-beta`.
- **Frontend:** Single deployment. Client-side toggle in header. Switches RPC, API URL, and Solscan links via localStorage.
- **Programs:** Same program IDs deployed on both mainnet and devnet.

---

## 9. Scripts Reference

### `scripts/setup-devnet.ts`

One-time devnet bootstrapper. Creates mock USDC mint + Handshake pool.

```bash
npx ts-node scripts/setup-devnet.ts
```

| Env var | Description | Default |
|---|---|---|
| `RPC_URL` | Solana RPC | `http://localhost:8899` |
| `SYSTEM_SIGNER_PRIVATE_KEY` | Path to keypair JSON | `~/.config/solana/id.json` |
| `HANDSHAKE_PROGRAM_ID` | Handshake program | `HZ8paEkYZ2hKBwHoVk23doSLEad9K5duASRTGaYogmfg` |
| `HANDSHAKE_POOL_NAME` | Pool name | `usdc-devnet` |

### `scripts/pack-sdk.sh`

Builds the SDK and packages it as a `.tgz` tarball in `apps/backend/public/sdk/`.

```bash
./scripts/pack-sdk.sh
```

### `apps/backend/updateschema`

Runs MikroORM schema update against the configured database.

```bash
cd apps/backend
./updateschema           # uses .env
./updateschema mainnet   # loads .env.mainnet
./updateschema devnet    # loads .env.devnet
```

---

## 10. Troubleshooting

### Anchor build: "lock file version 4" error

Delete `anchor/Cargo.lock` and rebuild:
```bash
cd anchor && rm Cargo.lock && anchor build
```

### setup-devnet: airdrop fails

Devnet has rate limits. If the airdrop fails, the script continues — your signer may already have SOL. Check with:
```bash
solana balance --url devnet
```

### Backend won't start: "Could not load keypair"

The system signer keypair is missing. Either:
- Generate one: `solana-keygen new -o ~/.config/solana/id.json`
- Or set `SYSTEM_SIGNER_PRIVATE_KEY` to the path of an existing keypair

The backend falls back to an ephemeral keypair if it can't load the file, but the faucet and pool operations won't work without the real one.

### Frontend: wallet doesn't switch on cluster toggle

The `WalletProvider` re-mounts when the cluster changes (via `key={rpcUrl}`). If the wallet doesn't reconnect, hard-refresh the page. This also clears any stale Jotai atoms.

### SDK: "Wallet not found" error

Create a wallet first:
```bash
silk wallet create
```

### CORS errors

Make sure `ALLOWED_ORIGINS` in the backend `.env` includes your frontend URL:
```
ALLOWED_ORIGINS=http://localhost:8000,https://silk.silkyway.ai
```

### Database schema out of date

Run the update against the correct database:
```bash
cd apps/backend
./updateschema devnet   # or mainnet
```

### PM2: check which processes are running

```bash
pm2 status
pm2 logs --lines 50
```

Restart after config changes:
```bash
pm2 restart ecosystem.config.js
```
