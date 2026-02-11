function readCluster(): string {
  if (typeof window === 'undefined') return 'mainnet-beta';
  return localStorage.getItem('silkyway-cluster') || 'mainnet-beta';
}

export function solscanUrl(address: string, type: 'account' | 'tx', cluster?: string): string {
  const c = cluster ?? readCluster();
  const path = type === 'tx' ? 'tx' : 'account';
  const base = `https://solscan.io/${path}/${address}`;
  if (c === 'devnet') return `${base}?cluster=devnet`;
  return base;
}
