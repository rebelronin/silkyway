const CLUSTER = process.env.NEXT_PUBLIC_SOLANA_CLUSTER;

export function solscanUrl(address: string, type: 'account' | 'tx'): string {
  const path = type === 'tx' ? 'tx' : 'account';
  const base = `https://solscan.io/${path}/${address}`;
  if (CLUSTER === 'devnet') return `${base}?cluster=devnet`;
  return base;
}
