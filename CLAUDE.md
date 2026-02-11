# CLAUDE.md

## What is Silkyway?

Silkyway is an **agent payments protocol on Solana**. It lets AI agents make payments on behalf of human users with spending controls and time-locked transfers. The monorepo contains two on-chain programs, a backend API, an SDK/CLI, and a frontend app.

## Repo Structure

| Path | What it is |
|---|---|
| `anchor/programs/handshake/` | Solana program — time-locked claimable transfers between parties |
| `anchor/programs/silkysig/` | Solana program — managed token accounts with operator delegation and spending limits |
| `anchor/tests/` | Integration tests for both programs (ts-mocha + chai) |
| `apps/backend/` | NestJS API server — REST API, Solana integration, MikroORM/PostgreSQL |
| `apps/app/` | Next.js frontend app |
| `packages/sdk/` | `@silkyway/sdk` — TypeScript SDK + CLI (`silk`) for agent payments |
| `public-docs/` | Mintlify documentation site |
| `scripts/` | Setup and build scripts — devnet setup, SDK packaging |

## Solana Programs (`/anchor`)

Both programs live in the same Anchor workspace. Config is in `anchor/Anchor.toml`. Cluster is `localnet`; package manager is `yarn`.

Toolchain: Rust (pinned in `anchor/rust-toolchain.toml`), Anchor CLI 0.32.1, Agave (Solana) CLI v3.0.x stable.

### Handshake — `HZ8paEkYZ2hKBwHoVk23doSLEad9K5duASRTGaYogmfg`

Payment protocol for time-locked, claimable transfers. Instructions: `init_pool`, `create_transfer`, `claim_transfer`, `cancel_transfer`, `reject_transfer`, `decline_transfer`, `expire_transfer`, `withdraw_fees`.

- `anchor/programs/handshake/src/lib.rs` — All instruction handlers and account structs.
- `anchor/tests/handshake.ts`, `anchor/tests/handshake-kit.ts` — Integration tests.

### Silkysig — `8MDFar9moBycSXb6gdZgqkiSEGRBRkzxa7JPLddqYcKs`

Managed token account system with role-based operator delegation. A human owner creates an account that holds SPL tokens and authorizes up to 3 operators (agents) to transfer tokens with per-transaction spending limits. The owner bypasses all policies; operators are subject to limits and can be paused.

**Instructions:**
- `create_account` — Creates a SilkAccount PDA (`seeds = [b"account", owner]`) + associated token account. Optionally adds a first operator.
- `deposit` — Anyone can deposit tokens into a Silk account.
- `transfer_from_account` — Transfer tokens out. Owner: unrestricted. Operator: enforces pause check + per-tx limit. Others: rejected.

**Key state — `SilkAccount`:** owner, mint, is_paused, up to 3 `OperatorSlot`s (pubkey, per_tx_limit, daily_limit fields — daily limits defined but not yet enforced).

**Source layout:**
- `anchor/programs/silkysig/src/lib.rs` — Program entry point, declares all instructions.
- `anchor/programs/silkysig/src/instructions/` — `create_account.rs`, `deposit.rs`, `transfer_from_account.rs`.
- `anchor/programs/silkysig/src/state/account.rs` — `SilkAccount` and `OperatorSlot` structs.
- `anchor/programs/silkysig/src/errors.rs` — Error codes (Unauthorized, ExceedsPerTxLimit, AccountPaused, MaxOperatorsReached, etc.).
- `anchor/tests/silkysig.ts` — Integration tests.

## Backend (`/apps/backend`)

NestJS server. SWC builder. MikroORM with PostgreSQL.

**Key directories:**
- `src/api/` — REST controllers and services.
- `src/db/` — MikroORM config and entity models.
- `src/solana/` — Solana/Handshake client integration.
- `src/content/` — Content rendering (landing page, docs).
- `migrations/` — Database migrations.
- `content/` — Markdown content files served by the site.

## SDK (`/packages/sdk`)

`@silkyway/sdk` — TypeScript client library + Commander-based CLI exposed as `silk`.

**Key files:**
- `src/client.ts` — HTTP client for the backend API.
- `src/cli.ts` — CLI entry point.
- `src/commands/` — Subcommands: `wallet`, `balance`, `pay`, `claim`, `cancel`, `payments`, `account`.
- `src/config.ts` — Wallet/config management (`~/.config/silk/config.json`).
- `SKILL.md` — Agent-facing skill file shipped with the package.

## Frontend (`/apps/app`)

Next.js app. See `apps/app/src/` for source.

## Gotchas

- If `Cargo.lock` has `version = 4` and fails with "lock file version 4 requires `-Znext-lockfile-bump`", delete it and let `anchor build` regenerate.
- Anchor tests require a local validator running (`anchor test` starts one automatically).
