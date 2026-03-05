import { isEvmChain } from '@silkysquad/silk';

export interface ProgramInfo {
  address: string;
  name: string;
}

type ProgramEntry = { address: string };

const SOLANA_PROGRAMS: Record<string, Record<string, ProgramEntry>> = {
  mainnet: {
    handshake: { address: 'HANDu9uNdnraNbcueGfXhd3UPu6BXfQroKAsSxFhPXEQ' },
    silkysig: { address: 'SiLKos3MCFggwLsjSeuRiCdcs2MLoJNwq59XwTvEwcS' },
    jupiter: { address: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4' },
  },
  devnet: {
    handshake: { address: 'HANDu9uNdnraNbcueGfXhd3UPu6BXfQroKAsSxFhPXEQ' },
    silkysig: { address: 'SiLKos3MCFggwLsjSeuRiCdcs2MLoJNwq59XwTvEwcS' },
  },
};

export function resolveProgramName(
  chain: string,
  network: string,
  name: string,
): ProgramInfo | null {
  if (chain !== 'solana') {
    return null;
  }

  const entry = SOLANA_PROGRAMS[network]?.[name];
  if (!entry) {
    return null;
  }

  return {
    name,
    address: entry.address,
  };
}

export function resolveProgramAddress(
  chain: string,
  network: string,
  address: string,
): ProgramInfo | null {
  if (chain !== 'solana') {
    return null;
  }

  const entries = SOLANA_PROGRAMS[network] ?? {};
  const normalizedAddress = isEvmChain(chain) ? address.toLowerCase() : address;

  for (const [name, entry] of Object.entries(entries)) {
    const normalizedEntry = isEvmChain(chain) ? entry.address.toLowerCase() : entry.address;
    if (normalizedEntry === normalizedAddress) {
      return { name, address: entry.address };
    }
  }

  return null;
}

export function crossCheckProgram(
  chain: string,
  network: string,
  name: string,
  address: string,
): boolean {
  const resolved = resolveProgramName(chain, network, name);
  if (!resolved) {
    return false;
  }

  const evm = isEvmChain(chain);
  const expected = evm ? resolved.address.toLowerCase() : resolved.address;
  const provided = evm ? address.toLowerCase() : address;
  return expected === provided;
}
