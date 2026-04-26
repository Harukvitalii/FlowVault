import type { ExchangeId } from './types'

/**
 * Exchanges whose API requires an extra passphrase (also called "API
 * password"). Triggers an additional input in the Exchange form and
 * gates `ccxt.transfer` / `ccxt.withdraw` calls that pass the value
 * through as `password`.
 */
export const PASSPHRASE_EXCHANGES: readonly ExchangeId[] = [
  'okx',
  'kucoin',
  'bitget'
]

const set = new Set<ExchangeId>(PASSPHRASE_EXCHANGES)

export function needsPassphrase(ex: ExchangeId): boolean {
  return set.has(ex)
}

/**
 * Account type that `ccxt.withdraw()` actually pulls funds from on each
 * exchange. If the user's balance is held elsewhere we offer an internal
 * transfer first.
 */
export const WITHDRAW_TYPE: Record<ExchangeId, string> = {
  binance: 'spot',
  gate: 'spot',
  okx: 'funding',
  bybit: 'funding',
  kucoin: 'main',
  bitget: 'spot',
  htx: 'spot',
  mexc: 'spot',
  phemex: 'spot'
}

/**
 * Account types we expose in the From/To selectors of the internal-transfer
 * widget. These are practical wallets users actually hold balance in
 * (not every CCXT-supported type — futures variants are excluded unless
 * commonly used). MEXC is empty because CCXT doesn't expose `transfer`.
 */
export const TRANSFER_TYPES: Record<ExchangeId, string[]> = {
  binance: ['spot', 'funding', 'future', 'delivery'],
  gate: ['spot', 'funding', 'unified', 'swap'],
  okx: ['funding', 'unified'],
  bybit: ['unified', 'funding'],
  kucoin: ['main', 'trade', 'future'],
  bitget: ['spot', 'swap', 'usdc_swap', 'future'],
  htx: ['spot', 'linear', 'inverse'],
  mexc: ['spot', 'swap'],
  phemex: ['spot', 'swap']
}

/**
 * Translate UI account-type labels into what `ccxt.transfer()` expects.
 * OKX: fetchBalance reports balance under 'unified' but transfer() needs
 * 'trading' (CCXT's `accountsByType` for okx doesn't include 'unified').
 */
export function ccxtTransferType(ex: ExchangeId, type: string): string {
  if (ex === 'okx' && type === 'unified') return 'trading'
  if (ex === 'kucoin' && type === 'future') return 'contract'
  if (ex === 'htx' && type === 'linear') return 'linear-swap'
  if (ex === 'htx' && type === 'inverse') return 'futures'
  if (ex === 'binance' && type === 'future') return 'future'
  if (ex === 'binance' && type === 'delivery') return 'delivery'
  return type
}

export function canTransfer(ex: ExchangeId): boolean {
  return TRANSFER_TYPES[ex]?.length >= 2
}

const TYPE_LABELS: Record<string, string> = {
  spot: 'Spot',
  funding: 'Funding',
  unified: 'Unified',
  trading: 'Trading (Unified)',
  main: 'Main',
  trade: 'Trade',
  mix: 'Futures',
  futures: 'Futures',
  future: 'USDⓈ-M Futures',
  delivery: 'COIN-M Futures',
  linear: 'USDT-M Futures',
  inverse: 'Coin-M Futures',
  swap: 'Perpetuals',
  usdc_swap: 'USDC-M Futures'
}

const BITGET_LABELS: Record<string, string> = {
  swap: 'USDT-M Futures',
  usdc_swap: 'USDC-M Futures',
  future: 'Coin-M Futures'
}

export function transferTypeLabel(type: string, exchange?: ExchangeId): string {
  if (exchange === 'bitget' && BITGET_LABELS[type]) return BITGET_LABELS[type]
  return TYPE_LABELS[type] ?? type.charAt(0).toUpperCase() + type.slice(1)
}
