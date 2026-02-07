import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL, Transaction } from '@solana/web3.js';
import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor';
import {
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  createMintToInstruction,
  getAccount,
} from '@solana/spl-token';
import { HandshakeClient } from './handshake-client';
import * as idl from './handshake-idl.json';

@Injectable()
export class SolanaService implements OnModuleInit {
  private readonly logger = new Logger(SolanaService.name);

  private connection: Connection;
  private handshakeClient: HandshakeClient;
  private systemSigner: Keypair;

  // USDC faucet
  private usdcMintAddress: PublicKey | null = null;
  private usdcMintAuthority: Keypair | null = null;

  // Faucet rate limiting (in-memory)
  private faucetLastRequest = new Map<string, number>();
  private readonly FAUCET_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const rpcUrl = this.configService.get<string>('RPC_URL', 'https://api.devnet.solana.com');
    this.connection = new Connection(rpcUrl, 'confirmed');

    // Load system signer
    const signerKey = this.configService.get<string>('SYSTEM_SIGNER_PRIVATE_KEY');
    if (signerKey) {
      this.systemSigner = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(signerKey)));
    } else {
      this.systemSigner = Keypair.generate();
      this.logger.warn('No SYSTEM_SIGNER_PRIVATE_KEY configured, using ephemeral keypair');
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

    // Load USDC mint config
    const usdcMint = this.configService.get<string>('USDC_MINT_ADDRESS');
    if (usdcMint) {
      this.usdcMintAddress = new PublicKey(usdcMint);
      const authorityKey = this.configService.get<string>('USDC_MINT_AUTHORITY_PRIVATE_KEY');
      if (authorityKey) {
        this.usdcMintAuthority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(authorityKey)));
        this.logger.log(`USDC faucet configured: mint ${usdcMint}`);
      }
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
    if (!this.usdcMintAddress || !this.usdcMintAuthority) {
      throw new Error('USDC faucet not configured. Set USDC_MINT_ADDRESS and USDC_MINT_AUTHORITY_PRIVATE_KEY.');
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
          this.usdcMintAuthority.publicKey,
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
        this.usdcMintAuthority.publicKey,
        rawAmount,
      ),
    );

    const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.feePayer = this.usdcMintAuthority.publicKey;
    tx.sign(this.usdcMintAuthority);

    const txid = await this.connection.sendRawTransaction(tx.serialize());
    await this.connection.confirmTransaction(txid, 'confirmed');

    this.faucetLastRequest.set(walletStr, Date.now());
    return { usdc: { amount, txid } };
  }
}
