# Multi-Cluster Architecture: Mainnet + Devnet

## Why Two Clusters?

Silkyway serves two distinct audiences that need fundamentally different environments:

**Mainnet (mainnet-beta)** is for real usage. Hackathon judges, partners, and early users need to see Silkyway working with real USDC on real Solana. This proves the protocol actually works and handles real value. Without mainnet, Silkyway is just a demo.

**Devnet** is for agent onboarding. An AI agent trying Silkyway for the first time shouldn't need real funds. Devnet gives agents a zero-friction path: install the SDK, create a wallet, hit the faucet, start sending test payments. No cost, no risk, no human approval needed to get started.

Running both simultaneously means we don't have to choose. Judges see mainnet. Agents onboard on devnet. Same protocol, same code, different networks.

## Architecture Overview

```
                    ┌─────────────────────────┐
                    │     Frontend (Next.js)   │
                    │   app.silkyway.ai       │
                    │                          │
                    │  ┌───────┬───────┐       │
                    │  │Mainnet│Devnet │ toggle │
                    │  └───┬───┴───┬───┘       │
                    └──────┼───────┼───────────┘
                           │       │
              ┌────────────┘       └────────────┐
              ▼                                  ▼
   ┌─────────────────────┐           ┌─────────────────────┐
   │  Backend (NestJS)   │           │  Backend (NestJS)    │
   │  api.silkyway.ai    │           │  devnet-api.silkyway.ai  │
   │  PORT=3000          │           │  PORT=3001           │
   │                     │           │                      │
   │  SOLANA_CLUSTER=    │           │  SOLANA_CLUSTER=     │
   │    mainnet-beta     │           │    devnet            │
   │  RPC_URL=mainnet    │           │  RPC_URL=devnet      │
   │  USDC=real mint     │           │  USDC=mock mint      │
   └────────┬────────────┘           └────────┬─────────────┘
            │                                  │
            ▼                                  ▼
   ┌─────────────────┐               ┌─────────────────┐
   │  PostgreSQL     │               │  PostgreSQL      │
   │  (mainnet DB)   │               │  (devnet DB)     │
   └─────────────────┘               └─────────────────┘

   ┌──────────────────────────────────────────────────────┐
   │              Solana Programs (same IDs)              │
   │  Handshake: HZ8paEkYZ2hKBwHoVk23doSLEad9K5duASRTGaY │
   │  Silkysig:  8MDFar9moBycSXb6gdZgqkiSEGRBRkzxa7JPLdd │
   │         deployed on both mainnet and devnet          │
   └──────────────────────────────────────────────────────┘
```

**Key design decision:** One codebase, two deployments. Not two codebases. Not feature flags. The only difference between mainnet and devnet is environment variables.

## Components

### Backend: Two PM2 Processes

The backend is a NestJS server. We run two instances from the same built artifact (`dist/main.js`), differentiated by env vars.

**ecosystem.config.js** defines both:

| Setting | Mainnet (`silkyway-mainnet`) | Devnet (`silkyway-devnet`) |
|---|---|---|
| Port | 3000 | 3001 |
| `SOLANA_CLUSTER` | `mainnet-beta` | `devnet` |
| `RPC_URL` | Mainnet RPC (Helius, etc.) | `https://api.devnet.solana.com` |
| `USDC_MINT_ADDRESS` | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` (real USDC) | Mock mint from `setup-devnet.ts` |
| Database | `silkyway_mainnet` | `silkyway_devnet` |

The `SOLANA_CLUSTER` env var controls:
- **Solscan links** — mainnet links have no query param, devnet links get `?cluster=devnet`
- **`/.well-known/agent.json`** — reports `"network": "solana-mainnet"` or `"solana-devnet"` so agents know which network they're talking to
- **Activity page footer** — says "Solana Mainnet" or "Solana Devnet"

The `ConfigService` (NestJS built-in) injects the env var at startup. It's read once in the constructor — no per-request overhead.

**Deployment:**
```bash
# Build once
cd apps/backend && npm run build

# Run both
pm2 start ecosystem.config.js
```

A reverse proxy (nginx/Caddy) routes:
- `api.silkyway.ai` → `localhost:3000`
- `devnet-api.silkyway.ai` → `localhost:3001`

**Database schema updates** use the `updateschema` script:
```bash
./updateschema mainnet   # loads .env.mainnet, updates mainnet DB
./updateschema devnet    # loads .env.devnet, updates devnet DB
```

### SDK: Cluster in Config

The CLI SDK stores cluster preference in `~/.config/silk/config.json`:

```json
{
  "cluster": "mainnet-beta",
  "wallets": [...]
}
```

The cluster determines which API backend the SDK talks to:
- `mainnet-beta` → `https://api.silkyway.ai`
- `devnet` → `https://devnet-api.silkyway.ai`

An explicit `apiUrl` or `SILK_API_URL` env var overrides the cluster-based mapping (useful for local dev).

**Default is mainnet-beta.** Agents doing real work should be on mainnet by default. Switching to devnet is an explicit choice:

```bash
silk config set-cluster devnet    # for testing
silk config set-cluster mainnet-beta  # for real payments
silk config get-cluster           # check current setting
```

The `wallet fund` command (devnet faucet) is labeled "devnet only" — it won't work on mainnet since there's no faucet for real USDC.

### Frontend: Client-Side Toggle

The frontend is a single Next.js deployment. Cluster switching happens entirely client-side:

**ClusterContext** (`contexts/ClusterContext.tsx`) provides:
- `cluster` — current selection (`mainnet-beta` or `devnet`)
- `setCluster()` — switches and persists to `localStorage('silkyway-cluster')`
- `rpcUrl` — resolved RPC endpoint for the current cluster
- `apiUrl` — resolved API backend URL for the current cluster

**Header toggle pill** — a prominent Mainnet/Devnet switcher in the header, between the logo and nav links. Gold gradient when mainnet is active, purple gradient for devnet. Always visible, not hidden behind a menu.

**What happens when you toggle:**
1. `localStorage` updates
2. `ClusterContext` re-renders
3. `WalletProvider` re-mounts (via `key={rpcUrl}`) — reconnects wallet to new RPC
4. API client (`getApi()`) reads the new cluster from localStorage on next call — hits the correct backend
5. Solscan links (`solscanUrl()`) read from localStorage — point to correct explorer

**Why localStorage instead of React state alone?** The API client is used in Jotai actions (non-React code) that can't access React context. Reading from localStorage at call time means both React components and Jotai atoms stay in sync without prop drilling or global state coupling.

**Environment variables** (set in deployment platform):
```
NEXT_PUBLIC_MAINNET_RPC_URL=https://api.mainnet-beta.solana.com
NEXT_PUBLIC_MAINNET_API_URL=https://api.silkyway.ai
NEXT_PUBLIC_DEVNET_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_DEVNET_API_URL=https://devnet-api.silkyway.ai
```

All four have sensible defaults baked in, so the frontend works even without explicit env vars.

### On-Chain Programs

The Handshake and Silkysig programs use the same program IDs on both clusters. They're deployed to both mainnet and devnet independently. The programs are stateless logic — all state lives in PDAs derived from user accounts, so there's no cross-cluster interference.

## What Each Audience Sees

### Agent installing the SDK for the first time
1. `npm install -g @silkyway/sdk`
2. `silk wallet create` — creates a local keypair
3. `silk config set-cluster devnet` — switch to testnet
4. `silk wallet fund` — free SOL + test USDC from faucet
5. `silk pay <address> 5 --memo "test"` — sends test payment
6. When ready for real payments: `silk config set-cluster mainnet-beta`

### Hackathon judge visiting the site
1. Opens `app.silkyway.ai` — defaults to Mainnet (gold pill active)
2. Connects Phantom wallet — sees real USDC balance
3. Sends a real payment — transaction hits mainnet Solana
4. Solscan links go to `solscan.io/tx/...` (no cluster param = mainnet)

### Developer testing locally
1. Runs local validator + backend on `:3000`
2. Frontend toggle set to Devnet (or env vars point to localhost)
3. Can switch toggle to see how mainnet experience looks

## File Changes Summary

| File | Change |
|---|---|
| `apps/backend/.env.sample` | Added `SOLANA_CLUSTER=devnet` |
| `apps/backend/ecosystem.config.js` | New — PM2 config with two apps |
| `apps/backend/updateschema` | Accepts `mainnet`/`devnet` argument |
| `apps/backend/src/api/controller/view.controller.ts` | Reads `SOLANA_CLUSTER` via `ConfigService`, dynamic Solscan links and footer |
| `apps/backend/src/api/controller/well-known.controller.ts` | New — serves `agent.json` dynamically with cluster-aware `network` field |
| `apps/backend/src/api/api.module.ts` | Registers `WellKnownController` |
| `apps/backend/src/app.module.ts` | Removed static `.well-known` serving |
| `packages/sdk/src/config.ts` | Added `cluster` field, `getCluster()`, cluster-to-URL mapping |
| `packages/sdk/src/commands/config.ts` | Added `set-cluster`, `get-cluster`, `reset-cluster` commands |
| `packages/sdk/src/cli.ts` | Registered cluster commands |
| `packages/sdk/SKILL.md` | Added cluster configuration docs |
| `apps/app/src/contexts/ClusterContext.tsx` | New — React context for cluster state |
| `apps/app/src/lib/api.ts` | Cluster-aware API client reading from localStorage |
| `apps/app/src/lib/solscan.ts` | Reads cluster from localStorage |
| `apps/app/src/app/layout.tsx` | Wrapped with `ClusterProvider` |
| `apps/app/src/providers/WalletProvider.tsx` | Uses `useCluster()` for RPC endpoint |
| `apps/app/src/components/layout/Header.tsx` | Added cluster toggle pill |
| `apps/app/.env.sample` | Four cluster-specific env vars |
| `apps/app/ENV_SETUP.md` | Updated for new env var scheme |
