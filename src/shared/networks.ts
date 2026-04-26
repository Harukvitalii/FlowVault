/**
 * Exchanges use different codes for the same chain.
 * Binance: "BSC" / "BEP20", OKX: "BSC", Gate: "BSC"
 * Binance: "ARBITRUM" / "ARBONE", OKX: "Arbitrum One", Gate: "ARBEVM"
 *
 * We map any exchange code to a small canonical family key so two codes
 * on different exchanges can be compared.
 *
 * Returns the ORIGINAL code uppercased if the family is unknown — never
 * merges unknown codes silently.
 */

type Family = string

const ALIASES: Record<string, Family> = {
  // === Generic EVM (matches all EVM chains) ===
  EVM: 'EVM',

  // === EVM chains ===
  // Ethereum
  ETH: 'ETH',
  ERC20: 'ETH',
  ETHEREUM: 'ETH',
  ETHMAINNET: 'ETH',

  // BNB Smart Chain
  BSC: 'BSC',
  BEP20: 'BSC',
  BNB: 'BSC',
  BNBSMARTCHAIN: 'BSC',
  BSCBEP20: 'BSC',

  // Arbitrum One
  ARB: 'ARB',
  ARBITRUM: 'ARB',
  ARBEVM: 'ARB',
  ARBITRUMONE: 'ARB',
  ARBONE: 'ARB',

  // Optimism
  OP: 'OP',
  OPTIMISM: 'OP',
  OPETH: 'OP',
  OPMAINNET: 'OP',

  // Base
  BASE: 'BASE',
  BASEETH: 'BASE',
  BASEEVM: 'BASE',
  BASEMAINNET: 'BASE',

  // Polygon
  MATIC: 'MATIC',
  POLYGON: 'MATIC',
  MATICEVM: 'MATIC',
  POLYGONPOS: 'MATIC',

  // Avalanche C-Chain (EVM). X-Chain and P-Chain are separate (non-EVM).
  AVAX: 'AVAX',
  AVAXC: 'AVAX',
  AVALANCHE: 'AVAX',
  AVALANCHECCHAIN: 'AVAX',
  CAVAX: 'AVAX',

  // zkSync Era
  ZKSYNC: 'ZKSYNC',
  ZKSYNCERA: 'ZKSYNC',
  ZKEVM: 'ZKSYNC',

  // Other EVM L2s / L1s
  LINEA: 'LINEA',
  BLAST: 'BLAST',
  MANTLE: 'MANTLE',
  SCROLL: 'SCROLL',
  OPBNB: 'OPBNB',
  CELO: 'CELO',
  RON: 'RON',
  RONIN: 'RON',
  SEI: 'SEI',
  SEIEVM: 'SEI',
  SONIC: 'SONIC',
  WLD: 'WORLD',
  WORLD: 'WORLD',
  WORLDCHAIN: 'WORLD',
  KAIA: 'KAIA',
  KLAY: 'KAIA',
  KLAYTN: 'KAIA',
  KAVAEVM: 'KAVA',
  KAVA: 'KAVA',
  METIS: 'METIS',
  CORE: 'CORE',
  BERA: 'BERA',
  BERACHAIN: 'BERA',
  MANTA: 'MANTA',
  ZETAEVM: 'ZETA',
  ZETA: 'ZETA',
  CFX: 'CFX',
  CONFLUX: 'CFX',

  // Fantom (pre-merge)
  FTM: 'FTM',
  FANTOM: 'FTM',

  // === Non-EVM chains ===
  TRX: 'TRX',
  TRC20: 'TRX',
  TRON: 'TRX',

  SOL: 'SOL',
  SOLANA: 'SOL',

  BTC: 'BTC',
  BITCOIN: 'BTC',
  BTCSEGWIT: 'BTC',

  TON: 'TON',
  TONCOIN: 'TON',

  XRP: 'XRP',
  XRPL: 'XRP',
  RIPPLE: 'XRP',

  SUI: 'SUI',
  APT: 'APT',
  APTOS: 'APT',

  ALGO: 'ALGO',
  ALGORAND: 'ALGO',

  NEAR: 'NEAR',

  ADA: 'ADA',
  CARDANO: 'ADA',

  LTC: 'LTC',
  LITECOIN: 'LTC',

  XLM: 'XLM',
  STELLAR: 'XLM',

  HBAR: 'HBAR',
  HEDERA: 'HBAR',

  STATEMINT: 'DOT',
  DOT: 'DOT',
  POLKADOT: 'DOT',

  ATOM: 'ATOM',
  COSMOS: 'ATOM',

  KAS: 'KAS',
  KASPA: 'KAS',

  DOGE: 'DOGE',
  DOGECOIN: 'DOGE',

  BCH: 'BCH',
  BITCOINCASH: 'BCH',

  EOS: 'EOS',
  ICP: 'ICP',
  FIL: 'FIL',
  FILECOIN: 'FIL',
  ZIL: 'ZIL',
  XTZ: 'XTZ',
  TEZOS: 'XTZ',
  DASH: 'DASH',
  WAVES: 'WAVES',
  XMR: 'XMR',
  MONERO: 'XMR',
  NEO: 'NEO',
  XEM: 'XEM',
  IOTA: 'IOTA',
  VET: 'VET'
}

/** Chain families whose address format is EVM 0x... and can be sent to an EVM wallet. */
const EVM_FAMILIES = new Set<Family>([
  'EVM',
  'ETH',
  'BSC',
  'ARB',
  'OP',
  'BASE',
  'MATIC',
  'AVAX',
  'ZKSYNC',
  'LINEA',
  'BLAST',
  'MANTLE',
  'SCROLL',
  'OPBNB',
  'FTM',
  'CELO',
  'RON',
  'SEI',
  'SONIC',
  'WORLD',
  'KAIA',
  'KAVA',
  'METIS',
  'CORE',
  'BERA',
  'MANTA',
  'ZETA',
  'CFX'
])

function stripNonAlnum(s: string): string {
  return s.toUpperCase().replace(/[\s_\-.]/g, '')
}

export function networkFamily(code: string): Family {
  if (!code) return ''
  return ALIASES[stripNonAlnum(code)] ?? code.toUpperCase()
}

/**
 * True if two exchange-specific network codes resolve to the same family.
 */
export function sameNetworkFamily(a: string, b: string): boolean {
  if (!a || !b) return false
  return networkFamily(a) === networkFamily(b)
}

/** True if the family is EVM-compatible (address format 0x... + 40 hex). */
export function isEvmFamily(family: string): boolean {
  return EVM_FAMILIES.has(family)
}

/** True if the exchange network code resolves to an EVM-compatible chain. */
export function isEvmNetwork(code: string): boolean {
  return isEvmFamily(networkFamily(code))
}

const FAMILY_LABELS: Record<Family, string> = {
  EVM: 'EVM (any)',
  ETH: 'Ethereum',
  BSC: 'BNB Chain',
  TRX: 'Tron',
  ARB: 'Arbitrum',
  OP: 'Optimism',
  BASE: 'Base',
  MATIC: 'Polygon',
  AVAX: 'Avalanche',
  SOL: 'Solana',
  BTC: 'Bitcoin',
  ZKSYNC: 'zkSync Era',
  LINEA: 'Linea',
  BLAST: 'Blast',
  MANTLE: 'Mantle',
  SCROLL: 'Scroll',
  OPBNB: 'opBNB',
  TON: 'TON',
  XRP: 'XRP',
  SUI: 'Sui',
  APT: 'Aptos',
  ALGO: 'Algorand',
  NEAR: 'NEAR',
  ADA: 'Cardano',
  LTC: 'Litecoin',
  FTM: 'Fantom',
  CELO: 'Celo',
  RON: 'Ronin',
  SEI: 'Sei',
  SONIC: 'Sonic',
  WORLD: 'World Chain',
  KAIA: 'Kaia',
  KAVA: 'Kava',
  METIS: 'Metis',
  CORE: 'Core',
  BERA: 'Berachain',
  MANTA: 'Manta',
  ZETA: 'ZetaChain',
  CFX: 'Conflux',
  XLM: 'Stellar',
  HBAR: 'Hedera',
  DOT: 'Polkadot',
  ATOM: 'Cosmos',
  KAS: 'Kaspa',
  DOGE: 'Dogecoin',
  BCH: 'Bitcoin Cash',
  EOS: 'EOS',
  ICP: 'Internet Computer',
  FIL: 'Filecoin',
  ZIL: 'Zilliqa',
  XTZ: 'Tezos',
  DASH: 'Dash',
  WAVES: 'Waves',
  XMR: 'Monero',
  NEO: 'NEO',
  XEM: 'NEM',
  IOTA: 'IOTA',
  VET: 'VeChain'
}

export function familyLabel(family: Family): string {
  return FAMILY_LABELS[family] ?? family
}
