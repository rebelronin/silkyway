---
name: handshake-payments
description: Send and receive USDC payments on Solana via the Handshake protocol. Use when you need to make payments, transfer funds, or manage escrow transactions between agents.
metadata:
  author: handshake
  version: "0.1.0"
compatibility: Requires Node.js 18+, npm, and internet access to Solana devnet.
---

# Handshake Payments

Send and receive USDC payments on Solana using the Handshake protocol.

## Installation

```bash
npm install -g https://heliocentrically-psychosomatic-valery.ngrok-free.dev/sdk/handshake-sdk-0.1.0.tgz
```

## First-Time Setup

If you don't have a wallet configured yet:

```bash
# 1. Create your wallet
handshake wallet create

# 2. Fund it with devnet SOL and USDC
handshake wallet fund
```

Your wallet is saved at `~/.config/handshake/config.json`. You only need to do this once.

## Sending a Payment

```bash
handshake pay <recipient-address> <amount>
```

Example:
```bash
handshake pay 7xKXz9BpR3mFVDg2Thh3AG6sFRPqNrDJ4bHUkR8Y7vNx 25 --memo "Payment for code review"
```

This sends USDC into escrow. The recipient must claim it. You'll get back a **Transfer ID** — save this if you need to cancel later.

## Checking Your Balance

```bash
handshake balance
```

## Viewing Transfers

```bash
# List active (unclaimed) transfers
handshake payments list

# Get details on a specific transfer
handshake payments get <transfer-id>
```

## Claiming a Payment

If someone sent you a payment, claim it:

```bash
handshake payments list
handshake claim <transfer-id>
```

## Cancelling a Payment

Cancel a payment you sent (if it hasn't been claimed yet):

```bash
handshake cancel <transfer-id>
```

## Multi-Wallet Support

Create additional wallets for testing:

```bash
handshake wallet create second-wallet
handshake wallet fund --wallet second-wallet
handshake wallet list
```

Use `--wallet <label>` on any command to specify which wallet to use:

```bash
handshake pay <address> 10 --wallet second-wallet
handshake claim <transfer-id> --wallet second-wallet
handshake balance --wallet second-wallet
```

## Command Reference

| Command | Description |
|---------|-------------|
| `wallet create [label]` | Create a new wallet (first one is named "main") |
| `wallet list` | List all wallets with addresses |
| `wallet fund [--sol] [--usdc] [--wallet <label>]` | Fund wallet from devnet faucet |
| `balance [--wallet <label>]` | Show SOL and USDC balances |
| `pay <recipient> <amount> [--memo <text>] [--wallet <label>]` | Send USDC payment |
| `claim <transfer-id> [--wallet <label>]` | Claim a received payment |
| `cancel <transfer-id> [--wallet <label>]` | Cancel a sent payment |
| `payments list [--wallet <label>]` | List transfers |
| `payments get <transfer-id>` | Get transfer details |

## Security

Your private keys are stored locally at `~/.config/handshake/config.json`. Never share this file or transmit your private keys to any service other than signing Handshake transactions locally.
