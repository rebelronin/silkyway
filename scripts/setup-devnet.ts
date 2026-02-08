/**
 * Devnet Setup Script
 *
 * One-time setup that:
 * 1. Loads system signer from SYSTEM_SIGNER_PRIVATE_KEY file
 * 2. Airdrops SOL to system signer
 * 3. Creates a fake USDC mint (system signer = mint authority)
 * 4. Mints 1B USDC to system signer's ATA
 * 5. Creates a Handshake pool on-chain for USDC
 * 6. Prints .env values to configure
 *
 * Usage: npx ts-node scripts/setup-devnet.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
  PublicKey,
} from '@solana/web3.js';
import {
  createAssociatedTokenAccountInstruction,
  createInitializeMintInstruction,
  createMintToCheckedInstruction,
  getAssociatedTokenAddress,
  getMinimumBalanceForRentExemptMint,
  getMint,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { AnchorProvider, Program, Wallet, web3, utils } from '@coral-xyz/anchor';

require('dotenv').config();

// --- Config ---

const POOL_NAME = process.env.HANDSHAKE_POOL_NAME || 'usdc-devnet';
const POOL_FEE_BPS = 0;
const DECIMALS = 6;
const MINT_AMOUNT = BigInt('1000000000000000'); // 1B USDC (with 6 decimals)

const USDC_MINT_KEYPAIR_FILE = path.join(__dirname, 'mints', 'EdgRyTNhoroQnYhsyBYv1t22dZGcDPoywfcG68FpqmrS.json');

// --- Helpers ---

function loadKeypairFromFile(filePath: string): Keypair {
  const resolved = filePath.startsWith('~')
    ? path.join(os.homedir(), filePath.slice(1))
    : filePath;
  const keyData = JSON.parse(fs.readFileSync(resolved, 'utf-8'));
  return Keypair.fromSecretKey(Uint8Array.from(keyData));
}

function generateNamedPoolId(name: string): PublicKey {
  const crypto = require('node:crypto');
  const hash = crypto.createHash('sha256').update(name).digest();
  return new PublicKey(hash.subarray(0, 32));
}

// --- Main ---

async function setup() {
  // 1. Load system signer
  const signerPath = process.env.SYSTEM_SIGNER_PRIVATE_KEY
    || path.join(os.homedir(), '.config', 'solana', 'id.json');
  console.log(`Loading system signer from ${signerPath}...`);
  const systemSigner = loadKeypairFromFile(signerPath);
  console.log(`System signer: ${systemSigner.publicKey.toBase58()}`);

  // Connection
  const rpcUrl = process.env.RPC_URL || 'https://api.devnet.solana.com';
  const connection = new Connection(rpcUrl, 'confirmed');
  console.log(`Connected to ${rpcUrl}`);

  // 2. Airdrop SOL
  console.log(`\nAirdropping SOL to system signer...`);
  try {
    const sig = await connection.requestAirdrop(systemSigner.publicKey, 2 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, 'confirmed');
    console.log(`Airdropped 2 SOL (tx: ${sig})`);
  } catch (e: any) {
    console.log(`Airdrop failed (may already have SOL): ${e.message}`);
  }

  const balance = await connection.getBalance(systemSigner.publicKey);
  console.log(`System signer balance: ${balance / LAMPORTS_PER_SOL} SOL`);

  // 3. Create fake USDC mint
  console.log(`\nCreating USDC mint...`);
  const usdcMintKeypair = loadKeypairFromFile(USDC_MINT_KEYPAIR_FILE);
  const usdcMint = usdcMintKeypair.publicKey;
  console.log(`USDC mint address: ${usdcMint.toBase58()}`);

  let mintExists = false;
  try {
    await getMint(connection, usdcMint, 'confirmed', TOKEN_PROGRAM_ID);
    console.log(`Mint already exists, skipping creation.`);
    mintExists = true;
  } catch {
    // Mint doesn't exist, create it
  }

  if (!mintExists) {
    const ata = await getAssociatedTokenAddress(usdcMint, systemSigner.publicKey, true, TOKEN_PROGRAM_ID);

    const tx = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: systemSigner.publicKey,
        newAccountPubkey: usdcMint,
        lamports: await getMinimumBalanceForRentExemptMint(connection),
        space: MINT_SIZE,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeMintInstruction(
        usdcMint,
        DECIMALS,
        systemSigner.publicKey, // mint authority = system signer
        systemSigner.publicKey, // freeze authority = system signer
        TOKEN_PROGRAM_ID,
      ),
      createAssociatedTokenAccountInstruction(
        systemSigner.publicKey,
        ata,
        systemSigner.publicKey,
        usdcMint,
        TOKEN_PROGRAM_ID,
      ),
      createMintToCheckedInstruction(
        usdcMint,
        ata,
        systemSigner.publicKey,
        MINT_AMOUNT,
        DECIMALS,
        [],
        TOKEN_PROGRAM_ID,
      ),
    );

    const wallet = new Wallet(systemSigner);
    const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
    const txid = await provider.sendAndConfirm(tx, [usdcMintKeypair]);
    console.log(`Mint created and funded (tx: ${txid})`);
  }

  // 4. Create Handshake pool
  console.log(`\nCreating Handshake pool "${POOL_NAME}"...`);

  const programId = new PublicKey(
    process.env.HANDSHAKE_PROGRAM_ID || 'HZ8paEkYZ2hKBwHoVk23doSLEad9K5duASRTGaYogmfg',
  );
  const wallet = new Wallet(systemSigner);
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });

  const idlPath = path.join(__dirname, '..', 'src', 'solana', 'handshake-idl.json');
  const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8'));
  const program = new Program(idl as any, provider);

  const poolId = generateNamedPoolId(POOL_NAME);
  const [poolPda] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from(utils.bytes.utf8.encode('pool')), poolId.toBuffer()],
    programId,
  );

  console.log(`Pool ID: ${poolId.toBase58()}`);
  console.log(`Pool PDA: ${poolPda.toBase58()}`);

  // Check if pool already exists
  let poolExists = false;
  try {
    const existing = await (program.account as any).pool.fetch(poolPda);
    if (existing) {
      console.log(`Pool already exists, skipping creation.`);
      poolExists = true;
    }
  } catch {
    // Pool doesn't exist
  }

  if (!poolExists) {
    const poolTokenAccount = getAssociatedTokenAddressSync(usdcMint, poolPda, true, TOKEN_PROGRAM_ID);

    const accounts = {
      operator: systemSigner.publicKey,
      mint: usdcMint,
      pool: poolPda,
      poolTokenAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: web3.SYSVAR_RENT_PUBKEY,
    };

    const ix = await (program.methods as any)
      .initPool(poolId, POOL_FEE_BPS)
      .accounts(accounts)
      .instruction();

    const poolTx = new Transaction().add(ix);
    const txid = await provider.sendAndConfirm(poolTx);
    console.log(`Pool created (tx: ${txid})`);
  }

  // 5. Print .env values
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Setup complete! Add these to your .env:`);
  console.log(`${'='.repeat(60)}`);
  console.log(`SYSTEM_SIGNER_PRIVATE_KEY=${signerPath}`);
  console.log(`USDC_MINT_ADDRESS=${usdcMint.toBase58()}`);
  console.log(`HANDSHAKE_POOL_NAME=${POOL_NAME}`);
  console.log(`${'='.repeat(60)}`);
}

setup()
  .then(() => console.log('\nDone.'))
  .catch((err) => {
    console.error('Setup failed:', err);
    process.exit(1);
  });
