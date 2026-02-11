'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PublicKey } from '@solana/web3.js';
import dynamic from 'next/dynamic';
import { useConnectedWallet } from '@/hooks/useConnectedWallet';
import { useAccountActions } from '@/_jotai/account/account.actions';
import { useCluster } from '@/contexts/ClusterContext';
import { solscanUrl } from '@/lib/solscan';

const WalletMultiButton = dynamic(
  () => import('@solana/wallet-adapter-react-ui').then((mod) => mod.WalletMultiButton),
  { ssr: false },
);

const PROGRAM_ID = new PublicKey('8MDFar9moBycSXb6gdZgqkiSEGRBRkzxa7JPLddqYcKs');

export default function HomePage() {
  const router = useRouter();
  const { publicKey, isConnected } = useConnectedWallet();
  const { fetchAccount } = useAccountActions();
  const { cluster } = useCluster();
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!isConnected || !publicKey) return;
    setChecking(true);
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from('account'), publicKey.toBuffer()],
      PROGRAM_ID,
    );
    fetchAccount(pda.toBase58())
      .then(() => router.push('/account'))
      .catch(() => router.push('/transfers'))
      .finally(() => setChecking(false));
  }, [isConnected, publicKey, fetchAccount, router]);

  if (isConnected && checking) {
    return (
      <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center">
        <p className="text-[0.85rem] text-star-white/40">Checking account...</p>
      </div>
    );
  }

  if (isConnected) return null;

  const clusterLabel = cluster === 'mainnet-beta' ? 'Solana Mainnet' : 'Solana Devnet';

  return (
    <div className="relative min-h-[calc(100vh-3.5rem)]">
      <div className="mx-auto flex max-w-[1200px] flex-col items-center justify-center px-8" style={{ minHeight: 'calc(100vh - 3.5rem)' }}>
        <div className="animate-fade-up text-center">
          <h1 className="font-display text-4xl font-black uppercase tracking-wide bg-gradient-to-br from-[#fef3c7] via-solar-gold via-40% to-solar-orange bg-clip-text text-transparent">
            Silkyway
          </h1>
          <p className="mt-3 max-w-md text-[0.9rem] leading-relaxed text-star-white/50">
            Let your AI agents make payments on Solana — without handing over your keys.
          </p>
          <div className="mt-2 flex items-center justify-center gap-2 text-[0.7rem] uppercase tracking-[0.15em] text-nebula-purple/60">
            <span className="h-1.5 w-1.5 rounded-full bg-solar-gold shadow-[0_0_6px_#fbbf24] animate-status-pulse" />
            {clusterLabel}
          </div>
        </div>

        <div className="animate-fade-up mt-10 w-full max-w-sm border border-nebula-purple/20 p-6" style={{ animationDelay: '100ms', background: 'linear-gradient(180deg, rgba(168, 85, 247, 0.04) 0%, rgba(12, 0, 21, 0.6) 100%)' }}>
          <h2 className="mb-1 text-[0.8rem] font-medium uppercase tracking-[0.2em] text-solar-gold">
            Connect Wallet
          </h2>
          <p className="mb-5 text-[0.75rem] text-star-white/35">
            Connect your Solana wallet to get started.
          </p>
          <div className="wallet-adapter-override">
            <WalletMultiButton />
          </div>
        </div>

        <div className="animate-fade-up mt-10 grid max-w-lg grid-cols-2 gap-8 text-center" style={{ animationDelay: '200ms' }}>
          <div>
            <div className="text-[0.7rem] font-medium uppercase tracking-[0.15em] text-star-white/25">Delegated Control</div>
            <p className="mt-1 text-[0.65rem] leading-relaxed text-star-white/15">Agents operate with spending limits you define — your wallet stays yours</p>
          </div>
          <div>
            <div className="text-[0.7rem] font-medium uppercase tracking-[0.15em] text-star-white/25">Escrow Safety</div>
            <p className="mt-1 text-[0.65rem] leading-relaxed text-star-white/15">Time-locked transfers held on-chain until claimed — cancel anytime before</p>
          </div>
        </div>

        <footer className="absolute bottom-8 text-center">
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-nebula-purple/40">Program</div>
          <a
            href={solscanUrl('HZ8paEkYZ2hKBwHoVk23doSLEad9K5duASRTGaYogmfg', 'account')}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[0.65rem] tracking-[0.03em] text-star-white/20 transition-colors hover:text-solar-gold/60"
          >
            HZ8paEkYZ2hKBwHoVk23doSLEad9K5duASRTGaYogmfg
          </a>
        </footer>
      </div>
    </div>
  );
}
