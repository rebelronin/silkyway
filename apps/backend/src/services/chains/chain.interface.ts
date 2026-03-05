import type { IntentV2 as Intent } from '@silkysquad/silk';
import type { BuildResult, AnalyzeResult } from '../intent/types';

export interface BuildOpts {
  feePayer?: string;
}

export interface AnalyzeOpts {
  checkViability?: boolean;
}

export interface ChainBuilder {
  readonly chain: string;
  build(intent: Intent, opts?: BuildOpts): Promise<BuildResult>;
}

export interface ChainAnalyzer {
  readonly chain: string;
  analyze(tx: string, intent: Intent, opts?: AnalyzeOpts): Promise<AnalyzeResult>;
}
