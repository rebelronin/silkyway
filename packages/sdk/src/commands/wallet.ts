import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { loadConfig, saveConfig, getWallet, getApiUrl } from '../config.js';
import { createHttpClient } from '../client.js';
import { SdkError } from '../errors.js';
import { outputSuccess } from '../output.js';

export async function walletCreate(label: string) {
  const config = loadConfig();

  if (config.wallets.find((w) => w.label === label)) {
    throw new SdkError('WALLET_EXISTS', `Wallet "${label}" already exists.`);
  }

  const keypair = Keypair.generate();
  const address = keypair.publicKey.toBase58();
  const privateKey = bs58.encode(keypair.secretKey);

  config.wallets.push({ label, address, privateKey });
  if (config.wallets.length === 1) {
    config.defaultWallet = label;
  }

  saveConfig(config);
  outputSuccess({ action: 'wallet_created', label, address });
}

export async function walletList() {
  const config = loadConfig();
  const wallets = config.wallets.map((w) => ({
    label: w.label,
    address: w.address,
    default: w.label === config.defaultWallet,
  }));
  outputSuccess({ wallets });
}

export async function walletFund(opts: { sol?: boolean; usdc?: boolean; wallet?: string }) {
  const config = loadConfig();
  const wallet = getWallet(config, opts.wallet);
  const client = createHttpClient({ baseUrl: getApiUrl(config) });

  const doSol = opts.sol || (!opts.sol && !opts.usdc);
  const doUsdc = opts.usdc || (!opts.sol && !opts.usdc);

  const funded: Record<string, unknown> = {};

  if (doSol) {
    try {
      const res = await client.post('/api/tx/faucet', { wallet: wallet.address });
      funded.sol = { amount: res.data.data.sol.amount, txid: res.data.data.sol.txid };
    } catch (e: any) {
      funded.sol = { error: e.code || 'FAUCET_FAILED', message: e.message };
    }
  }

  if (doUsdc) {
    try {
      const res = await client.post('/api/tx/faucet', { wallet: wallet.address, token: 'usdc' });
      funded.usdc = { amount: res.data.data.usdc.amount, txid: res.data.data.usdc.txid };
    } catch (e: any) {
      funded.usdc = { error: e.code || 'FAUCET_FAILED', message: e.message };
    }
  }

  outputSuccess({ action: 'wallet_funded', wallet: wallet.label, address: wallet.address, funded });
}
