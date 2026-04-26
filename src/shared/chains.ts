export const KNOWN_CHAINS: Record<number, string> = {
  1: 'Ethereum',
  10: 'Optimism',
  56: 'BNB Chain',
  100: 'Gnosis',
  137: 'Polygon',
  250: 'Fantom',
  324: 'zkSync Era',
  5000: 'Mantle',
  8453: 'Base',
  42161: 'Arbitrum',
  43114: 'Avalanche',
  59144: 'Linea',
  81457: 'Blast',
  534352: 'Scroll'
}

const ALIASES: Record<string, number> = {
  eth: 1,
  ethereum: 1,
  mainnet: 1,
  op: 10,
  optimism: 10,
  bnb: 56,
  bsc: 56,
  'bnb chain': 56,
  'bnb smart chain': 56,
  matic: 137,
  polygon: 137,
  arb: 42161,
  arbitrum: 42161,
  'arbitrum one': 42161,
  base: 8453,
  avax: 43114,
  avalanche: 43114,
  linea: 59144,
  blast: 81457,
  scroll: 534352,
  zksync: 324,
  'zksync era': 324,
  fantom: 250,
  ftm: 250,
  gnosis: 100,
  mantle: 5000
}

export function chainName(chainId: number): string {
  return KNOWN_CHAINS[chainId] ?? `Chain ${chainId}`
}

export function chainIdByName(name: string): number | undefined {
  const n = name.trim().toLowerCase()
  if (!n) return undefined
  for (const [id, known] of Object.entries(KNOWN_CHAINS)) {
    if (known.toLowerCase() === n) return Number(id)
  }
  return ALIASES[n]
}
