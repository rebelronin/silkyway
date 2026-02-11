# Chunk 2: SDK — Account Commands

## Context

The backend Account API is live (from Chunk 1). The SDK (`packages/sdk/`) currently has wallet management + Handshake escrow commands. This chunk adds the `silk account` command group for agents to interact with their Silkysig accounts. No existing commands are modified — this is purely additive.

**Depends on:** Chunk 1 (backend endpoints must exist)

---

## Task 1: Add Silkysig error codes to error map

**Modify:** `packages/sdk/src/errors.ts`

The Silkysig program uses error codes 6000+ but these overlap with Handshake's error codes (both programs start at 6000). Since the SDK knows which endpoint it called, we handle this at the command level rather than the global parser.

Add a `SILKYSIG_ERROR_MAP` alongside the existing `ANCHOR_ERROR_MAP`:

```ts
export const SILKYSIG_ERROR_MAP: Record<number, { code: string; message: string }> = {
  6000: { code: 'POLICY_UNAUTHORIZED', message: 'Unauthorized: signer is not owner or operator' },
  6001: { code: 'POLICY_EXCEEDS_TX_LIMIT', message: 'Transfer exceeds operator per-transaction limit' },
  6002: { code: 'POLICY_EXCEEDS_DAILY_LIMIT', message: 'Transfer exceeds operator daily limit' },
  6003: { code: 'ACCOUNT_PAUSED', message: 'Account is paused' },
  6004: { code: 'MAX_OPERATORS', message: 'Maximum operators reached' },
  6005: { code: 'OPERATOR_NOT_FOUND', message: 'Operator not found' },
  6006: { code: 'OPERATOR_EXISTS', message: 'Operator slot already occupied' },
  6007: { code: 'INSUFFICIENT_BALANCE', message: 'Insufficient token balance' },
  6008: { code: 'MATH_OVERFLOW', message: 'Mathematical overflow' },
};
```

Add a `toSilkysigError(err: unknown): SdkError` function that uses `SILKYSIG_ERROR_MAP` instead of `ANCHOR_ERROR_MAP`. Same logic as `toSdkError` but with the different map.

---

## Task 2: Extend config with account field

**Modify:** `packages/sdk/src/config.ts`

Add an optional `account` field to `HandshakeConfig`:

```ts
export interface AccountInfo {
  pda: string;
  owner: string;
  mint: string;
  mintDecimals: number;    // decimals for human-readable conversion
  operatorIndex: number;
  perTxLimit: number;      // in token smallest units (0 = unlimited)
  syncedAt: string;        // ISO timestamp of last sync
}

export interface HandshakeConfig {
  wallets: WalletEntry[];
  defaultWallet: string;
  preferences: Record<string, unknown>;
  apiUrl?: string;
  account?: AccountInfo; // Silkysig account synced by `silk account sync`
}
```

No changes to `loadConfig`/`saveConfig` — they already serialize/deserialize the full object.

---

## Task 3: Create `account` commands

**New file:** `packages/sdk/src/commands/account.ts`

Three commands: `sync`, `status`, `send`.

### `accountSync(opts: { wallet?: string; account?: string })`

Discovers the agent's Silkysig account by operator pubkey and saves it to config.

**`--account <pda>` flag:** If provided, skips the by-operator lookup entirely and syncs directly from `GET /api/account/:pda` (verifying the wallet is actually an operator on that account). Useful when the agent has multiple accounts and needs to switch.

Flow:
1. Load config, get wallet
2. If `--account <pda>` provided:
   - Call `GET /api/account/:pda`
   - Verify wallet is an operator on the account (error if not)
   - Save to config and output (same as single-match case below)
3. Otherwise, call `GET /api/account/by-operator/:walletAddress`
4. **When 0 accounts found:**
   - Output: `"No account found for wallet \"<label>\" (<walletAddress>)."`
   - Output: `"Ask your human to set up your account at:\n  https://app.silkyway.ai/account/setup?agent=<walletAddress>"`
   - Exit (not an error — just informational)
5. **When 1 account found:**
   - Auto-select. Extract: `pda`, `owner`, `mint`, `mintDecimals`, operator slot info
   - Save to config: `account = { pda, owner, mint, mintDecimals, operatorIndex, perTxLimit, syncedAt: new Date().toISOString() }`
   - Output: `{ action: "sync", pda, owner, balance, perTxLimit, mint }`
6. **When multiple accounts found:**
   - Auto-select the first one (most common case — agent just got added)
   - Save first to config (same as single-match case)
   - Output all found accounts so the agent/user can see them
   - Output hint: `"To use a different account: silk account sync --account <pda>"`

### `accountStatus(opts: { wallet?: string })`

Shows current account state by fetching fresh data from the backend.

Flow:
1. Load config, check `config.account` exists. If not: error "No account synced. Run: silk account sync"
2. Call `GET /api/account/:pda`
3. Output:
```
{
  action: "status",
  pda,
  owner,
  balance,        // token balance in human units (e.g. 5.00)
  mint,
  isPaused,
  operatorIndex,
  perTxLimit,     // in human units (e.g. 5.00)
}
```

### `accountSend(recipient: string, amount: string, opts: { memo?: string; wallet?: string })`

Sends tokens from the Silkysig account via `transfer_from_account`. This is the policy-enforced transfer.

Flow:
1. Load config, get wallet, check `config.account` exists
2. Validate recipient address, validate amount > 0
3. Convert amount to smallest units using `config.account.mintDecimals` (e.g., `amount * 10^mintDecimals`)
4. Call `POST /api/account/transfer` with `{ signer: walletAddress, accountPda: config.account.pda, recipient, amount: amountRaw }`
5. Receive unsigned transaction (base64)
6. Deserialize → sign with wallet keypair → serialize
7. Submit via `POST /api/tx/submit`
8. On success: output `{ action: "send", txid, amount, recipient }`
9. On failure: catch error, use `toSilkysigError()` to parse policy rejections
   - For `POLICY_EXCEEDS_TX_LIMIT`: format a clear message like `"REJECTED by on-chain policy: amount $X.XX exceeds per-transaction limit of $Y.YY"`

**Pattern reference:** Follow `packages/sdk/src/commands/pay.ts` exactly — same build → sign → submit flow, just different endpoint.

---

## Task 4: Register `account` command group in CLI

**Modify:** `packages/sdk/src/cli.ts`

Add import and command registration:

```ts
import { accountSync, accountStatus, accountSend } from './commands/account.js';

// account commands
const account = program.command('account').description('Manage Silkysig account');
account
  .command('sync')
  .option('--wallet <label>', 'Wallet to sync')
  .option('--account <pda>', 'Sync a specific account by PDA')
  .description('Discover and sync your account')
  .action(wrapCommand(accountSync));
account
  .command('status')
  .option('--wallet <label>', 'Wallet to check')
  .description('Show account balance and policy')
  .action(wrapCommand(accountStatus));
account
  .command('send')
  .argument('<recipient>', 'Recipient wallet address')
  .argument('<amount>', 'Amount in USDC')
  .option('--memo <text>', 'Payment memo')
  .option('--wallet <label>', 'Sender wallet')
  .description('Send from account (policy-enforced)')
  .action(wrapCommand(accountSend));
```

---

## Task 5: Update SKILL.md

**Modify:** `packages/sdk/SKILL.md`

Add a new section for account-based payments. Keep existing content intact. Add:

- **Account Setup** section explaining the flow:
  1. `silk wallet create` (existing)
  2. Share setup URL with your human: `https://app.silkyway.ai/account/setup?agent=YOUR_ADDRESS`
  3. After human creates account: `silk account sync`
  4. Check status: `silk account status`
  5. Send payments: `silk account send <recipient> <amount>`

- **Command Reference** additions:
  - `silk account sync` — Discover your account (must be set up by human first)
  - `silk account sync --account <pda>` — Switch to a specific account by PDA
  - `silk account status` — Show balance and spending policy
  - `silk account send <recipient> <amount>` — Send tokens (policy-enforced on-chain)

- Note that `silk account send` is policy-enforced: the on-chain program checks the operator's per-transaction limit and rejects transfers that exceed it.

---

## Verification

1. `cd packages/sdk && npm run build` — compiles without errors
2. Start backend (`cd apps/backend && npm run start:dev`)
3. Test commands:
   - `silk account sync` → "No account found" (expected, no account exists yet)
   - `silk account status` → "No account synced" error (expected)
   - `silk account send <addr> 10` → "No account synced" error (expected)
4. Existing commands still work: `silk wallet list`, `silk balance`, etc.

Full end-to-end test requires Chunk 3 (frontend setup page) to create an account first.

---

## Files Summary

| Action | File |
|--------|------|
| New | `packages/sdk/src/commands/account.ts` |
| Modify | `packages/sdk/src/cli.ts` |
| Modify | `packages/sdk/src/config.ts` |
| Modify | `packages/sdk/src/errors.ts` |
| Modify | `packages/sdk/SKILL.md` |
