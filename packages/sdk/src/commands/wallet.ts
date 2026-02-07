import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { loadConfig, saveConfig, getWallet, getApiUrl } from '../config.js';
import { createHttpClient } from '../client.js';

export async function walletCreate(label: string) {
  const config = loadConfig();

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

  const doSol = opts.sol || (!opts.sol && !opts.usdc);
  const doUsdc = opts.usdc || (!opts.sol && !opts.usdc);

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
