import { Injectable } from '@nestjs/common';
import { parseChain, type IntentV2 as Intent } from '@silkysquad/silk';
import type { BuildResult } from './types';
import type { BuildOpts, ChainBuilder } from '../chains/chain.interface';
import { SolanaBuilder } from '../chains/solana/solana.builder';

@Injectable()
export class IntentBuildService {
  private readonly builders = new Map<string, ChainBuilder>();

  constructor(solanaBuilder: SolanaBuilder) {
    this.builders.set('solana', solanaBuilder);
  }

  async build(intent: Intent, opts?: BuildOpts): Promise<BuildResult> {
    const { chain } = parseChain(intent.chain);
    const builder = this.builders.get(chain);

    if (!builder) {
      throw new Error(`No build engine available for chain '${chain}'`);
    }

    return builder.build(intent, opts);
  }
}
