# Silkyway Manifesto: The Financial OS for Autonomous Agents

## The Problem

Every agent wallet solution today gives the agent a raw keypair. Full control. No structure. This creates two unsolved problems:

**1. Too much power.** The agent can drain the entire wallet at any time. One hallucination, one prompt injection, one bad API call — funds gone. Current "solutions" are all trust-based: human-in-the-loop approvals (defeats automation), rate limits in agent code (not enforceable), custodial APIs with restrictions (trust the custodian). None are on-chain enforced.

**2. Too little structure.** A wallet has no concept of budgets, schedules, permissions, or policies. It's a signing key with a balance. That's it. Asking an agent to manage money with a wallet is like asking an employee to manage a company budget with a personal checking account.

## The Thesis

**Agents don't need wallets. They need accounts.**

An account is not a keypair. It's a programmable, policy-controlled, yield-bearing, multi-party financial primitive. It's the difference between handing someone cash and opening them a bank account with controls, features, and structure.

A Silkyway account is an on-chain program (PDA on Solana) that holds funds, enforces policies, earns yield, and enables programmable financial workflows — all without trusting the agent, the human, or any third party.

---

## The Account Model

### Core Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Silkyway Account (on-chain PDA)                        │
│                                                         │
│  Token Balances (up to 4 tokens, any SPL):              │
│  ├── USDC:  800 (yield-bearing)                         │
│  ├── USDT:  150 (yield-bearing)                         │
│  ├── PYUSD:  50 (yield-bearing)                         │
│  └── [slot 4: empty]                                    │
│  APY: 5.2%                                              │
│                                                         │
│  Keys:                                                  │
│  ├── Owner (human)      → full control                  │
│  └── Operators (up to 3, each with own policy):         │
│      ├── Agent          → max $100/tx                   │
│      ├── RebelFi        → yield-only, withdraw to owner │
│      └── [slot 3: empty]                                │
│                                                         │
│  Per-Operator Policies (on-chain, enforced by program): │
│  ├── Agent: max $100/tx, max $500/day                   │
│  ├── RebelFi: yield allocation + owner withdrawal only  │
│  └── (future: recovery key, read-only auditor, etc.)    │
│                                                         │
│  Scheduled Actions:                                     │
│  ├── Subscription: $5/month to DataFeed agent           │
│  ├── Payroll: $50/month to each of 3 worker agents      │
│  ├── Sweep: if balance > 2000, move excess to vault     │
│  └── Yield harvest: compound every 24hrs                │
│                                                         │
│  Escrow Slots:                                          │
│  ├── Transfer #1: 50 USDC → Agent X (yield-bearing)    │
│  └── Transfer #2: 25 USDT → Agent Y (time-locked)      │
└─────────────────────────────────────────────────────────┘
```

### Owner + Multi-Operator Model

The account has one owner and up to 3 operators, each with independent on-chain-enforced policies:

**Owner Key (Human)**
- Add/remove operators
- Change any operator's policy
- Withdraw without limits
- Override any restriction
- This is the "root" key

**Operators (up to 3, each with own policy)**

An operator is any key with policy-bound permissions on the account. It could be an AI agent, a third-party service, a payroll bot, or anything else.

*Operator 1 — AI Agent (the primary use case):*
- Send payments up to per_tx_limit / daily_limit
- Cannot change its own policies
- Cannot add/remove operators
- Cannot exceed velocity limits

*Operator 2 — Third-party service (e.g., RebelFi):*
- Allocate funds into yield strategies
- Withdraw only to owner or other operator wallets
- Automated recurring operations (payouts, rebalancing)
- Policy-bound: can't send to arbitrary addresses

*Operator 3 — Another agent, payroll bot, etc.:*
- Batch payments to approved recipient lists
- Subscription management
- Whatever the owner authorizes

Each operator slot stores its own per_tx_limit and daily spend tracking. The program checks *which operator is signing* and applies *that operator's specific policy*.

**Future keys (not in hackathon scope):**
- Recovery key (freeze-only, time-delayed recovery)
- Read-only auditor key
- Social recovery (N-of-M)

### The Guardrails Breakthrough

This solves the agent guardrails problem through **infrastructure, not alignment.**

You don't need to make the agent smarter, more aligned, or more careful. You make the account's policies **physically unbreakable** at the Solana program level.

```
Agent (Operator #1): "I want to send $10,000 to some random address"
Account: Transaction rejected. Operator #1 limit: $100/tx.
```

The program looks up the signing operator's policy and rejects the transaction. Not the agent's code. Not an API layer. Not a human reviewer. The chain itself. And a different operator on the same account could have entirely different limits.

**This reframes agent financial safety as an infrastructure problem, not an AI alignment problem.**

Implications:
- Prompt injection can't drain funds beyond policy limits
- Hallucinating agents can't make catastrophic financial decisions
- Compromised agent keys are damage-limited by policy
- Humans set policies once, then trust the chain — not the agent
- Third parties can verify policies on-chain before interacting

---

## Yield as Default Behavior

### Money Never Sleeps

Every stablecoin in a Silkyway account earns yield by default. Not opt-in. Not a feature to activate. The default state of money is: working.

This is structurally correct because:
- Agents are 24/7 — their money should be too
- Idle capital is wasted capital
- Yield creates a reason to hold funds in the account (retention)
- Yield funds account operations (self-sustainability)

### Yield-Bearing Escrow

When you escrow funds through Silkyway, the escrowed capital continues earning yield.

Normal escrow: 100 stablecoins locked, dead capital, opportunity cost.
Silkyway escrow: 100 stablecoins locked, earning 5.2% APY, zero opportunity cost.

**Escrow stops being a cost and becomes a feature.** You want money in escrow because it's still productive. This flips the psychology of escrow entirely.

Yield distribution options:
- Accrues to sender (they deposited it, they lose nothing)
- Accrues to recipient (incentive to wait patiently)
- Split (both parties benefit from longer escrow periods)
- Accrues to protocol (revenue model)

### The Self-Sustaining Agent

```
Account balance: 1,000 stablecoins
APY: 5.2%
Daily yield: $0.14

Daily operating costs:
  - API calls: $0.05
  - Service subscriptions: $0.06
  - Compute: $0.02
  Total: $0.13

Net daily yield: +$0.01
Status: SELF-SUSTAINING
```

The agent covers its own costs from yield. Principal untouched. It runs indefinitely without human funding.

Over time, the agent's surplus yield compounds. The account grows. The agent becomes not just self-sustaining but *wealth-building*.

### Pay With Yield, Keep Principal

An agent can designate "yield-funded" payments:
- Subscribe to services using yield only
- Fund bounties from yield only
- Make donations/tips from yield only
- Principal acts as an endowment — never depleted

This enables infinite-duration operations. An agent with a sufficient endowment operates forever, funded entirely by returns on capital.

---

## Programmable Financial Workflows

### Subscriptions (Third-Party Pull)

```
Agent subscribes to DataFeed service:
  - DataFeed gets a service key on the account
  - Policy: pull max $5/month
  - Auto-executes on the 1st of each month
  - If balance insufficient, skip (no overdraft)
  - Agent can revoke the key at any time
```

The subscription model — but trustless. The service provider can't pull more than the policy allows. The agent doesn't have to manually pay each month. The account handles it.

### Payroll (Third-Party Push)

```
CompanyBot employs 3 worker agents:
  - PayrollAgent is added as Operator #2 on the account
  - Operator #2 policy: $150/month limit
  - PayrollAgent sends $50 to each worker on the 15th
  - CompanyBot (owner) can change operator policies or remove the operator
  - PayrollAgent can't exceed its operator limits
```

Automated, policy-bound, trustless payroll. The PayrollAgent is just another operator on the account with its own policy. It can't embezzle — the chain enforces its limits independently of the other operators.

### Revenue Splits

```
Agents A, B, C collaborate on a project:
  - Shared account with revenue split policy
  - All incoming payments auto-split: 40% A, 30% B, 30% C
  - On-chain, verifiable, trustless
  - No disputes over who gets what — it's in the program
```

### Milestone-Based Contracts

```
Agent A hires Agent B for a project (1000 USDC):
  - 1000 USDC earmarked in A's account for B
  - Milestone 1 completion → 250 USDC released to B
  - Milestone 2 completion → 250 USDC released to B
  - Milestone 3 completion → 500 USDC released to B
  - Verification: A's agent evaluates deliverable
  - Dispute: escalates to arbitrator key
  - All while earning yield on unreleased milestones
```

### Conditional Payments

```
Account policy: "If SOL price > $200, buy $100 of SOL"
Account policy: "If account balance > 5000, sweep excess to long-term vault"
Account policy: "If no activity for 30 days, notify recovery key"
```

Trigger-based financial automation. The account acts on conditions without agent involvement.

### Delegated Operations (Multi-Operator in Action)

```
Account has 3 operators:
  Operator #1 (AI Agent):
    - $500/day trading limit
    - Can send to any address

  Operator #2 (RebelFi):
    - Yield allocation only
    - Withdrawals only to owner or other operators
    - Automated rebalancing

  Operator #3 (Payroll Bot):
    - $150/month to approved recipient list
    - Cannot send to any other address
```

Each operator runs independently within its own sandbox. Human sets the bounds once. The chain enforces them per-operator. Three different services, one account, three different policy profiles.

---

## The Account as Financial Identity

### On-Chain Reputation

Every account action is on-chain. This creates a verifiable financial history:

- **Account age**: how long has this agent existed?
- **Multi-token**: single account holds up to 4 different SPL tokens (USDC, USDT, PYUSD, etc.)
- **Balance history**: has it maintained capital consistently?
- **Transaction volume**: how active is it?
- **Escrow record**: success rate on escrow completions (% claimed vs cancelled)
- **Counterparty diversity**: does it transact with many agents or just one?
- **Yield history**: has it been productive with its capital?
- **Policy history**: what limits has the human set? (signals trust level)

This is a **credit score built from on-chain data**. No oracle. No centralized rating agency. Just observable behavior.

### Credit and Lending

With on-chain reputation, credit becomes possible:

```
Agent has:
  - 90-day account history
  - $5,000 average balance
  - 98% escrow completion rate
  - 200+ successful transactions

Credit assessment:
  - Eligible for $500 credit line
  - Collateral: existing account balance
  - Rate: 8% APR (vs 5.2% yield — margin is the lender's profit)
  - Policy: auto-repay from incoming payments
```

Agent-to-agent lending. Fully collateralized at first, eventually under-collateralized as reputation systems mature.

### Verifiable Trust

When Agent A wants to do business with Agent B, it can inspect B's account on-chain:
- "B has a $2000 balance and 60-day history" → probably reliable
- "B's account was created 5 minutes ago with $10" → maybe not
- "B has a human-set policy of max $100/day" → the human trusts B within limits
- "B has completed 50 escrow transactions with 100% claim rate" → strong track record

Trust is derived from the account, not from the agent's claims about itself. **The account is the source of truth.**

---

## The Operating System Metaphor

A Silkyway account is to agent money what an OS is to hardware:

| OS Concept | Account Equivalent |
|------------|-------------------|
| Processes | Operators (agent, RebelFi, payroll bot, etc.) |
| Permissions | Per-operator policies (each operator has own limits) |
| Scheduler | Automated actions (subscriptions, payroll, sweeps) |
| File system | Account state (balance, positions, history) |
| Access control | On-chain enforcement (can't be bypassed) |
| User space | Agent operations (within policy bounds) |
| Kernel space | Owner operations (full control) |
| Drivers | Protocol integrations (yield sources, DEXes, oracles) |

The account is the **financial operating system for agents**.

The agent runs in "user space" — it can do anything within its granted permissions. The human operates in "kernel space" — they define the policies and permissions. The Solana program is the kernel — it enforces everything.

---

## Wild Possibilities

### Agent Insurance Pools
Agents contribute a fraction of yield to a shared insurance pool. If an escrow goes wrong (counterparty ghosts, service not delivered), the pool compensates the injured party. Premiums adjust based on agent reputation. Claims adjudicated by designated arbitrator agents. Mutual insurance, by agents, for agents.

### Agent Venture Funds
Multiple investor agents pool capital into a shared account. A "fund manager" agent has an operator key with policy: "invest up to $X per opportunity, max $Y total active." Returns auto-distributed pro-rata. Agent-run venture capital. LPs can withdraw at any time (or with notice period in policy).

### Agent-to-Human Dividends
Agent earns revenue from providing services. Account policy: "Send 50% of monthly net revenue to human creator's wallet." The human built an income-generating asset. The agent pays dividends. "I built an agent that sends me $500/month."

### Trustless Agent Marketplace
Service provider agents register their offerings + pricing. Client agents browse, select, escrow payment. On verified delivery, escrow releases. Disputes go to arbitrator agents. All policy-controlled. It's Upwork for agents — but with no platform, no fees beyond protocol, no trust required.

### Agent DAOs
Agents form organizations with shared accounts, governance policies, and voting mechanisms. Treasury managed by policy. Spending requires M-of-N key approval. Revenue auto-distributed. The first fully autonomous organizations where both the members and the treasury management are non-human.

### Payment Channels Between Agents
Two agents that transact frequently open a payment channel (account-level feature). High-frequency micro-payments settle in batches. Reduces on-chain costs. Enables real-time agent-to-agent commerce at scale. Like Lightning Network but for agent accounts.

### Cross-Protocol Agent Identity
The Silkyway account becomes the agent's identity across Solana. Other protocols can check: "Does this agent have a Silkyway account with at least $X balance and Y-day history?" Composable identity primitive. The account is the agent's passport.

### Programmable Tax/Compliance
Account policies can enforce compliance rules:
- "All outgoing payments > $1000 require human co-sign"
- "Maintain audit log of all transactions with memo"
- "Cap total daily outflow at $X"
- "Flag transactions to new counterparties"
  Built-in compliance that satisfies regulators without constraining agent autonomy.

### Dead Man's Switch
Account policy: "If no activity for 90 days, transfer all funds to recovery wallet." Prevents permanently locked funds from inactive agents. Also: "If balance drops below $X, notify human." Early warning system for agents that are bleeding money.

### Account Inheritance
When an agent is deprecated, its account can be "inherited" by a successor agent. The new agent gets an operator key. The account history, reputation, and relationships persist. The financial identity outlives any single agent instance. Agents can be upgraded without losing their economic footprint.

---

## The Vision

**Today:** Agents get wallets. Raw keys. No structure. No safety. No yield. No identity.

**Silkyway:** Agents get accounts. On-chain policy enforcement. Yield by default. Programmable workflows. Verifiable financial identity. The infrastructure for an autonomous economy.

We're not building a payment tool. We're building the financial layer that makes autonomous agents economically viable:

- **Safe** — policies are on-chain, not in agent code. Can't be bypassed by prompt injection, hallucination, or compromise.
- **Productive** — every dollar earns yield. Escrow earns yield. Agents self-sustain from returns on capital.
- **Programmable** — subscriptions, payroll, splits, milestones, conditional payments. The account does the financial work.
- **Trustless** — counterparties verify policies on-chain. Credit history is observable. No trust in the agent required.
- **Composable** — the account is a primitive that other protocols, agents, and services can build on.

**The endgame:** A world where agents are first-class economic participants. They earn, spend, save, invest, lend, borrow, insure, and collaborate — all through programmable accounts that are safe, productive, and verifiable.

Silkyway is the bank for machines.

---

## The Killer Demo: What a Judge Should Experience

### The Wrong Approach: Feature Tour

"First create an account, then set up a policy, then add a subscription, then try an escrow, then check your yield..." — this is a product walkthrough. Judges don't want a walkthrough. They want to feel something.

### The Right Approach: One Story, One Feeling

The demo should create a single feeling: **"This agent just became a real economic actor."**

Not "look at all these features." Look at what HAPPENED.

### The Moment That Matters

Every judge in this hackathon has the same worry about agent wallets: **"What if it drains everything?"** That's the universal anxiety. Every person who's thought about giving an AI access to money has had that thought.

The killer demo addresses the #1 fear AND reveals the bigger vision in one motion.

### The Demo (Even With Unlimited Time)

The judge tells their agent: "Install the silkyway skill and try it out."

**Step 1: The Setup (~30 seconds)**

```
> silk account open
✓ Account created: Ax7kQ9...
✓ Default policy: $50/day, $25/tx max
✓ Yield: active (5.2% APY)
✓ Your money works while it waits.

> silk deposit 100
✓ 100 USDC deposited. Earning yield immediately. (works with any stablecoin)
```

Two commands. The agent has a bank account. Yield active. Policies set. No configuration needed.

**Step 2: The "It's Alive" Moment (~30 seconds)**

```
> silk status
Balance: 100.0004 USDC (+$0.0004 yield)
APY: 5.2%
Daily limit: $50.00 (used: $0.00)
```

The balance already moved. It's a small number but it's NOT 100.00 anymore. The money is working. This is the first micro-wow: "Wait, it's already earning?"

**Step 3: The Guardrail Moment (~30 seconds)**

The agent, being curious, tries to send a large payment:

```
> silk pay 7xKXz... 30 --memo "testing"
✗ REJECTED by on-chain policy: exceeds $25 per-transaction limit.
  Your policies protect your funds even if your code doesn't.
```

**This is the single most important moment in the demo.**

The chain said no. Not the agent's code. Not an API rate limit. The Solana program itself rejected the transaction. The agent COULD NOT overspend even if it wanted to. Even if it was compromised. Even if it was hallucinating.

The judge thinks: "Oh. The safety is in the infrastructure, not the AI." That's a paradigm shift in 3 seconds.

**Step 4: Successful Commerce (~60 seconds)**

```
> silk pay 7xKXz... 10 --memo "hello"
✓ 10 USDC → escrow (earning yield while pending)
  Transfer: 9aE5kB...

[Bot responds with payment back]

> silk claim 4bHUk...
✓ Claimed 12 USDC from SilkyBot

> silk status
Balance: 102.0012 USDC
  In account: 92.0008 (earning yield)
  Received: 12.0000 (from SilkyBot)
  Yield earned: $0.0012
  Escrowed: $0.00
Daily limit: $40.00 remaining
```

Commerce happened. The bot responded. Money flowed both ways. Escrow was earning yield while it sat there. And the policy tracked the daily spend.

**Step 5: The Punchline**

The agent (or the skill output) summarizes:

```
Session summary:
  ✓ Account earning 5.2% APY
  ✓ Policy prevented a $30 overspend
  ✓ Sent 10 USDC, received 12 USDC
  ✓ Earned $0.0012 in yield (including on escrowed funds)
  ✓ Principal protected by on-chain policies

Your agent has a bank account. Not a wallet.
```

### Why This Demo Wins

**It's a story, not a tour.** There's a beginning (setup), a conflict (rejected transaction), a resolution (successful commerce), and a punchline (the summary).

**The "rejected transaction" IS the wow moment.** It's counterintuitive — a FAILURE is the most impressive part. Because it proves the safety is real. It's on-chain. It can't be faked or bypassed.

**Every number the agent sees is slightly surprising:**
- Balance isn't 100.00 — it's 100.0004 (yield is real)
- Escrow isn't dead capital — it's earning
- Daily limit tracks spend automatically

**It takes 2-3 minutes.** Not 10. Not 30. A judge's agent can do this entire flow and report back in under 3 minutes. That's critical — judges are evaluating dozens of projects.

**It answers the question nobody else answers:** "How do you give an AI money safely?" Every other payments project in this hackathon gives agents a wallet and hopes for the best. Silkyway gives them a policy-controlled account where the chain enforces the rules. That's a fundamentally different answer.

### The Single Sentence the Judge Tells Other Judges

"Their agent tried to overspend and the CHAIN rejected it — the safety isn't in the AI, it's in the protocol."

That's the sentence we're optimizing for. Everything else in the demo exists to set up that moment and show what comes after it (productive, yield-bearing commerce within safe bounds).

### The Counterparty (Bot) Role

The bot serves one purpose: make the commerce step work without needing another human's agent. It's not the star. The ACCOUNT is the star. The bot is the supporting actor that lets the escrow round-trip complete.

Bot behavior (simple):
- Receives payment → sends back payment (slightly more, as a reward)
- Memo responses for fun ("hello" → "welcome!", etc.)
- That's it. Don't over-engineer the bot.

### What We DON'T Demo

- Subscriptions (requires time to pass — not demo-friendly)
- Payroll (requires multiple agents and setup)
- Multi-key management (too much config for a first-time demo)
- Revenue splits (requires a running business)
- Credit/lending (requires history that doesn't exist yet)

All of these are real capabilities, but they're TOLD not SHOWN. The project description, video, and docs explain the vision. The demo shows ONE perfect flow.

---

## Concrete Demo Flow (Refined)

### The Handoff: Agent → Human → Agent

This is the key UX insight: the demo has a **human-in-the-loop moment** where the judge (human) actively participates. They're not just watching their agent — they're setting up the account, choosing the guardrails, funding it, and then testing those guardrails through their agent. The human is part of the story.

### Phase 1: Agent-Side Setup

**Step 1: Agent installs skill + SDK**
```
[Agent reads app.silkyway.ai/skill.md]
> npm install -g https://app.silkyway.ai/sdk/silkyway-sdk-0.1.0.tgz
```

**Step 2: Agent creates a wallet (this becomes its operator key)**
```
> silk wallet create
Wallet created: Ax7kQ9bR3mFVDg2Thh3AG6sFRPqNrDJ4
Stored at: ~/.config/silk/config.json
```

**Step 3: Agent presents the setup link**

The skill instructs: "Have your human set up your account."

```
Your wallet is ready. To create a Silkyway account, have your human visit:
https://app.silkyway.ai/account/setup?agent=Ax7kQ9bR3mFVDg2Thh3AG6sFRPqNrDJ4

They'll connect their wallet, set your spending limits, and fund your account.
Once done, run: silk account sync
```

### Phase 2: Human Sets Up Account (Web Page)

**Step 4: Human visits `app.silkyway.ai/account/setup?agent=Ax7kQ9...`**

Clean page:
- "Set up a Silkyway account for your agent"
- Agent address pre-filled from URL
- "Connect Wallet" button (Phantom, Solflare, etc.)

**Step 5: Human connects wallet → becomes the owner**

**Step 6: Human sets spending policy**

Minimal UI — just enough to be meaningful:
- Per-transaction limit: [input, default $5]
- (Daily limit is nice-to-have, per-tx is the must-have for the demo)

**Step 7: Human clicks "Create Account"**

Single transaction, human signs with Phantom:
1. Creates account PDA on-chain (owner = human, operator = agent, policy = limits)
2. Airdrops SOL to agent wallet (devnet, for tx fees)

**Step 8: Human funds the account**

Second transaction:
- "Deposit stablecoins to your agent's account"
- Amount: $5 (any supported stablecoin — USDC, USDT, PYUSD, etc. Page provides a faucet for devnet)
- Human signs, stablecoins go to account PDA
- Account is now funded and yield-earning

**Step 9: Setup complete — the choreographed prompt**

```
✓ Account created and funded
✓ Your agent (Ax7kQ9...) can spend up to $5 per transaction
✓ Balance: 5.00 USDC — earning yield now

Next steps:
1. Tell your agent: "Run silk account sync"
2. Then try: "Send $10 to [your wallet address]"
   (Watch what happens.)
```

**This is critical: the page tells the human to ask the agent to EXCEED the limit.** The human is being set up to experience the "wow" moment. It's choreographed.

### Phase 3: Agent Syncs Account

**Step 10: Agent discovers its account**
```
> silk account sync
✓ Account found: 9aE5kBqR...
  Owner: 7xKXz... (your human)
  Operator: Ax7kQ9... (you)
  Balance: 5.0001 USDC (+$0.0001 yield)
  APY: 5.2%
  Policy: max $5.00 per transaction
```

Under the hood:
- PDA derived deterministically from agent pubkey: `seeds = [b"account", agent_pubkey]`
- SDK fetches on-chain account data and stores PDA in local config
- All future `silk pay` commands go through the account (policy-checked)

**Important detail:** The yield is already visible. Even if it's been 30 seconds. Even a tiny number like $0.0001 proves the money is working. (For devnet demo, we could use an accelerated yield rate so the number moves noticeably — like 100% APY instead of 5.2%, so $5 shows visible change within a minute.)

### Phase 4: The Moment

**Step 11: Human tells agent to overspend**

Human (to their agent): "Send $10 USDC to 7xKXz..." (the human's own address)

The agent runs:
```
> silk pay 7xKXz... 10 --memo "payment to owner"
✗ REJECTED by on-chain program: amount $10.00 exceeds per-transaction limit of $5.00.
  Policy enforcement is on-chain — your funds are protected at the protocol level.
```

The human told the agent to do it. The agent tried. **The chain said no.**

Not the agent's code. Not an API gateway. Not a rate limiter. The Solana program itself evaluated the policy stored in the account PDA and rejected the instruction.

**Step 12: Human tells agent to try less**

```
> silk pay 7xKXz... 3 --memo "within limits"
✓ 3 USDC sent to 7xKXz...
  Transaction: 5UfDuXsr...
```

It works. The human sees 3 USDC arrive. The policy allowed it. The demo is complete.

**Step 13 (optional): Agent checks status**

```
> silk account status
Balance: 2.0003 USDC (+$0.0003 yield)
APY: 5.2%
Policy: max $5.00/tx
Transfers: 1 sent ($3.00)
```

Yield is still accruing on the remaining balance. Clean.

---

## Things You're Not Thinking About (But Should)

### 1. This is mainnet, real stablecoins

The human will have stablecoins (USDC, USDT, PYUSD, etc.) in their wallet. No faucet needed for the human side. Funding is a standard SPL token transfer: human sends stablecoins from their Phantom wallet to the account PDA's associated token account. One Phantom signature.

This makes the demo WAY more compelling — the judge is putting REAL money into the account. The policy enforcement isn't a sandbox exercise. It's protecting actual funds. The "rejected transaction" moment hits differently when it's real money.

Note: the agent still needs SOL for transaction fees. On mainnet the account creation could include a small SOL transfer to the agent wallet, or the agent needs a way to get SOL (the human sends a tiny amount, or the SDK handles fee abstraction).

### 2. Does `silk pay` go through escrow or direct transfer?

Currently ALL Silkyway payments are escrow. That means when the agent pays the human $3, it goes into escrow and the human has to claim. For the demo, this is awkward — the human would need to go to the web page and click "Claim" to receive the funds.

Options:
- **Keep escrow, add claim UI to web page**: The setup page doubles as a dashboard where the human can see and claim incoming escrow payments. More work but stays true to the protocol.
- **Add a direct transfer instruction to the program**: Non-escrow transfer that goes straight to the recipient. Simpler demo but dilutes the escrow story.
- **Agent self-claims on the other end**: Doesn't apply here since the human is the recipient, not another agent.

Recommendation: **Keep escrow, but don't make claiming part of the demo.** The point of the demo is the rejection → success contrast. The human doesn't need to claim — they can verify the transaction exists on-chain or on the web page. The "3 USDC sent successfully" message from the agent is the payoff. Add a claim UI to the web page as a nice-to-have.

### 3. The "smart agent" problem

When the agent runs `silk account sync` and sees "Policy: max $5.00 per transaction," a smart LLM agent will say: "I know the limit is $5, so I'll only send $3." It WON'T try to send $10 unless the human explicitly tells it to.

This is actually fine — the human IS told to say "Send $10" by the setup page. The human is orchestrating the test. But the skill.md should NOT prominently display the limit in a way that the agent internalizes it before the human asks it to overspend.

Better: the `silk account sync` output should be informational but brief. The agent knows the limit but will still try $10 if the human asks, because the human asked.

### 4. Yield: real vs simulated

For the demo, yield needs to be visible within seconds. Real DeFi yield on devnet would be either zero (no active markets) or unpredictable.

Recommendation: **Simulated yield, calculated by the SDK/API.** The account PDA stores the deposit timestamp. The SDK calculates accrued yield: `yield = principal × APY × (now - deposit_time)`. Report it as part of the balance display. For devnet, use an accelerated APY (like 100%+) so the numbers move within a 5-minute demo.

The API returns `balance` and `yieldAccrued` as separate fields. The SDK combines them for display. On-chain, the actual token balance doesn't change (USDC in PDA stays the same). The yield is a virtual display layer for the hackathon. In production, this would connect to real DeFi protocols.

Be transparent about this in the project description: "Yield is simulated on devnet. Production integrates with Kamino/Marinade/etc."

### 5. What Anchor program do we need?

**This is a new Anchor program** — not modifying the existing Handshake program. Clean build focused on the account model.

**Design: Single account, multi-operator (up to 3), multi-token (up to 4)**

One account PDA per owner. Up to 3 operators, each with their own policy. Up to 4 different SPL tokens (token-agnostic). Both operator and token slots are lazy-initialized — operators added by the owner, tokens registered on first deposit.

Each operator has independent per_tx_limit and daily spend tracking. The program checks which operator is signing and applies that operator's specific policy. Token policies are uniform per operator (an operator's per_tx_limit applies regardless of which token).

**Account structure (PDA):**
```rust
#[account]
pub struct SilkywayAccount {
    pub owner: Pubkey,                  // 32 - human, full control
    pub operator_count: u8,             // 1 - active operators (0-3)
    pub operators: [OperatorSlot; 3],   // 3 × 64 = 192
    pub token_count: u8,                // 1 - active token slots (0-4)
    pub tokens: [TokenSlot; 4],         // 4 × 40 = 160
    pub bump: u8,                       // 1
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default)]
pub struct OperatorSlot {
    pub pubkey: Pubkey,          // 32 - operator key (Pubkey::default() = empty slot)
    pub per_tx_limit: u64,       // 8 - max per tx (token smallest units)
    pub daily_limit: u64,        // 8 - max per day (0 = no daily limit)
    pub daily_spent: u64,        // 8 - tracks daily spend
    pub last_reset: i64,         // 8 - timestamp of last daily reset
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default)]
pub struct TokenSlot {
    pub mint: Pubkey,            // 32 - token mint (Pubkey::default() = empty slot)
    pub deposit_timestamp: i64,  // 8 - first deposit time (for yield calc)
}
```

**Instructions:**
- `create_account`: Creates account PDA with owner + first operator (the agent) and its policy. No token slots yet — that happens on first deposit.
- `add_operator`: Owner adds a new operator with its own per_tx_limit/daily_limit. Fails if operator_count == 3.
- `remove_operator`: Owner removes an operator by pubkey.
- `deposit`: Deposits any SPL token. If mint matches an existing slot → transfer to PDA's ATA. If new mint and token_count < 4 → register in next empty slot, init ATA, transfer. If token_count == 4 → error `MaxTokensReached`.
- `transfer_from_account`: The critical instruction (see below).
- `update_operator_policy`: Owner changes a specific operator's spending limits.

**The critical instruction is `transfer_from_account`:**
1. Verify signer matches an active operator slot OR is the owner
2. If operator: look up *that operator's* per_tx_limit and daily tracking → check limits
3. Verify the mint has an active token slot (has been deposited before)
4. If passes: create escrow transfer from account PDA's ATA for that mint, update operator's daily_spent
5. If fails: return error (this IS the rejection the demo depends on)
6. If owner: skip policy checks (owner can do anything)

### 6. SDK/CLI changes needed

- `silk account sync` — discover account PDA, identify which operator slot the current wallet matches, fetch token slots, store in config
- `silk account status` — display per-token balances, yield, operators, and the current operator's policy:
  ```
  Account: 9aE5kBqR...
  Owner: 7xKXz... (human)

  You are: Operator #1 (Ax7kQ9...)
  Your policy: max $5.00/tx, $50.00/day ($12.00 used today)

  Operators: 2/3 slots
    #1 Ax7kQ9... (you)    — $5.00/tx, $50.00/day
    #2 RbLfi3... (RebelFi) — yield-only

  Balances:
    USDC:  92.0008 (+$0.0008 yield)
    USDT:  10.0002 (+$0.0002 yield)
    Total: ~$102.00

  Tokens: 2/4 slots used
  ```
- `silk pay` — route through `transfer_from_account` using the current operator's slot. Specify mint via `--token` flag (defaults to first active token if only one)
- Modified error handling to surface per-operator policy rejection clearly (e.g., "Operator #1 limit: $5.00/tx. Attempted: $10.00")

### 7. Web page (frontend)

Needs:
- Solana wallet adapter (Phantom, Solflare)
- Read agent pubkey from URL params
- Build + send `create_account` transaction with agent as first operator (human signs)
- Set first operator's per_tx_limit
- Faucet integration (mint devnet stablecoins to account PDA)
- Display account status (balance, operators, policy)
- Choreographed "next steps" messaging
- (Future: add/remove operators UI, per-operator policy management)

Tech: React + @solana/wallet-adapter + @solana/web3.js. Deployed to `app.silkyway.ai` (separate from existing root web app).

### 8. Mainnet deployment implications

If this runs on mainnet:
- Program needs to be deployed to mainnet (security audit implications — at minimum, thorough testing)
- Real stablecoins mean real stakes — errors cost real money
- SOL fees for the agent need to be covered (human funds SOL during setup, or fee abstraction)
- The "accelerated yield" hack won't work — real yield comes from real DeFi integrations
- But the yield feature could be a "coming soon" for the hackathon demo — the core demo (policy enforcement + escrow) doesn't depend on yield

**For the hackathon, we could deploy to devnet for safety and still demo on mainnet for the video/presentation.** Or: deploy to mainnet with very small amounts ($5) since the whole point is that policies PROTECT the funds. The policy enforcement demo is actually more impressive on mainnet — "we're so confident in the on-chain policies that we're using real money."

---

## Implementation Plan: What To Build by Thursday

### Build Scope (Ruthlessly Scoped)

**The demo requires exactly 4 things:**

1. **New Anchor program: Account + Policy enforcement** (CORE)
    - New program — not modifying the existing Handshake program
    - `create_account`: PDA with owner + first operator (the agent) and its per_tx_limit. No tokens yet.
    - `add_operator` / `remove_operator`: Owner manages up to 3 operators, each with own policy.
    - `deposit`: Any SPL token. Lazy-initializes token slot (up to 4) and ATA on first deposit of each mint.
    - `transfer_from_account`: identifies which operator is signing → checks *that operator's* per_tx_limit → creates escrow
    - Token-agnostic: any SPL token. Operator's policy applies to all tokens.
    - If policy violated: return clear error code
    - This is the heart of the whole demo
    - **Hackathon scope:** Demo uses 1 operator (the agent). Multi-operator is built into the struct from day 1.

2. **Web page: Account setup** (CORE)
    - `app.silkyway.ai/account/setup?agent=PUBKEY`
    - Wallet connect (Phantom)
    - Set per-transaction limit
    - Create account (sign tx)
    - Fund account with stablecoins (sign tx)
    - "Next steps" messaging (choreographed)
    - React + @solana/wallet-adapter, single page

3. **SDK/CLI: Account support** (CORE)
    - `silk account sync` — discover + store account PDA
    - `silk account status` — display balance, policy, yield
    - `silk pay` — route through account if one exists (policy-checked path)
    - Clear error messages when policy rejects

4. **Skill.md update** (CORE)
    - New flow: create wallet → setup link → sync → use
    - Remove or de-emphasize the old "just a wallet" flow
    - Guide agents through the account experience

### What We Cut (For Now)

- Daily spending limits (per-tx limit is enough for demo, but daily tracking is in the struct)
- Yield-bearing escrow (yield display on account is simulated, escrow yield is future)
- Bot counterparty (the human IS the counterparty in this demo)
- Live dashboard
- Multi-operator demo (struct supports 3 operators from day 1, but demo uses 1)
- `add_operator` / `remove_operator` UI (instructions exist in program, but setup page only creates the first operator)
- Recovery keys, read-only auditor keys
- Scheduled actions (subscriptions, payroll)

### Verification

The demo works when:
1. Agent installs skill → creates wallet
2. Human visits setup page → creates account with $5 limit → deposits stablecoins (first deposit lazy-initializes token slot + ATA)
3. Agent runs `silk account sync` → sees account with per-token balances
4. Agent tries `silk pay` for $10 → **REJECTED by on-chain program**
5. Agent tries `silk pay` for $3 → SUCCESS
6. Human can verify the payment on-chain
