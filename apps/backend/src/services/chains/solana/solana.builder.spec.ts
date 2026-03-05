import { Keypair, TransactionInstruction } from '@solana/web3.js';
import { SolanaBuilder } from './solana.builder';

describe('SolanaBuilder', () => {
  it('has chain set to solana', () => {
    const builder = new SolanaBuilder(
      { getConnection: jest.fn() } as any,
      { programName: 'native', supportedActions: ['transfer'], build: jest.fn() } as any,
      { programName: 'handshake', supportedActions: ['transfer'], build: jest.fn() } as any,
    );

    expect(builder.chain).toBe('solana');
  });

  it('rejects intents for non-solana chains', async () => {
    const builder = new SolanaBuilder(
      { getConnection: jest.fn() } as any,
      { programName: 'native', supportedActions: ['transfer'], build: jest.fn() } as any,
      { programName: 'handshake', supportedActions: ['transfer'], build: jest.fn() } as any,
    );

    await expect(
      builder.build({ chain: 'ethereum', action: 'transfer', from: 'x', to: 'y', amount: '1' } as any),
    ).rejects.toThrow('solana');
  });

  it('uses native builder by default', async () => {
    const from = Keypair.generate().publicKey;
    const nativeBuild = jest.fn().mockResolvedValue([
      new TransactionInstruction({
        programId: Keypair.generate().publicKey,
        keys: [],
        data: Buffer.alloc(0),
      }),
    ]);

    const builder = new SolanaBuilder(
      {
        getConnection: jest.fn().mockReturnValue({
          getLatestBlockhash: jest.fn().mockResolvedValue({
            blockhash: '11111111111111111111111111111111',
          }),
        }),
      } as any,
      { programName: 'native', supportedActions: ['transfer'], build: nativeBuild } as any,
      { programName: 'handshake', supportedActions: ['transfer'], build: jest.fn() } as any,
    );

    const result = await builder.build({
      chain: 'solana',
      action: 'transfer',
      from: from.toBase58(),
      to: Keypair.generate().publicKey.toBase58(),
      amount: '1',
    } as any);

    expect(nativeBuild).toHaveBeenCalled();
    expect(result.metadata.programName).toBe('native');
    expect(typeof result.transaction).toBe('string');
  });
});
