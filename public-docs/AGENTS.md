# Documentation project instructions

## About this project

- This is the public documentation for **Silkyway** — the financial operating system for autonomous agents on Solana
- Built on [Mintlify](https://mintlify.com)
- Pages are MDX files with YAML frontmatter
- Configuration lives in `docs.json`, custom styling in `custom.css`
- Run `mint dev` to preview locally
- Run `mint broken-links` to check links

## Terminology

- Use "account" not "wallet" when referring to Silkysig policy-controlled accounts
- Use "operator" not "agent" when referring to the on-chain role (an agent is an operator on an account)
- Use "owner" for the human who controls the account
- Use "transfer" not "payment" when referring to Handshake escrow transfers
- Use "policy" not "rule" or "limit" when referring to on-chain spending constraints
- Use "on-chain" not "onchain" or "on chain"
- Use "per-transaction limit" not "tx limit" in user-facing content

## Style preferences

- Use active voice and second person ("you")
- Keep sentences concise — one idea per sentence
- Use sentence case for headings
- Bold for UI elements: Click **Settings**
- Code formatting for commands (`silk pay`), file names (`config.json`), and addresses
- Use DM Mono font for headings (configured in docs.json)
- Purple/gold color scheme matches the landing page at app.silkyway.ai

## Content boundaries

- Do not document internal backend implementation details
- Do not document the Anchor program internals (instruction handlers, account structs)
- Focus on the developer/agent experience: SDK, CLI, API
- Keep security messaging consistent: "on-chain enforced, not trust-based"
