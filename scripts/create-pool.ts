/**
 * Create Handshake Pool
 *
 * Creates a Handshake pool on-chain for a given mint.
 * Toggle between DevNet and MainNet by commenting/uncommenting the config sections below.
 *
 * Usage: npx ts-node scripts/create-pool.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { AnchorProvider, Program, Wallet, web3, utils } from '@coral-xyz/anchor';

// ============================================================
// Config — uncomment ONE section at a time
// ============================================================

// --- DevNet (Drift fake USDC) ---
const RPC_URL = 'https://api.devnet.solana.com';
const POOL_NAME = 'usdc-drift';
const MINT_ADDRESS = '8zGuJQqwhZafTah7Uc7Z4tXRnguqkn5KLFAP8oV6PHe2';
const POOL_FEE_BPS = 0;

// --- MainNet ---
// const RPC_URL = 'https://api.mainnet-beta.solana.com';
// const POOL_NAME = 'usdc';
// const MINT_ADDRESS = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
// const POOL_FEE_BPS = 0;

// ============================================================

const PROGRAM_ID = 'HANDu9uNdnraNbcueGfXhd3UPu6BXfQroKAsSxFhPXEQ';
const SIGNER_PATH = process.env.SYSTEM_SIGNER_PRIVATE_KEY
  || path.join(os.homedir(), '.config', 'solana', 'id.json');

// --- Helpers ---

function loadKeypairFromFile(filePath: string): Keypair {
  const resolved = filePath.startsWith('~')
    ? path.join(os.homedir(), filePath.slice(1))
    : filePath;
  const keyData = JSON.parse(fs.readFileSync(resolved, 'utf-8'));
  return Keypair.fromSecretKey(Uint8Array.from(keyData));
}

function generateNamedPoolId(name: string): PublicKey {
  const hash = crypto.createHash('sha256').update(name).digest();
  return new PublicKey(hash.subarray(0, 32));
}

// --- Main ---

async function createPool() {
  // Load signer
  console.log(`Loading signer from ${SIGNER_PATH}...`);
  const signer = loadKeypairFromFile(SIGNER_PATH);
  console.log(`Signer: ${signer.publicKey.toBase58()}`);

  // Connect
  const connection = new Connection(RPC_URL, 'confirmed');
  console.log(`RPC: ${RPC_URL}`);

  // Derive pool PDA
  const programId = new PublicKey(PROGRAM_ID);
  const mint = new PublicKey(MINT_ADDRESS);
  const poolId = generateNamedPoolId(POOL_NAME);
  const [poolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from(utils.bytes.utf8.encode('pool')), poolId.toBuffer()],
    programId,
  );

  console.log(`\nPool name:  ${POOL_NAME}`);
  console.log(`Mint:       ${mint.toBase58()}`);
  console.log(`Pool ID:    ${poolId.toBase58()}`);
  console.log(`Pool PDA:   ${poolPda.toBase58()}`);
  console.log(`Fee:        ${POOL_FEE_BPS} bps`);

  // Load program
  const wallet = new Wallet(signer);
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  const idlPath = path.join(__dirname, '..', 'apps', 'backend', 'src', 'solana', 'handshake-idl.json');
  const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8'));
  const program = new Program(idl as any, provider);

  // Check if pool already exists
  try {
    const existing = await (program.account as any).pool.fetch(poolPda);
    if (existing) {
      console.log(`\nPool "${POOL_NAME}" already exists. Nothing to do.`);
      return;
    }
  } catch {
    // Pool doesn't exist — proceed
  }

  // Create pool
  console.log(`\nCreating pool...`);
  const poolTokenAccount = getAssociatedTokenAddressSync(mint, poolPda, true, TOKEN_PROGRAM_ID);

  const ix = await (program.methods as any)
    .initPool(poolId, POOL_FEE_BPS)
    .accounts({
      operator: signer.publicKey,
      mint,
      pool: poolPda,
      poolTokenAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: web3.SYSVAR_RENT_PUBKEY,
    })
    .instruction();

  const tx = new Transaction().add(ix);
  const txid = await provider.sendAndConfirm(tx);
  console.log(`Pool created (tx: ${txid})`);

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Done! Pool "${POOL_NAME}" is live on ${RPC_URL.includes('devnet') ? 'devnet' : 'mainnet'}.`);
  console.log(`\nAdd to .env:`);
  console.log(`HANDSHAKE_POOL_NAME=${POOL_NAME}`);
  console.log(`USDC_MINT_ADDRESS=${MINT_ADDRESS}`);
  console.log(`${'='.repeat(60)}`);
}

createPool()
  .then(() => console.log('\nDone.'))
  .catch((err) => {
    console.error('Failed:', err);
    process.exit(1);
  });
