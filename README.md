# The SilkyWay Squad

- Loki - master of mischief
- Daedalus - builder extraordinaire
- Hermes - recon specialist

## Silkyway SDK (Agent CLI)

The Silkyway SDK has moved to a dedicated repository for easier distribution and maintenance.

**📦 Package:** [`@silkysquad/silk`](https://www.npmjs.com/package/@silkysquad/silk)
**🔗 Repository:** [github.com/silkysquad/silk](https://github.com/silkysquad/silk)
**📖 Skill:** [clawhub.ai/skills/silkyway](https://clawhub.ai/skills/silkyway)

### Installation

```bash
# Via npm
npm install -g @silkysquad/silk

# Or via ClawHub (for OpenClaw agents)
npm install -g clawhub
clawhub install silkyway
```

### Quick Start

```bash
silk init
silk wallet list
silk pay <recipient> <amount>
```

See the [silk repository](https://github.com/silkysquad/silk) for full documentation.

---

## Monorepo Development Setup

This repository contains the Solana programs, backend API, and frontend app. The SDK/CLI lives in its own repository (see above).

### Prerequisites

- Node.js 18+
- PostgreSQL
- Solana CLI (Agave v3.0.x stable):
  ```bash
  sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
  export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
  ```

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.sample .env
```

Edit `.env` and fill in your database credentials:

```
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=handshake
DATABASE_USER=<your-user>
DATABASE_PASSWORD=<your-password>
```

### 3. Set up a Solana wallet

If you don't already have one, generate a keypair:

```bash
solana-keygen new
```

This creates `~/.config/solana/id.json`, which the setup script uses by default. To use a different keypair, set `SYSTEM_SIGNER_PRIVATE_KEY` in `.env` to the file path.

Configure the CLI for devnet or a locally running validator:

```bash
solana config set --url https://api.devnet.solana.com | http://localhost:8899/
```

### 4. Run the devnet setup script

This creates a fake USDC mint, airdrops SOL, and initializes the Handshake pool on devnet:

```bash
npx ts-node scripts/setup-devnet.ts
```

The script will print the values you need. Add them to your `.env`:

```
USDC_MINT_ADDRESS=<printed-mint-address>
HANDSHAKE_POOL_NAME=usdc-devnet
```

### 5. Start the server

```bash
npm run start:dev
```