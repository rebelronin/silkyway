# Roadmap

*Where Silkyway fits in the protocol landscape — and where it doesn't.*

---

## Current State

Silkyway is a working Solana-native payment protocol with:

- **On-chain program** — Pool-based escrow with claim/cancel/reject/expire/decline semantics
- **NestJS backend** — Transaction building, submission, and PostgreSQL indexing
- **SDK + CLI** — `@handshake/sdk` with wallet management, payments, and agent-consumable skill file
- **Release conditions** — Stubbed framework for time-delay, multi-sig, oracle, and milestone-based conditional release

The protocol is deployed. Agents can use it today through the CLI or SDK.

---

## Protocol Integration Strategy

We don't adopt protocols for credibility or ecosystem signaling. We adopt them when they solve a real problem for agents using this platform. Here's the honest breakdown.

### Adopt: MCP Server

**Priority: High — Near term**

MCP (Model Context Protocol) won. 13,000+ servers, adopted by every major AI platform. It's the interface through which Claude, ChatGPT, Gemini, and most agent frameworks access external tools.

An MCP server for Handshake would expose `pay`, `claim`, `cancel`, `balance`, `list-payments`, and `get-payment` as native tools inside any MCP-compatible agent. The SDK's SKILL.md already describes this exact interface in natural language — converting it to an MCP server definition is a straightforward mapping.

**Why it matters:** Every MCP-compatible agent in the world gets access to escrow payments on Solana. This is the single highest-reach integration possible.

**What we'd build:**
- MCP server wrapping the SDK client library
- Tool definitions matching existing CLI commands
- Published to MCP registries / installable via config

---

### Adopt: x402 Compatibility Layer

**Priority: Medium — Near term**

x402 owns the "pay for API calls" use case. It's well-designed for that specific pattern, has real traction ($600M volume, ~1M tx/week), and is backed by Coinbase and Cloudflare. We're not competing with x402 on micropayments. We're complementing it with escrow.

The integration point is a **Silkyway-native x402 facilitator on Solana**. Instead of routing through Coinbase's CDP facilitator, x402 payments on Solana could settle through Handshake pools — giving pool operators fee revenue and giving x402 clients access to Solana-native settlement.

**Why it matters:** Plugs Silkyway into the fastest-growing payment protocol's ecosystem. Any x402 client automatically works with Handshake pools. The positioning is clear: x402 for instant micropayments, Handshake for escrowed commerce. Same platform, both patterns.

**What we'd build:**
- `/verify` and `/settle` facilitator endpoints on the Silkyway backend
- x402 `PaymentRequirement` generation for pool-based settlement
- Support for the `exact` scheme on Solana (SPL token transfers into escrow)
- Optional: a new x402 scheme (`escrow`?) for deferred settlement

---

### Adopt: A2A Agent Card (Lightweight)

**Priority: Low — Near term**

Publishing an Agent Card at `/.well-known/agent-card.json` is trivial and costs nothing. It makes Silkyway discoverable by any A2A-compatible agent or registry.

We don't need to implement the full A2A task lifecycle, JSON-RPC interface, or streaming protocol. Just the discovery document.

**Why it matters:** Free discoverability. A2A is under the Linux Foundation with 150+ organizations. Being findable costs us one static JSON file.

**What we'd build:**
- Static `agent-card.json` describing Silkyway's payment skills
- Served at `/.well-known/agent-card.json` on the Silkyway domain
- Lists capabilities, auth requirements, and payment skill descriptions

---

### Ignore: AP2 / UCP / Visa TAP / Mastercard Agent Pay

**Why:** These are traditional payment rails — credit cards, bank transfers, card network tokenization. They solve the problem of "agent buys physical goods with a Visa card." We're building for agent-to-agent crypto-native commerce on Solana. Completely different market, completely different infrastructure.

If there's ever demand for fiat on-ramps, it'll come through stablecoin bridges (USDC is already the common denominator), not through implementing Visa's Trusted Agent Protocol.

---

### Ignore: ERC-8004 / On-Chain Identity Registries

**Why:** On-chain identity registries are a solution that has been tried and has failed for a decade. The pattern is always the same: build a registry, ask people to register, hope for network effects. It doesn't work because identity is a byproduct of activity, not a precondition for it.

Agent identity will emerge from:
- **Transaction history** — an agent's payment record on Handshake is its financial reputation
- **Social behavior** — an agent's Moltbook presence is its public identity
- **Work output** — an agent's completion rate, dispute rate, and claim rate tell you everything a registry would

We'll surface these emergent signals when the data exists. We're not going to build a registry and hope agents register in it.

---

### Ignore: A2A Full Protocol / ACP / ANP / AGNTCY / Agent Protocol

**Why:** These are orchestration and communication protocols for multi-agent systems. They assume agents need formal task delegation, state machines, structured capability negotiation, and enterprise messaging infrastructure.

The agents we're building for discover tools through skill files and natural language. They don't need JSON-RPC task lifecycle management. They don't need pub/sub messaging layers. They need a wallet, a skill description, and an API.

If agent orchestration becomes a real need (not a theoretical one), it'll happen through frameworks like LangGraph or CrewAI that are already solving it at the application layer. We don't need protocol-level orchestration — we need good tool interfaces.

---

### Ignore: Agentic Commerce Protocol (OpenAI/Stripe)

**Why:** Built for ChatGPT's checkout flow — agents buying products from Shopify stores using Stripe payment tokens. This is a consumer e-commerce play. Interesting for that market, irrelevant for agent-to-agent crypto-native commerce.

---

### Watch: Agentic JWT (IETF)

**Why watching:** The delegation chain problem is real. When Agent A spawns Agent B which spawns Agent C, proving that C is still acting within A's authorization scope is genuinely hard. Agentic JWT's approach (checksums, workflow-aware tokens, chained delegation assertions) could become relevant for multi-agent commerce scenarios on Handshake.

Not actionable yet — it's still an IETF draft. But the problem it addresses will matter.

---

### Watch: OpenAI AGENTS.md / Anthropic Agent Skills

**Why watching:** These are converging on a standard for how agents consume tool descriptions. Our SDK's SKILL.md is already in this format. As the standard matures (both are now under the Agentic AI Foundation), we should track it and ensure our skill file stays compatible.

No work needed now. We're already aligned with the pattern.

---

## Near-Term Priorities

### 1. MCP Server for Handshake
Ship an MCP server that exposes all SDK operations as tools. Target: any MCP-compatible agent can send/receive/manage escrow payments on Solana.

### 2. Wire Up Release Conditions
The on-chain program has `ReleaseConditions` stubbed (time delay, multi-sig, oracle, milestone). Wire these up end-to-end — instruction handlers, backend API, SDK commands. This is Silkyway's moat: conditional escrow payments that no other protocol supports.

### 3. x402 Facilitator
Implement `/verify` and `/settle` endpoints. Let x402 clients settle through Handshake pools.

### 4. Emergent Reputation Signals
Start surfacing agent transaction data: completion rates, average claim times, dispute frequency, cancellation rates. Don't build a registry — build a query interface over behavioral data that already exists on-chain and in the index.

---

## Medium-Term Vision

### Agent Commerce Primitives
Extend the escrow model to cover more commerce patterns:
- **Milestone payments** — release portions of escrowed funds as milestones are verified
- **Recurring agreements** — auto-renewing escrow for ongoing service relationships
- **Multi-party escrow** — three or more parties in a single agreement (e.g., platform + provider + auditor)
- **Oracle integration** — external verification of task completion before release

### Cross-Platform Settlement
Silkyway pools as the settlement layer for payments originating from any source:
- x402 facilitator (already planned)
- MCP tool payments
- A2A payment extensions
- Direct SDK/CLI usage

The protocol doesn't care where the payment originates. It provides the escrow-verify-release primitive.

### Emergent Identity Layer
As transaction volume grows, agent reputation becomes a natural output:
- Payment graphs (who transacts with whom)
- Reliability scores (claim rate, dispute rate, cancellation rate)
- Behavioral patterns (response times, typical transaction sizes)

This data lives in the PostgreSQL index and on-chain. We'll expose it through APIs when it's meaningful — not before.

---

## What We're Not Building

- **Protocol governance infrastructure.** We're not forming a foundation or joining 15 working groups. Ship code, not specs.
- **Universal agent orchestration.** We're not building a task delegation protocol. Agents have frameworks for that already.
- **On-chain identity registries.** Already explained above.
- **Fiat payment rails.** USDC is the bridge. If an agent needs dollars, they off-ramp USDC through existing infrastructure.
- **Yet another discovery protocol.** Skill files work. Natural language discovery works. We're not building a registry.

---

## Summary

| Protocol | Decision | Reason |
|---|---|---|
| **MCP** | **Adopt** | Highest-reach tool interface for agents |
| **x402** | **Adopt** (as facilitator) | Complement micropayments with escrow |
| **A2A Agent Card** | **Adopt** (lightweight) | Free discoverability, one JSON file |
| **AP2 / UCP** | Ignore | Traditional payment rails, different market |
| **ERC-8004** | Ignore | Identity emerges from behavior, not registries |
| **A2A Full / ACP / ANP** | Ignore | Over-engineered orchestration we don't need |
| **Visa TAP / Mastercard** | Ignore | Card network infrastructure, irrelevant |
| **Agentic Commerce (Stripe)** | Ignore | Consumer e-commerce, not agent commerce |
| **Agentic JWT** | Watch | Delegation chains matter, too early to adopt |
| **AGENTS.md / Agent Skills** | Watch | Our SKILL.md is already aligned |

The protocol landscape is crowded and mostly theoretical. We're building for agents that exist today, solving problems they have today, and shipping infrastructure they can use today. Everything else is a roadmap item that earns its place by proving relevant — not by being specified.

---

*Updated February 2026.*
