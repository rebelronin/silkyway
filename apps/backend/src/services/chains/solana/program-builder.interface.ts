import type { ActionIntent } from '@silkysquad/silk';
import type { Connection, PublicKey, TransactionInstruction } from '@solana/web3.js';

export interface SolanaBuildContext {
  connection: Connection;
  feePayer: PublicKey;
  chain: string;
  network: string;
}

export interface ProgramBuilder {
  readonly programName: string;
  readonly supportedActions: string[];
  build(action: ActionIntent, context: SolanaBuildContext): Promise<TransactionInstruction[]>;
}
