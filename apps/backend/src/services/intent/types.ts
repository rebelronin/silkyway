import type { IntentV2 as Intent, ActionIntent, TransactionAnalysis, RiskFlag } from '@silkysquad/silk';

export type Verdict = 'proceed' | 'caution' | 'reject';

export type MatchLevel = 'full' | 'partial' | 'none';

export interface MatchDimension {
  level: MatchLevel;
  discrepancies: string[];
}

export type RiskLevel = 'low' | 'medium' | 'high';

export interface RiskDimension {
  level: RiskLevel;
  flags: RiskFlag[];
}

export type ViabilityLevel = 'viable' | 'uncertain' | 'unviable';

export interface ViabilityDimension {
  level: ViabilityLevel;
  issues: string[];
}

export interface AnalyzeResult {
  verdict: Verdict;
  match: MatchDimension;
  risk: RiskDimension;
  viability: ViabilityDimension;
  raw: TransactionAnalysis;
}

export interface BuildMetadata {
  chain: string;
  network: string;
  program?: string;
  programName?: string;
  estimatedFee?: string;
}

export interface BuildResult {
  transaction: string;
  intent: Intent;
  metadata: BuildMetadata;
  analysis?: AnalyzeResult;
}

export function deriveVerdict(
  match: MatchDimension,
  risk: RiskDimension,
  viability: ViabilityDimension,
): Verdict {
  if (match.level === 'none' || risk.level === 'high' || viability.level === 'unviable') {
    return 'reject';
  }

  if (match.level === 'partial' || risk.level === 'medium' || viability.level === 'uncertain') {
    return 'caution';
  }

  return 'proceed';
}

export type { Intent, ActionIntent };
