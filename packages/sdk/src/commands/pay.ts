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

  console.log(`Sending ${amountNum} USDC to ${recipient}...`);

  // 1. Build unsigned transaction
  const buildRes = await client.post('/api/tx/create-transfer', {
    sender: wallet.address,
    recipient,
    amount: amountNum,
    token: 'usdc',
    memo: opts.memo || '',
  });

  const { transaction: txBase64, transferPda } = buildRes.data.data;

  // 2. Sign the transaction
  const tx = Transaction.from(Buffer.from(txBase64, 'base64'));
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
