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
