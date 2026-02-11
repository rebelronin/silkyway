# Chunk 3: Frontend — Account Setup Page

## Context

The backend Account API is live (Chunk 1) and the SDK has account commands (Chunk 2). This chunk builds the human-facing setup page where account owners connect their wallet, create a Silkysig account for their agent, set spending limits, and fund it. This is the "Phase 2: Human Sets Up Account" from the MANIFESTO's Killer Demo.

**Depends on:** Chunk 1 (backend endpoints)
**Existing frontend:** `apps/app/` — Next.js app with wallet adapter (Phantom, Solflare), Jotai state, shadcn-style components, space theme.

---

## Task 1: Create account action helpers

**New file:** `apps/app/src/_jotai/account/account.actions.ts`

Helper functions for the setup page to call backend endpoints. Follow the pattern in `apps/app/src/_jotai/transfer/transfer.actions.ts`.

### Functions:

**`createAccount(params: { owner: string, mint: string, operator: string, perTxLimit: number })`**
- Calls `api.post('/api/account/create', params)`
- Returns `{ transaction: string (base64), accountPda: string }`

**`depositToAccount(params: { depositor: string, accountPda: string, amount: number })`**
- Calls `api.post('/api/account/deposit', params)`
- Returns `{ transaction: string (base64) }`

**`fetchAccount(pda: string)`**
- Calls `api.get(`/api/account/${pda}`)`
- Returns account data (balance, operators, etc.)

**`signAndSubmitAccountTx(transaction: string)`**
- Reuse the existing sign-and-submit pattern from transfer actions
- Deserialize base64 → `Transaction`, sign with wallet adapter, submit via `api.post('/api/tx/submit', { signedTx })`
- This may be extractable from the existing transfer actions as a shared utility, or just duplicate the pattern (it's ~10 lines)

---

## Task 2: Create the setup page

**New file:** `apps/app/src/app/account/setup/page.tsx`

A single-page wizard with 4 steps. Reads `?agent=PUBKEY` from URL search params. Uses existing components and styling patterns from the send page (`apps/app/src/app/send/page.tsx`).

### Step State Machine

Use a `step` state variable: `'connect' | 'configure' | 'fund' | 'done'`

### Step 1: Connect Wallet (`step === 'connect'`)

- Read `agent` param from `useSearchParams()`. If missing, show error: "Missing agent address in URL."
- Show: "Set up a Silkyway account for your agent"
- Display agent address (truncated)
- `WalletMultiButton` component (already available via wallet adapter)
- When wallet connects (detected via `useConnectedWallet` hook), auto-advance to step 2

### Step 2: Configure & Create (`step === 'configure'`)

- Show connected wallet address as "Owner"
- Show agent address as "Operator"
- Input: "Per-transaction limit" — number input, default `5`, label shows "$" prefix
- "Create Account" button
- On click:
  1. Set loading state
  2. Call `createAccount({ owner: connectedWallet, mint: USDC_MINT_ADDRESS, operator: agentPubkey, perTxLimit: inputValue * 1e6 })`
  3. Get back unsigned TX
  4. Sign with wallet adapter (triggers Phantom popup)
  5. Submit signed TX
  6. On success: save `accountPda` to component state, advance to step 3
  7. On error: show toast error

**USDC mint address:** Read from `NEXT_PUBLIC_USDC_MINT_ADDRESS` env var (same one the faucet uses).

### Step 3: Fund Account (`step === 'fund'`)

- Show account PDA (created in step 2)
- "Get Devnet USDC" button — calls existing faucet endpoint (`api.post('/api/tx/faucet', { wallet: connectedWallet, token: 'usdc' })`) to mint test USDC to the human's wallet
- Input: deposit amount, default `5`
- "Fund Account" button:
  1. Call `depositToAccount({ depositor: connectedWallet, accountPda, amount: inputValue * 1e6 })`
  2. Sign → submit
  3. On success: advance to step 4
- Also: "Airdrop SOL to agent" button — calls faucet with the agent's pubkey so the agent has SOL for tx fees (`api.post('/api/tx/faucet', { wallet: agentPubkey })`)

### Step 4: Done (`step === 'done'`)

The choreographed prompt — this is the critical UX moment.

Display:
```
Account created and funded

  Account:  [accountPda, truncated]
  Owner:    [your wallet, truncated]
  Operator: [agent address, truncated]
  Balance:  $X.XX USDC
  Policy:   max $Y.YY per transaction

Next steps — tell your agent:

  1. Run: silk account sync
  2. Then try: "Send $[2x the limit] to [your wallet address]"
     (Watch what happens.)
```

The key detail: step 2 tells the human to ask the agent to **exceed the limit**. The amount should be 2x the per_tx_limit they set (e.g., if they set $5, suggest "Send $10"). The human's own wallet address is shown so they can copy it.

---

## Task 3: Styling

Follow the existing app's patterns exactly:
- Same page layout as `/send`: `mx-auto max-w-xl px-8 py-10`
- Same card styling: `gradient-border-top border border-nebula-purple/20 p-6` with the linear-gradient background
- Same input styling: `border border-nebula-purple/20 bg-deep-space/80 px-3 py-2.5 text-[0.8rem]`
- Same button styling: `border border-solar-gold/30 bg-solar-gold/10 text-solar-gold`
- Same label styling: `text-[0.7rem] uppercase tracking-[0.15em] text-star-white/50`
- Step indicator: simple text at top showing which step (e.g., "Step 2 of 4 — Configure Policy")
- Use `toast` from `react-toastify` for success/error messages (already in layout)

No new UI components needed — everything can use raw Tailwind with the existing patterns.

---

## Task 4: No header/nav changes needed

The setup page is a standalone flow — agents and humans arrive via direct URL. It doesn't need to appear in the header navigation. The existing layout (with Header) wraps all pages, which is fine — the header provides the wallet connect button.

---

## Verification

1. `cd apps/app && npm run build` — compiles without errors
2. Start backend and frontend
3. Full flow test:
   - Visit `localhost:3000/account/setup?agent=SOME_VALID_PUBKEY`
   - Connect Phantom wallet
   - Set $5 limit → "Create Account" → sign in Phantom → success
   - Get devnet USDC → Fund $10 → sign → success
   - See "Next steps" message with choreographed prompt
4. In terminal with SDK:
   - `silk account sync` → finds the account
   - `silk account send <your-wallet> 10` → **REJECTED** (exceeds $5 limit)
   - `silk account send <your-wallet> 3` → **SUCCESS**
5. Existing pages still work (`/send`, `/transfers`, `/faucet`)

---

## Files Summary

| Action | File |
|--------|------|
| New | `apps/app/src/app/account/setup/page.tsx` |
| New | `apps/app/src/_jotai/account/account.actions.ts` |
