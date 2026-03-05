import { Injectable } from '@nestjs/common';
import { parseChain, type IntentV2 as Intent } from '@silkysquad/silk';
import type { AnalyzeResult } from './types';
import type { AnalyzeOpts, ChainAnalyzer } from '../chains/chain.interface';
import { SolanaAnalyzer } from '../chains/solana/solana.analyzer';

@Injectable()
export class IntentAnalyzeService {
  private readonly analyzers = new Map<string, ChainAnalyzer>();

  constructor(solanaAnalyzer: SolanaAnalyzer) {
    this.analyzers.set('solana', solanaAnalyzer);
  }

  async analyze(tx: string, intent: Intent, opts?: AnalyzeOpts): Promise<AnalyzeResult> {
    const { chain } = parseChain(intent.chain);
    const analyzer = this.analyzers.get(chain);

    if (!analyzer) {
      throw new Error(`No analyzer available for chain '${chain}'`);
    }

    return analyzer.analyze(tx, intent, opts);
  }
}
