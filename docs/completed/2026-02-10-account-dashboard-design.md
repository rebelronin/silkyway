# Account Dashboard & Solscan Links

## Context

Chunks 2-4 (backend Silkysig service, SDK account commands, frontend setup page) are implemented. During testing, three areas need improvement:

1. Transaction IDs and account addresses should link to Solscan
2. The setup wizard has a step transition bug and no path to a dashboard
3. The account management view needs a redesign — clearer balance labeling, deposit/withdraw, and room to grow

---

## 1. Solscan Utility & Link Component

### `apps/silk/src/lib/solscan.ts`

```ts
export function solscanUrl(address: string, type: 'account' | 'tx'): string
```

- Reads `NEXT_PUBLIC_SOLANA_CLUSTER` env var
- If `devnet`, appends `?cluster=devnet`
- If `mainnet-beta` or absent, no query param
- Returns `https://solscan.io/{type === 'tx' ? 'tx' : 'account'}/${address}` + cluster param

### `apps/silk/src/components/SolscanLink.tsx`

Small inline component:

```tsx
<SolscanLink address={pda} type="account" />
```

- Renders truncated address (6...4 pattern) as an `<a>` tag
- Links to `solscanUrl(address, type)`
- Opens in new tab (`target="_blank" rel="noopener noreferrer"`)
- Shows small external link indicator (↗ or icon)
- Styled with `text-star-white/70 hover:text-solar-gold` for subtle clickability

### Where to apply

| Page | What to link | Current state |
|------|-------------|---------------|
| Setup wizard (toasts) | TX IDs after create/deposit/airdrop | Plain `TX: abcd1234...` |
| Setup wizard (Done step) | Account PDA, owner, operator | Plain text |
| Dashboard hero card | Account PDA, owner | New page |
| Dashboard operators tab | Operator addresses | Pulled from settings |
| Home page footer | Program address | Already linked (refactor to use shared component) |
| Transfer detail page | TX IDs | Already linked (refactor to use shared component) |
| Send page (toast) | TX ID after creation | Plain `TX: abcd1234...` |

Transfer list PDAs stay as internal links to `/transfers/:pda` — no Solscan needed there.

---

## 2. Setup Wizard Fixes

### File: `apps/silk/src/app/account/setup/page.tsx`

### Bug fix: step transition

The wizard gets stuck somewhere during the flow. Investigate by stepping through:
- Step 1 (Connect) → Step 2 (Configure): triggered by wallet connection
- Step 2 (Configure) → Step 3 (Fund): triggered after successful create TX
- Step 3 (Fund) → Step 4 (Done): triggered after successful deposit TX

Trace the actual state transitions and find where the flow breaks. Fix accordingly.

### "Go to Account" button on Done step

After the existing "Next steps — tell your agent" content, add:

```
[Go to Account →]
```

Button navigates to `/account`. Uses primary gold button styling.

---

## 3. Account Dashboard

### Route: `/account`

**New file:** `apps/silk/src/app/account/page.tsx`

Replaces `/account/settings`. All settings functionality moves here.

### No-account state

If the connected wallet has no Silk account (PDA lookup returns null), redirect to `/account/setup` (without the `?agent=` param — the setup page should handle this gracefully or show a message).

### Hero Card

```
┌─────────────────────────────────────┐
│  SILK ACCOUNT                       │
│                                     │
│  $45.00 USDC                        │
│                                     │
│  Account  9aE5kBq...x7Kf  ↗        │
│  Owner    7xKXz...mP2w    ↗        │
│  Status   Active                    │
└─────────────────────────────────────┘
```

- **"SILK ACCOUNT"** — small uppercase tracking label (`text-[0.7rem] uppercase tracking-[0.15em] text-star-white/50`)
- **Balance** — large text, formatted as `$XX.XX USDC` using `formatAmount(raw, decimals)`
- **Account PDA** — `SolscanLink` with type `account`
- **Owner** — `SolscanLink` with type `account`
- **Status** — Active (green) or Paused (orange/red)
- Card styling: `gradient-border-top border border-nebula-purple/20 p-6`

Only shows Silk account balance. Wallet balance is visible via the header wallet button.

### Tab Bar

```
  Deposit  |  Withdraw  |  Operators  |  Settings
```

- Horizontal tab row below hero card
- Active tab: `text-solar-gold border-b-2 border-solar-gold`
- Inactive: `text-star-white/40 hover:text-star-white/70`
- Extensible — easy to add more tabs later (History, Limits, etc.)

### Deposit Tab

- Amount input with `$` prefix (existing input pattern)
- "Get Devnet USDC" button — calls faucet to mint test USDC to owner's wallet
- "Deposit" button:
  1. Call `depositToAccount({ depositor: wallet, accountPda, amount: inputValue * 10^decimals })`
  2. Sign via wallet adapter
  3. Submit
  4. Toast with Solscan link to TX
  5. Refresh balance in hero card

### Withdraw Tab

- Amount input with `$` prefix
- "Withdraw to Wallet" button:
  1. Call `POST /api/account/transfer` with `{ signer: wallet, accountPda, recipient: wallet, amount }`
  2. Sign via wallet adapter
  3. Submit
  4. Toast with Solscan link
  5. Refresh balance
- Uses the existing `transfer_from_account` instruction — owner bypasses all policy checks

### Operators Tab

- List of current operators (up to 3 slots), each showing:
  - Address as `SolscanLink`
  - Per-tx limit: `$X.XX`
  - Remove button (with confirmation)
- Empty slots shown as available
- "Add Operator" form below: address input + per-tx limit input + Add button
- Pulled from existing `/account/settings` operator management code

### Settings Tab

- **Pause / Resume** toggle — existing functionality from `/account/settings`
- **Danger Zone** — Close Account button with confirmation modal
- Minimal for now, room to add more settings later

---

## 4. Navigation Changes

### Header: `apps/silk/src/components/layout/Header.tsx`

- Change "Settings" link → "Account"
- Point to `/account` instead of `/account/settings`

---

## 5. Cleanup

### Delete: `apps/silk/src/app/account/settings/page.tsx`

All functionality absorbed into `/account` dashboard tabs.

---

## Files Summary

| Action | File |
|--------|------|
| New | `apps/silk/src/lib/solscan.ts` |
| New | `apps/silk/src/components/SolscanLink.tsx` |
| New | `apps/silk/src/app/account/page.tsx` |
| Modify | `apps/silk/src/app/account/setup/page.tsx` |
| Modify | `apps/silk/src/components/layout/Header.tsx` |
| Modify | `apps/silk/src/app/send/page.tsx` |
| Modify | `apps/silk/src/app/transfers/[pda]/page.tsx` |
| Modify | `apps/silk/src/app/page.tsx` |
| Delete | `apps/silk/src/app/account/settings/page.tsx` |

## Verification

1. `cd apps/silk && npm run build` — compiles without errors
2. Start backend + frontend
3. Test setup wizard: full flow through all 4 steps, verify no step gets stuck
4. Done step: "Go to Account" button navigates to `/account`
5. Dashboard: hero card shows correct balance, PDA, owner, status
6. Deposit tab: deposit USDC, balance updates
7. Withdraw tab: withdraw to wallet, balance updates
8. Operators tab: view/add/remove operators
9. Settings tab: pause/resume, close account
10. Solscan links: click any address/TX → opens correct Solscan page
11. Existing pages still work (`/send`, `/transfers`, `/faucet`)
