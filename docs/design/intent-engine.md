# Intent Engine — Build and Analyze Transactions from Intents

**Date:** 2026-03-04
**Status:** Design

---

## Overview

The intent engine adds two capabilities to the SilkyWay backend: building unsigned transactions from intents, and analyzing transactions against intents with multi-dimensional feedback. It sits in a new `src/services/` module alongside the existing `src/api/` layer, with a pluggable chain architecture that starts with Solana and can accommodate any blockchain.

The SDK (`@silkysquad/silk`) also gains the `program`/`programName` fields on the Intent type, mirroring the existing `token`/`tokenSymbol` convention, and the verification matcher is updated to check program identity when provided.

---

## Two Operations

### Build

Takes an intent, returns an unsigned transaction that satisfies it.

```
POST /api/intent/build
```

Request:
```typescript
{
  intent: Intent;
  analyze?: boolean;  // default false — include analysis in response
}
```

Response:
```typescript
{
  transaction: string;       // base64 unsigned transaction
  intent: Intent;            // resolved intent (program addresses filled in, etc.)
  metadata: BuildMetadata;
  analysis?: AnalyzeResult;  // present when analyze=true
}
```

### Analyze

Takes a transaction and an intent, returns a multi-dimensional analysis of whether the transaction matches the intent, what risks it carries, and whether it will succeed.

```
POST /api/intent/analyze
```

Request:
```typescript
{
  transaction: string;  // base64 unsigned transaction
  intent: Intent;       // what the caller expected
}
```

Response:
```typescript
AnalyzeResult
```

The analyze endpoint serves two use cases: verifying transactions you built yourself (the `analyze: true` shortcut on build), and verifying transactions from third parties.

---

## Analyze Response Shape

```typescript
type Verdict = 'proceed' | 'caution' | 'reject';

interface AnalyzeResult {
  verdict: Verdict;
  match: MatchDimension;
  risk: RiskDimension;
  viability: ViabilityDimension;
  raw: TransactionAnalysis;  // full decoded tx from SDK's analyzeTransaction
}

interface MatchDimension {
  level: 'full' | 'partial' | 'none';
  discrepancies: string[];
}

interface RiskDimension {
  level: 'low' | 'medium' | 'high';
  flags: RiskFlag[];
}

interface ViabilityDimension {
  level: 'viable' | 'uncertain' | 'unviable';
  issues: string[];
}
```

### Verdict derivation

Deterministic from dimensions:

- **`reject`** — match is `none`, OR risk is `high`, OR viability is `unviable`
- **`caution`** — match is `partial`, OR risk is `medium`, OR viability is `uncertain`
- **`proceed`** — everything clean

### Extensibility

Adding a new dimension (e.g., `compliance`, `cost`) means adding a new field to `AnalyzeResult`, a new interface, and a new rule in the verdict derivation. No existing code changes.

---

## Build Response Shape

```typescript
interface BuildResult {
  transaction: string;
  intent: Intent;
  metadata: BuildMetadata;
  analysis?: AnalyzeResult;
}

interface BuildMetadata {
  chain: string;
  network: string;
  program?: string;
  programName?: string;
  estimatedFee?: string;
}
```

---

## Program Identification

Mirrors the `token`/`tokenSymbol` convention:

- **`program`** — direct program address (e.g., `'HANDu9uNdnraNbcueGfXhd3UPu6BXfQroKAsSxFhPXEQ'`)
- **`programName`** — human-readable name resolved via registry (e.g., `'handshake'`)

Either, both, or neither can be provided:

```typescript
// By name (resolved via registry)
{ programName: 'handshake' }

// By address
{ program: 'HANDu9uN...' }

// Both (cross-checked)
{ programName: 'handshake', program: 'HANDu9uN...' }

// Neither — chain-native operation
{}
```

The registry is chain-and-network-scoped and bidirectional: resolve name to address for building, resolve address to name for analysis. Cross-checking works the same way as tokens — if both are provided and don't match, it's an error.

### Action semantics

- `action: 'transfer'` with no program — chain-native SPL/SOL transfer
- `action: 'transfer'` with `programName: 'handshake'` — Handshake `create_transfer`
- `action: 'swap'` with `programName: 'jupiter'` — Jupiter swap

The `action` describes what, the `program` describes which protocol.

---

## Backend Module Structure

```
src/services/
├── services.module.ts
├── intent/
│   ├── intent.module.ts
│   ├── intent-build.service.ts      — orchestrator: resolves chain, dispatches
│   ├── intent-analyze.service.ts    — orchestrator: resolves chain, dispatches
│   ├── intent-registry.service.ts   — bidirectional program/token registry
│   └── types.ts                     — AnalyzeResult, BuildResult, dimension types
│
└── chains/
    ├── chain.interface.ts           — ChainBuilder + ChainAnalyzer interfaces
    └── solana/
        ├── solana.module.ts
        ├── solana.builder.ts        — dispatches to program builders
        ├── solana.analyzer.ts       — wraps SDK analyzeTransaction + risk/viability
        └── programs/
            ├── native.builder.ts    — SPL transfers, system program
            ├── handshake.builder.ts — Handshake create_transfer, claim, cancel
            └── silkysig.builder.ts  — Silkysig transfer_from_account, deposit
```

### Chain interfaces

```typescript
interface ChainBuilder {
  chain: string;
  build(intent: Intent, opts: BuildOpts): Promise<BuildResult>;
}

interface ChainAnalyzer {
  chain: string;
  analyze(tx: string, intent: Intent, opts: AnalyzeOpts): Promise<AnalyzeResult>;
}
```

The orchestrator services hold a `Map<string, ChainBuilder>` and `Map<string, ChainAnalyzer>`. Dispatch is by `intent.chain`. Adding a new chain means a new subdirectory under `chains/` and registering in the module.

### Program builder interface

```typescript
interface ProgramBuilder {
  programName: string;
  supportedActions: string[];
  build(intent: ActionIntent, context: SolanaBuildContext): Promise<TransactionInstruction[]>;
}
```

Each program builder returns raw instructions. The chain-level `solana.builder.ts` handles common boilerplate: blockhash, fee payer, compute budget, serialization.

### Solana build flow

1. `intent-build.service.ts` receives intent, parses chain, dispatches to `solana.builder.ts`
2. `solana.builder.ts` checks for `program`/`programName` — if present, resolves via registry and dispatches to matching program builder. If absent, dispatches to `native.builder.ts`
3. Program builder (e.g., `native.builder.ts`) resolves token via registry, creates ATA instruction if needed, builds transfer instruction, returns instructions
4. `solana.builder.ts` assembles transaction with blockhash and fee payer, serializes
5. If `analyze: true`, runs the analyze pipeline on the built transaction before returning

### Solana analyze flow

1. `intent-analyze.service.ts` receives transaction + intent, dispatches to `solana.analyzer.ts`
2. `solana.analyzer.ts` calls the SDK's `analyzeTransaction` to get full decoded transaction
3. Runs match checking: uses the SDK's matcher (which now checks program identity too)
4. Runs risk assessment: extends the SDK's flag engine with backend-specific risk rules
5. Runs viability checks: RPC-based balance checks, token account existence, blockhash freshness
6. Derives verdict from dimensions, returns `AnalyzeResult`

---

## SDK Changes (`@silkysquad/silk`)

### Intent type additions

```typescript
type ProgramRef = {
  programName?: string;
  program?: string;
};

// Updated
type SingleIntent = { chain: string; strict?: boolean } & ActionIntent & ProgramRef;
type CompoundIntent = { chain: string; strict?: boolean; actions: ActionIntent[] } & ProgramRef;
```

`ProgramRef` is optional on both forms. Compound intents apply the top-level `ProgramRef` as a default; individual actions could override it in the future.

### Program registry (bidirectional)

The token registry already supports `resolveSymbol` and `resolveAddress`. The program registry gets the same treatment:

```typescript
// Added to token-registry.ts or new program-registry.ts
resolveProgram('solana', 'mainnet', 'handshake')
// → { address: 'HANDu9uN...', name: 'handshake' }

resolveProgramAddress('solana', 'mainnet', 'HANDu9uN...')
// → { address: 'HANDu9uN...', name: 'handshake' }

crossCheckProgram('solana', 'mainnet', 'handshake', 'HANDu9uN...')
// → true
```

### Matcher changes

When `program` or `programName` is provided on the intent, the matcher verifies that the matched instruction's `programId` corresponds to the expected program. If the program doesn't match, a discrepancy is added. When neither is provided, behavior is unchanged.

---

## Viability Checks (first iteration)

Solana-specific, RPC-based:

| Check | Result on failure |
|---|---|
| Fee payer has enough SOL for estimated fees | `unviable`: "Insufficient SOL for transaction fees" |
| Sender has sufficient token balance for transfer amount | `unviable`: "Insufficient USDC balance (have 50, need 100)" |
| Destination token account exists or can be created | `uncertain`: "Destination token account does not exist (will be created)" |
| Blockhash is recent | `uncertain`: "Blockhash may be expired" |

---

## Risk Assessment (first iteration)

Reuses the SDK's existing flag engine:

| Flag | Severity | Risk level mapping |
|---|---|---|
| `UNKNOWN_PROGRAM` | error | high |
| `UNEXPECTED_SOL_DRAIN` | error | high |
| `UNEXPECTED_TOKEN_TRANSFER` | warning | medium |
| `LARGE_COMPUTE_BUDGET` | info | low |

The backend can add its own rules on top (e.g., protocol reputation, contract age, known exploit history) in future iterations.

---

## Scope — first iteration

**In scope:**
- Solana chain builder and analyzer
- Transfer action only: `native.builder.ts` (SPL/SOL), `handshake.builder.ts` (create_transfer)
- Basic viability checks (balance, token account, blockhash)
- Basic risk assessment (SDK flag engine)
- SDK type changes: `ProgramRef` on Intent, bidirectional program registry, matcher program check
- Two API endpoints: `POST /api/intent/build`, `POST /api/intent/analyze`

**Out of scope (future iterations):**
- EVM chain builders
- Swap, stake, lend, borrow builders
- Simulation-based viability
- Protocol-level risk scoring
- Silkysig builder (deferred to second iteration after transfer works end-to-end)

---

## Relationship to existing code

| Component | Relationship |
|---|---|
| `src/api/service/tx.service.ts` | Existing Handshake-specific builder. Stays as-is. `handshake.builder.ts` in the new engine will eventually subsume its logic. |
| `@silkysquad/silk` `src/intent/` | Intent types and verification. Gets `ProgramRef` addition and matcher update. |
| `@silkysquad/silk` `src/verify/` | Solana decoder pipeline. Used by `solana.analyzer.ts` via `analyzeTransaction`. |
| Midas `src/services/blockchain/` | Pattern reference for chain adapter dispatch. Not a dependency. |
| Midas `packages/common` SolanaClient | Pattern reference for instruction composition and TX building. Not a dependency. |
