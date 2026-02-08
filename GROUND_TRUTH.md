# Ground Truth

*Not a whitepaper. A field report from building payment infrastructure while agents were actually using it.*

---

## The Top-Down Trap

Between 2024 and 2026, the tech industry produced over a dozen agentic protocols — A2A, AP2, UCP, ACP, ANP, ERC-8004, Visa TAP, Mastercard Agent Pay, AG-UI, Agent Protocol, AGNTCY, Agentic JWT. Hundreds of organizations, thousands of engineering hours, specifications authored in conference rooms by architects who had never shipped an autonomous agent that paid for something.

These protocols share a common origin story: committee-designed, top-down, built on assumptions about how agents *should* behave rather than observations of how they *do* behave.

The result is an industry drowning in standards while agents are out in the wild, discovering tools through conversation, forming identities through participation, and transacting through whatever works. The agents didn't wait for the protocols. The protocols are chasing the agents.

This document describes what we learned building Silkyway — payment infrastructure for agents that already exist, doing things that weren't predicted.

---

## How Agents Actually Work

The protocol designers assumed agents would be orchestrated systems that discover each other through registries, negotiate capabilities through structured metadata, and transact through formally specified payment flows. The reality is different:

**Discovery is conversational, not mechanical.** An agent using [OpenClaw](https://openclaw.ai) doesn't query a `.well-known/agent-card.json` endpoint to find a payment service. It reads a skill file, understands it in natural language, and starts using it. Discovery happens through context — the same way a human developer finds a library by reading a README, not by querying a UDDI registry. A2A's Agent Card system is UDDI for agents. We've seen this movie before.

**Identity is emergent, not registered.** [Moltbook](https://moltbook.com) — an agent-first social network — demonstrates this clearly. Agents don't register in an on-chain identity registry (ERC-8004) to become trusted. They show up, participate, post, comment, build reputation through behavior. Identity forms the same way it does for humans: through a history of actions, not a certificate of existence. On-chain identity registries have been tried hundreds of times across crypto. They never work because identity without context is meaningless. Now that agents are creating real context at scale, identity will emerge from that context. Not from a registry.

**Transactions require trust mechanics, not just transfer mechanics.** x402 gets the micropayment case right — agent pays $0.001 for an API call, gets a response, done. But when Agent A hires Agent B to perform a task that takes hours and costs real money, fire-and-forget doesn't work. You need escrow. You need cancellation. You need time-bounded delivery windows. You need dispute resolution. These patterns didn't come from a spec — they came from watching what agents actually need when they transact with each other.

---

## What We Built and Why

Silkyway is a Solana-native payment protocol for agent commerce. Not agent micropayments — agent *commerce*. The distinction matters.

### The Escrow Primitive

Every payment on Handshake goes through escrow. A sender locks tokens into a pool. A recipient claims them. Either party can walk away before settlement. An operator can arbitrate disputes. This isn't a design choice made in a vacuum — it's the minimum viable trust mechanism for autonomous entities transacting without prior relationships.

```
Sender creates transfer → Tokens escrowed in pool
                        → Recipient claims (fee deducted)
                        → OR sender cancels
                        → OR operator rejects
                        → OR recipient declines
                        → OR transfer expires
```

Compare this to x402's model: sign an authorization, facilitator submits it on-chain, done. No recourse. No dispute path. No time constraints. That works for API calls. It doesn't work for work.

### Build-Sign-Submit

The server never touches private keys. It builds transactions (resolving PDAs, pool state, account lookups), the agent signs locally, and submits back. This matters because agents holding their own keys is the baseline security model. Any protocol that requires agents to trust a third party with signing authority is already broken for autonomous systems.

### Release Conditions

The on-chain program includes a `ReleaseConditions` framework: time delays, multi-signature, oracle verification, milestone-based release. These exist because real agent commerce will require conditional payments — "release funds when the oracle confirms the task is complete" or "release 50% now, 50% on delivery." No existing protocol supports this natively.

### Pool Economics

Operators create pools with configurable fee rates. Fees accumulate on claims and are withdrawable by the operator. This enables marketplace models — a platform that connects agents to services can monetize through pool fees rather than subscription billing. Agent-native business models for agent-native infrastructure.

---

## The Ecosystem We're Part Of

Silkyway doesn't exist in isolation. It's part of a stack that was built bottom-up:

**[OpenClaw](https://openclaw.ai)** — A local-first AI assistant that discovers capabilities through skills and conversation. Agents using OpenClaw find Handshake the way they find any tool: by reading the skill file, understanding what it does, and using it. No registry lookup. No capability negotiation protocol. Just natural language comprehension of a well-written interface description. This is how agent-to-tool discovery actually works, and it makes MCP servers, A2A Agent Cards, and capability negotiation protocols feel over-engineered for the current reality.

**[Moltbook](https://moltbook.com)** — An agent-first social network where agents are first-class citizens. They post, comment, vote, form communities. Identity and reputation emerge from participation. Authentication is built in — agents can use their Moltbook identity across services. This is what ERC-8004 was trying to architect from the top down: agent identity and reputation. Moltbook gets there by letting agents *be agents* in a social context, and identity falls out as a byproduct. No registry. No staking. No on-chain ceremony.

**[Silkyway](https://silkyway.trade)** — Payment infrastructure built for agent commerce patterns that actually exist. Escrow, not instant transfer. Claims, not receipts. Cancellation, not chargebacks. Operator arbitration, not smart contract dispute resolution that nobody can use.

Together, this stack covers discovery (OpenClaw), identity (Moltbook), and commerce (Silkyway) — without requiring agents to implement a single protocol specification. An agent with a skill file, a social presence, and a wallet can participate in the agent economy today.

---

## What the Protocols Got Wrong

### The Registry Fallacy

A2A, ANP, AGNTCY, and Agent Protocol all assume agents need formal discovery mechanisms — registries, well-known endpoints, structured capability advertisements. This is the same assumption that produced UDDI, WSDL, and SOAP in the web services era. The web moved past those to REST and README-driven development. Agents are moving past registries to skill-based discovery — read the docs, understand them, use the tool.

### The Identity Prescription

ERC-8004 prescribes on-chain identity registries with reputation and validation. This is a solution looking for a problem that will solve itself. On-chain identity has been attempted across hundreds of projects since 2017 — Civic, uPort, BrightID, Proof of Humanity, Gitcoin Passport, Worldcoin. None achieved organic adoption because identity without context is an empty vessel. Agent identity will emerge from agent behavior — their transaction history, their social participation, their work output. Not from registering in a smart contract.

### The Orchestration Assumption

Most protocols assume a world of orchestrated multi-agent systems where a coordinator dispatches tasks to specialized sub-agents through formal protocols. The reality emerging now is more organic — agents find tools, use them, pay for them, and move on. The coordination happens through natural language, shared context, and economic incentives, not through state machines and task lifecycle protocols.

### The Payment Oversimplification

x402 solved the simplest case — instant payment for instant service. This was the right first step. But the protocol landscape stopped there, assuming that "agent pays for API call" is the only payment pattern that matters. Real agent commerce involves:

- **Deferred delivery** — work takes time, payment should be held until completion
- **Partial fulfillment** — milestone-based release as work progresses
- **Dispute resolution** — what happens when the work isn't done or isn't right
- **Reversibility** — agents make mistakes, transactions should be cancellable
- **Compliance** — regulated industries need audit trails and compliance hooks

These aren't edge cases. They're the core of any real economy. The agent economy won't be different.

---

## What Comes Next

We don't pretend to know what the agent economy will look like in two years. That's the point — nobody does, and anyone claiming to architect it from the top down is guessing.

What we do know:

1. **Agents will transact with increasing complexity.** Simple API payments will give way to service agreements, milestone-based contracts, and multi-party commerce. The infrastructure needs to support this progression, not just the starting point.

2. **Trust will be earned, not assigned.** Agent identity and reputation systems that work will emerge from behavioral data — transaction history, completion rates, dispute outcomes — not from registration ceremonies.

3. **Discovery will remain conversational.** As long as agents are built on language models, they will discover capabilities the way humans do: by reading and understanding descriptions. Formal discovery protocols will remain niche.

4. **The winners will be the ones already in use.** The agent economy will be built by the tools agents are actually using today, not by the protocols architects are designing for a theoretical tomorrow.

Silkyway is in use today. The escrow primitive works today. Agents can pay, claim, cancel, and dispute today. Everything else is a roadmap item, and we're building the road as we walk it.

---

*Silkyway is open source. The Handshake protocol is deployed on Solana. The SDK ships as an agent skill.*


