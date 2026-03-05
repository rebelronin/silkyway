import { Injectable } from '@nestjs/common';
import {
  analyzeTransaction,
  createTokenRegistry,
  parseChain,
  verifyIntentV2,
  type ActionIntent,
  type IntentV2 as Intent,
  type RiskFlag,
  type TransactionAnalysis,
} from '@silkysquad/silk';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, getMint, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { SolanaService } from '../../../solana/solana.service';
import type { ChainAnalyzer, AnalyzeOpts } from '../chain.interface';
import type {
  AnalyzeResult,
  MatchDimension,
  RiskDimension,
  ViabilityDimension,
} from '../../intent/types';
import { deriveVerdict } from '../../intent/types';
import { requireExactAmount, toBaseUnits } from './amount';
import { crossCheckProgram, resolveProgramName } from './program-registry';

type ProgramRef = {
  program?: string;
  programName?: string;
};

type IntentWithProgram = Intent & ProgramRef;

interface NativeTransferCheck {
  matched: boolean;
  discrepancies: string[];
}

@Injectable()
export class SolanaAnalyzer implements ChainAnalyzer {
  readonly chain = 'solana';

  constructor(private readonly solanaService: SolanaService) {}

  async analyze(tx: string, intent: Intent, opts?: AnalyzeOpts): Promise<AnalyzeResult> {
    const { chain, network } = parseChain(intent.chain);
    if (chain !== 'solana') {
      throw new Error(`SolanaAnalyzer only handles solana intents, got '${chain}'`);
    }

    const connection = this.solanaService.getConnection();
    const raw = await analyzeTransaction(tx, { connection });
    const verifyResult = await verifyIntentV2(tx, intent, { connection });

    const discrepancies = [...verifyResult.discrepancies];

    this.applyProgramChecks(intent as IntentWithProgram, raw, chain, network, discrepancies);

    const nativeFallback = await this.checkNativeTransferFallback(intent as IntentWithProgram, raw, chain, network);
    if (!verifyResult.matched && nativeFallback.discrepancies.length > 0) {
      discrepancies.push(...nativeFallback.discrepancies);
    }

    const matched = (verifyResult.matched || nativeFallback.matched) && discrepancies.length === 0;
    const match: MatchDimension = {
      level: matched ? 'full' : this.inferMatchLevel(intent as IntentWithProgram, raw, verifyResult.matched || nativeFallback.matched),
      discrepancies,
    };

    const risk = this.assessRisk(raw.flags);
    const viability = opts?.checkViability === false
      ? { level: 'viable' as const, issues: [] }
      : await this.checkViability(intent as IntentWithProgram, chain, network);

    return {
      verdict: deriveVerdict(match, risk, viability),
      match,
      risk,
      viability,
      raw,
    };
  }

  private applyProgramChecks(
    intent: IntentWithProgram,
    raw: TransactionAnalysis,
    chain: string,
    network: string,
    discrepancies: string[],
  ): void {
    const ref = this.extractProgramRef(intent);
    if (!ref.program && !ref.programName) {
      return;
    }

    if (ref.program && ref.programName) {
      const valid = crossCheckProgram(chain, network, ref.programName, ref.program);
      if (!valid) {
        discrepancies.push(
          `Program mismatch: '${ref.programName}' does not match '${ref.program}' on ${chain}:${network}`,
        );
        return;
      }
    }

    if (ref.programName === 'native' && !ref.program) {
      const hasNativeInstruction = raw.instructions.some(
        (ix) => ix.programId === SystemProgram.programId.toBase58() || ix.programId === TOKEN_PROGRAM_ID.toBase58(),
      );
      if (!hasNativeInstruction) {
        discrepancies.push('Expected a native Solana transfer instruction, but none was found');
      }
      return;
    }

    const expectedProgram = ref.program
      ?? (ref.programName ? resolveProgramName(chain, network, ref.programName)?.address : undefined);

    if (!expectedProgram) {
      discrepancies.push(`Unknown programName '${ref.programName}' on ${chain}:${network}`);
      return;
    }

    const hasInstructionFromProgram = raw.instructions.some((ix) => ix.programId === expectedProgram);
    if (!hasInstructionFromProgram) {
      discrepancies.push(
        `Expected a call to program '${expectedProgram}' but transaction uses: ${[...new Set(raw.instructions.map((ix) => ix.programId))].join(', ')}`,
      );
    }
  }

  private inferMatchLevel(intent: IntentWithProgram, raw: TransactionAnalysis, hadMatchSignal: boolean): MatchDimension['level'] {
    if (hadMatchSignal) {
      return 'partial';
    }

    if ('action' in intent) {
      const expectedAction = intent.action;
      const hasRelated = raw.instructions.some((ix) => this.matchesAction(expectedAction, ix.type));
      return hasRelated ? 'partial' : 'none';
    }

    return 'none';
  }

  private matchesAction(action: string, ixType: string | null): boolean {
    if (!ixType) {
      return false;
    }

    if (ixType === action) {
      return true;
    }

    if (action === 'transfer' && (ixType === 'create_transfer' || ixType === 'transfer_checked')) {
      return true;
    }

    return false;
  }

  private assessRisk(flags: RiskFlag[]): RiskDimension {
    const hasError = flags.some((flag) => flag.severity === 'error');
    const hasWarning = flags.some((flag) => flag.severity === 'warning');

    return {
      level: hasError ? 'high' : hasWarning ? 'medium' : 'low',
      flags,
    };
  }

  private async checkViability(
    intent: IntentWithProgram,
    chain: string,
    network: string,
  ): Promise<ViabilityDimension> {
    if (!('action' in intent) || intent.action !== 'transfer') {
      return { level: 'viable', issues: [] };
    }

    const issues: string[] = [];
    const connection = this.solanaService.getConnection();

    const from = intent.from;
    try {
      new PublicKey(from);
    } catch {
      return { level: 'unviable', issues: [`Invalid sender public key '${from}'`] };
    }

    const fromKey = new PublicKey(from);
    const exactAmount = (() => {
      try {
        return requireExactAmount(intent.amount);
      } catch (err) {
        issues.push((err as Error).message);
        return null;
      }
    })();

    if (!intent.token && (!intent.tokenSymbol || intent.tokenSymbol.toUpperCase() === 'SOL')) {
      try {
        const balance = await connection.getBalance(fromKey, 'confirmed');
        if (exactAmount) {
          const requiredLamports = toBaseUnits(exactAmount, 9) + 5000n;
          if (BigInt(balance) < requiredLamports) {
            issues.push(
              `Insufficient SOL balance: need ${(Number(requiredLamports) / 1e9).toFixed(9)} SOL (including fee buffer), have ${(balance / 1e9).toFixed(9)} SOL`,
            );
          }
        }
      } catch {
        issues.push('Could not verify SOL balance via RPC');
      }

      return this.viabilityFromIssues(issues);
    }

    const mint = this.resolveMintAddress(intent, chain, network, issues);
    if (!mint || !exactAmount) {
      return this.viabilityFromIssues(issues);
    }

    try {
      const mintKey = new PublicKey(mint);
      const mintInfo = await getMint(connection, mintKey);
      const requiredRaw = toBaseUnits(exactAmount, mintInfo.decimals);

      const sourceAta = getAssociatedTokenAddressSync(mintKey, fromKey, true);
      const tokenBalance = await connection.getTokenAccountBalance(sourceAta, 'confirmed');
      const availableRaw = BigInt(tokenBalance.value.amount);
      if (availableRaw < requiredRaw) {
        issues.push(
          `Insufficient token balance: need ${requiredRaw.toString()} raw units, have ${availableRaw.toString()} raw units`,
        );
      }
    } catch {
      issues.push('Could not verify token balance; source token account may not exist');
    }

    return this.viabilityFromIssues(issues);
  }

  private resolveMintAddress(
    intent: IntentWithProgram & ActionIntent,
    chain: string,
    network: string,
    issues: string[],
  ): string | null {
    if (intent.token) {
      return intent.token;
    }

    if (!intent.tokenSymbol) {
      issues.push('Token transfer intent is missing token/tokenSymbol');
      return null;
    }

    const registry = createTokenRegistry();
    const resolved = registry.resolveSymbol(chain, network, intent.tokenSymbol.toUpperCase());
    if (!resolved) {
      issues.push(`Could not resolve token symbol '${intent.tokenSymbol}' on ${chain}:${network}`);
      return null;
    }

    return resolved.address;
  }

  private viabilityFromIssues(issues: string[]): ViabilityDimension {
    if (issues.some((issue) => issue.startsWith('Insufficient') || issue.startsWith('Invalid'))) {
      return { level: 'unviable', issues };
    }

    if (issues.length > 0) {
      return { level: 'uncertain', issues };
    }

    return { level: 'viable', issues: [] };
  }

  private async checkNativeTransferFallback(
    intent: IntentWithProgram,
    raw: TransactionAnalysis,
    chain: string,
    network: string,
  ): Promise<NativeTransferCheck> {
    if (!('action' in intent) || intent.action !== 'transfer') {
      return { matched: false, discrepancies: [] };
    }

    const ref = this.extractProgramRef(intent);
    if (ref.programName && ref.programName !== 'native') {
      return { matched: false, discrepancies: [] };
    }

    const exactAmount = (() => {
      try {
        return requireExactAmount(intent.amount);
      } catch (err) {
        return { error: (err as Error).message };
      }
    })();

    if (typeof exactAmount !== 'string') {
      return { matched: false, discrepancies: [exactAmount.error] };
    }

    const transferIxs = raw.instructions.filter((ix) => ix.type === 'transfer' || ix.type === 'transfer_checked');
    if (transferIxs.length === 0) {
      return { matched: false, discrepancies: [] };
    }

    for (const ix of transferIxs) {
      if (ix.programId === SystemProgram.programId.toBase58()) {
        const from = ix.params['from'];
        const to = ix.params['to'];
        const lamports = ix.params['lamports'];
        if (from === intent.from && to === intent.to && lamports === toBaseUnits(exactAmount, 9).toString()) {
          return { matched: true, discrepancies: [] };
        }
        continue;
      }

      if (ix.programId === TOKEN_PROGRAM_ID.toBase58()) {
        const authority = ix.params['authority'];
        if (authority !== intent.from) {
          continue;
        }

        const mintAddress = this.resolveMintAddress(intent as IntentWithProgram & ActionIntent, chain, network, []);
        if (!mintAddress) {
          return { matched: false, discrepancies: ['Unable to verify SPL transfer target token mint'] };
        }

        const mint = new PublicKey(mintAddress);
        const mintInfo = await getMint(this.solanaService.getConnection(), mint);
        const requiredRaw = toBaseUnits(exactAmount, mintInfo.decimals).toString();

        const destination = ix.params['destination'];
        const expectedDestination = getAssociatedTokenAddressSync(mint, new PublicKey(intent.to), true).toBase58();
        const amount = ix.params['amount'];

        if (destination === expectedDestination && amount === requiredRaw) {
          return { matched: true, discrepancies: [] };
        }
      }
    }

    return {
      matched: false,
      discrepancies: ['Transaction transfer instruction did not match expected sender/recipient/amount for native transfer'],
    };
  }

  private extractProgramRef(intent: IntentWithProgram): ProgramRef {
    return {
      program: intent.program,
      programName: intent.programName,
    };
  }
}
