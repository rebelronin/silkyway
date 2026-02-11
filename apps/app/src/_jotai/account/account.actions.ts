import { useCallback } from 'react';
import { VersionedTransaction } from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';
import { api } from '@/lib/api';

export function useAccountActions() {
  const { signTransaction } = useWallet();

  const createAccount = useCallback(
    async (params: { owner: string; mint: string; operator: string; perTxLimit: number }) => {
      const res = await api.post('/api/account/create', params);
      return res.data.data as { transaction: string; accountPda: string };
    },
    [],
  );

  const depositToAccount = useCallback(
    async (params: { depositor: string; accountPda: string; amount: number }) => {
      const res = await api.post('/api/account/deposit', params);
      return res.data.data as { transaction: string };
    },
    [],
  );

  const transferFromAccount = useCallback(
    async (params: { signer: string; accountPda: string; recipient: string; amount: number }) => {
      const res = await api.post('/api/account/transfer', params);
      return res.data.data as { transaction: string };
    },
    [],
  );

  const fetchAccount = useCallback(async (pda: string) => {
    const res = await api.get(`/api/account/${pda}`);
    return res.data.data;
  }, []);

  const signAndSubmit = useCallback(
    async (base64Tx: string): Promise<string> => {
      if (!signTransaction) throw new Error('Wallet does not support signing');
      const txBytes = Buffer.from(base64Tx, 'base64');
      const tx = VersionedTransaction.deserialize(txBytes);
      const signed = await signTransaction(tx);
      const signedBase64 = Buffer.from(signed.serialize()).toString('base64');
      const res = await api.post('/api/tx/submit', { signedTx: signedBase64 });
      return res.data.data.txid;
    },
    [signTransaction],
  );

  const togglePause = useCallback(
    async (params: { owner: string; accountPda: string }) => {
      const res = await api.post('/api/account/pause', params);
      return res.data.data as { transaction: string };
    },
    [],
  );

  const addOperator = useCallback(
    async (params: { owner: string; accountPda: string; operator: string; perTxLimit: number }) => {
      const res = await api.post('/api/account/add-operator', params);
      return res.data.data as { transaction: string };
    },
    [],
  );

  const removeOperator = useCallback(
    async (params: { owner: string; accountPda: string; operator: string }) => {
      const res = await api.post('/api/account/remove-operator', params);
      return res.data.data as { transaction: string };
    },
    [],
  );

  const closeAccount = useCallback(
    async (params: { owner: string; accountPda: string }) => {
      const res = await api.post('/api/account/close', params);
      return res.data.data as { transaction: string };
    },
    [],
  );

  return {
    createAccount,
    depositToAccount,
    transferFromAccount,
    fetchAccount,
    signAndSubmit,
    togglePause,
    addOperator,
    removeOperator,
    closeAccount,
  };
}
