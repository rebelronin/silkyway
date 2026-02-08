# MikroORM Transactions & Context

How transactions, EntityManagers, and identity maps work in our NestJS + MikroORM stack, and the conventions we follow.

## Table of Contents

1. [How MikroORM Context Works](#how-mikroorm-context-works)
2. [Transaction Boundaries](#transaction-boundaries)
3. [Blockchain I/O and Transactions](#blockchain-io-and-transactions)
4. [Passing Data Across Boundaries](#passing-data-across-boundaries)
5. [Flushing Strategy](#flushing-strategy)
6. [Rules of Thumb](#rules-of-thumb)
7. [Common Patterns](#common-patterns)
8. [Anti-Patterns](#anti-patterns)

---

## How MikroORM Context Works

### Global Context is Disabled

Our MikroORM configuration has **`allowGlobalContext: false`**. This enforces proper EntityManager scoping:

- **All code must run within a request context** - no implicit global EM access
- Using `em` or repositories without context throws:
  `"Using global EntityManager instance methods for context specific actions is disallowed"`
- This prevents stale entity issues, identity map leaks, and transaction boundary confusion

**Required context providers:**

| Scenario                  | Solution                                                          |
|---------------------------|-------------------------------------------------------------------|
| HTTP requests             | Automatic via `@mikro-orm/nestjs`                                 |
| Event handlers            | `@EnsureRequestContext()` decorator                               |
| Cron jobs/background work | `@EnsureRequestContext()` or `@CreateRequestContext()`            |
| Module initialization     | `@CreateRequestContext()` decorator                               |
| Tests                     | Use `testHelper.withTransaction()` or `testHelper.withForkedEm()` |

**IMPORTANT: `@EnsureRequestContext()` and `@Transactional()` are mutually exclusive.**

- **Use `@Transactional()`** when the method performs database operations and needs transaction boundaries
- **Use `@EnsureRequestContext()`** for entry points (event handlers, cron jobs) that call other services which handle their own transactions
- **NEVER use both decorators on the same method** - `@Transactional()` already creates a request context, making `@EnsureRequestContext()` redundant

```typescript
// ✅ CORRECT - @Transactional creates context automatically
@Transactional()
async handleTransactionDetected(event: TransactionDetectedEvent): Promise<void> {
  // Has both context and transaction
}

// ✅ CORRECT - @EnsureRequestContext for entry point that delegates
@OnEvent(EventType.SOMETHING)
@EnsureRequestContext()
async handleEvent(event: SomeEvent): Promise<void> {
  await this.someService.process(event.id);  // Service has @Transactional
}

// ❌ INCORRECT - Redundant decorators
@OnEvent(EventType.SOMETHING)
@EnsureRequestContext()
@Transactional()
async handleEvent(event: SomeEvent): Promise<void> {
  // @Transactional already provides context!
}
```

### Request Context & Per-Request EntityManager

MikroORM is designed around **one EntityManager + identity map per request**. In our NestJS setup:

- `@mikro-orm/nestjs` plus `RequestContext` gives us a request-scoped EM
- Injected `EntityManager` and repositories automatically use that request-scoped EM
- `@EnsureRequestContext()` **is required** for entry points outside HTTP (event handlers, jobs)

```typescript
@Injectable()
export class SomeService {
  constructor(
    private readonly em: EntityManager,  // Request-scoped via context
    private readonly userRepository: UserRepository  // Also uses request context
  ) {}
}
```

### Transactions Create Forked EMs with Shared Identity Map

When you call `em.transactional()` or use `@Transactional()`:

1. **A new EM is created** (forked from the current one)
2. **The forked EM is bound to the async context** (like RequestContext)
3. **Identity map is shared** - created with `clear: false` by default, so all managed entities from the parent EM are
   available
4. **Auto-flush on commit** - MikroORM flushes the inner EM before committing

```typescript
// Entity loaded in request context
const user = await this.userRepository.findOne(userId);

await this.em.transactional(async (em) => {
  // user IS in the forked EM's identity map - this works!
  user.isActive = true;
  em.persist(user);  // Changes will be tracked and persisted
});
```

### Context Propagation

Inside `em.transactional()` or a `@Transactional()` method, **any use of the injected EM or repositories respects the inner
context**:

```typescript
await this.em.transactional(async (em) => {
  // Both of these use the transaction's EM automatically:
  const token = await this.tokenRepository.findByAddress(address);  // Uses transaction EM
  this.em.persist(newEntity);  // Also uses transaction EM via context propagation
});
```

You don't need to thread `em` through every method call - repositories and `this.em` automatically use the current
transaction context.

### Nested @Transactional Methods

| Propagation Mode     | Behavior                                       |
|----------------------|------------------------------------------------|
| `REQUIRED` (default) | Reuses existing transaction & EM               |
| `REQUIRES_NEW`       | Creates fresh EM + separate DB transaction     |
| `NESTED`             | Creates savepoint within existing transaction  |
| `MANDATORY`          | Requires existing transaction (throws if none) |

```typescript
@Transactional({ propagation: TransactionPropagation.REQUIRED })
async outerMethod(): Promise<void> {
  await this.innerService.innerMethod();  // Shares same transaction
}

@Transactional({ propagation: TransactionPropagation.REQUIRED })
async innerMethod(): Promise<void> {
  // Same EM, same transaction as outerMethod
}
```

### Detached Entities

Entities become "detached" when used in a **different** EM context (not the forked transactional EM, but a truly separate
one):

- **Separate transactions**: Entity loaded in Transaction A, used in Transaction B (after A commits)
- **Background workers**: Code running outside RequestContext with independent EMs
- **Explicit fork**: `em.fork({ clear: true, useContext: false })`

Calling `em.persist(detachedEntity)` on a detached entity **will attach it and take a new snapshot** - it's only a no-op if
the entity is already managed by that EM.

---

## Transaction Boundaries

### Make Transaction Boundary Methods Explicit

For each service, have a small number of methods that explicitly define transaction boundaries:

```typescript
// Option 1: @Transactional decorator
@Transactional()
async createSupplyOperation(walletId: number, amount: string): Promise<Operation> {
  // All DB work here shares one transaction
}

// Option 2: em.transactional for tight, surgical transactions
async processInflow(walletId: number): Promise<void> {
  // Do blockchain RPC outside transaction
  const balances = await this.chainService.fetchBalances(walletId);

  // Tight transaction for DB writes only
  await this.em.transactional(async (em) => {
    const snapshot = new WalletSnapshot(wallet, balances);
    em.persist(snapshot);
  });
}
```

### Avoid Mixing Styles in the Same Code Path

Pick one style per code path for clarity:

```typescript
// Avoid this - confusing mix of styles
@Transactional()
async confusingMethod(): Promise<void> {
  await this.em.transactional(async (em) => {  // Nested manual transaction
    // ...
  });
}

// Better: pick one approach
@Transactional()
async clearMethod(): Promise<void> {
  // All DB work here, no inner em.transactional
}

// Or: use em.transactional when you need tight control
async orchestrationMethod(): Promise<void> {
  const data = await this.fetchExternalData();  // RPC outside
  await this.em.transactional(async (em) => {
    // DB work inside
  });
}
```

### When to Use Each Style

| Style                | Use When                                                                   |
|----------------------|----------------------------------------------------------------------------|
| `@Transactional()`   | Simple, DB-only methods; called from controllers or other services         |
| `em.transactional()` | Surgical, small transactions inside larger flows that include external I/O |

---

## Blockchain I/O and Transactions

### Keep RPC Calls Outside DB Transactions

Blockchain RPC calls can be slow. Keeping them outside transactions prevents holding DB locks unnecessarily:

```typescript
// Good: RPC outside, DB inside
async snapshotWalletBalances(wallet: Wallet): Promise<void> {
  // 1. Blockchain RPC (may be slow) - OUTSIDE transaction
  const balances = await this.chainService.fetchWalletBalances(wallet.address);

  // 2. Check if changes exist
  const hasChanges = await this.hasBalanceChanges(wallet, balances);
  if (!hasChanges) return;

  // 3. Tight transaction for DB writes only
  await this.em.transactional(async (em) => {
    const snapshot = new WalletSnapshot(wallet, 'FULL');
    em.persist(snapshot);
    // ... create token snapshots
  });
}
```

### Blockchain Writes Follow Eventual Consistency

You can't get perfect atomicity between DB and blockchain (blockchain is irreversible, DB can roll back). Follow this
pattern:

```typescript
// Step 1: Short DB transaction - create operation record
@Transactional()
async planSupplyOperation(walletId: number, amount: string): Promise<Operation> {
  const operation = new Operation(OperationType.SUPPLY, ...);
  operation.markPlanned();
  this.em.persist(operation);
  return operation;
}

// Step 2: Outside transaction - build and submit blockchain transaction
async executeOperation(operationId: number): Promise<void> {
  const operation = await this.operationRepository.findById(operationId);
  const unsignedTx = await this.buildTransaction(operation);
  // Submit to chain (agent or browser wallet)
}

// Step 3: Separate transaction - update on confirmation
@Transactional()
async handleConfirmation(operationId: number, txHash: string): Promise<void> {
  const operation = await this.operationRepository.findById(operationId);
  operation.markCompleted();
  this.em.persist(operation);
}
```

---

## Passing Data Across Boundaries

### Within a Service/Transaction: Entities Are Fine

Inside one service and one transaction context, passing entity instances is convenient and safe:

```typescript
@Transactional()
async processOperation(operationId: number): Promise<void> {
  const operation = await this.operationRepository.findById(operationId);

  // Fine to pass entity to private helper within same transaction
  await this.validateOperation(operation);
  await this.executeSteps(operation);
}

private async validateOperation(operation: Operation): Promise<void> {
  // Same transaction context, entity is managed
}
```

### Across Service Boundaries: Prefer IDs/DTOs

When calling other services, especially those with their own `@Transactional`:

```typescript
// Prefer this
@Transactional()
async handleCompletion(operationId: number): Promise<void> {
  const operation = await this.operationRepository.findById(operationId);
  operation.markCompleted();
  this.em.persist(operation);

  // Pass ID to other service
  await this.ledgerService.recordCompletion(operationId);
}

// Instead of this
@Transactional()
async handleCompletion(operation: Operation): Promise<void> {
  operation.markCompleted();
  this.em.persist(operation);

  // Passing entity - works due to context propagation, but less explicit
  await this.ledgerService.recordCompletion(operation);
}
```

**Why prefer IDs/DTOs across boundaries:**

1. Makes data dependencies explicit
2. Supports future refactoring (workers, queues, microservices)
3. Works correctly even with different propagation modes
4. Easier to test and reason about

### Side-Effect Services: Always Pass DTOs

Services that perform side effects (email, webhooks, external APIs) don't need ORM entities:

```typescript
// Good: Pass only needed data
await this.emailService.sendNotification({
  email: user.email,
  subject: 'Transfer Complete',
  amount: operation.amountBase,
  token: operation.token.symbol
});
```

---

## Flushing Strategy

### Auto-Flush Behavior

- `em.transactional()` auto-flushes at the end of the callback
- `@Transactional()` auto-flushes at the end of the method

Inside transactional contexts, call `em.persist()` as needed - no manual flush required unless:

### When to Manually Flush

1. **Need IDs mid-transaction** for follow-on logic:

```typescript
await this.em.transactional(async (em) => {
  const reservation = new Reservation(...);
  em.persist(reservation);
  await em.flush();  // Get reservation.id

  // Now use reservation.id
  await this.createRelatedRecord(reservation.id);
});
```

2. **Before external side-effects** to ensure durability:

```typescript
@Transactional()
async createAndNotify(data: CreateDto): Promise<Entity> {
  const entity = new Entity(data);
  this.em.persist(entity);
  await this.em.flush();  // Ensure DB state is durable

  // Now safe to send notification - entity exists in DB
  await this.notificationService.send(entity.id);
  return entity;
}
```

3. **Before calling methods that may create nested contexts:**

```typescript
@Transactional()
async processEntity(entityId: number): Promise<void> {
  const entity = await this.repository.findById(entityId);
  entity.updateStatus('PROCESSING');
  this.em.persist(entity);

  await this.em.flush();  // Commit before nested call

  await this.otherService.processDetails(entityId);  // Has its own @Transactional
}
```

---

## Rules of Thumb

### 1. Use @Transactional as Your Main Tool

For most DB-centric methods, `@Transactional()` is the right choice:

```typescript
@Transactional()
async createOperation(...): Promise<Operation> {
  // DB work
}
```

### 2. Use em.transactional for Surgical Transactions

Inside larger orchestration flows that include RPC or external I/O:

```typescript
async orchestrateFlow(): Promise<void> {
  const externalData = await this.fetchFromChain();  // Outside

  await this.em.transactional(async (em) => {
    // Tight DB transaction
  });

  await this.notifyExternalSystem();  // Outside
}
```

### 3. Keep Blockchain RPC Outside Transactions

```typescript
// Do this
const balances = await this.chainService.fetch();
await this.em.transactional(async (em) => { /* write */ });

// Not this
await this.em.transactional(async (em) => {
  const balances = await this.chainService.fetch();  // Holding lock while waiting on RPC
  /* write */
});
```

### 4. Entities Within, IDs Across

- **Within** a single service/transaction: entities are fine
- **Across** service boundaries: prefer IDs/DTOs

### 5. Identify Transaction Boundary Methods

Annotate and keep them small:

```typescript
/**
 * Transaction boundary: Creates reservation and posts to ledger.
 */
@Transactional()
async reserveForAllocation(...): Promise<Reservation> {
  // Clear, focused transaction
}
```

---

## Common Patterns

### Event Handler with Idempotency

```typescript
@OnEvent(EventType.TRANSACTION_DETECTED)
@EnsureRequestContext()
async handleTransactionDetected(event: TransactionDetectedEvent): Promise<void> {
  await this.withIdempotency(event, async (em) => {
    const chainTx = await this.chainTransactionRepository.findByTxid(event.txid);
    await this.processTransaction(chainTx);
    await em.flush();
  });
}
```

### Service Method Calling Another Service

```typescript
@Transactional()
async handleOperationComplete(operationId: number): Promise<void> {
  const operation = await this.operationRepository.findById(operationId);
  operation.markCompleted();
  this.em.persist(operation);

  // Pass ID - ledgerService has its own @Transactional
  // With REQUIRED propagation, shares same transaction
  await this.ledgerService.recordCompletion(operationId);
}
```

### Snapshot Pattern (RPC + Tight Transaction)

```typescript
async snapshotWallet(wallet: Wallet): Promise<void> {
  // 1. RPC outside transaction
  const balances = await this.chainService.fetchBalances(wallet.address);

  // 2. Early return if no changes
  if (!this.hasChanges(wallet, balances)) return;

  // 3. Tight transaction for writes
  await this.em.transactional(async (em) => {
    const snapshot = new WalletSnapshot(wallet, balances);
    em.persist(snapshot);
  });
}
```

---

## Anti-Patterns

### Mixing @Transactional with Inner em.transactional

```typescript
// Avoid
@Transactional()
async confusingMethod(): Promise<void> {
  await this.em.transactional(async (em) => {
    // Nested transaction - confusing
  });
}
```

### Long Transactions with RPC Inside

```typescript
// Avoid
@Transactional()
async slowMethod(): Promise<void> {
  const data = await this.chainService.fetch();  // Holds DB lock during RPC!
  // ...
}
```

### Inconsistent em Parameter Usage

```typescript
// Avoid
private async helper(em: EntityManager, entity: Entity): Promise<void> {
  // em passed but not used
  await this.repository.persist(entity);  // Uses injected repo instead
}
```

If you pass `em`, use it. If you don't need it, don't pass it.

### Using Entity from Separate Transaction

```typescript
// Avoid
async processAlert(alertId: number): Promise<void> {
  // Transaction 1
  const alert = await this.em.transactional(async (em) => {
    return await this.loadAlert(alertId);
  });
  // Transaction 1 commits - alert now detached

  // Transaction 2
  await this.em.transactional(async (em) => {
    await this.sendEmail(alert);  // alert not in this EM's identity map
  });
}

// Better: re-fetch in second transaction
async processAlert(alertId: number): Promise<void> {
  await this.em.transactional(async (em) => {
    await this.updateStatus(alertId, 'PROCESSING');
  });

  await this.em.transactional(async (em) => {
    const alert = await em.findOneOrFail(Alert, alertId);  // Fresh fetch
    await this.sendEmail(alert);
  });
}
```

---

## Summary

| Concept                 | Key Point                                                           |
|-------------------------|---------------------------------------------------------------------|
| **Request Context**     | One EM per request; injected EM/repos use it automatically          |
| **Transactional Fork**  | Shares identity map with parent; entities are available             |
| **Context Propagation** | Repos/EM inside transaction use the transaction's EM                |
| **Nested Transactions** | `REQUIRED` = same EM; `REQUIRES_NEW` = fresh EM                     |
| **Blockchain I/O**      | Keep RPC outside transactions; use tight transactions for DB writes |
| **Passing Data**        | Entities within service; IDs/DTOs across services                   |
| **Flushing**            | Auto on commit; manual only when needed for IDs or side-effects     |

---

## Related Documentation

- [MikroORM Transactions](https://mikro-orm.io/docs/transactions)
- [Coding Patterns](./coding-patterns.md) - Implementation patterns
- [Architecture: Transactions](../architecture/transactions.md) - Domain terminology
- [Architecture: Events](../architecture/events.md) - Event bus patterns
