'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';
import { useConnectedWallet } from '@/hooks/useConnectedWallet';
import { useCluster, type SolanaCluster } from '@/contexts/ClusterContext';

const WalletMultiButton = dynamic(
  () => import('@solana/wallet-adapter-react-ui').then((mod) => mod.WalletMultiButton),
  { ssr: false },
);

const NAV_LINKS = [
  { href: '/send', label: 'Send' },
  { href: '/transfers', label: 'Transfers' },
  { href: '/account', label: 'Account' },
];

function ClusterToggle() {
  const { cluster, setCluster } = useCluster();

  const options: { value: SolanaCluster; label: string }[] = [
    { value: 'mainnet-beta', label: 'Mainnet' },
    { value: 'devnet', label: 'Devnet' },
  ];

  return (
    <div className="flex items-center rounded-full border border-nebula-purple/20 bg-deep-space/80 p-0.5">
      {options.map(({ value, label }) => (
        <button
          key={value}
          onClick={() => setCluster(value)}
          className={cn(
            'rounded-full px-2.5 py-0.5 text-[0.6rem] font-medium uppercase tracking-[0.15em] transition-all duration-200',
            cluster === value
              ? value === 'mainnet-beta'
                ? 'bg-gradient-to-r from-solar-gold/90 to-solar-orange/90 text-deep-space'
                : 'bg-gradient-to-r from-nebula-purple/90 to-nebula-purple/70 text-star-white'
              : 'text-star-white/30 hover:text-star-white/50',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function Header() {
  const pathname = usePathname();
  const { isConnected } = useConnectedWallet();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-nebula-purple/15 bg-deep-space/90 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between px-8">
        <div className="flex items-center gap-4">
          <Link href={isConnected ? '/account' : '/'} className="group flex items-center gap-2">
            <span className="font-display text-lg font-black uppercase tracking-wide bg-gradient-to-r from-solar-gold via-solar-orange to-nebula-purple bg-clip-text text-transparent">
              Silkyway
            </span>
          </Link>

          <ClusterToggle />

          {isConnected && (
            <nav className="hidden items-center gap-0.5 md:flex ml-6">
              {NAV_LINKS.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'px-3 py-1.5 text-[0.7rem] font-medium uppercase tracking-[0.2em] transition-all duration-300',
                    pathname === href || pathname?.startsWith(href + '/')
                      ? 'text-solar-gold'
                      : 'text-star-white/40 hover:text-solar-gold/70',
                  )}
                >
                  {label}
                </Link>
              ))}
            </nav>
          )}
        </div>

        <div className="wallet-adapter-override">
          <WalletMultiButton />
        </div>
      </div>
    </header>
  );
}
