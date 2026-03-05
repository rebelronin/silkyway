export type AmountConstraint = string | { gte?: string; lte?: string; gt?: string; lt?: string };

export function requireExactAmount(amount: AmountConstraint): string {
  if (typeof amount !== 'string') {
    throw new Error('Amount constraints are not supported for build. Provide an exact amount string.');
  }

  const trimmed = amount.trim();
  if (!/^\d+(?:\.\d+)?$/.test(trimmed)) {
    throw new Error(`Invalid amount: '${amount}'. Expected a positive decimal string.`);
  }

  return trimmed;
}

export function toBaseUnits(amount: string, decimals: number): bigint {
  if (!/^\d+(?:\.\d+)?$/.test(amount)) {
    throw new Error(`Invalid decimal amount: '${amount}'`);
  }

  const [whole, frac = ''] = amount.split('.');
  if (frac.length > decimals) {
    throw new Error(`Amount '${amount}' exceeds token precision (${decimals} decimals)`);
  }

  const normalizedFrac = frac.padEnd(decimals, '0');
  const raw = `${whole}${normalizedFrac}`.replace(/^0+(?=\d)/, '');
  return BigInt(raw || '0');
}
