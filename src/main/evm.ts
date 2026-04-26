import { bestRpcsForChain } from './rpc'
import type { Balance, RpcEntry } from '../shared/types'

const RPC_TIMEOUT_MS = 8000

export interface TokenInfo {
  symbol: string
  address: `0x${string}`
  decimals: number
}

export interface ChainTokens {
  chainId: number
  /** Short label shown on the UI, e.g. "ETH", "ARB", "BSC". */
  short: string
  nativeSymbol: string
  // Native decimals are 18 everywhere we support today.
  tokens: TokenInfo[]
}

/**
 * Canonical stablecoin contracts per chain. We include only USDT + USDC,
 * picking the **native** (Circle-issued) USDC where available rather than
 * bridged variants, since that matches what exchanges list.
 */
export const CHAIN_TOKENS: ChainTokens[] = [
  {
    chainId: 1,
    short: 'ETH',
    nativeSymbol: 'ETH',
    tokens: [
      {
        symbol: 'USDT',
        address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        decimals: 6
      },
      {
        symbol: 'USDC',
        address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        decimals: 6
      }
    ]
  },
  {
    chainId: 42161,
    short: 'ARB',
    nativeSymbol: 'ETH',
    tokens: [
      {
        symbol: 'USDT',
        address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
        decimals: 6
      },
      {
        symbol: 'USDC',
        address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
        decimals: 6
      }
    ]
  },
  {
    chainId: 8453,
    short: 'BASE',
    nativeSymbol: 'ETH',
    tokens: [
      {
        symbol: 'USDC',
        address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        decimals: 6
      },
      {
        symbol: 'USDT',
        address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
        decimals: 6
      }
    ]
  },
  {
    chainId: 56,
    short: 'BSC',
    nativeSymbol: 'BNB',
    tokens: [
      {
        symbol: 'USDT',
        address: '0x55d398326f99059fF775485246999027B3197955',
        decimals: 18
      },
      {
        symbol: 'USDC',
        address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
        decimals: 18
      }
    ]
  },
  {
    chainId: 137,
    short: 'POL',
    nativeSymbol: 'MATIC',
    tokens: [
      {
        symbol: 'USDT',
        address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
        decimals: 6
      },
      {
        symbol: 'USDC',
        address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
        decimals: 6
      }
    ]
  },
  {
    chainId: 10,
    short: 'OP',
    nativeSymbol: 'ETH',
    tokens: [
      {
        symbol: 'USDT',
        address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
        decimals: 6
      },
      {
        symbol: 'USDC',
        address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
        decimals: 6
      }
    ]
  }
]

const STABLES = new Set(['USDT', 'USDC'])

export function findChainTokens(chainId: number): ChainTokens | undefined {
  return CHAIN_TOKENS.find((c) => c.chainId === chainId)
}

export function findChainByShort(short: string): ChainTokens | undefined {
  return CHAIN_TOKENS.find((c) => c.short === short.toUpperCase())
}

export function findToken(
  chainId: number,
  symbol: string
): TokenInfo | 'native' | null {
  const chain = findChainTokens(chainId)
  if (!chain) return null
  if (symbol.toUpperCase() === chain.nativeSymbol) return 'native'
  const t = chain.tokens.find((t) => t.symbol === symbol.toUpperCase())
  return t ?? null
}

async function rpcCall<T>(
  url: string,
  method: string,
  params: unknown[]
): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: controller.signal
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = (await res.json()) as {
      result?: T
      error?: { message?: string }
    }
    if (body.error) throw new Error(body.error.message ?? 'rpc error')
    if (body.result === undefined) throw new Error('empty result')
    return body.result
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Convert a hex-encoded big integer to a JavaScript number.
 * Precision loss beyond 15 significant digits is acceptable for display.
 */
function hexToNumber(hex: string, decimals: number): number {
  if (!hex || hex === '0x' || hex === '0x0') return 0
  let big: bigint
  try {
    big = BigInt(hex)
  } catch {
    return 0
  }
  if (big === 0n) return 0
  const divisor = 10n ** BigInt(decimals)
  const whole = Number(big / divisor)
  const frac = Number(big % divisor) / Number(divisor)
  return whole + frac
}

function encodeBalanceOf(address: string): string {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address))
    throw new Error(`invalid EVM address for balanceOf: ${address}`)
  const addr = address.toLowerCase().replace(/^0x/, '')
  return '0x70a08231' + addr.padStart(64, '0')
}

async function callWithFallback<T>(
  urls: string[],
  chainId: number,
  method: string,
  params: unknown[],
  label: string
): Promise<T> {
  let lastErr: unknown = new Error('no rpc')
  for (const url of urls) {
    try {
      return await rpcCall<T>(url, method, params)
    } catch (err) {
      lastErr = err
      console.warn(
        `[evm] chain ${chainId} ${label} via ${url} fail:`,
        err instanceof Error ? err.message : err
      )
    }
  }
  throw lastErr
}

async function getChainBalances(
  address: string,
  rpcUrls: string[],
  chain: ChainTokens
): Promise<Balance[]> {
  const nativePromise = callWithFallback<string>(
    rpcUrls,
    chain.chainId,
    'eth_getBalance',
    [address, 'latest'],
    'native'
  )
    .then((hex) => {
      const amount = hexToNumber(hex, 18)
      console.log(
        `[evm] chain ${chain.chainId} ${chain.nativeSymbol} (native): ${amount}`
      )
      return amount
    })
    .catch(() => 0)

  const tokenPromises = chain.tokens.map(async (t) => {
    const to = t.address.toLowerCase()
    try {
      const hex = await callWithFallback<string>(
        rpcUrls,
        chain.chainId,
        'eth_call',
        [{ to, data: encodeBalanceOf(address) }, 'latest'],
        `${t.symbol} ${to}`
      )
      const amount = hexToNumber(hex, t.decimals)
      console.log(
        `[evm] chain ${chain.chainId} ${t.symbol}: ${amount} (raw ${hex})`
      )
      return { token: t, amount }
    } catch {
      return { token: t, amount: 0 }
    }
  })

  const [native, tokens] = await Promise.all([
    nativePromise,
    Promise.all(tokenPromises)
  ])

  const out: Balance[] = []
  if (native > 0) {
    out.push({
      asset: chain.nativeSymbol,
      free: native,
      usd: 0,
      chainId: chain.chainId,
      chain: chain.short
    })
  }
  for (const { token, amount } of tokens) {
    if (amount > 0) {
      out.push({
        asset: token.symbol,
        free: amount,
        usd: STABLES.has(token.symbol) ? amount : 0,
        chainId: chain.chainId,
        chain: chain.short
      })
    }
  }
  return out
}

function rpcsForChain(rpcs: RpcEntry[], chainId: number): string[] {
  // Latency-sorted: fastest healthy RPC first. Falls back to raw order when
  // no pings have happened yet.
  return bestRpcsForChain(rpcs, chainId).map((r) => r.url)
}

export async function getEvmWalletBalances(
  address: string,
  rpcs: RpcEntry[]
): Promise<{ ok: boolean; balances?: Balance[]; error?: string }> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return { ok: false, error: 'invalid address' }
  }
  const started = Date.now()
  const tasks: Promise<Balance[]>[] = []
  let chainsQueried = 0
  for (const chain of CHAIN_TOKENS) {
    const urls = rpcsForChain(rpcs, chain.chainId)
    if (urls.length === 0) {
      console.log(
        `[evm] chain ${chain.chainId} (${chain.short}) skipped: no RPC configured`
      )
      continue
    }
    chainsQueried++
    console.log(
      `[evm] chain ${chain.chainId} (${chain.short}) querying via ${urls.length} RPC(s)`
    )
    tasks.push(
      getChainBalances(address, urls, chain).catch((err) => {
        console.warn(
          `[evm] chain ${chain.chainId} failed:`,
          err instanceof Error ? err.message : err
        )
        return []
      })
    )
  }
  if (chainsQueried === 0) {
    console.warn(
      `[evm] getBalances ${address}: no RPCs configured for any supported chain`
    )
    return { ok: false, error: 'no RPCs configured for supported chains' }
  }
  const results = await Promise.all(tasks)
  const balances = results
    .flat()
    .sort((a, b) => b.usd - a.usd || b.free - a.free)
  console.log(
    `[evm] getBalances ${address} ok · ${chainsQueried} chains · ${balances.length} rows · ${Date.now() - started}ms`
  )
  return { ok: true, balances }
}
