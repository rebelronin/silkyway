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
