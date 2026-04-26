import type { Balance, ExchangeId } from '@shared/types'

export type SourceKind = 'cex' | 'evm'

export interface Source {
  kind: SourceKind
  id: string
  name: string
  short: string
  accent: string
  exchange?: ExchangeId
  address?: string
  /** Network family for watch-only wallets (e.g. 'ETH', 'TRX'). */
  network?: string
  /** False for watch-only wallets (no private key). Default true. */
  canSend?: boolean
  balances: Balance[] | null
  error?: string
}

export const EXCHANGE_META: Record<
  ExchangeId,
  { short: string; accent: string; displayName: string }
> = {
  binance: { short: 'BN', accent: '#F0B90B', displayName: 'Binance' },
  gate: { short: 'GT', accent: '#2354E6', displayName: 'Gate' },
  okx: { short: 'OK', accent: '#FFFFFF', displayName: 'OKX' },
  bybit: { short: 'BB', accent: '#F7A600', displayName: 'Bybit' },
  kucoin: { short: 'KC', accent: '#24AE8F', displayName: 'KuCoin' },
  bitget: { short: 'BG', accent: '#00CED1', displayName: 'Bitget' },
  htx: { short: 'HT', accent: '#5CB8E6', displayName: 'HTX' },
  mexc: { short: 'MX', accent: '#0B6EF1', displayName: 'MEXC' },
  phemex: { short: 'PX', accent: '#EE534F', displayName: 'Phemex' }
}

export const SUPPORTED_COINS = ['USDT', 'USDC', 'ETH', 'BTC'] as const
export type CoinSymbol = (typeof SUPPORTED_COINS)[number]
