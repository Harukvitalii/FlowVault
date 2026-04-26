/**
 * Rough expected-confirmation-time heuristics per chain family. Minutes.
 * These are approximate and vary with congestion; used only as a hint in UI.
 */
const ETA_MINUTES: Record<string, number> = {
  ETH: 3,
  ARB: 1,
  OP: 1,
  BASE: 1,
  BSC: 1,
  MATIC: 2,
  AVAX: 1,
  ZKSYNC: 2,
  LINEA: 2,
  BLAST: 2,
  MANTLE: 2,
  SCROLL: 2,
  OPBNB: 1,
  CELO: 1,
  RON: 1,
  SEI: 1,
  SONIC: 1,
  WORLD: 1,
  KAIA: 1,
  KAVA: 1,
  METIS: 2,
  CORE: 1,
  BERA: 1,
  MANTA: 2,
  ZETA: 2,
  CFX: 1,
  FTM: 1,

  TRX: 1,
  SOL: 1,
  BTC: 10,
  LTC: 5,
  DOGE: 5,
  BCH: 5,

  TON: 1,
  XRP: 1,
  SUI: 1,
  APT: 1,
  ALGO: 1,
  NEAR: 1,
  ADA: 2,
  XLM: 1,
  HBAR: 1,
  DOT: 2,
  ATOM: 1,
  KAS: 1,
  EOS: 1,
  ICP: 1,
  FIL: 3,
  XTZ: 1,
  DASH: 2,
  XMR: 5
}

export function etaMinutes(family: string): number | null {
  return ETA_MINUTES[family] ?? null
}

export function formatEta(family: string): string {
  const mins = etaMinutes(family)
  if (mins == null) return '—'
  if (mins < 1) return '<1m'
  return `${mins}m`
}
