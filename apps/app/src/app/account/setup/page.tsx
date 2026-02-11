'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { PublicKey } from '@solana/web3.js';
import { useConnectedWallet } from '@/hooks/useConnectedWallet';
import { useAccountActions } from '@/_jotai/account/account.actions';
import { useTransferActions } from '@/_jotai/transfer/transfer.actions';
import { api } from '@/lib/api';
import { toast } from 'react-toastify';
import Link from 'next/link';
import { SolscanLink } from '@/components/SolscanLink';
import { solscanUrl } from '@/lib/solscan';
import { useCluster } from '@/contexts/ClusterContext';

type Step = 'connect' | 'configure' | 'fund' | 'done';

function truncate(s: string) {
  return s.length > 12 ? `${s.slice(0, 6)}...${s.slice(-4)}` : s;
}

export default function AccountSetupPage() {
  return (
    <Suspense>
      <AccountSetupContent />
    </Suspense>
  );
}

function AccountSetupContent() {
  const searchParams = useSearchParams();
  const agentParam = searchParams.get('agent');
  const { publicKey, isConnected } = useConnectedWallet();
  const { createAccount, depositToAccount, signAndSubmit } = useAccountActions();
  const { requestFaucet } = useTransferActions();
  const { cluster } = useCluster();

  const [step, setStep] = useState<Step>('connect');
  const [perTxLimit, setPerTxLimit] = useState('5');
  const [depositAmount, setDepositAmount] = useState('5');
  const [accountPda, setAccountPda] = useState('');
  const [usdcMint, setUsdcMint] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isFunding, setIsFunding] = useState(false);
  const [isAirdropping, setIsAirdropping] = useState(false);
  const [isFauceting, setIsFauceting] = useState(false);

  // Validate agent param
  const agentValid = (() => {
    if (!agentParam) return false;
    try {
      new PublicKey(agentParam);
      return true;
    } catch {
      return false;
    }
  })();

  // Fetch USDC mint from tokens endpoint
  useEffect(() => {
    api.get('/api/tokens').then((res) => {
      const tokens = res.data.data.tokens;
      const usdc = tokens.find((t: { symbol: string }) => t.symbol === 'USDC');
      if (usdc) setUsdcMint(usdc.mint);
    }).catch(() => {});
  }, []);

  // Auto-advance from connect to configure when wallet connects
  useEffect(() => {
    if (step === 'connect' && isConnected) {
      setStep('configure');
    }
  }, [step, isConnected]);

  if (!agentValid) {
    return <AgentAddressPrompt />;
  }

  const walletAddress = publicKey?.toBase58() ?? '';
  const limitNum = parseFloat(perTxLimit) || 0;
  const depositNum = parseFloat(depositAmount) || 0;

  const handleCreate = async () => {
    if (!walletAddress || !usdcMint || !agentParam) return;
    setIsCreating(true);
    try {
      const { transaction, accountPda: pda } = await createAccount({
        owner: walletAddress,
        mint: usdcMint,
        operator: agentParam,
        perTxLimit: limitNum * 1e6,
      });
      toast.info('Please approve the transaction in your wallet...');
      const txid = await signAndSubmit(transaction);
      toast.success(
        <span>Account created! TX: <a href={solscanUrl(txid, 'tx')} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-solar-gold">{txid.slice(0, 8)}...</a></span>,
      );
      setAccountPda(pda);
      setStep('fund');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create account';
      toast.error(message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleGetUsdc = async () => {
    if (!walletAddress) return;
    setIsFauceting(true);
    try {
      await requestFaucet(walletAddress, 'usdc');
      toast.success('Devnet USDC received!');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Faucet request failed';
      toast.error(message);
    } finally {
      setIsFauceting(false);
    }
  };

  const handleFund = async () => {
    if (!walletAddress || !accountPda) return;
    setIsFunding(true);
    try {
      const { transaction } = await depositToAccount({
        depositor: walletAddress,
        accountPda,
        amount: depositNum * 1e6,
      });
      toast.info('Please approve the transaction in your wallet...');
      const txid = await signAndSubmit(transaction);
      toast.success(
        <span>Account funded! TX: <a href={solscanUrl(txid, 'tx')} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-solar-gold">{txid.slice(0, 8)}...</a></span>,
      );
      setStep('done');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fund account';
      toast.error(message);
    } finally {
      setIsFunding(false);
    }
  };

  const handleAirdropSol = async () => {
    if (!agentParam) return;
    setIsAirdropping(true);
    try {
      await requestFaucet(agentParam, 'sol');
      toast.success('SOL airdropped to agent!');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Airdrop failed';
      toast.error(message);
    } finally {
      setIsAirdropping(false);
    }
  };

  const stepLabels: Record<Step, string> = {
    connect: 'Connect & Learn',
    configure: 'Configure Policy',
    fund: 'Fund Account',
    done: 'Complete',
  };
  const stepNumber = { connect: 1, configure: 2, fund: 3, done: 4 }[step];

  return (
    <div className="mx-auto max-w-xl px-8 py-10">
      <div className="mb-8">
        <div className="text-[0.65rem] uppercase tracking-[0.3em] text-nebula-purple/60">
          Step {stepNumber} of 4 — {stepLabels[step]}
        </div>
        <h1 className="font-display text-3xl font-black uppercase tracking-wide text-star-white">
          Account Setup
        </h1>
        <p className="mt-1 text-[0.85rem] italic text-star-white/40">
          Set up a Silkyway account for your agent.
        </p>
      </div>

      <div
        className="gradient-border-top border border-nebula-purple/20 p-6"
        style={{ background: 'linear-gradient(180deg, rgba(168, 85, 247, 0.04) 0%, rgba(12, 0, 21, 0.8) 100%)' }}
      >
        {/* Step 1: Connect & Learn */}
        {step === 'connect' && (
          <div className="space-y-5">
            <h2 className="mb-5 text-[0.85rem] font-medium uppercase tracking-[0.2em] text-solar-gold">
              Connect &amp; Learn
            </h2>
            <div className="border-l-2 border-nebula-purple bg-nebula-purple/[0.04] p-4 space-y-2">
              <p className="text-[0.8rem] font-medium text-nebula-purple">How it works</p>
              <p className="text-[0.75rem] text-star-white/40">You&apos;re creating an on-chain account controlled by your wallet.</p>
              <p className="text-[0.75rem] text-star-white/40">You&apos;re the owner — full access, always.</p>
              <p className="text-[0.75rem] text-star-white/40">Your agent becomes an operator with spending limits you define.</p>
            </div>
            <div className="space-y-1.5">
              <div className="text-[0.7rem] uppercase tracking-[0.15em] text-star-white/50">Agent Address</div>
              <div className="border border-nebula-purple/15 bg-deep-space/80 px-3 py-2.5">
                <p className="text-[0.75rem] text-star-white/50">{truncate(agentParam!)}</p>
              </div>
            </div>
            <p className="text-[0.8rem] text-star-white/40">
              Connect your wallet using the button in the header to continue.
            </p>
          </div>
        )}

        {/* Step 2: Configure & Create */}
        {step === 'configure' && (
          <div className="space-y-5">
            <h2 className="mb-5 text-[0.85rem] font-medium uppercase tracking-[0.2em] text-solar-gold">
              Configure Policy
            </h2>

            <div className="space-y-1.5">
              <div className="text-[0.7rem] uppercase tracking-[0.15em] text-star-white/50">Owner</div>
              <div className="border border-nebula-purple/15 bg-deep-space/80 px-3 py-2.5">
                <p className="text-[0.75rem] text-star-white/50">{walletAddress}</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="text-[0.7rem] uppercase tracking-[0.15em] text-star-white/50">Operator (Agent)</div>
              <div className="border border-nebula-purple/15 bg-deep-space/80 px-3 py-2.5">
                <p className="text-[0.75rem] text-star-white/50">{agentParam}</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="perTxLimit" className="block text-[0.7rem] uppercase tracking-[0.15em] text-star-white/50">
                Per-transaction limit
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[0.8rem] text-star-white/30">$</span>
                <input
                  id="perTxLimit"
                  type="number"
                  step="any"
                  min="0"
                  value={perTxLimit}
                  onChange={(e) => setPerTxLimit(e.target.value)}
                  className="w-full border border-nebula-purple/20 bg-deep-space/80 py-2.5 pl-7 pr-3 text-[0.8rem] text-star-white placeholder:text-star-white/15 transition-colors focus:border-solar-gold/30 focus:outline-none"
                />
              </div>
            </div>

            <div className="border-l-2 border-nebula-purple bg-nebula-purple/[0.04] p-4">
              <p className="text-[0.75rem] text-star-white/40">
                Your operator can never spend more than this in a single transaction. You (owner) can transfer any amount.
              </p>
            </div>

            <button
              onClick={handleCreate}
              disabled={isCreating || !usdcMint || limitNum <= 0}
              className="h-10 w-full border border-solar-gold/30 bg-solar-gold/10 text-[0.8rem] font-medium uppercase tracking-[0.15em] text-solar-gold transition-all hover:border-solar-gold/50 hover:bg-solar-gold/18 hover:shadow-[0_0_20px_rgba(251,191,36,0.15)] disabled:opacity-30 disabled:hover:shadow-none"
            >
              {isCreating ? 'Creating...' : 'Create Account'}
            </button>
          </div>
        )}

        {/* Step 3: Fund Account */}
        {step === 'fund' && (
          <div className="space-y-5">
            <h2 className="mb-5 text-[0.85rem] font-medium uppercase tracking-[0.2em] text-solar-gold">
              Fund Account
            </h2>

            <div className="space-y-1.5">
              <div className="text-[0.7rem] uppercase tracking-[0.15em] text-star-white/50">Account PDA</div>
              <div className="border border-nebula-purple/15 bg-deep-space/80 px-3 py-2.5">
                <p className="text-[0.75rem] text-star-white/50">{accountPda}</p>
              </div>
            </div>

            {cluster === 'devnet' && (
              <button
                onClick={handleGetUsdc}
                disabled={isFauceting}
                className="h-10 w-full border border-nebula-purple/30 bg-nebula-purple/10 text-[0.8rem] font-medium uppercase tracking-[0.15em] text-nebula-purple transition-all hover:border-nebula-purple/50 hover:bg-nebula-purple/18 disabled:opacity-30"
              >
                {isFauceting ? 'Requesting...' : 'Get Devnet USDC'}
              </button>
            )}

            <div className="space-y-1.5">
              <label htmlFor="depositAmount" className="block text-[0.7rem] uppercase tracking-[0.15em] text-star-white/50">
                Deposit amount
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[0.8rem] text-star-white/30">$</span>
                <input
                  id="depositAmount"
                  type="number"
                  step="any"
                  min="0"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="w-full border border-nebula-purple/20 bg-deep-space/80 py-2.5 pl-7 pr-3 text-[0.8rem] text-star-white placeholder:text-star-white/15 transition-colors focus:border-solar-gold/30 focus:outline-none"
                />
              </div>
            </div>

            {cluster !== 'devnet' && (
              <div className="border-l-2 border-nebula-purple bg-nebula-purple/[0.04] p-4">
                <p className="text-[0.75rem] text-star-white/40">
                  Deposit USDC from your connected wallet.
                </p>
              </div>
            )}

            <button
              onClick={handleFund}
              disabled={isFunding || depositNum <= 0}
              className="h-10 w-full border border-solar-gold/30 bg-solar-gold/10 text-[0.8rem] font-medium uppercase tracking-[0.15em] text-solar-gold transition-all hover:border-solar-gold/50 hover:bg-solar-gold/18 hover:shadow-[0_0_20px_rgba(251,191,36,0.15)] disabled:opacity-30 disabled:hover:shadow-none"
            >
              {isFunding ? 'Funding...' : 'Fund Account'}
            </button>

            {cluster === 'devnet' && (
              <button
                onClick={handleAirdropSol}
                disabled={isAirdropping}
                className="h-10 w-full border border-nebula-purple/30 bg-nebula-purple/10 text-[0.8rem] font-medium uppercase tracking-[0.15em] text-nebula-purple transition-all hover:border-nebula-purple/50 hover:bg-nebula-purple/18 disabled:opacity-30"
              >
                {isAirdropping ? 'Airdropping...' : 'Airdrop SOL to Agent'}
              </button>
            )}
          </div>
        )}

        {/* Step 4: Done */}
        {step === 'done' && (
          <div className="space-y-5">
            <h2 className="mb-5 text-[0.85rem] font-medium uppercase tracking-[0.2em] text-solar-gold">
              Account Created & Funded
            </h2>

            <div className="space-y-3">
              <div className="flex justify-between text-[0.8rem]">
                <span className="text-star-white/50">Account</span>
                <SolscanLink address={accountPda} type="account" />
              </div>
              <div className="flex justify-between text-[0.8rem]">
                <span className="text-star-white/50">Owner</span>
                <SolscanLink address={walletAddress} type="account" />
              </div>
              <div className="flex justify-between text-[0.8rem]">
                <span className="text-star-white/50">Operator</span>
                <SolscanLink address={agentParam!} type="account" />
              </div>
              <div className="flex justify-between text-[0.8rem]">
                <span className="text-star-white/50">Balance</span>
                <span className="text-star-white/70">${depositNum.toFixed(2)} USDC</span>
              </div>
              <div className="flex justify-between text-[0.8rem]">
                <span className="text-star-white/50">Policy</span>
                <span className="text-star-white/70">max ${limitNum.toFixed(2)} per transaction</span>
              </div>
              <div className="flex justify-between text-[0.8rem]">
                <span className="text-star-white/50">Network</span>
                <span className="text-star-white/70">{cluster === 'mainnet-beta' ? 'Mainnet' : 'Devnet'}</span>
              </div>
            </div>

            <div className="border-l-2 border-solar-gold bg-solar-gold/[0.04] p-4">
              <p className="mb-3 text-[0.85rem] font-medium text-solar-gold">Next steps — tell your agent:</p>
              <div className="space-y-2 font-mono text-[0.75rem] text-star-white/60">
                <p>1. Run: <span className="text-star-white">silk account sync</span></p>
                <p>2. Then try: <span className="text-star-white">&quot;Send ${(limitNum * 2).toFixed(0)} to {walletAddress}&quot;</span></p>
                <p className="text-star-white/30 italic">&nbsp;&nbsp;&nbsp;(Watch what happens.)</p>
              </div>
            </div>

            <Link
              href="/account"
              className="mt-2 flex h-10 w-full items-center justify-center border border-solar-gold/30 bg-solar-gold/10 text-[0.8rem] font-medium uppercase tracking-[0.15em] text-solar-gold transition-all hover:border-solar-gold/50 hover:bg-solar-gold/18 hover:shadow-[0_0_20px_rgba(251,191,36,0.15)]"
            >
              Go to Account →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function AgentAddressPrompt() {
  const router = useRouter();
  const [key, setKey] = useState('');
  const [error, setError] = useState('');

  const handleContinue = () => {
    setError('');
    try {
      new PublicKey(key.trim());
      router.replace(`/account/setup?agent=${key.trim()}`);
    } catch {
      setError('Invalid Solana public key. Please check and try again.');
    }
  };

  return (
    <div className="mx-auto max-w-xl px-8 py-10">
      <div className="mb-8">
        <div className="text-[0.65rem] uppercase tracking-[0.3em] text-nebula-purple/60">
          Account Setup
        </div>
        <h1 className="font-display text-3xl font-black uppercase tracking-wide text-star-white">
          Enter Agent Address
        </h1>
      </div>

      <div
        className="gradient-border-top border border-nebula-purple/20 p-6"
        style={{ background: 'linear-gradient(180deg, rgba(168, 85, 247, 0.04) 0%, rgba(12, 0, 21, 0.8) 100%)' }}
      >
        <div className="mb-5 border-l-2 border-nebula-purple bg-nebula-purple/[0.04] p-4">
          <p className="text-[0.8rem] font-medium text-nebula-purple">What is an agent address?</p>
          <p className="mt-1 text-[0.75rem] text-star-white/40">
            It is the Solana public key of the AI agent (operator) you want to authorize to make payments from your account.
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="agentKey" className="block text-[0.7rem] uppercase tracking-[0.15em] text-star-white/50">
              Agent public key
            </label>
            <input
              id="agentKey"
              type="text"
              value={key}
              onChange={(e) => { setKey(e.target.value); setError(''); }}
              placeholder="e.g. 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
              className="w-full border border-nebula-purple/20 bg-deep-space/80 px-3 py-2.5 text-[0.8rem] text-star-white placeholder:text-star-white/15 transition-colors focus:border-solar-gold/30 focus:outline-none"
            />
            {error && (
              <p className="text-[0.75rem] text-red-400">{error}</p>
            )}
          </div>

          <button
            onClick={handleContinue}
            disabled={!key.trim()}
            className="h-10 w-full border border-solar-gold/30 bg-solar-gold/10 text-[0.8rem] font-medium uppercase tracking-[0.15em] text-solar-gold transition-all hover:border-solar-gold/50 hover:bg-solar-gold/18 hover:shadow-[0_0_20px_rgba(251,191,36,0.15)] disabled:opacity-30 disabled:hover:shadow-none"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
