import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@mikro-orm/nestjs';
import { CreateRequestContext } from '@mikro-orm/core';
import { EntityRepository, EntityManager } from '@mikro-orm/postgresql';
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL, Transaction } from '@solana/web3.js';
import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor';
import {
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  createMintToInstruction,
  getAccount,
} from '@solana/spl-token';
import { HandshakeClient, generateNamedPoolId } from './handshake-client';
import { Token } from '../db/models/Token';
import { Pool } from '../db/models/Pool';
import * as idl from './handshake-idl.json';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

@Injectable()
export class SolanaService implements OnModuleInit {
  private readonly logger = new Logger(SolanaService.name);

  private connection: Connection;
  private handshakeClient: HandshakeClient;
  private systemSigner: Keypair;

  // USDC faucet (system signer is the mint authority)
  private usdcMintAddress: PublicKey | null = null;

  // Faucet rate limiting (in-memory)
  private faucetLastRequest = new Map<string, number>();
  private readonly FAUCET_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes

  constructor(
    private readonly configService: ConfigService,
    private readonly em: EntityManager,
    @InjectRepository(Token) private readonly tokenRepo: EntityRepository<Token>,
    @InjectRepository(Pool) private readonly poolRepo: EntityRepository<Pool>,
  ) {}

  async onModuleInit() {
    const rpcUrl = this.configService.get<string>('RPC_URL', 'https://api.devnet.solana.com');
    this.connection = new Connection(rpcUrl, 'confirmed');

    // Load system signer from keypair file (like Solana CLI convention)
    const signerPath = this.configService.get<string>('SYSTEM_SIGNER_PRIVATE_KEY')
      || path.join(os.homedir(), '.config', 'solana', 'id.json');
    try {
      const keyData = JSON.parse(fs.readFileSync(signerPath, 'utf-8'));
      this.systemSigner = Keypair.fromSecretKey(Uint8Array.from(keyData));
      this.logger.log(`System signer loaded from ${signerPath}: ${this.systemSigner.publicKey.toBase58()}`);
    } catch (e) {
      this.systemSigner = Keypair.generate();
      this.logger.warn(`Could not load keypair from ${signerPath}, using ephemeral keypair: ${this.systemSigner.publicKey.toBase58()}`);
    }

    // Initialize Anchor program
    const programId = this.configService.get<string>(
      'HANDSHAKE_PROGRAM_ID',
      'HZ8paEkYZ2hKBwHoVk23doSLEad9K5duASRTGaYogmfg',
    );

    const wallet = new Wallet(this.systemSigner);
    const provider = new AnchorProvider(this.connection, wallet, {
      commitment: 'confirmed',
    });
    const program = new Program(idl as any, provider);

    this.handshakeClient = new HandshakeClient(program);
    this.logger.log(`Solana connected to ${rpcUrl}, program ${programId}`);

    // Load USDC mint config (system signer is the mint authority)
    const usdcMint = this.configService.get<string>('USDC_MINT_ADDRESS');
    if (usdcMint) {
      this.usdcMintAddress = new PublicKey(usdcMint);
      this.logger.log(`USDC faucet configured: mint ${usdcMint} (authority: system signer)`);
    }

    // Sync token and pool to database from on-chain state
    await this.syncTokenAndPool();
  }

  @CreateRequestContext()
  private async syncTokenAndPool() {
    const usdcMintAddr = this.configService.get<string>('USDC_MINT_ADDRESS');
    const poolName = this.configService.get<string>('HANDSHAKE_POOL_NAME');

    if (!usdcMintAddr) {
      this.logger.warn('USDC_MINT_ADDRESS not set, skipping token/pool sync');
      return;
    }

    // Ensure Token record exists
    let token = await this.tokenRepo.findOne({ mint: usdcMintAddr });
    if (!token) {
      token = this.tokenRepo.create({
        mint: usdcMintAddr,
        name: 'USD Coin',
        symbol: 'USDC',
        decimals: 6,
      });
      await this.em.persistAndFlush(token);
      this.logger.log(`Token synced to DB: USDC (${usdcMintAddr})`);
    } else {
      this.logger.log(`Token already in DB: USDC (${usdcMintAddr})`);
    }

    if (!poolName) {
      this.logger.warn('HANDSHAKE_POOL_NAME not set, skipping pool sync');
      return;
    }

    // Derive pool PDA and sync from chain
    const poolId = generateNamedPoolId(poolName);
    const [poolPda] = this.handshakeClient.findPoolPda(poolId);
    const poolPdaStr = poolPda.toBase58();

    let pool = await this.poolRepo.findOne({ poolPda: poolPdaStr });
    if (!pool) {
      // Fetch from chain to verify it exists
      const onChain = await this.handshakeClient.fetchPool(poolPda);
      if (!onChain) {
        this.logger.warn(`Pool "${poolName}" (${poolPdaStr}) not found on-chain. Run scripts/setup-devnet.ts first.`);
        return;
      }

      pool = this.poolRepo.create({
        poolId: poolId.toBase58(),
        poolPda: poolPdaStr,
        operatorKey: onChain.operator.toBase58(),
        token,
        feeBps: onChain.transferFeeBps,
        isPaused: onChain.isPaused,
      });
      await this.em.persistAndFlush(pool);
      this.logger.log(`Pool synced to DB: "${poolName}" (${poolPdaStr})`);
    } else {
      this.logger.log(`Pool already in DB: "${poolName}" (${poolPdaStr})`);
    }
  }

  getConnection(): Connection {
    return this.connection;
  }

  getHandshakeClient(): HandshakeClient {
    return this.handshakeClient;
  }

  getSystemSigner(): Keypair {
    return this.systemSigner;
  }

  getUsdcMintAddress(): PublicKey | null {
    return this.usdcMintAddress;
  }

  // --- Faucet ---

  async requestAirdrop(wallet: PublicKey): Promise<{ sol: { amount: number; txid: string } }> {
    const walletStr = wallet.toBase58();

    // Rate limit check
    const lastRequest = this.faucetLastRequest.get(walletStr);
    if (lastRequest && Date.now() - lastRequest < this.FAUCET_COOLDOWN_MS) {
      const waitSec = Math.ceil((this.FAUCET_COOLDOWN_MS - (Date.now() - lastRequest)) / 1000);
      throw new Error(`RATE_LIMITED: Try again in ${waitSec} seconds`);
    }

    const txid = await this.connection.requestAirdrop(wallet, 1 * LAMPORTS_PER_SOL);
    await this.connection.confirmTransaction(txid, 'confirmed');

    this.faucetLastRequest.set(walletStr, Date.now());

    return { sol: { amount: 1.0, txid } };
  }

  async mintUsdc(wallet: PublicKey, amount: number = 100): Promise<{ usdc: { amount: number; txid: string } }> {
    if (!this.usdcMintAddress) {
      throw new Error('USDC faucet not configured. Set USDC_MINT_ADDRESS in .env.');
    }

    // Rate limit (separate from SOL faucet)
    const walletStr = `usdc:${wallet.toBase58()}`;
    const lastRequest = this.faucetLastRequest.get(walletStr);
    if (lastRequest && Date.now() - lastRequest < this.FAUCET_COOLDOWN_MS) {
      const waitSec = Math.ceil((this.FAUCET_COOLDOWN_MS - (Date.now() - lastRequest)) / 1000);
      throw new Error(`RATE_LIMITED: Try again in ${waitSec} seconds`);
    }

    const ata = getAssociatedTokenAddressSync(this.usdcMintAddress, wallet, true);

    const tx = new Transaction();

    // Create ATA if it doesn't exist
    try {
      await getAccount(this.connection, ata);
    } catch {
      tx.add(
        createAssociatedTokenAccountInstruction(
          this.systemSigner.publicKey,
          ata,
          wallet,
          this.usdcMintAddress,
        ),
      );
    }

    // Mint tokens (amount * 10^6 for 6 decimals)
    const rawAmount = amount * 1e6;
    tx.add(
      createMintToInstruction(
        this.usdcMintAddress,
        ata,
        this.systemSigner.publicKey,
        rawAmount,
      ),
    );

    const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.feePayer = this.systemSigner.publicKey;
    tx.sign(this.systemSigner);

    const txid = await this.connection.sendRawTransaction(tx.serialize());
    await this.connection.confirmTransaction(txid, 'confirmed');

    this.faucetLastRequest.set(walletStr, Date.now());
    return { usdc: { amount, txid } };
  }
}
