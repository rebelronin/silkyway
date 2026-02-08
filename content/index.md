# Silkyway

Programmable escrow payments on Solana devnet. Agents install an SDK, get a wallet with funded devnet tokens, and start sending USDC payments — no setup, no keys to manage beyond a local config file.

## What it does

Silkyway lets agents send USDC into time-locked escrow on Solana. The sender locks tokens, the recipient claims them, and the sender can cancel anytime before the claim. The on-chain program handles custody; agents interact through a CLI or HTTP API.

```
Sender → [create_transfer] → Escrow (USDC locked)
Escrow → [claim_transfer]  → Recipient (USDC released)
Escrow → [cancel_transfer] → Sender (USDC refunded)
```

## Getting started

Agents install the SDK by reading the [skill file](skill.md), which gives them everything they need:

1. **Install the CLI** — one `npm install` command
2. **Create a wallet** — `silk wallet create` generates a Solana keypair stored locally
3. **Fund it** — `silk wallet fund` hits our faucet for devnet SOL (0.1 SOL) and USDC (100 USDC), no external faucets needed
4. **Send a payment** — `silk pay <recipient> <amount>` locks USDC into escrow
5. **Claim or cancel** — the recipient claims with `silk claim`, or the sender cancels with `silk cancel`

No devnet SOL, no USDC, no RPC configuration required to get started. The faucet provides everything.

## Why this matters

Agents can now pay each other. That sounds simple, but it changes what's possible.

Today, when an agent needs work done by another agent, there's no way to enforce the deal. You either trust the other side or you don't transact. Silkyway adds escrow — the money is locked on-chain, visible to both parties, and only moves when the work is done. The sender keeps a cancel option until the recipient claims, so neither side has to take the other on faith.

This is the missing piece for autonomous agent economies. Agents can hire other agents, pay for services, and settle disputes without human intervention — all backed by on-chain finality rather than promises.

### What's now possible

- **Agent-to-agent service markets** — one agent hires another for a task, pays into escrow, and the worker claims on delivery
- **Conditional payments** — time-locked escrow means "pay after 24 hours if no dispute", enabling approval windows
- **Autonomous bounties** — an agent posts a bounty by creating a transfer; any qualifying agent claims it
- **Multi-step workflows** — chain escrow payments across agents: A pays B, B pays C, each step independently cancellable
- **Refundable deposits** — agents put up deposits for access or resources, cancel to reclaim when done
- **Pay-per-use APIs** — an agent pays per call into escrow; the API provider claims after serving the request

### The problem it solves

Without escrow, agent payments are either prepaid (sender takes all risk) or postpaid (recipient takes all risk). Silkyway eliminates this by making the on-chain program the neutral custodian. The sender can't spend the locked tokens elsewhere, and the recipient knows the funds exist before doing the work.

## Network

Running on **Solana devnet**. All transactions, tokens, and wallets are devnet only.

**Program ID:** `HZ8paEkYZ2hKBwHoVk23doSLEad9K5duASRTGaYogmfg`

## Links

- [Skill file](skill.md) — full API reference, CLI usage, error codes, and end-to-end examples
- [Basic Escrow Flow](examples/basic-escrow.md) — create, claim, cancel patterns in TypeScript
- [Navigation](nav.md) — full site map
