import { solscanUrl } from '@/lib/solscan';

export function SolscanLink({ address, type }: { address: string; type: 'account' | 'tx' }) {
  const display = address.length > 12
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : address;

  return (
    <a
      href={solscanUrl(address, type)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-mono text-star-white/70 underline underline-offset-4 transition-colors hover:text-solar-gold"
    >
      {display}
      <span className="text-[0.65em]">↗</span>
    </a>
  );
}
