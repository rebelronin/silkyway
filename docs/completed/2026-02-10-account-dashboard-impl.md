# Account Dashboard & Solscan Links — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Solscan links throughout the app, fix the setup wizard, and build a tabbed account dashboard at `/account` that replaces the old `/account/settings` page.

**Architecture:** Shared `solscanUrl()` utility + `SolscanLink` component used across all pages. New `/account` page with hero card and 4 tabs (Deposit, Withdraw, Operators, Settings) absorbs all functionality from the old settings page. A new `transferFromAccount` action enables withdrawals.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind CSS 4 (CSS-based config), Jotai, Solana wallet-adapter, react-toastify

**Design doc:** `docs/plans/2026-02-10-account-dashboard-design.md`

---

## Task 1: Solscan Utility & SolscanLink Component

**Files:**
- Create: `apps/silk/src/lib/solscan.ts`
- Create: `apps/silk/src/components/SolscanLink.tsx`

### Step 1: Create the solscanUrl utility

Create `apps/silk/src/lib/solscan.ts`:

```ts
const CLUSTER = process.env.NEXT_PUBLIC_SOLANA_CLUSTER;

export function solscanUrl(address: string, type: 'account' | 'tx'): string {
  const path = type === 'tx' ? 'tx' : 'account';
  const base = `https://solscan.io/${path}/${address}`;
  if (CLUSTER === 'devnet') return `${base}?cluster=devnet`;
  return base;
}
```

### Step 2: Create the SolscanLink component

Create `apps/silk/src/components/SolscanLink.tsx`:

```tsx
import { solscanUrl } from '@/lib/solscan';

export function SolscanLink({ address, type }: { address: string; type: 'account' | 'tx' }) {
  const display = address.length > 12
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : address;

  return (
    <a
      href={solscanUrl(address, type)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-mono text-star-white/70 underline underline-offset-4 transition-colors hover:text-solar-gold"
    >
      {display}
      <span className="text-[0.65em]">↗</span>
    </a>
  );
}
```

### Step 3: Verify build

```bash
cd apps/silk && npx next build 2>&1 | tail -5
```

Expected: Build succeeds (unused files are fine — they'll be imported in later tasks).

### Step 4: Commit

```bash
git add apps/silk/src/lib/solscan.ts apps/silk/src/components/SolscanLink.tsx
git commit -m "feat: add solscanUrl utility and SolscanLink component"
```

---

## Task 2: Add transferFromAccount Action

The withdraw tab needs an action to call `POST /api/account/transfer`. This endpoint already exists in the backend (`apps/backend/src/api/controller/account.controller.ts:124`). The frontend just needs a new action function.

**Files:**
- Modify: `apps/silk/src/_jotai/account/account.actions.ts`

### Step 1: Add the action

In `apps/silk/src/_jotai/account/account.actions.ts`, add after the `depositToAccount` callback (after line 23), before the `fetchAccount` callback:

```ts
  const transferFromAccount = useCallback(
    async (params: { signer: string; accountPda: string; recipient: string; amount: number }) => {
      const res = await api.post('/api/account/transfer', params);
      return res.data.data as { transaction: string };
    },
    [],
  );
```

Also add `transferFromAccount` to the return object:

```ts
  return {
    createAccount,
    depositToAccount,
    transferFromAccount,
    fetchAccount,
    signAndSubmit,
    togglePause,
    addOperator,
    removeOperator,
    closeAccount,
  };
```

### Step 2: Verify build

```bash
cd apps/silk && npx next build 2>&1 | tail -5
```

Expected: Build succeeds.

### Step 3: Commit

```bash
git add apps/silk/src/_jotai/account/account.actions.ts
git commit -m "feat: add transferFromAccount action for account withdrawals"
```

---

## Task 3: Account Dashboard — Hero Card & Tab Skeleton

**Files:**
- Create: `apps/silk/src/app/account/page.tsx`

This task creates the full dashboard page. It's the largest single file. The page has:
- Account loading/redirect logic (ported from settings page)
- Hero card with balance, PDA, owner, status
- Tab bar with 4 tabs
- All 4 tab panels (Deposit, Withdraw, Operators, Settings)

### Step 1: Create the dashboard page

Create `apps/silk/src/app/account/page.tsx` with the complete implementation below.

**Key patterns ported from the existing settings page (`apps/silk/src/app/account/settings/page.tsx`):**
- `loadAccount` callback with PDA derivation (settings:60-75)
- Auto-redirect to `/account/setup` when no account found (settings:84-88)
- `handleTogglePause` (settings:108-121)
- `handleAddOperator` (settings:123-151)
- `handleRemoveOperator` (settings:153-170)
- `handleCloseAccount` (settings:172-186)

**New functionality:**
- Tab state management (`useState<'deposit' | 'withdraw' | 'operators' | 'settings'>`)
- Hero card with `SolscanLink` components
- Deposit tab (ported from setup wizard Fund step)
- Withdraw tab (new — uses `transferFromAccount`)
- Toast messages with `SolscanLink` JSX for TX IDs

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { PublicKey } from '@solana/web3.js';
import { useConnectedWallet } from '@/hooks/useConnectedWallet';
import { useAccountActions } from '@/_jotai/account/account.actions';
import { useTransferActions } from '@/_jotai/transfer/transfer.actions';
import { SolscanLink } from '@/components/SolscanLink';
import { solscanUrl } from '@/lib/solscan';
import { toast } from 'react-toastify';

const PROGRAM_ID = new PublicKey('8MDFar9moBycSXb6gdZgqkiSEGRBRkzxa7JPLddqYcKs');

type Tab = 'deposit' | 'withdraw' | 'operators' | 'settings';

const TABS: { key: Tab; label: string }[] = [
  { key: 'deposit', label: 'Deposit' },
  { key: 'withdraw', label: 'Withdraw' },
  { key: 'operators', label: 'Operators' },
  { key: 'settings', label: 'Settings' },
];

function formatAmount(raw: string | number, decimals: number) {
  return (Number(raw) / 10 ** decimals).toFixed(2);
}

interface AccountData {
  pda: string;
  owner: string;
  mint: string;
  mintDecimals: number;
  isPaused: boolean;
  balance: number;
  operators: Array<{
    index: number;
    pubkey: string;
    perTxLimit: string;
    dailyLimit: string;
  }>;
}

export default function AccountDashboardPage() {
  const router = useRouter();
  const { publicKey, isConnected } = useConnectedWallet();
  const {
    fetchAccount,
    depositToAccount,
    transferFromAccount,
    togglePause,
    addOperator,
    removeOperator,
    closeAccount,
    signAndSubmit,
  } = useAccountActions();
  const { requestFaucet } = useTransferActions();

  const [account, setAccount] = useState<AccountData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('deposit');

  // Deposit state
  const [depositAmount, setDepositAmount] = useState('');
  const [depositLoading, setDepositLoading] = useState(false);
  const [faucetLoading, setFaucetLoading] = useState(false);

  // Withdraw state
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawLoading, setWithdrawLoading] = useState(false);

  // Operator state
  const [newOperator, setNewOperator] = useState('');
  const [newPerTxLimit, setNewPerTxLimit] = useState('5');
  const [addOpLoading, setAddOpLoading] = useState(false);
  const [removeOpLoading, setRemoveOpLoading] = useState<string | null>(null);

  // Settings state
  const [pauseLoading, setPauseLoading] = useState(false);
  const [closeLoading, setCloseLoading] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  const walletAddress = publicKey?.toBase58() ?? '';

  const loadAccount = useCallback(async () => {
    if (!publicKey) return;
    setLoading(true);
    try {
      const [pda] = PublicKey.findProgramAddressSync(
        [Buffer.from('account'), publicKey.toBuffer()],
        PROGRAM_ID,
      );
      const data = await fetchAccount(pda.toBase58());
      setAccount(data);
    } catch {
      setAccount(null);
    } finally {
      setLoading(false);
    }
  }, [publicKey, fetchAccount]);

  useEffect(() => {
    if (isConnected) {
      loadAccount();
    }
  }, [isConnected, loadAccount]);

  useEffect(() => {
    if (!loading && !account && isConnected) {
      router.push('/account/setup');
    }
  }, [loading, account, isConnected, router]);

  // ── Deposit handlers ──

  const handleGetUsdc = async () => {
    if (!walletAddress) return;
    setFaucetLoading(true);
    try {
      await requestFaucet(walletAddress, 'usdc');
      toast.success('Devnet USDC received!');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Faucet request failed');
    } finally {
      setFaucetLoading(false);
    }
  };

  const handleDeposit = async () => {
    if (!walletAddress || !account) return;
    const amt = parseFloat(depositAmount) || 0;
    if (amt <= 0) return;
    setDepositLoading(true);
    try {
      const { transaction } = await depositToAccount({
        depositor: walletAddress,
        accountPda: account.pda,
        amount: amt * 10 ** account.mintDecimals,
      });
      toast.info('Please approve the transaction in your wallet...');
      const txid = await signAndSubmit(transaction);
      toast.success(
        <span>Deposited! TX: <a href={solscanUrl(txid, 'tx')} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-solar-gold">{txid.slice(0, 8)}...</a></span>,
      );
      setDepositAmount('');
      await loadAccount();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Deposit failed');
    } finally {
      setDepositLoading(false);
    }
  };

  // ── Withdraw handlers ──

  const handleWithdraw = async () => {
    if (!walletAddress || !account) return;
    const amt = parseFloat(withdrawAmount) || 0;
    if (amt <= 0) return;
    setWithdrawLoading(true);
    try {
      const { transaction } = await transferFromAccount({
        signer: walletAddress,
        accountPda: account.pda,
        recipient: walletAddress,
        amount: amt * 10 ** account.mintDecimals,
      });
      toast.info('Please approve the transaction in your wallet...');
      const txid = await signAndSubmit(transaction);
      toast.success(
        <span>Withdrawn! TX: <a href={solscanUrl(txid, 'tx')} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-solar-gold">{txid.slice(0, 8)}...</a></span>,
      );
      setWithdrawAmount('');
      await loadAccount();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Withdrawal failed');
    } finally {
      setWithdrawLoading(false);
    }
  };

  // ── Operator handlers ──

  const handleAddOperator = async () => {
    if (!account) return;
    const limitNum = parseFloat(newPerTxLimit) || 0;
    if (!newOperator || limitNum < 0) return;
    try {
      new PublicKey(newOperator);
    } catch {
      toast.error('Invalid operator public key');
      return;
    }
    setAddOpLoading(true);
    try {
      const { transaction } = await addOperator({
        owner: walletAddress,
        accountPda: account.pda,
        operator: newOperator,
        perTxLimit: limitNum * 10 ** account.mintDecimals,
      });
      toast.info('Please approve the transaction in your wallet...');
      await signAndSubmit(transaction);
      toast.success('Operator added');
      setNewOperator('');
      setNewPerTxLimit('5');
      await loadAccount();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to add operator');
    } finally {
      setAddOpLoading(false);
    }
  };

  const handleRemoveOperator = async (operatorPubkey: string) => {
    if (!account) return;
    setRemoveOpLoading(operatorPubkey);
    try {
      const { transaction } = await removeOperator({
        owner: walletAddress,
        accountPda: account.pda,
        operator: operatorPubkey,
      });
      toast.info('Please approve the transaction in your wallet...');
      await signAndSubmit(transaction);
      toast.success('Operator removed');
      await loadAccount();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove operator');
    } finally {
      setRemoveOpLoading(null);
    }
  };

  // ── Settings handlers ──

  const handleTogglePause = async () => {
    if (!account) return;
    setPauseLoading(true);
    try {
      const { transaction } = await togglePause({ owner: walletAddress, accountPda: account.pda });
      toast.info('Please approve the transaction in your wallet...');
      await signAndSubmit(transaction);
      toast.success(account.isPaused ? 'Account resumed' : 'Account paused');
      await loadAccount();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to toggle pause');
    } finally {
      setPauseLoading(false);
    }
  };

  const handleCloseAccount = async () => {
    if (!account) return;
    setCloseLoading(true);
    try {
      const { transaction } = await closeAccount({ owner: walletAddress, accountPda: account.pda });
      toast.info('Please approve the transaction in your wallet...');
      await signAndSubmit(transaction);
      toast.success('Account closed — tokens swept to your wallet');
      setShowCloseConfirm(false);
      setTimeout(() => router.push('/account/setup'), 1500);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to close account');
    } finally {
      setCloseLoading(false);
    }
  };

  // ── Render gates ──

  if (!isConnected) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-[1200px] items-center justify-center px-8">
        <p className="text-[0.85rem] text-star-white/40">Connect your wallet to view your account.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-[1200px] items-center justify-center px-8">
        <p className="text-[0.85rem] text-star-white/40">Loading account...</p>
      </div>
    );
  }

  if (!account) return null;

  return (
    <div className="mx-auto max-w-xl px-8 py-10">
      {/* Hero Card */}
      <div
        className="gradient-border-top mb-6 border border-nebula-purple/20 p-6"
        style={{ background: 'linear-gradient(180deg, rgba(168, 85, 247, 0.04) 0%, rgba(12, 0, 21, 0.8) 100%)' }}
      >
        <div className="text-[0.7rem] uppercase tracking-[0.15em] text-star-white/50">
          Silk Account
        </div>
        <div className="mt-3 font-display text-3xl font-black text-star-white">
          ${formatAmount(account.balance, account.mintDecimals)}
          <span className="ml-2 text-base font-normal text-star-white/30">USDC</span>
        </div>
        <div className="mt-5 space-y-2">
          <div className="flex items-center justify-between text-[0.8rem]">
            <span className="text-star-white/50">Account</span>
            <SolscanLink address={account.pda} type="account" />
          </div>
          <div className="flex items-center justify-between text-[0.8rem]">
            <span className="text-star-white/50">Owner</span>
            <SolscanLink address={account.owner} type="account" />
          </div>
          <div className="flex items-center justify-between text-[0.8rem]">
            <span className="text-star-white/50">Status</span>
            {account.isPaused ? (
              <span className="border border-red-400/30 bg-red-400/10 px-2 py-0.5 text-[0.7rem] font-medium uppercase tracking-[0.1em] text-red-400">
                Paused
              </span>
            ) : (
              <span className="border border-green-400/30 bg-green-400/10 px-2 py-0.5 text-[0.7rem] font-medium uppercase tracking-[0.1em] text-green-400">
                Active
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="mb-6 flex border-b border-nebula-purple/15">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-[0.75rem] font-medium uppercase tracking-[0.15em] transition-colors ${
              tab === key
                ? 'border-b-2 border-solar-gold text-solar-gold'
                : 'text-star-white/40 hover:text-star-white/70'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab Panels */}
      <div
        className="border border-nebula-purple/20 p-6"
        style={{ background: 'linear-gradient(180deg, rgba(168, 85, 247, 0.04) 0%, rgba(12, 0, 21, 0.8) 100%)' }}
      >
        {/* ── Deposit Tab ── */}
        {tab === 'deposit' && (
          <div className="space-y-5">
            <h2 className="mb-5 text-[0.85rem] font-medium uppercase tracking-[0.2em] text-solar-gold">
              Deposit
            </h2>

            <button
              onClick={handleGetUsdc}
              disabled={faucetLoading}
              className="h-10 w-full border border-nebula-purple/30 bg-nebula-purple/10 text-[0.8rem] font-medium uppercase tracking-[0.15em] text-nebula-purple transition-all hover:border-nebula-purple/50 hover:bg-nebula-purple/18 disabled:opacity-30"
            >
              {faucetLoading ? 'Requesting...' : 'Get Devnet USDC'}
            </button>

            <div className="space-y-1.5">
              <label htmlFor="depositAmount" className="block text-[0.7rem] uppercase tracking-[0.15em] text-star-white/50">
                Deposit amount
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[0.8rem] text-star-white/30">$</span>
                <input
                  id="depositAmount"
                  type="number"
                  step="any"
                  min="0"
                  placeholder="0.00"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="w-full border border-nebula-purple/20 bg-deep-space/80 py-2.5 pl-7 pr-3 text-[0.8rem] text-star-white placeholder:text-star-white/15 transition-colors focus:border-solar-gold/30 focus:outline-none"
                />
              </div>
            </div>

            <button
              onClick={handleDeposit}
              disabled={depositLoading || (parseFloat(depositAmount) || 0) <= 0}
              className="h-10 w-full border border-solar-gold/30 bg-solar-gold/10 text-[0.8rem] font-medium uppercase tracking-[0.15em] text-solar-gold transition-all hover:border-solar-gold/50 hover:bg-solar-gold/18 hover:shadow-[0_0_20px_rgba(251,191,36,0.15)] disabled:opacity-30 disabled:hover:shadow-none"
            >
              {depositLoading ? 'Depositing...' : 'Deposit'}
            </button>
          </div>
        )}

        {/* ── Withdraw Tab ── */}
        {tab === 'withdraw' && (
          <div className="space-y-5">
            <h2 className="mb-5 text-[0.85rem] font-medium uppercase tracking-[0.2em] text-solar-gold">
              Withdraw
            </h2>

            <div className="space-y-1.5">
              <label htmlFor="withdrawAmount" className="block text-[0.7rem] uppercase tracking-[0.15em] text-star-white/50">
                Withdraw amount
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[0.8rem] text-star-white/30">$</span>
                <input
                  id="withdrawAmount"
                  type="number"
                  step="any"
                  min="0"
                  placeholder="0.00"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  className="w-full border border-nebula-purple/20 bg-deep-space/80 py-2.5 pl-7 pr-3 text-[0.8rem] text-star-white placeholder:text-star-white/15 transition-colors focus:border-solar-gold/30 focus:outline-none"
                />
              </div>
            </div>

            <button
              onClick={handleWithdraw}
              disabled={withdrawLoading || (parseFloat(withdrawAmount) || 0) <= 0}
              className="h-10 w-full border border-solar-gold/30 bg-solar-gold/10 text-[0.8rem] font-medium uppercase tracking-[0.15em] text-solar-gold transition-all hover:border-solar-gold/50 hover:bg-solar-gold/18 hover:shadow-[0_0_20px_rgba(251,191,36,0.15)] disabled:opacity-30 disabled:hover:shadow-none"
            >
              {withdrawLoading ? 'Withdrawing...' : 'Withdraw to Wallet'}
            </button>
          </div>
        )}

        {/* ── Operators Tab ── */}
        {tab === 'operators' && (
          <div className="space-y-5">
            <h2 className="mb-5 text-[0.85rem] font-medium uppercase tracking-[0.2em] text-solar-gold">
              Operators
            </h2>

            {account.operators.length === 0 ? (
              <p className="text-[0.8rem] text-star-white/40">No operators configured.</p>
            ) : (
              <div className="space-y-2">
                {account.operators.map((op) => (
                  <div key={op.pubkey} className="flex items-center justify-between border border-nebula-purple/15 bg-deep-space/80 px-3 py-2.5">
                    <div className="flex items-center gap-3">
                      <SolscanLink address={op.pubkey} type="account" />
                      <span className="text-[0.7rem] text-star-white/40">
                        ${formatAmount(op.perTxLimit, account.mintDecimals)}/tx
                      </span>
                    </div>
                    <button
                      onClick={() => handleRemoveOperator(op.pubkey)}
                      disabled={removeOpLoading === op.pubkey}
                      className="text-[0.7rem] font-medium uppercase tracking-[0.15em] text-red-400 transition-colors hover:text-red-300 disabled:opacity-30"
                    >
                      {removeOpLoading === op.pubkey ? 'Removing...' : 'Remove'}
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-3 border-t border-nebula-purple/15 pt-4">
              <div className="space-y-1.5">
                <label className="block text-[0.7rem] uppercase tracking-[0.15em] text-star-white/50">
                  Operator public key
                </label>
                <input
                  type="text"
                  value={newOperator}
                  onChange={(e) => setNewOperator(e.target.value)}
                  placeholder="Pubkey..."
                  className="w-full border border-nebula-purple/20 bg-deep-space/80 px-3 py-2.5 text-[0.8rem] text-star-white placeholder:text-star-white/15 transition-colors focus:border-solar-gold/30 focus:outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-[0.7rem] uppercase tracking-[0.15em] text-star-white/50">
                  Per-transaction limit
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[0.8rem] text-star-white/30">$</span>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={newPerTxLimit}
                    onChange={(e) => setNewPerTxLimit(e.target.value)}
                    className="w-full border border-nebula-purple/20 bg-deep-space/80 py-2.5 pl-7 pr-3 text-[0.8rem] text-star-white placeholder:text-star-white/15 transition-colors focus:border-solar-gold/30 focus:outline-none"
                  />
                </div>
              </div>
              <button
                onClick={handleAddOperator}
                disabled={addOpLoading || !newOperator}
                className="h-10 w-full border border-solar-gold/30 bg-solar-gold/10 text-[0.8rem] font-medium uppercase tracking-[0.15em] text-solar-gold transition-all hover:border-solar-gold/50 hover:bg-solar-gold/18 hover:shadow-[0_0_20px_rgba(251,191,36,0.15)] disabled:opacity-30 disabled:hover:shadow-none"
              >
                {addOpLoading ? 'Adding...' : 'Add Operator'}
              </button>
            </div>
          </div>
        )}

        {/* ── Settings Tab ── */}
        {tab === 'settings' && (
          <div className="space-y-6">
            <div>
              <h2 className="mb-5 text-[0.85rem] font-medium uppercase tracking-[0.2em] text-solar-gold">
                Account Status
              </h2>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-[0.8rem] text-star-white/50">Status</span>
                  {account.isPaused ? (
                    <span className="border border-red-400/30 bg-red-400/10 px-2 py-0.5 text-[0.7rem] font-medium uppercase tracking-[0.1em] text-red-400">
                      Paused
                    </span>
                  ) : (
                    <span className="border border-green-400/30 bg-green-400/10 px-2 py-0.5 text-[0.7rem] font-medium uppercase tracking-[0.1em] text-green-400">
                      Active
                    </span>
                  )}
                </div>
                <button
                  onClick={handleTogglePause}
                  disabled={pauseLoading}
                  className="h-9 border border-nebula-purple/30 bg-nebula-purple/10 px-4 text-[0.75rem] font-medium uppercase tracking-[0.15em] text-nebula-purple transition-all hover:border-nebula-purple/50 hover:bg-nebula-purple/18 disabled:opacity-30"
                >
                  {pauseLoading ? 'Processing...' : account.isPaused ? 'Resume Account' : 'Pause Account'}
                </button>
              </div>
            </div>

            <div className="border-t border-nebula-purple/15 pt-6">
              <h2 className="mb-3 text-[0.85rem] font-medium uppercase tracking-[0.2em] text-red-400">
                Danger Zone
              </h2>
              <p className="mb-4 text-[0.8rem] text-star-white/40">
                Closing your account will sweep all remaining tokens to your wallet and permanently delete the account.
              </p>
              <button
                onClick={() => setShowCloseConfirm(true)}
                className="h-10 w-full border border-red-400/30 bg-red-400/10 text-[0.8rem] font-medium uppercase tracking-[0.15em] text-red-400 transition-all hover:border-red-400/50 hover:bg-red-400/18"
              >
                Close Account
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Close Confirmation Overlay */}
      {showCloseConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md border border-red-400/20 bg-deep-space p-6">
            <h3 className="mb-3 text-[0.85rem] font-medium uppercase tracking-[0.2em] text-red-400">
              Confirm Close Account
            </h3>
            <p className="mb-6 text-[0.8rem] text-star-white/50">
              This will sweep all tokens to your wallet and permanently close the account. This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowCloseConfirm(false)}
                disabled={closeLoading}
                className="h-10 flex-1 border border-nebula-purple/20 bg-transparent text-[0.8rem] font-medium uppercase tracking-[0.15em] text-star-white/50 transition-all hover:border-nebula-purple/40 hover:text-star-white/70"
              >
                Cancel
              </button>
              <button
                onClick={handleCloseAccount}
                disabled={closeLoading}
                className="h-10 flex-1 border border-red-400/30 bg-red-400/10 text-[0.8rem] font-medium uppercase tracking-[0.15em] text-red-400 transition-all hover:border-red-400/50 hover:bg-red-400/18 disabled:opacity-30"
              >
                {closeLoading ? 'Closing...' : 'Confirm Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

### Step 2: Verify build

```bash
cd apps/silk && npx next build 2>&1 | tail -5
```

Expected: Build succeeds. The page should render at `/account`.

### Step 3: Commit

```bash
git add apps/silk/src/app/account/page.tsx
git commit -m "feat: add account dashboard with hero card, deposit, withdraw, operators, settings tabs"
```

---

## Task 4: Setup Wizard — Solscan Links + "Go to Account" Button

**Files:**
- Modify: `apps/silk/src/app/account/setup/page.tsx`

### Step 1: Add Solscan imports

At the top of `apps/silk/src/app/account/setup/page.tsx`, add after the existing imports (after line 10):

```ts
import { SolscanLink } from '@/components/SolscanLink';
import { solscanUrl } from '@/lib/solscan';
```

### Step 2: Add Link import

The "Go to Account" button needs `Link` from Next.js. Add to the existing imports:

```ts
import Link from 'next/link';
```

### Step 3: Replace toast TX messages with Solscan links

In `handleCreate` (around line 96), replace:
```ts
      toast.success(`Account created! TX: ${txid.slice(0, 8)}...`);
```
with:
```ts
      toast.success(
        <span>Account created! TX: <a href={solscanUrl(txid, 'tx')} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-solar-gold">{txid.slice(0, 8)}...</a></span>,
      );
```

In `handleFund` (around line 132), replace:
```ts
      toast.success(`Account funded! TX: ${txid.slice(0, 8)}...`);
```
with:
```ts
      toast.success(
        <span>Account funded! TX: <a href={solscanUrl(txid, 'tx')} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-solar-gold">{txid.slice(0, 8)}...</a></span>,
      );
```

### Step 4: Replace plain text addresses in Done step with SolscanLink

In the Done step (step === 'done' block, around lines 314-335), replace the plain `truncate()` calls with `SolscanLink`:

Replace the Account row:
```tsx
              <div className="flex justify-between text-[0.8rem]">
                <span className="text-star-white/50">Account</span>
                <span className="font-mono text-star-white/70">{truncate(accountPda)}</span>
              </div>
```
with:
```tsx
              <div className="flex justify-between text-[0.8rem]">
                <span className="text-star-white/50">Account</span>
                <SolscanLink address={accountPda} type="account" />
              </div>
```

Replace the Owner row:
```tsx
              <div className="flex justify-between text-[0.8rem]">
                <span className="text-star-white/50">Owner</span>
                <span className="font-mono text-star-white/70">{truncate(walletAddress)}</span>
              </div>
```
with:
```tsx
              <div className="flex justify-between text-[0.8rem]">
                <span className="text-star-white/50">Owner</span>
                <SolscanLink address={walletAddress} type="account" />
              </div>
```

Replace the Operator row:
```tsx
              <div className="flex justify-between text-[0.8rem]">
                <span className="text-star-white/50">Operator</span>
                <span className="font-mono text-star-white/70">{truncate(agentParam!)}</span>
              </div>
```
with:
```tsx
              <div className="flex justify-between text-[0.8rem]">
                <span className="text-star-white/50">Operator</span>
                <SolscanLink address={agentParam!} type="account" />
              </div>
```

### Step 5: Add "Go to Account" button after the "Next steps" callout

After the closing `</div>` of the `border-l-2 border-solar-gold` callout block (around line 344), add:

```tsx
            <Link
              href="/account"
              className="mt-2 flex h-10 w-full items-center justify-center border border-solar-gold/30 bg-solar-gold/10 text-[0.8rem] font-medium uppercase tracking-[0.15em] text-solar-gold transition-all hover:border-solar-gold/50 hover:bg-solar-gold/18 hover:shadow-[0_0_20px_rgba(251,191,36,0.15)]"
            >
              Go to Account →
            </Link>
```

### Step 6: Investigate and fix step transition bug

The design says the wizard "gets stuck somewhere during the flow." Debug by stepping through each transition:

1. **Step 1→2 (connect → configure):** Triggered by `useEffect` when `isConnected` changes (line 64-68). This should work — the effect runs when `isConnected` transitions from false to true.

2. **Step 2→3 (configure → fund):** Triggered by `setStep('fund')` inside `handleCreate` success path (line 98). If the create transaction fails silently or the `setStep` call is never reached, the wizard sticks on step 2. Verify the `createAccount` API call returns correctly and `signAndSubmit` resolves.

3. **Step 3→4 (fund → done):** Triggered by `setStep('done')` inside `handleFund` success path (line 133). Same pattern as above.

**Action:** Run the app locally, connect wallet, and step through the wizard. Add temporary `console.log` statements at each transition if needed:

```ts
// In handleCreate, before setStep:
console.log('CREATE SUCCESS, transitioning to fund', { pda, txid });
setStep('fund');

// In handleFund, before setStep:
console.log('FUND SUCCESS, transitioning to done', { txid });
setStep('done');
```

Fix whatever is found. Remove console.logs after fixing. If the bug is a race condition with `isConnected`, ensure the `useEffect` dependency array is correct. If the bug is a failed API call that's silently caught, check the error handling.

### Step 7: Verify build

```bash
cd apps/silk && npx next build 2>&1 | tail -5
```

Expected: Build succeeds.

### Step 8: Commit

```bash
git add apps/silk/src/app/account/setup/page.tsx
git commit -m "fix: setup wizard Solscan links, Go to Account button, step transition debug"
```

---

## Task 5: Refactor Transfer Detail Page to Use SolscanLink

**Files:**
- Modify: `apps/silk/src/app/transfers/[pda]/page.tsx`

### Step 1: Add imports

At the top of `apps/silk/src/app/transfers/[pda]/page.tsx`, add after the existing imports:

```ts
import { SolscanLink } from '@/components/SolscanLink';
import { solscanUrl } from '@/lib/solscan';
```

### Step 2: Replace TxLink component

Replace the entire `TxLink` function (lines 197-211):

```tsx
function TxLink({ label, txid }: { label: string; txid: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[0.75rem] uppercase tracking-[0.1em] text-star-white/30">{label}</span>
      <a
        href={`https://solscan.io/tx/${txid}?cluster=devnet`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[0.75rem] text-nebula-purple underline underline-offset-4 transition-colors hover:text-solar-gold"
      >
        {txid.slice(0, 8)}...{txid.slice(-8)}
      </a>
    </div>
  );
}
```

with:

```tsx
function TxLink({ label, txid }: { label: string; txid: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[0.75rem] uppercase tracking-[0.1em] text-star-white/30">{label}</span>
      <SolscanLink address={txid} type="tx" />
    </div>
  );
}
```

### Step 3: Replace toast TX messages with Solscan links

In `handleClaim` (around line 45), replace:
```ts
      toast.success(`Transfer claimed! TX: ${txid.slice(0, 8)}...`);
```
with:
```ts
      toast.success(
        <span>Transfer claimed! TX: <a href={solscanUrl(txid, 'tx')} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-solar-gold">{txid.slice(0, 8)}...</a></span>,
      );
```

In `handleCancel` (around line 62), replace:
```ts
      toast.success(`Transfer cancelled! TX: ${txid.slice(0, 8)}...`);
```
with:
```ts
      toast.success(
        <span>Transfer cancelled! TX: <a href={solscanUrl(txid, 'tx')} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-solar-gold">{txid.slice(0, 8)}...</a></span>,
      );
```

### Step 4: Verify build

```bash
cd apps/silk && npx next build 2>&1 | tail -5
```

### Step 5: Commit

```bash
git add apps/silk/src/app/transfers/\\[pda\\]/page.tsx
git commit -m "refactor: transfer detail page uses SolscanLink component"
```

---

## Task 6: Refactor Home Page Footer to Use SolscanLink

**Files:**
- Modify: `apps/silk/src/app/page.tsx`

### Step 1: Add import

At the top of `apps/silk/src/app/page.tsx`, add after the existing imports:

```ts
import { solscanUrl } from '@/lib/solscan';
```

### Step 2: Replace hardcoded Solscan URL in footer

In the footer (around lines 79-89), replace:

```tsx
          <footer className="absolute bottom-8 text-center">
            <div className="text-[0.6rem] uppercase tracking-[0.2em] text-nebula-purple/40">Program</div>
            <a
              href="https://solscan.io/account/HZ8paEkYZ2hKBwHoVk23doSLEad9K5duASRTGaYogmfg?cluster=devnet"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[0.65rem] tracking-[0.03em] text-star-white/20 transition-colors hover:text-solar-gold/60"
            >
              HZ8paEkYZ2hKBwHoVk23doSLEad9K5duASRTGaYogmfg
            </a>
          </footer>
```

with:

```tsx
          <footer className="absolute bottom-8 text-center">
            <div className="text-[0.6rem] uppercase tracking-[0.2em] text-nebula-purple/40">Program</div>
            <a
              href={solscanUrl('HZ8paEkYZ2hKBwHoVk23doSLEad9K5duASRTGaYogmfg', 'account')}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[0.65rem] tracking-[0.03em] text-star-white/20 transition-colors hover:text-solar-gold/60"
            >
              HZ8paEkYZ2hKBwHoVk23doSLEad9K5duASRTGaYogmfg
            </a>
          </footer>
```

Note: We keep the full address display here (no truncation) because this is a well-known program address, not a user address. The only change is using `solscanUrl()` instead of a hardcoded URL so the cluster param is dynamic.

### Step 3: Verify build

```bash
cd apps/silk && npx next build 2>&1 | tail -5
```

### Step 4: Commit

```bash
git add apps/silk/src/app/page.tsx
git commit -m "refactor: home page footer uses solscanUrl for dynamic cluster"
```

---

## Task 7: Add Solscan Links to Send Page Toast

**Files:**
- Modify: `apps/silk/src/app/send/page.tsx`

### Step 1: Add import

At the top of `apps/silk/src/app/send/page.tsx`, add after the existing imports:

```ts
import { solscanUrl } from '@/lib/solscan';
```

### Step 2: Replace toast message

In `handleSubmit` (around line 64), replace:
```ts
      toast.success(`Transfer created! TX: ${txid.slice(0, 8)}...`);
```
with:
```ts
      toast.success(
        <span>Transfer created! TX: <a href={solscanUrl(txid, 'tx')} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-solar-gold">{txid.slice(0, 8)}...</a></span>,
      );
```

### Step 3: Verify build

```bash
cd apps/silk && npx next build 2>&1 | tail -5
```

### Step 4: Commit

```bash
git add apps/silk/src/app/send/page.tsx
git commit -m "feat: send page toast includes Solscan link for TX ID"
```

---

## Task 8: Header Nav Update

**Files:**
- Modify: `apps/silk/src/components/layout/Header.tsx`

### Step 1: Update the navigation link

In `apps/silk/src/components/layout/Header.tsx`, change the last entry in `NAV_LINKS` (line 18):

Replace:
```ts
  { href: '/account/settings', label: 'Settings' },
```
with:
```ts
  { href: '/account', label: 'Account' },
```

### Step 2: Verify build

```bash
cd apps/silk && npx next build 2>&1 | tail -5
```

### Step 3: Commit

```bash
git add apps/silk/src/components/layout/Header.tsx
git commit -m "feat: header nav Settings → Account, points to /account"
```

---

## Task 9: Delete Old Settings Page

**Files:**
- Delete: `apps/silk/src/app/account/settings/page.tsx`

### Step 1: Delete the file

```bash
rm apps/silk/src/app/account/settings/page.tsx
```

If the `settings/` directory is now empty:
```bash
rmdir apps/silk/src/app/account/settings
```

### Step 2: Verify build

```bash
cd apps/silk && npx next build 2>&1 | tail -5
```

Expected: Build succeeds. No other file imports from the deleted settings page — it was a standalone route.

### Step 3: Commit

```bash
git add -u apps/silk/src/app/account/settings/
git commit -m "cleanup: delete old /account/settings page, replaced by /account dashboard"
```

---

## Task 10: Set NEXT_PUBLIC_SOLANA_CLUSTER Environment Variable

The `solscanUrl` utility reads `NEXT_PUBLIC_SOLANA_CLUSTER`. For devnet usage, this needs to be set.

**Files:**
- Modify: `apps/silk/.env.local` (or `.env` if it exists)

### Step 1: Check for existing env file

```bash
ls -la apps/silk/.env*
```

### Step 2: Add the variable

If `.env.local` exists, append to it. If not, create it:

```
NEXT_PUBLIC_SOLANA_CLUSTER=devnet
```

Note: Don't commit `.env.local` — it should be in `.gitignore`. If the project uses a `.env` template or `.env.example`, add `NEXT_PUBLIC_SOLANA_CLUSTER=devnet` there instead.

### Step 3: Verify build with env var

```bash
cd apps/silk && NEXT_PUBLIC_SOLANA_CLUSTER=devnet npx next build 2>&1 | tail -5
```

---

## Task 11: Full Build Verification & Manual Testing

### Step 1: Full build

```bash
cd apps/silk && npx next build
```

Expected: Build succeeds with zero errors.

### Step 2: Manual test checklist

Start backend + frontend and verify each item:

1. **Setup wizard** — Full flow through all 4 steps, no step gets stuck
2. **Setup Done step** — Account, Owner, Operator are Solscan links; "Go to Account →" button navigates to `/account`
3. **Dashboard hero card** — Shows balance, PDA link, owner link, status badge
4. **Deposit tab** — "Get Devnet USDC" works; deposit works; balance updates in hero card; toast has Solscan link
5. **Withdraw tab** — Withdraw works; balance updates; toast has Solscan link
6. **Operators tab** — Lists operators with Solscan links; add/remove works
7. **Settings tab** — Pause/resume toggles correctly; close account with confirmation works
8. **Header** — Shows "Account" (not "Settings"); links to `/account`; highlights correctly
9. **Send page** — Toast after send includes Solscan link for TX ID
10. **Transfer detail page** — TX links use SolscanLink component
11. **Home page footer** — Program address uses `solscanUrl()` for dynamic cluster
12. **Existing pages** — `/send`, `/transfers`, `/faucet` all still work
13. **No-account redirect** — If wallet has no Silk account, `/account` redirects to `/account/setup`

### Step 3: Final commit (if any fixes needed)

Fix anything found during manual testing and commit.

---

## Files Summary

| Task | Action | File |
|------|--------|------|
| 1 | Create | `apps/silk/src/lib/solscan.ts` |
| 1 | Create | `apps/silk/src/components/SolscanLink.tsx` |
| 2 | Modify | `apps/silk/src/_jotai/account/account.actions.ts` |
| 3 | Create | `apps/silk/src/app/account/page.tsx` |
| 4 | Modify | `apps/silk/src/app/account/setup/page.tsx` |
| 5 | Modify | `apps/silk/src/app/transfers/[pda]/page.tsx` |
| 6 | Modify | `apps/silk/src/app/page.tsx` |
| 7 | Modify | `apps/silk/src/app/send/page.tsx` |
| 8 | Modify | `apps/silk/src/components/layout/Header.tsx` |
| 9 | Delete | `apps/silk/src/app/account/settings/page.tsx` |
| 10 | Create/Modify | `apps/silk/.env.local` |
