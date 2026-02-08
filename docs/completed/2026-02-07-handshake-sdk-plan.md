# Handshake Agent SDK — Implementation Plan

## Overview

Build a CLI-first SDK package (`packages/sdk`) that OpenClaw agents install to send and receive USDC payments via the Handshake protocol on Solana devnet. Ships with a `SKILL.md` following the Agent Skills spec. Requires 4 backend changes to support the SDK.

**Two workstreams that can be built in parallel:**
- **Backend changes** (new endpoints + modify existing)
- **SDK package** (CLI tool that calls the backend)

---

## Batch 1: Backend — New Endpoints

### Task 1.1: Add `GET /api/tokens` endpoint

Returns supported tokens with symbol-to-mint mapping. The SDK uses this to resolve "usdc" to an actual mint address.

**Create file:** `src/api/controller/token.controller.ts`

```typescript
import { Controller, Get } from '@nestjs/common';
import { TokenService } from '../service/token.service';

@Controller('api/tokens')
export class TokenController {
  constructor(private readonly tokenService: TokenService) {}

  @Get()
  async listTokens() {
    const tokens = await this.tokenService.listTokens();
    return { ok: true, data: { tokens } };
  }
}
```

**Create file:** `src/api/service/token.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/postgresql';
import { Token } from '../../db/models/Token';

@Injectable()
export class TokenService {
  constructor(
    @InjectRepository(Token)
    private readonly tokenRepo: EntityRepository<Token>,
  ) {}

  async listTokens(): Promise<Token[]> {
    return this.tokenRepo.findAll();
  }
}
```

**Modify file:** `src/api/api.module.ts` — Add `TokenController` and `TokenService` to the module's `controllers` and `providers` arrays.

**Response format:**
```json
{
  "ok": true,
  "data": {
    "tokens": [
      { "id": "...", "mint": "FakeUSDC...", "name": "USD Coin", "symbol": "USDC", "decimals": 6 }
    ]
  }
}
```

**Verify:** `curl http://localhost:3000/api/tokens` returns the token list.

---

### Task 1.2: Add `GET /api/balance/:address` endpoint

Returns SOL and token balances for a wallet address. The SDK calls this for `balance` command.

**Add to `token.controller.ts`:**

```typescript
@Get('balance/:address')
async getBalance(@Param('address') address: string) {
  // Validate pubkey (same pattern as tx.controller.ts)
  if (!address) {
    throw new BadRequestException({ ok: false, error: 'MISSING_FIELD', message: 'address is required' });
  }
  try {
    new PublicKey(address);
  } catch {
    throw new BadRequestException({ ok: false, error: 'INVALID_PUBKEY', message: 'address is not a valid public key' });
  }

  const balances = await this.tokenService.getBalances(address);
  return { ok: true, data: balances };
}
```

**NOTE:** Actually this should be a separate controller route since the path is `api/balance/:address`, not under `api/tokens`. Create a new `BalanceController` OR put it under a different prefix. The cleanest approach: add a new `@Controller('api/balance')` class in `token.controller.ts` (rename file to `wallet.controller.ts`) or keep it simple and add a `WalletController`:

**Create file:** `src/api/controller/wallet.controller.ts`

```typescript
import { Controller, Get, Param, BadRequestException } from '@nestjs/common';
import { PublicKey } from '@solana/web3.js';
import { WalletService } from '../service/wallet.service';

@Controller('api/wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get(':address/balance')
  async getBalance(@Param('address') address: string) {
    if (!address) {
      throw new BadRequestException({ ok: false, error: 'MISSING_FIELD', message: 'address is required' });
    }
    try {
      new PublicKey(address);
    } catch {
      throw new BadRequestException({ ok: false, error: 'INVALID_PUBKEY', message: 'address is not a valid public key' });
    }

    const data = await this.walletService.getBalances(address);
    return { ok: true, data };
  }
}
```

**Create file:** `src/api/service/wallet.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/postgresql';
import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, getAccount } from '@solana/spl-token';
import { SolanaService } from '../../solana/solana.service';
import { Token } from '../../db/models/Token';

@Injectable()
export class WalletService {
  constructor(
    private readonly solanaService: SolanaService,
    @InjectRepository(Token)
    private readonly tokenRepo: EntityRepository<Token>,
  ) {}

  async getBalances(address: string) {
    const connection = this.solanaService.getConnection();
    const pubkey = new PublicKey(address);

    // SOL balance
    const lamports = await connection.getBalance(pubkey);
    const sol = lamports / 1e9;

    // Token balances for all known tokens
    const tokens = await this.tokenRepo.findAll();
    const tokenBalances: Array<{ symbol: string; mint: string; balance: string; decimals: number }> = [];

    for (const token of tokens) {
      try {
        const mint = new PublicKey(token.mint);
        const ata = getAssociatedTokenAddressSync(mint, pubkey, true);
        const account = await getAccount(connection, ata);
        const balance = (Number(account.amount) / 10 ** token.decimals).toString();
        tokenBalances.push({ symbol: token.symbol, mint: token.mint, balance, decimals: token.decimals });
      } catch {
        // No token account — balance is 0
        tokenBalances.push({ symbol: token.symbol, mint: token.mint, balance: '0', decimals: token.decimals });
      }
    }

    return { sol, tokens: tokenBalances };
  }
}
```

**Modify file:** `src/api/api.module.ts` — Add `WalletController`, `WalletService` to the module. Also import `Token` entity (already imported).

**Response format:**
```json
{
  "ok": true,
  "data": {
    "sol": 1.5,
    "tokens": [
      { "symbol": "USDC", "mint": "FakeUSDC...", "balance": "100.0", "decimals": 6 }
    ]
  }
}
```

**Verify:** `curl http://localhost:3000/api/wallet/<some-pubkey>/balance` returns balances.

---

### Task 1.3: Extend faucet to support USDC minting

Currently `POST /api/tx/faucet` only airdrops SOL. Add optional `token` parameter that mints fake USDC.

**Prerequisite:** A fake USDC mint must exist on devnet where the backend holds the mint authority. Store the mint authority private key in `.env` as `USDC_MINT_AUTHORITY_PRIVATE_KEY` and the mint address as `USDC_MINT_ADDRESS`.

**Modify file:** `src/solana/solana.service.ts`

Add new properties and method:

```typescript
private usdcMintAddress: PublicKey | null;
private usdcMintAuthority: Keypair | null;
```

In `onModuleInit()`, load from config:

```typescript
const usdcMint = this.configService.get<string>('USDC_MINT_ADDRESS');
if (usdcMint) {
  this.usdcMintAddress = new PublicKey(usdcMint);
  const authorityKey = this.configService.get<string>('USDC_MINT_AUTHORITY_PRIVATE_KEY');
  if (authorityKey) {
    this.usdcMintAuthority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(authorityKey)));
  }
}
```

Add new method:

```typescript
async mintUsdc(wallet: PublicKey, amount: number = 100): Promise<{ usdc: { amount: number; txid: string } }> {
  if (!this.usdcMintAddress || !this.usdcMintAuthority) {
    throw new Error('USDC faucet not configured');
  }

  // Rate limit (same pattern as SOL faucet)
  const walletStr = `usdc:${wallet.toBase58()}`;
  const lastRequest = this.faucetLastRequest.get(walletStr);
  if (lastRequest && Date.now() - lastRequest < this.FAUCET_COOLDOWN_MS) {
    const waitSec = Math.ceil((this.FAUCET_COOLDOWN_MS - (Date.now() - lastRequest)) / 1000);
    throw new Error(`RATE_LIMITED: Try again in ${waitSec} seconds`);
  }

  // Create/get ATA and mint tokens
  const { createAssociatedTokenAccountInstruction, getAssociatedTokenAddressSync, createMintToInstruction } = await import('@solana/spl-token');
  const ata = getAssociatedTokenAddressSync(this.usdcMintAddress, wallet, true);

  const tx = new Transaction();

  // Create ATA if it doesn't exist
  try {
    await getAccount(this.connection, ata);
  } catch {
    tx.add(createAssociatedTokenAccountInstruction(this.usdcMintAuthority.publicKey, ata, wallet, this.usdcMintAddress));
  }

  // Mint tokens (amount * 10^6 for 6 decimals)
  const rawAmount = amount * 1e6;
  tx.add(createMintToInstruction(this.usdcMintAddress, ata, this.usdcMintAuthority.publicKey, rawAmount));

  const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.feePayer = this.usdcMintAuthority.publicKey;
  tx.sign(this.usdcMintAuthority);

  const txid = await this.connection.sendRawTransaction(tx.serialize());
  await this.connection.confirmTransaction(txid, 'confirmed');

  this.faucetLastRequest.set(walletStr, Date.now());
  return { usdc: { amount, txid } };
}

getUsdcMintAddress(): PublicKey | null {
  return this.usdcMintAddress;
}
```

**Modify file:** `src/api/controller/tx.controller.ts`

Update the faucet endpoint to accept optional `token` parameter:

```typescript
@Post('/faucet')
@HttpCode(200)
async faucet(@Body() body: { wallet: string; token?: string }) {
  this.validatePubkey(body.wallet, 'wallet');
  const wallet = new PublicKey(body.wallet);

  try {
    if (body.token === 'usdc') {
      const data = await this.solanaService.mintUsdc(wallet);
      return { ok: true, data };
    } else if (body.token === 'sol' || !body.token) {
      const data = await this.solanaService.requestAirdrop(wallet);
      return { ok: true, data };
    } else {
      throw new BadRequestException({ ok: false, error: 'UNSUPPORTED_TOKEN', message: `Token '${body.token}' not supported. Use 'sol' or 'usdc'.` });
    }
  } catch (e) {
    if (e.message?.startsWith('RATE_LIMITED')) {
      throw new BadRequestException({ ok: false, error: 'RATE_LIMITED', message: e.message });
    }
    throw new BadRequestException({ ok: false, error: 'FAUCET_FAILED', message: e.message });
  }
}
```

**Modify file:** `.env.sample` — Add:
```
USDC_MINT_ADDRESS=
USDC_MINT_AUTHORITY_PRIVATE_KEY=
```

**Verify:**
- `curl -X POST http://localhost:3000/api/tx/faucet -d '{"wallet":"..."}' -H 'Content-Type: application/json'` still airdrops SOL
- `curl -X POST http://localhost:3000/api/tx/faucet -d '{"wallet":"...","token":"usdc"}' -H 'Content-Type: application/json'` mints USDC

---

## Batch 2: Backend — Modify create-transfer for Pool Auto-Selection

### Task 2.1: Remove `poolPda` requirement from create-transfer

The SDK shouldn't need to know about pools. The backend should auto-select the pool based on token.

**Modify file:** `src/api/service/tx.service.ts`

Update the `CreateTransferParams` interface — make `poolPda` optional and add `token` as optional:

```typescript
export interface CreateTransferParams {
  sender: string;
  recipient: string;
  amount: number;
  mint?: string;       // optional now — can be resolved from token symbol
  poolPda?: string;    // optional now — auto-selected if not provided
  token?: string;      // e.g. "usdc" — resolves to mint and pool
  memo?: string;
  claimableAfter?: number;
  claimableUntil?: number;
}
```

Update `buildCreateTransfer` method to resolve pool automatically:

```typescript
async buildCreateTransfer(params: CreateTransferParams) {
  const client = this.solanaService.getHandshakeClient();
  const connection = this.solanaService.getConnection();

  const sender = new PublicKey(params.sender);
  const recipient = new PublicKey(params.recipient);

  // Resolve pool: explicit poolPda > token symbol lookup
  let poolPda: PublicKey;
  if (params.poolPda) {
    poolPda = new PublicKey(params.poolPda);
  } else {
    // Find pool by token symbol or mint
    const pool = await this.resolvePool(params.token, params.mint);
    poolPda = new PublicKey(pool.poolPda);
  }

  // ... rest of the method stays the same
}
```

Add helper method:

```typescript
private async resolvePool(tokenSymbol?: string, mint?: string): Promise<Pool> {
  if (mint) {
    const token = await this.tokenRepo.findOne({ mint });
    if (!token) throw new Error('TOKEN_NOT_FOUND');
    const pool = await this.poolRepo.findOne({ token }, { populate: ['token'] });
    if (!pool) throw new Error('POOL_NOT_FOUND');
    return pool;
  }
  if (tokenSymbol) {
    const token = await this.tokenRepo.findOne({ symbol: { $ilike: tokenSymbol } });
    if (!token) throw new Error('TOKEN_NOT_FOUND');
    const pool = await this.poolRepo.findOne({ token }, { populate: ['token'] });
    if (!pool) throw new Error('POOL_NOT_FOUND');
    return pool;
  }
  // Default: find first active pool
  const pool = await this.poolRepo.findOne({ isPaused: false }, { populate: ['token'] });
  if (!pool) throw new Error('NO_ACTIVE_POOL');
  return pool;
}
```

**Modify file:** `src/api/controller/tx.controller.ts`

Update validation in `createTransfer` — `poolPda` and `mint` are now optional:

```typescript
@Post('create-transfer')
@HttpCode(200)
async createTransfer(@Body() body: CreateTransferParams) {
  this.validatePubkey(body.sender, 'sender');
  this.validatePubkey(body.recipient, 'recipient');
  if (body.poolPda) this.validatePubkey(body.poolPda, 'poolPda');
  if (body.mint) this.validatePubkey(body.mint, 'mint');
  if (!body.amount || body.amount <= 0) {
    throw new BadRequestException({ ok: false, error: 'INVALID_AMOUNT', message: 'Amount must be positive' });
  }
  // Must provide either poolPda, mint, or token
  if (!body.poolPda && !body.mint && !body.token) {
    throw new BadRequestException({ ok: false, error: 'MISSING_FIELD', message: 'Provide poolPda, mint, or token' });
  }

  const data = await this.txService.buildCreateTransfer(body);
  return { ok: true, data };
}
```

**Verify:** `curl -X POST http://localhost:3000/api/tx/create-transfer -d '{"sender":"...","recipient":"...","amount":10,"token":"usdc"}' -H 'Content-Type: application/json'` works without `poolPda`.

---

## Batch 3: SDK Package Scaffold

### Task 3.1: Create the SDK package with CLI scaffold

**Create directory:** `packages/sdk/`

**Create file:** `packages/sdk/package.json`

```json
{
  "name": "@handshake/sdk",
  "version": "0.1.0",
  "description": "Handshake Protocol SDK — Agent payments on Solana",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "bin": {
    "handshake": "./dist/cli.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "clean": "rm -rf dist",
    "prepublishOnly": "npm run clean && npm run build"
  },
  "dependencies": {
    "axios": "^1.11.0",
    "@solana/web3.js": "^1.98.4",
    "bs58": "^6.0.0",
    "commander": "^12.1.0"
  },
  "devDependencies": {
    "@types/node": "^22.10.7",
    "typescript": "^5.7.3"
  },
  "files": ["dist", "SKILL.md"],
  "license": "MIT"
}
```

Key decisions:
- `commander` for CLI parsing (lightweight, well-known)
- `@solana/web3.js` for keypair generation and transaction signing
- `bs58` for base58 encoding of private keys
- `bin.handshake` makes it runnable as `npx @handshake/sdk <command>`

**Create file:** `packages/sdk/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "declaration": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Verify:** `cd packages/sdk && npm install && npm run build` succeeds.

---

### Task 3.2: SDK core — HTTP client and config manager

**Create file:** `packages/sdk/src/client.ts`

HTTP client that wraps calls to the Handshake backend API. Follows the Midas SDK pattern (axios + error interceptor).

```typescript
import axios, { AxiosInstance, AxiosError } from 'axios';

const DEFAULT_BASE_URL = 'https://api.handshake.example.com'; // TODO: update with real URL
const DEFAULT_TIMEOUT = 30000;

export interface ClientConfig {
  baseUrl?: string;
  timeout?: number;
}

export function createHttpClient(config: ClientConfig = {}): AxiosInstance {
  const client = axios.create({
    baseURL: config.baseUrl || DEFAULT_BASE_URL,
    timeout: config.timeout || DEFAULT_TIMEOUT,
    headers: { 'Content-Type': 'application/json' },
  });

  client.interceptors.response.use(
    (response) => response,
    (error: AxiosError<{ ok: boolean; error?: string; message?: string }>) => {
      if (error.response?.data?.message) {
        throw new Error(error.response.data.message);
      }
      if (error.code === 'ECONNABORTED') {
        throw new Error('Request timeout — is the Handshake server running?');
      }
      throw new Error('Network error — is the Handshake server running?');
    },
  );

  return client;
}
```

**Create file:** `packages/sdk/src/config.ts`

Manages `~/.config/handshake/config.json`:

```typescript
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CONFIG_DIR = path.join(os.homedir(), '.config', 'handshake');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export interface WalletEntry {
  label: string;
  address: string;
  privateKey: string;  // base58 encoded
}

export interface HandshakeConfig {
  wallets: WalletEntry[];
  defaultWallet: string;
  preferences: Record<string, unknown>;
  apiUrl?: string;
}

function defaultConfig(): HandshakeConfig {
  return { wallets: [], defaultWallet: 'main', preferences: {} };
}

export function loadConfig(): HandshakeConfig {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
    return JSON.parse(raw) as HandshakeConfig;
  } catch {
    return defaultConfig();
  }
}

export function saveConfig(config: HandshakeConfig): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

export function getWallet(config: HandshakeConfig, label?: string): WalletEntry {
  const target = label || config.defaultWallet;
  const wallet = config.wallets.find((w) => w.label === target);
  if (!wallet) {
    throw new Error(`Wallet "${target}" not found. Run: handshake wallet create`);
  }
  return wallet;
}

export function getApiUrl(config: HandshakeConfig): string {
  return config.apiUrl || process.env.HANDSHAKE_API_URL || 'http://localhost:3000';
}
```

**Verify:** Build succeeds, `loadConfig()` returns default when no file exists.

---

### Task 3.3: SDK CLI entry point and wallet commands

**Create file:** `packages/sdk/src/cli.ts`

```typescript
#!/usr/bin/env node
import { Command } from 'commander';
import { walletCreate, walletList, walletFund } from './commands/wallet.js';
import { balance } from './commands/balance.js';
import { pay } from './commands/pay.js';
import { claim } from './commands/cancel.js';  // name fixed below
import { cancel } from './commands/cancel.js';
import { paymentsList, paymentsGet } from './commands/payments.js';

const program = new Command();
program.name('handshake').description('Handshake Protocol SDK — Agent payments on Solana').version('0.1.0');

// wallet commands
const wallet = program.command('wallet');
wallet.command('create').argument('[label]', 'wallet label', 'main').description('Create a new wallet').action(walletCreate);
wallet.command('list').description('List all wallets').action(walletList);
wallet.command('fund').option('--sol', 'Request SOL only').option('--usdc', 'Request USDC only').option('--wallet <label>', 'Wallet to fund').description('Fund wallet from devnet faucet').action(walletFund);

// balance
program.command('balance').option('--wallet <label>', 'Wallet to check').description('Check wallet balances').action(balance);

// payments
program.command('pay').argument('<recipient>', 'Recipient wallet address').argument('<amount>', 'Amount in USDC').option('--memo <text>', 'Payment memo').option('--wallet <label>', 'Sender wallet').description('Send a USDC payment').action(pay);

program.command('claim').argument('<transferPda>', 'Transfer PDA to claim').option('--wallet <label>', 'Wallet to claim with').description('Claim a received payment').action(claim);

program.command('cancel').argument('<transferPda>', 'Transfer PDA to cancel').option('--wallet <label>', 'Wallet to cancel with').description('Cancel a sent payment').action(cancel);

const payments = program.command('payments');
payments.command('list').option('--wallet <label>', 'Wallet to query').description('List transfers').action(paymentsList);
payments.command('get').argument('<transferPda>', 'Transfer PDA').description('Get transfer details').action(paymentsGet);

program.parse();
```

Add `"bin": { "handshake": "./dist/cli.js" }` to package.json (already shown above). The `#!/usr/bin/env node` shebang makes it executable.

**Create file:** `packages/sdk/src/commands/wallet.ts`

```typescript
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { loadConfig, saveConfig, getWallet, getApiUrl } from '../config.js';
import { createHttpClient } from '../client.js';

export async function walletCreate(label: string) {
  const config = loadConfig();

  // Check for duplicate label
  if (config.wallets.find((w) => w.label === label)) {
    console.error(`Wallet "${label}" already exists.`);
    process.exit(1);
  }

  const keypair = Keypair.generate();
  const address = keypair.publicKey.toBase58();
  const privateKey = bs58.encode(keypair.secretKey);

  config.wallets.push({ label, address, privateKey });
  if (config.wallets.length === 1) {
    config.defaultWallet = label;
  }

  saveConfig(config);
  console.log(`Wallet "${label}" created: ${address}`);
}

export async function walletList() {
  const config = loadConfig();
  if (config.wallets.length === 0) {
    console.log('No wallets. Run: handshake wallet create');
    return;
  }
  for (const w of config.wallets) {
    const marker = w.label === config.defaultWallet ? ' (default)' : '';
    console.log(`  ${w.label}${marker}: ${w.address}`);
  }
}

export async function walletFund(opts: { sol?: boolean; usdc?: boolean; wallet?: string }) {
  const config = loadConfig();
  const wallet = getWallet(config, opts.wallet);
  const client = createHttpClient({ baseUrl: getApiUrl(config) });

  const doSol = opts.sol || (!opts.sol && !opts.usdc);   // default: both
  const doUsdc = opts.usdc || (!opts.sol && !opts.usdc);  // default: both

  if (doSol) {
    try {
      const res = await client.post('/api/tx/faucet', { wallet: wallet.address });
      console.log(`SOL: +${res.data.data.sol.amount} SOL (tx: ${res.data.data.sol.txid})`);
    } catch (e: any) {
      console.error(`SOL faucet failed: ${e.message}`);
    }
  }

  if (doUsdc) {
    try {
      const res = await client.post('/api/tx/faucet', { wallet: wallet.address, token: 'usdc' });
      console.log(`USDC: +${res.data.data.usdc.amount} USDC (tx: ${res.data.data.usdc.txid})`);
    } catch (e: any) {
      console.error(`USDC faucet failed: ${e.message}`);
    }
  }
}
```

**Verify:** `npx handshake wallet create` creates a wallet in `~/.config/handshake/config.json`. `npx handshake wallet list` shows it.

---

### Task 3.4: Balance command

**Create file:** `packages/sdk/src/commands/balance.ts`

```typescript
import { loadConfig, getWallet, getApiUrl } from '../config.js';
import { createHttpClient } from '../client.js';

export async function balance(opts: { wallet?: string }) {
  const config = loadConfig();
  const wallet = getWallet(config, opts.wallet);
  const client = createHttpClient({ baseUrl: getApiUrl(config) });

  const res = await client.get(`/api/wallet/${wallet.address}/balance`);
  const data = res.data.data;

  console.log(`Wallet: ${wallet.label} (${wallet.address})`);
  console.log(`  SOL: ${data.sol}`);
  for (const t of data.tokens) {
    console.log(`  ${t.symbol}: ${t.balance}`);
  }
}
```

**Verify:** `npx handshake balance` shows SOL + USDC balances.

---

### Task 3.5: Pay command (send payment)

**Create file:** `packages/sdk/src/commands/pay.ts`

This is the core flow: call API for unsigned tx → sign locally → submit.

```typescript
import { Keypair, Transaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { loadConfig, getWallet, getApiUrl } from '../config.js';
import { createHttpClient } from '../client.js';

export async function pay(recipient: string, amount: string, opts: { memo?: string; wallet?: string }) {
  const config = loadConfig();
  const wallet = getWallet(config, opts.wallet);
  const client = createHttpClient({ baseUrl: getApiUrl(config) });

  const amountNum = parseFloat(amount);
  if (isNaN(amountNum) || amountNum <= 0) {
    console.error('Amount must be a positive number');
    process.exit(1);
  }

  // 1. Build unsigned transaction
  console.log(`Sending ${amountNum} USDC to ${recipient}...`);
  const buildRes = await client.post('/api/tx/create-transfer', {
    sender: wallet.address,
    recipient,
    amount: amountNum,
    token: 'usdc',
    memo: opts.memo || '',
  });

  const { transaction: txBase64, transferPda, nonce } = buildRes.data.data;

  // 2. Sign the transaction
  const txBytes = Buffer.from(txBase64, 'base64');
  const tx = Transaction.from(txBytes);
  const keypair = Keypair.fromSecretKey(bs58.decode(wallet.privateKey));
  tx.sign(keypair);

  // 3. Submit signed transaction
  const submitRes = await client.post('/api/tx/submit', {
    signedTx: tx.serialize().toString('base64'),
  });

  const { txid } = submitRes.data.data;
  console.log(`Payment sent!`);
  console.log(`  Transfer: ${transferPda}`);
  console.log(`  TX: ${txid}`);
}
```

**Verify:** `npx handshake pay <recipient> 10 --memo "test payment"` sends USDC and prints the transfer PDA + txid.

---

### Task 3.6: Claim and cancel commands

**Create file:** `packages/sdk/src/commands/claim.ts`

```typescript
import { Keypair, Transaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { loadConfig, getWallet, getApiUrl } from '../config.js';
import { createHttpClient } from '../client.js';

export async function claim(transferPda: string, opts: { wallet?: string }) {
  const config = loadConfig();
  const wallet = getWallet(config, opts.wallet);
  const client = createHttpClient({ baseUrl: getApiUrl(config) });

  console.log(`Claiming transfer ${transferPda}...`);

  // 1. Build unsigned claim tx
  const buildRes = await client.post('/api/tx/claim-transfer', {
    claimer: wallet.address,
    transferPda,
  });

  const txBase64 = buildRes.data.data.transaction;

  // 2. Sign
  const tx = Transaction.from(Buffer.from(txBase64, 'base64'));
  const keypair = Keypair.fromSecretKey(bs58.decode(wallet.privateKey));
  tx.sign(keypair);

  // 3. Submit
  const submitRes = await client.post('/api/tx/submit', {
    signedTx: tx.serialize().toString('base64'),
  });

  console.log(`Payment claimed!`);
  console.log(`  TX: ${submitRes.data.data.txid}`);
}
```

**Create file:** `packages/sdk/src/commands/cancel.ts`

```typescript
import { Keypair, Transaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { loadConfig, getWallet, getApiUrl } from '../config.js';
import { createHttpClient } from '../client.js';

export async function cancel(transferPda: string, opts: { wallet?: string }) {
  const config = loadConfig();
  const wallet = getWallet(config, opts.wallet);
  const client = createHttpClient({ baseUrl: getApiUrl(config) });

  console.log(`Cancelling transfer ${transferPda}...`);

  // 1. Build unsigned cancel tx
  const buildRes = await client.post('/api/tx/cancel-transfer', {
    canceller: wallet.address,
    transferPda,
  });

  const txBase64 = buildRes.data.data.transaction;

  // 2. Sign
  const tx = Transaction.from(Buffer.from(txBase64, 'base64'));
  const keypair = Keypair.fromSecretKey(bs58.decode(wallet.privateKey));
  tx.sign(keypair);

  // 3. Submit
  const submitRes = await client.post('/api/tx/submit', {
    signedTx: tx.serialize().toString('base64'),
  });

  console.log(`Payment cancelled!`);
  console.log(`  TX: ${submitRes.data.data.txid}`);
}
```

**Verify:** After sending a payment, `npx handshake claim <pda> --wallet receiver` claims it. `npx handshake cancel <pda>` cancels one.

---

### Task 3.7: Payments list and get commands

**Create file:** `packages/sdk/src/commands/payments.ts`

```typescript
import { loadConfig, getWallet, getApiUrl } from '../config.js';
import { createHttpClient } from '../client.js';

export async function paymentsList(opts: { wallet?: string }) {
  const config = loadConfig();
  const wallet = getWallet(config, opts.wallet);
  const client = createHttpClient({ baseUrl: getApiUrl(config) });

  const res = await client.get(`/api/transfers`, { params: { wallet: wallet.address } });
  const transfers = res.data.data.transfers;

  if (transfers.length === 0) {
    console.log('No transfers found.');
    return;
  }

  // Default: show active transfers (sent and received)
  const active = transfers.filter((t: any) => t.status === 'ACTIVE');
  const other = transfers.filter((t: any) => t.status !== 'ACTIVE');

  if (active.length > 0) {
    console.log('Active transfers:');
    for (const t of active) {
      const direction = t.sender === wallet.address ? 'SENT' : 'RECEIVED';
      const counterparty = direction === 'SENT' ? t.recipient : t.sender;
      const amount = (Number(t.amount) / 10 ** (t.token?.decimals || 6)).toFixed(2);
      const symbol = t.token?.symbol || 'tokens';
      console.log(`  ${t.transferPda}  |  ${amount} ${symbol}  |  ${direction} ${direction === 'SENT' ? 'to' : 'from'} ${counterparty}  |  ${t.status}`);
      if (t.memo) console.log(`    memo: ${t.memo}`);
    }
  }

  if (other.length > 0) {
    console.log(`\nCompleted transfers (${other.length}):`);
    for (const t of other) {
      const direction = t.sender === wallet.address ? 'SENT' : 'RECEIVED';
      const amount = (Number(t.amount) / 10 ** (t.token?.decimals || 6)).toFixed(2);
      const symbol = t.token?.symbol || 'tokens';
      console.log(`  ${t.transferPda}  |  ${amount} ${symbol}  |  ${direction}  |  ${t.status}`);
    }
  }
}

export async function paymentsGet(transferPda: string) {
  const config = loadConfig();
  const client = createHttpClient({ baseUrl: getApiUrl(config) });

  const res = await client.get(`/api/transfers/${transferPda}`);
  const t = res.data.data.transfer;

  if (!t) {
    console.error('Transfer not found.');
    process.exit(1);
  }

  const amount = (Number(t.amount) / 10 ** (t.token?.decimals || 6)).toFixed(2);
  const symbol = t.token?.symbol || 'tokens';

  console.log(`Transfer: ${t.transferPda}`);
  console.log(`  Amount: ${amount} ${symbol}`);
  console.log(`  Sender: ${t.sender}`);
  console.log(`  Recipient: ${t.recipient}`);
  console.log(`  Status: ${t.status}`);
  if (t.memo) console.log(`  Memo: ${t.memo}`);
  console.log(`  Created: ${t.createdAt}`);
  if (t.createTxid) console.log(`  Create TX: ${t.createTxid}`);
  if (t.claimTxid) console.log(`  Claim TX: ${t.claimTxid}`);
}
```

**Verify:** `npx handshake payments list` shows active transfers grouped by status.

---

### Task 3.8: SDK index.ts (library export for future use)

**Create file:** `packages/sdk/src/index.ts`

```typescript
export { loadConfig, saveConfig, getWallet, getApiUrl } from './config.js';
export type { HandshakeConfig, WalletEntry } from './config.js';
export { createHttpClient } from './client.js';
export type { ClientConfig } from './client.js';
```

This is minimal for now — just re-exports config and client utilities. The library API can grow later when someone wants to use it programmatically instead of via CLI.

---

## Batch 4: SKILL.md

### Task 4.1: Create the Agent Skills SKILL.md

**Create file:** `packages/sdk/SKILL.md`

This follows the Agent Skills spec (https://agentskills.io/specification). The frontmatter has required `name` and `description` fields, then the body has step-by-step instructions for agents.

```markdown
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
npm install -g @handshake/sdk
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
```

**Verify:** Validate the SKILL.md frontmatter has required `name` and `description` fields. The name matches lowercase-hyphen format. Description is under 1024 chars.

---

## Batch 5: Integration & Smoke Test

### Task 5.1: Fix CLI entry point and build

Ensure `packages/sdk/src/cli.ts` has correct imports (the imports shown in Task 3.3 had a naming issue — `claim` and `cancel` need separate files). Fix the import to:

```typescript
import { claim } from './commands/claim.js';
import { cancel } from './commands/cancel.js';
```

Build the SDK:

```bash
cd packages/sdk
npm install
npm run build
```

Make the CLI executable:

```bash
chmod +x dist/cli.js
```

**Verify:** `node packages/sdk/dist/cli.js --help` prints the command list.

---

### Task 5.2: End-to-end smoke test

This is the full agent flow to verify everything works. Run with the NestJS backend running against devnet.

**Prerequisites:**
- Backend is running (`npm run start:dev` from root)
- A USDC mint exists on devnet with the backend holding mint authority
- The pool is initialized on-chain for that USDC mint
- Token and Pool records exist in the database

**Test script (run manually):**

```bash
# 1. Setup wallet 1
npx handshake wallet create
npx handshake wallet fund

# 2. Setup wallet 2
npx handshake wallet create receiver
npx handshake wallet fund --wallet receiver

# 3. Check balances
npx handshake balance
npx handshake balance --wallet receiver

# 4. Send payment from main to receiver
npx handshake pay <receiver-address> 5 --memo "test payment"
# Note the Transfer ID from output

# 5. Check receiver's incoming transfers
npx handshake payments list --wallet receiver
# Should show 1 ACTIVE transfer

# 6. Claim from receiver wallet
npx handshake claim <transfer-id> --wallet receiver

# 7. Verify balances changed
npx handshake balance
npx handshake balance --wallet receiver

# 8. Test cancel flow
npx handshake pay <receiver-address> 3 --memo "will cancel"
npx handshake cancel <transfer-id>
npx handshake balance  # should have 3 USDC back
```

**Verify:** All commands complete without errors. Balances reflect the transfers.

---

## File Summary

### New files
| File | Batch |
|------|-------|
| `src/api/controller/token.controller.ts` | 1 |
| `src/api/service/token.service.ts` | 1 |
| `src/api/controller/wallet.controller.ts` | 1 |
| `src/api/service/wallet.service.ts` | 1 |
| `packages/sdk/package.json` | 3 |
| `packages/sdk/tsconfig.json` | 3 |
| `packages/sdk/src/client.ts` | 3 |
| `packages/sdk/src/config.ts` | 3 |
| `packages/sdk/src/cli.ts` | 3 |
| `packages/sdk/src/index.ts` | 3 |
| `packages/sdk/src/commands/wallet.ts` | 3 |
| `packages/sdk/src/commands/balance.ts` | 3 |
| `packages/sdk/src/commands/pay.ts` | 3 |
| `packages/sdk/src/commands/claim.ts` | 3 |
| `packages/sdk/src/commands/cancel.ts` | 3 |
| `packages/sdk/src/commands/payments.ts` | 3 |
| `packages/sdk/SKILL.md` | 4 |

### Modified files
| File | Batch | Change |
|------|-------|--------|
| `src/api/api.module.ts` | 1 | Add TokenController, TokenService, WalletController, WalletService |
| `src/solana/solana.service.ts` | 1 | Add USDC mint config, `mintUsdc()` method, `getUsdcMintAddress()` |
| `src/api/controller/tx.controller.ts` | 1, 2 | Extend faucet with `token` param; relax poolPda validation |
| `src/api/service/tx.service.ts` | 2 | Add `resolvePool()`, update CreateTransferParams |
| `.env.sample` | 1 | Add USDC_MINT_ADDRESS, USDC_MINT_AUTHORITY_PRIVATE_KEY |

### Build order
1. Backend Batch 1 (new endpoints) — can be done in parallel with Batch 3
2. Backend Batch 2 (modify create-transfer) — depends on Batch 1 (needs token service)
3. SDK Batch 3 (package + all CLI commands) — can start in parallel with Batch 1
4. SKILL.md Batch 4 — after Batch 3
5. Integration Batch 5 — after all batches complete
