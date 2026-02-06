# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Handshake is a Solana program built with the Anchor framework (v0.32.1). The on-chain program is written in Rust; tests and migration scripts are in TypeScript.

**Program ID:** `HZ8paEkYZ2hKBwHoVk23doSLEad9K5duASRTGaYogmfg`

## Common Commands

### Build the Solana program
```
anchor build
```

### Run all tests (requires local validator)
```
anchor test
```

### Run a single test file
```
yarn run ts-mocha -p ./tsconfig.json -t 1000000 "tests/handshake.ts"
```

### Lint / format check
```
yarn lint
```

### Lint / format fix
```
yarn lint:fix
```

## Architecture

- **`programs/handshake/src/lib.rs`** — The Solana on-chain program. All instruction handlers and account structs live here. Uses `anchor_lang` macros (`#[program]`, `#[derive(Accounts)]`, `declare_id!`).
- **`tests/`** — TypeScript integration tests using ts-mocha + chai. Tests interact with the program via the auto-generated TypeScript client from `target/types/handshake`.
- **`migrations/deploy.ts`** — Anchor deploy migration script.
- **`Anchor.toml`** — Anchor workspace config. Cluster is set to `localnet`; package manager is `yarn`.

## Toolchain

- Rust `1.89.0` (pinned in `rust-toolchain.toml`), includes `rustfmt` and `clippy`
- Anchor CLI `0.32.1`
- **Agave (Solana) CLI v3.0.x stable** — required for `cargo-build-sbf`. Older versions (1.18.x, 2.1.x) ship Rust compilers too old for Anchor 0.32.1's dependencies. Install with:
  ```
  sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
  ```
  Then ensure it's on PATH: `export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"`
- Node/Yarn for TypeScript tests and linting

## Build Notes

- If `Cargo.lock` has `version = 4` and the build fails with "lock file version 4 requires `-Znext-lockfile-bump`", delete `Cargo.lock` and let `anchor build` regenerate it.
- If crate version errors mention a rustc version mismatch, the Solana/Agave CLI is likely too old — upgrade to stable.
