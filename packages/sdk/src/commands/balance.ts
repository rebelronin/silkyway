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
