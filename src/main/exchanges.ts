import ccxt, { type Exchange } from 'ccxt'
import { getExchangeCreds, listExchanges as listExchangeAccounts } from './vault'
import * as phemexApi from './phemex'
import { runSignedProbe } from './diag'
import { familyLabel, networkFamily, sameNetworkFamily } from '../shared/networks'
import {
  addPending as addPendingWithdrawal,
  update as updateWithdrawal
} from './withdrawals'
import {
  getAddresses as cachedGetAddresses,
  getNetworks as cachedGetNetworks,
  purgeAccount as purgeDisk,
  purgeAll as purgeDiskAll,
  setAddresses as cachedSetAddresses,
  setNetworks as cachedSetNetworks
} from './cache-store'
import type {
  Balance,
  CoinNetworkPair,
  ConnectionTestResult,
  ConnectionTestStep,
  DepositAddressEntry,
  ExchangeId,
  InternalTransferInput,
  InternalTransferResult,
  NetworkInfo,
  PreflightCheck,
  PreflightResult,
  WhitelistDepositAddress,
  WhitelistNetwork,
  WithdrawInput,
  WithdrawStatus,
  WithdrawSubmitResult
} from '../shared/types'

const STABLES = new Set([
  'USDT',
  'USDC',
  'DAI',
  'BUSD',
  'FDUSD',
  'TUSD',
  'USDP',
  'PYUSD'
])

const BALANCE_TIMEOUT_MS = 20_000
const NETWORKS_TIMEOUT_MS = 25_000
const ADDRESS_TIMEOUT_MS = 15_000
const WITHDRAW_TIMEOUT_MS = 15_000

const CURRENCIES_TTL_MS = 5 * 60 * 1000
const BALANCE_TTL_MS = 30 * 1000

/**
 * Wallet / account types queried per exchange when computing total balances.
 * Failed account types are skipped individually.
 */
/**
 * Per-exchange extra params for `fetchBalance({type, ...})`. Some venues need
 * an explicit productType / subType to return the right wallet — without it
 * they return empty.
 */
function balanceParams(
  exchange: ExchangeId,
  type: string
): Record<string, unknown> {
  if (exchange === 'bitget') {
    if (type === 'swap') return { productType: 'USDT-FUTURES' }
    if (type === 'usdc_swap') return { productType: 'USDC-FUTURES' }
    if (type === 'future') return { productType: 'COIN-FUTURES' }
  }
  if (exchange === 'htx') {
    if (type === 'linear') return { unified: true }
    if (type === 'inverse') return { subType: 'inverse' }
  }
  return {}
}

/**
 * Post-process futures balances for exchanges with multi-asset margin.
 * Binance multi-asset mode reports the USDT margin balance under every
 * stablecoin (USDC, FDUSD, etc.) even when the user only holds USDT.
 * We filter to keep only assets with actual `walletBalance > 0` from
 * the raw API response.
 */
function filterMultiAssetDupes(
  exchange: ExchangeId,
  type: string,
  balances: Map<string, number>,
  rawBal: Record<string, unknown>
): Map<string, number> {
  if (exchange !== 'binance') return balances
  if (type !== 'future' && type !== 'delivery') return balances
  // Check raw info for per-asset wallet balances
  const info = rawBal.info as { assets?: Array<{ asset: string; walletBalance: string }> } | undefined
  if (!info?.assets) return balances
  const realAssets = new Set<string>()
  for (const a of info.assets) {
    const wb = parseFloat(a.walletBalance ?? '0')
    if (wb > 0) realAssets.add(a.asset.toUpperCase())
  }
  if (realAssets.size === 0) return balances
  const filtered = new Map<string, number>()
  for (const [asset, amt] of balances) {
    if (realAssets.has(asset)) filtered.set(asset, amt)
  }
  return filtered
}

const ACCOUNT_TYPES: Record<ExchangeId, string[]> = {
  binance: ['spot', 'funding', 'future', 'delivery'],
  gate: ['spot', 'funding', 'unified', 'swap'],
  okx: ['funding', 'unified', 'trading'],
  bybit: ['unified', 'funding'],
  kucoin: ['main', 'trade', 'future'],
  bitget: ['spot', 'swap', 'usdc_swap', 'future'],
  htx: ['spot', 'linear', 'inverse'],
  mexc: ['spot', 'swap'],
  phemex: ['spot', 'swap']
}

import { WITHDRAW_TYPE, ccxtTransferType } from '../shared/exchanges'
import { isValidForNetwork } from '../shared/addresses'
import { mask } from './log'
export { WITHDRAW_TYPE }

/**
 * Fallback network definitions for exchanges whose fetchCurrencies doesn't
 * populate the `networks` sub-object (e.g. Phemex) or requires auth and may
 * fail (e.g. MEXC). Keyed by ExchangeId → coin → network[].
 */
const FALLBACK_NETWORKS: Partial<Record<ExchangeId, Record<string, NetworkInfo[]>>> = {
  mexc: {
    USDT: [
      { network: 'TRX', name: 'Tron (TRC20)', fee: 1, minWithdraw: 10, minDeposit: 0, withdrawEnabled: true, depositEnabled: true, estMinutes: 0 },
      { network: 'ETH', name: 'Ethereum (ERC20)', fee: 3.5, minWithdraw: 10, minDeposit: 0, withdrawEnabled: true, depositEnabled: true, estMinutes: 0 },
      { network: 'BSC', name: 'BSC (BEP20)', fee: 0.3, minWithdraw: 10, minDeposit: 0, withdrawEnabled: true, depositEnabled: true, estMinutes: 0 },
      { network: 'ARB', name: 'Arbitrum One', fee: 0.1, minWithdraw: 5, minDeposit: 0, withdrawEnabled: true, depositEnabled: true, estMinutes: 0 },
      { network: 'BASE', name: 'Base', fee: 0.1, minWithdraw: 5, minDeposit: 0, withdrawEnabled: true, depositEnabled: true, estMinutes: 0 },
      { network: 'SOL', name: 'Solana', fee: 1, minWithdraw: 10, minDeposit: 0, withdrawEnabled: true, depositEnabled: true, estMinutes: 0 },
      { network: 'OP', name: 'Optimism', fee: 0.1, minWithdraw: 5, minDeposit: 0, withdrawEnabled: true, depositEnabled: true, estMinutes: 0 },
    ],
    USDC: [
      { network: 'ETH', name: 'Ethereum (ERC20)', fee: 3.5, minWithdraw: 10, minDeposit: 0, withdrawEnabled: true, depositEnabled: true, estMinutes: 0 },
      { network: 'BSC', name: 'BSC (BEP20)', fee: 0.3, minWithdraw: 10, minDeposit: 0, withdrawEnabled: true, depositEnabled: true, estMinutes: 0 },
      { network: 'ARB', name: 'Arbitrum One', fee: 0.1, minWithdraw: 5, minDeposit: 0, withdrawEnabled: true, depositEnabled: true, estMinutes: 0 },
      { network: 'BASE', name: 'Base', fee: 0.1, minWithdraw: 5, minDeposit: 0, withdrawEnabled: true, depositEnabled: true, estMinutes: 0 },
      { network: 'SOL', name: 'Solana', fee: 1, minWithdraw: 5, minDeposit: 0, withdrawEnabled: true, depositEnabled: true, estMinutes: 0 },
    ],
    ETH: [
      { network: 'ETH', name: 'Ethereum', fee: 0.0015, minWithdraw: 0.01, minDeposit: 0, withdrawEnabled: true, depositEnabled: true, estMinutes: 0 },
      { network: 'ARB', name: 'Arbitrum One', fee: 0.0001, minWithdraw: 0.005, minDeposit: 0, withdrawEnabled: true, depositEnabled: true, estMinutes: 0 },
      { network: 'BASE', name: 'Base', fee: 0.0001, minWithdraw: 0.005, minDeposit: 0, withdrawEnabled: true, depositEnabled: true, estMinutes: 0 },
    ],
    BTC: [
      { network: 'BTC', name: 'Bitcoin', fee: 0.0003, minWithdraw: 0.001, minDeposit: 0, withdrawEnabled: true, depositEnabled: true, estMinutes: 0 },
    ],
  }
}

/** Coins we pre-compute network slices for in warmup + disk-cache. */
const PREFETCH_COINS = ['USDT', 'USDC', 'ETH', 'BTC'] as const

/** Networks we try to pre-fetch deposit addresses for, per coin. */
const PREFETCH_NETWORKS_BY_COIN: Record<string, string[]> = {
  USDT: ['BSC', 'ETH', 'TRX', 'ARBITRUM', 'BASE', 'SOL'],
  USDC: ['ETH', 'BASE', 'ARBITRUM', 'SOL', 'BSC'],
  ETH: ['ETH', 'ARBITRUM', 'BASE', 'OP'],
  BTC: ['BTC']
}

type NetworksResult = {
  ok: boolean
  networks?: NetworkInfo[]
  error?: string
}
type AddressResult = {
  ok: boolean
  addresses?: DepositAddressEntry[]
  error?: string
}

// ---------------- Exchange client cache ----------------

const EXCHANGE_CTORS: Record<
  ExchangeId,
  new (cfg: Record<string, unknown>) => Exchange
> = {
  binance: ccxt.binance,
  gate: ccxt.gate,
  okx: ccxt.okx,
  bybit: ccxt.bybit,
  kucoin: ccxt.kucoin,
  bitget: ccxt.bitget,
  htx: ccxt.htx,
  mexc: ccxt.mexc,
  phemex: ccxt.phemex
}

const clients = new Map<string, Exchange>()

function build(accountId: string): Exchange {
  const creds = getExchangeCreds(accountId)
  if (!creds) throw new Error('account not found (vault locked?)')
  const Ctor = EXCHANGE_CTORS[creds.exchange]
  if (!Ctor) throw new Error(`unsupported exchange: ${creds.exchange}`)
  return new Ctor({
    apiKey: creds.apiKey,
    secret: creds.secret,
    password: creds.passphrase,
    enableRateLimit: true,
    timeout: 10_000
  })
}

export function getClient(accountId: string): Exchange {
  const existing = clients.get(accountId)
  if (existing) return existing
  const c = build(accountId)
  clients.set(accountId, c)
  return c
}

// ---------------- In-memory caches ----------------

type CcxtCurrencies = Record<string, { networks?: Record<string, CcxtNetwork> }>

const currenciesCache = new Map<
  string,
  { ts: number; data: CcxtCurrencies }
>()
const balanceCache = new Map<string, { ts: number; data: Balance[] }>()
const networksInFlight = new Map<string, Promise<NetworksResult>>()
const addressInFlight = new Map<string, Promise<AddressResult>>()
const currenciesInFlight = new Map<string, Promise<CcxtCurrencies>>()

function addressKey(accountId: string, coin: string, network: string): string {
  return `${accountId}::${coin.toUpperCase()}::${network}`
}
function networksKey(accountId: string, coin: string): string {
  return `${accountId}::${coin.toUpperCase()}`
}

// ---------------- Invalidation ----------------

export function invalidateClient(accountId: string) {
  clients.delete(accountId)
  currenciesCache.delete(accountId)
  balanceCache.delete(accountId)
  for (const k of networksInFlight.keys()) {
    if (k.startsWith(`${accountId}::`)) networksInFlight.delete(k)
  }
  for (const k of addressInFlight.keys()) {
    if (k.startsWith(`${accountId}::`)) addressInFlight.delete(k)
  }
  currenciesInFlight.delete(accountId)
  purgeDisk(accountId)
}

export function invalidateAllClients() {
  clients.clear()
  currenciesCache.clear()
  balanceCache.clear()
  networksInFlight.clear()
  addressInFlight.clear()
  currenciesInFlight.clear()
  purgeDiskAll()
}

// ---------------- Helpers ----------------

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms
    )
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  }) as Promise<T>
}

const PUBLIC_PROBE_URLS: Record<ExchangeId, string> = {
  binance: 'https://api.binance.com/api/v3/ping',
  gate: 'https://api.gateio.ws/api/v4/spot/currencies/USDT',
  okx: 'https://www.okx.com/api/v5/public/time',
  bybit: 'https://api.bybit.com/v5/market/time',
  kucoin: 'https://api.kucoin.com/api/v1/timestamp',
  bitget: 'https://api.bitget.com/api/v2/public/time',
  htx: 'https://api.htx.com/v1/common/timestamp',
  mexc: 'https://api.mexc.com/api/v3/ping',
  phemex: 'https://api.phemex.com/public/products'
}

async function probeExchange(exchange: ExchangeId): Promise<string> {
  const r = await probeExchangeStep(exchange)
  if (r.status === 'ok') return `reachable ${r.latencyMs}ms`
  return r.detail ?? 'unknown'
}

async function probeExchangeStep(
  exchange: ExchangeId
): Promise<ConnectionTestStep> {
  const url = PUBLIC_PROBE_URLS[exchange]
  if (!url) return { name: 'public', status: 'skip', detail: 'no url' }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5000)
  const started = Date.now()
  try {
    const res = await fetch(url, { signal: controller.signal })
    const latencyMs = Date.now() - started
    if (!res.ok)
      return {
        name: 'public',
        status: 'fail',
        latencyMs,
        detail: `HTTP ${res.status}`
      }
    return { name: 'public', status: 'ok', latencyMs }
  } catch (err) {
    return {
      name: 'public',
      status: 'fail',
      latencyMs: Date.now() - started,
      detail: err instanceof Error ? err.message : 'unknown'
    }
  } finally {
    clearTimeout(timer)
  }
}

export async function testConnection(
  accountId: string
): Promise<ConnectionTestResult> {
  const creds = getExchangeCreds(accountId)
  if (!creds) {
    return {
      steps: [
        {
          name: 'public',
          status: 'fail',
          detail: 'account not found (vault locked?)'
        }
      ]
    }
  }
  const publicStep = await probeExchangeStep(creds.exchange)
  const signedStep = await runSignedProbe(creds)
  return { steps: [publicStep, signedStep] }
}

function toAmount(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

// ---------------- Balances ----------------

function extractFreeBalances(
  raw: Record<string, unknown>
): Map<string, number> {
  const out = new Map<string, number>()
  const freeMap = (raw.free ?? {}) as unknown as Record<string, unknown>
  for (const [asset, v] of Object.entries(freeMap)) {
    const amt = toAmount(v)
    if (amt > 0) out.set(asset.toUpperCase(), amt)
  }
  // Fallback: per-asset entries like bal['USDT'] = { free, used, total }.
  if (out.size === 0) {
    for (const [key, value] of Object.entries(raw)) {
      if (
        ['info', 'free', 'used', 'total', 'timestamp', 'datetime', 'debt'].includes(
          key
        )
      )
        continue
      if (!value || typeof value !== 'object') continue
      const entry = value as Record<string, unknown>
      const amt = toAmount(entry.free)
      if (amt > 0) out.set(key.toUpperCase(), amt)
    }
  }
  return out
}

export async function getBalances(
  accountId: string,
  opts?: { forceRefresh?: boolean }
): Promise<{
  ok: boolean
  balances?: Balance[]
  error?: string
  cached?: boolean
}> {
  if (!opts?.forceRefresh) {
    const cached = balanceCache.get(accountId)
    if (cached && Date.now() - cached.ts < BALANCE_TTL_MS) {
      return { ok: true, balances: cached.data, cached: true }
    }
  }
  const started = Date.now()
  const creds = getExchangeCreds(accountId)
  if (!creds) {
    return { ok: false, error: 'account not found (vault locked?)' }
  }
  const types = ACCOUNT_TYPES[creds.exchange] ?? ['spot']
  try {
    const client = getClient(accountId)
    console.log(
      `[exchanges] getBalances ${accountId} (${client.id}) types=[${types.join(',')}]…`
    )
    // Query each account type in parallel; tolerate per-type failures.
    const results = await Promise.all(
      types.map(async (type) => {
        try {
          const params = balanceParams(creds.exchange, type)
          const bal = (await withTimeout(
            client.fetchBalance({ type, ...params }),
            BALANCE_TIMEOUT_MS,
            `fetchBalance(${type})`
          )) as Record<string, unknown>
          let balances = extractFreeBalances(bal)
          balances = filterMultiAssetDupes(creds.exchange, type, balances, bal)
          return { type, balances }
        } catch (err) {
          console.warn(
            `[exchanges] ${accountId} type=${type} failed:`,
            err instanceof Error ? err.message : err
          )
          return null
        }
      })
    )

    const rowsAll: Balance[] = []
    for (const r of results) {
      if (!r) continue
      for (const [asset, amt] of r.balances) {
        rowsAll.push({
          asset,
          free: amt,
          usd: STABLES.has(asset) ? amt : 0,
          accountType: r.type
        })
      }
    }

    // De-duplicate: some exchanges return the SAME pool of funds via
    // different account-type queries (OKX: unified ≡ trading; Gate in
    // unified mode: spot ≡ funding ≡ unified). Identical (asset, free)
    // across types = same funds. Keep the withdraw-type row when there's
    // a tie, otherwise keep the first occurrence.
    const withdrawTypeForDedupe = WITHDRAW_TYPE[creds.exchange]
    // Dedup key: same asset + same amount across different account types = likely
    // the same pool (common on unified exchanges like OKX, Gate). This heuristic
    // can under-report if two genuinely distinct sub-accounts hold identical amounts.
    const amountKey = (asset: string, free: number) =>
      `${asset}::${free.toFixed(10)}`
    const seen = new Map<string, Balance>()
    // Pass 1: withdraw-type rows first (so they win duplicate collisions).
    for (const r of rowsAll) {
      if (r.accountType !== withdrawTypeForDedupe) continue
      const key = amountKey(r.asset, r.free)
      if (!seen.has(key)) seen.set(key, r)
    }
    // Pass 2: other types, only if no duplicate already captured.
    for (const r of rowsAll) {
      if (r.accountType === withdrawTypeForDedupe) continue
      const key = amountKey(r.asset, r.free)
      if (!seen.has(key)) seen.set(key, r)
    }
    const rows = Array.from(seen.values())
    const dropped = rowsAll.length - rows.length

    rows.sort(
      (a, b) =>
        b.usd - a.usd ||
        b.free - a.free ||
        a.asset.localeCompare(b.asset) ||
        (a.accountType ?? '').localeCompare(b.accountType ?? '')
    )

    if (rows.length === 0 && results.every((r) => r === null)) {
      // Every type failed. Surface as error so the card flips to "error".
      return {
        ok: false,
        error: `all account types failed (${types.join(', ')})`
      }
    }

    balanceCache.set(accountId, { ts: Date.now(), data: rows })
    console.log(
      `[exchanges] getBalances ${accountId} ok · ${rows.length} rows across ${results.filter(Boolean).length}/${types.length} types · ${dropped} dupes dropped · ${Date.now() - started}ms`
    )
    return { ok: true, balances: rows }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'failed'
    const probe = await probeExchange(creds.exchange)
    console.error(
      `[exchanges] getBalances ${accountId} FAIL · ${Date.now() - started}ms · ${message} · probe: ${probe}`
    )
    invalidateClient(accountId)
    return { ok: false, error: `${message} · probe: ${probe}` }
  }
}

// ---------------- Currencies (full blob) ----------------

type CcxtNetwork = {
  id?: string
  network?: string
  name?: string
  active?: boolean
  deposit?: boolean
  withdraw?: boolean
  fee?: number
  limits?: {
    withdraw?: { min?: number }
    deposit?: { min?: number }
  }
}

type FeesBlob = Record<
  string,
  {
    networks?: Record<
      string,
      {
        withdraw?: { fee?: number; percentage?: boolean }
        deposit?: { fee?: number }
      }
    >
  }
>

/**
 * Some exchanges (Gate, OKX in parts) return `fee = 0` in `fetchCurrencies`
 * and expose real withdrawal fees via `fetchDepositWithdrawFees`. Merge them
 * back into the currencies blob so downstream slicing has real numbers.
 */
function mergeFeesIntoCurrencies(
  currencies: CcxtCurrencies,
  fees: FeesBlob
): void {
  for (const [code, entry] of Object.entries(fees)) {
    const cur = currencies[code.toUpperCase()]
    if (!cur?.networks) continue
    const netFees = entry?.networks
    if (!netFees) continue
    for (const [netCode, netFee] of Object.entries(netFees)) {
      const network = cur.networks[netCode]
      if (!network) continue
      const fee = netFee?.withdraw?.fee
      if (typeof fee === 'number' && fee > 0) {
        network.fee = fee
      }
    }
  }
}

/**
 * Fetch & cache the full currencies blob for an account. Single network hit
 * per ~5 min; subsequent per-coin lookups slice from memory.
 */
async function loadCurrencies(accountId: string): Promise<CcxtCurrencies> {
  const cached = currenciesCache.get(accountId)
  if (cached && Date.now() - cached.ts < CURRENCIES_TTL_MS) return cached.data
  const existing = currenciesInFlight.get(accountId)
  if (existing) return existing
  const task = (async () => {
    const started = Date.now()
    const client = getClient(accountId)
    console.log(
      `[exchanges] loadCurrencies ${accountId} (${client.id}) → fetchCurrencies + fetchDepositWithdrawFees…`
    )
    // Run both in parallel; fees is best-effort.
    const hasFees =
      (client.has as Record<string, boolean>)['fetchDepositWithdrawFees'] ===
      true
    const [currencies, fees] = (await Promise.all([
      withTimeout(
        client.fetchCurrencies(),
        NETWORKS_TIMEOUT_MS,
        'fetchCurrencies'
      ),
      hasFees
        ? withTimeout(
            (
              client as unknown as {
                fetchDepositWithdrawFees: () => Promise<unknown>
              }
            ).fetchDepositWithdrawFees(),
            NETWORKS_TIMEOUT_MS,
            'fetchDepositWithdrawFees'
          ).catch((err) => {
            console.warn(
              `[exchanges] fetchDepositWithdrawFees failed:`,
              err instanceof Error ? err.message : err
            )
            return null
          })
        : Promise.resolve(null)
    ])) as [CcxtCurrencies, FeesBlob | null]

    if (fees) {
      mergeFeesIntoCurrencies(currencies, fees)
    }

    currenciesCache.set(accountId, { ts: Date.now(), data: currencies })
    console.log(
      `[exchanges] loadCurrencies ${accountId} ok · ${Object.keys(currencies).length} coins · fees ${fees ? 'merged' : 'skipped'} · ${Date.now() - started}ms`
    )
    // Pre-derive + disk-persist slices for supported coins so every future
    // `getNetworksForCoin` for these coins is instant even after restart.
    for (const coin of PREFETCH_COINS) {
      const networks = sliceNetworks(currencies, coin)
      if (networks.length > 0) cachedSetNetworks(accountId, coin, networks)
    }
    return currencies
  })().finally(() => currenciesInFlight.delete(accountId))
  currenciesInFlight.set(accountId, task)
  return task
}

function sliceNetworks(
  currencies: CcxtCurrencies,
  coin: string
): NetworkInfo[] {
  const cur = currencies?.[coin.toUpperCase()]
  if (!cur?.networks) return []
  return Object.entries(cur.networks)
    .map(([key, n]) => {
      const code = n.network ?? n.id ?? key
      return {
        network: code,
        name: n.name ?? code,
        fee: typeof n.fee === 'number' ? n.fee : 0,
        minWithdraw:
          typeof n.limits?.withdraw?.min === 'number'
            ? n.limits.withdraw.min
            : 0,
        minDeposit:
          typeof n.limits?.deposit?.min === 'number'
            ? n.limits.deposit.min
            : 0,
        withdrawEnabled: n.withdraw === true,
        depositEnabled: n.deposit === true,
        estMinutes: 0
      } as NetworkInfo
    })
    .filter((n) => n.withdrawEnabled || n.depositEnabled)
    .sort((a, b) => a.network.localeCompare(b.network))
}

// ---------------- Networks ----------------

export async function getNetworksForCoin(
  accountId: string,
  coin: string
): Promise<NetworksResult> {
  // Phemex: use custom API client for real network data.
  const creds = getExchangeCreds(accountId)
  if (creds?.exchange === 'phemex') {
    try {
      const networks = await phemexApi.getNetworks(creds, coin)
      if (networks.length > 0) cachedSetNetworks(accountId, coin, networks)
      return { ok: true, networks }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'failed' }
    }
  }
  const key = networksKey(accountId, coin)
  // Disk/memory cache first — but skip empty cached results so fallbacks
  // can fill in networks for exchanges that don't report them via API.
  const cached = cachedGetNetworks(accountId, coin)
  if (cached && cached.data.length > 0) return { ok: true, networks: cached.data }
  const existing = networksInFlight.get(key)
  if (existing) return existing

  const task = (async (): Promise<NetworksResult> => {
    try {
      // Slice from already-loaded currencies if present.
      let networks: NetworkInfo[] = []
      const cachedBlob = currenciesCache.get(accountId)
      if (cachedBlob && Date.now() - cachedBlob.ts < CURRENCIES_TTL_MS) {
        networks = sliceNetworks(cachedBlob.data, coin)
      } else {
        const currencies = await loadCurrencies(accountId)
        networks = sliceNetworks(currencies, coin)
      }
      // Fallback for exchanges where fetchCurrencies doesn't return networks
      // (Phemex, MEXC without auth, etc.)
      if (networks.length === 0) {
        const creds = getExchangeCreds(accountId)
        const fallback = creds ? FALLBACK_NETWORKS[creds.exchange]?.[coin.toUpperCase()] : undefined
        if (fallback) {
          networks = fallback
          console.log(
            `[exchanges] getNetworks ${accountId}/${coin} using fallback · ${networks.length} networks`
          )
        }
      }
      if (networks.length > 0) cachedSetNetworks(accountId, coin, networks)
      console.log(
        `[exchanges] getNetworks ${accountId}/${coin} · ${networks.length} networks`
      )
      return { ok: true, networks }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'failed'
      const creds = getExchangeCreds(accountId)
      const probe = creds ? await probeExchange(creds.exchange) : 'n/a'
      console.error(
        `[exchanges] getNetworks ${accountId}/${coin} FAIL · ${message} · probe: ${probe}`
      )
      invalidateClient(accountId)
      return { ok: false, error: `${message} · probe: ${probe}` }
    }
  })().finally(() => networksInFlight.delete(key))

  networksInFlight.set(key, task)
  return task
}

// ---------------- Whitelist networks ----------------

/**
 * Union of all network codes the exchange supports for *withdrawal* across every
 * coin it lists. Used by the Setup tab's address-whitelist section so the user
 * sees every EVM network they might need to add on the exchange's whitelist
 * page, labelled with the exchange's own code (what appears in the dropdown).
 */
export async function getWithdrawNetworks(
  accountId: string
): Promise<{ ok: boolean; networks?: WhitelistNetwork[]; error?: string }> {
  // Phemex: use custom API to get withdraw networks for common coins.
  const creds = getExchangeCreds(accountId)
  if (creds?.exchange === 'phemex') {
    try {
      const coins = ['USDT', 'USDC', 'ETH', 'BTC']
      const byCode = new Map<string, WhitelistNetwork>()
      const results = await Promise.all(
        coins.map((c) => phemexApi.getWithdrawChains(creds, c).catch(() => []))
      )
      for (const chains of results) {
        for (const n of chains) {
          if (!n.withdrawEnabled || byCode.has(n.network)) continue
          const family = networkFamily(n.network)
          byCode.set(n.network, {
            exchangeCode: n.network,
            family,
            familyLabel: familyLabel(family)
          })
        }
      }
      return { ok: true, networks: Array.from(byCode.values()) }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'failed' }
    }
  }
  try {
    const currencies = await loadCurrencies(accountId)
    const byCode = new Map<string, WhitelistNetwork>()
    for (const cur of Object.values(currencies)) {
      const nets = cur?.networks
      if (!nets) continue
      for (const [key, n] of Object.entries(nets)) {
        if (n.withdraw !== true) continue
        const code = n.network ?? n.id ?? key
        if (!code || byCode.has(code)) continue
        const family = networkFamily(code)
        byCode.set(code, {
          exchangeCode: code,
          family,
          familyLabel: familyLabel(family)
        })
      }
    }
    // Fallback for exchanges without networks in fetchCurrencies
    if (byCode.size === 0) {
      const creds = getExchangeCreds(accountId)
      const fallback = creds ? FALLBACK_NETWORKS[creds.exchange] : undefined
      if (fallback) {
        for (const nets of Object.values(fallback)) {
          for (const n of nets) {
            if (!n.withdrawEnabled || byCode.has(n.network)) continue
            const family = networkFamily(n.network)
            byCode.set(n.network, {
              exchangeCode: n.network,
              family,
              familyLabel: familyLabel(family)
            })
          }
        }
      }
    }
    const list = Array.from(byCode.values()).sort(
      (a, b) =>
        a.familyLabel.localeCompare(b.familyLabel) ||
        a.exchangeCode.localeCompare(b.exchangeCode)
    )
    return { ok: true, networks: list }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'failed'
    const creds = getExchangeCreds(accountId)
    const probe = creds ? await probeExchange(creds.exchange) : 'n/a'
    console.error(
      `[exchanges] getWithdrawNetworks ${accountId} FAIL · ${message} · probe: ${probe}`
    )
    invalidateClient(accountId)
    return { ok: false, error: `${message} · probe: ${probe}` }
  }
}

// ---------------- Deposit addresses ----------------

type RawDeposit = {
  address?: string
  tag?: string | null
  network?: string | null
  info?: Record<string, unknown>
}

function labelFromInfo(info?: Record<string, unknown>): string | undefined {
  if (!info) return undefined
  const candidates = ['addressType', 'addrType', 'type', 'tag_type', 'chain']
  for (const k of candidates) {
    const v = info[k]
    if (typeof v === 'string' && v.trim()) return v
  }
  return undefined
}

function toEntry(raw: RawDeposit): DepositAddressEntry | null {
  if (!raw.address) return null
  return {
    address: raw.address,
    tag: raw.tag ?? undefined,
    label: labelFromInfo(raw.info)
  }
}

function dedupe(list: DepositAddressEntry[]): DepositAddressEntry[] {
  const seen = new Map<string, DepositAddressEntry>()
  for (const e of list) {
    const key = `${e.address}::${e.tag ?? ''}`
    if (!seen.has(key)) seen.set(key, e)
  }
  return Array.from(seen.values())
}

export async function getDepositAddresses(
  accountId: string,
  coin: string,
  network: string
): Promise<AddressResult> {
  const creds = getExchangeCreds(accountId)

  // MEXC: bypass ccxt's fetchDepositAddress (broken without currencies network data).
  // Fetch ALL deposit addresses for the coin, then filter by matching network family.
  if (creds?.exchange === 'mexc') {
    const cached = cachedGetAddresses(accountId, coin, network)
    if (cached) return { ok: true, addresses: cached.addresses }
    try {
      const client = getClient(accountId)
      // First try with the exact network code
      let res = (await withTimeout(
        (client as unknown as {
          spotPrivateGetCapitalDepositAddress: (params: Record<string, string>) => Promise<unknown>
        }).spotPrivateGetCapitalDepositAddress({
          coin: coin.toUpperCase(),
          network
        }),
        ADDRESS_TIMEOUT_MS,
        'mexcDepositAddress'
      )) as unknown
      let list = Array.isArray(res) ? res : (res && typeof res === 'object' ? [res] : [])
      // If empty, fetch ALL addresses for this coin and filter by network family
      if ((list as Array<Record<string, unknown>>).filter((r) => r.address).length === 0) {
        res = (await withTimeout(
          (client as unknown as {
            spotPrivateGetCapitalDepositAddress: (params: Record<string, string>) => Promise<unknown>
          }).spotPrivateGetCapitalDepositAddress({
            coin: coin.toUpperCase()
          }),
          ADDRESS_TIMEOUT_MS,
          'mexcDepositAddressAll'
        )) as unknown
        const all = Array.isArray(res) ? res : (res && typeof res === 'object' ? [res] : [])
        const targetFamily = networkFamily(network)
        list = (all as Array<Record<string, unknown>>).filter((r) => {
          const net = (r.netWork ?? r.network ?? '') as string
          return sameNetworkFamily(net, network) || networkFamily(net) === targetFamily
        })
      }
      const addresses: DepositAddressEntry[] = (list as Array<Record<string, unknown>>)
        .filter((r) => typeof r.address === 'string' && r.address)
        .map((r) => ({
          address: r.address as string,
          tag: (typeof r.memo === 'string' && r.memo) ? r.memo : undefined
        }))
      if (addresses.length === 0) {
        return { ok: false, error: 'exchange returned no address' }
      }
      cachedSetAddresses(accountId, coin, network, addresses)
      return { ok: true, addresses }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'failed'
      return { ok: false, error: msg }
    }
  }

  // KuCoin: resolve the chain ID from the currency's network info (e.g. BEP20 → bsc)
  // and call the raw deposit address endpoint with that ID.
  if (creds?.exchange === 'kucoin') {
    const cached = cachedGetAddresses(accountId, coin, network)
    if (cached) return { ok: true, addresses: cached.addresses }
    try {
      const client = getClient(accountId)
      await (client as unknown as { loadMarkets: () => Promise<void> }).loadMarkets()
      const currency = (client.currencies as Record<string, { networks?: Record<string, { id?: string }> }>)?.[coin.toUpperCase()]
      const chainId = currency?.networks?.[network]?.id ?? network.toLowerCase()
      const res = (await withTimeout(
        (client as unknown as {
          privateGetDepositAddresses: (params: Record<string, string>) => Promise<unknown>
        }).privateGetDepositAddresses({
          currency: coin.toUpperCase(),
          chain: chainId
        }),
        ADDRESS_TIMEOUT_MS,
        'kucoinDepositAddress'
      )) as { data?: unknown }
      const raw = res?.data
      const list = Array.isArray(raw) ? raw : (raw && typeof raw === 'object' ? [raw] : [])
      const addresses: DepositAddressEntry[] = (list as Array<Record<string, unknown>>)
        .filter((r) => typeof r.address === 'string' && r.address)
        .map((r) => ({ address: r.address as string, tag: (typeof r.memo === 'string' && r.memo) ? r.memo : undefined }))
      if (addresses.length === 0) return { ok: false, error: 'No deposit address — create one on the KuCoin website first' }
      cachedSetAddresses(accountId, coin, network, addresses)
      return { ok: true, addresses }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'failed'
      if (msg.includes('204000') || msg.includes('null')) {
        return { ok: false, error: 'No deposit address for this network — create one on the KuCoin website first' }
      }
      return { ok: false, error: msg }
    }
  }

  // Bitget: resolve the raw chain name from currency info (e.g. APT → Aptos).
  if (creds?.exchange === 'bitget') {
    const cached = cachedGetAddresses(accountId, coin, network)
    if (cached) return { ok: true, addresses: cached.addresses }
    try {
      const client = getClient(accountId)
      await (client as unknown as { loadMarkets: () => Promise<void> }).loadMarkets()
      const currency = (client.currencies as Record<string, { networks?: Record<string, { info?: { chain?: string } }> }>)?.[coin.toUpperCase()]
      const rawChain = currency?.networks?.[network]?.info?.chain ?? network
      const res = (await withTimeout(
        (client as unknown as {
          privateSpotGetV2SpotWalletDepositAddress: (params: Record<string, string>) => Promise<unknown>
        }).privateSpotGetV2SpotWalletDepositAddress({
          coin: coin.toUpperCase(),
          chain: rawChain
        }),
        ADDRESS_TIMEOUT_MS,
        'bitgetDepositAddress'
      )) as { data?: { address?: string; tag?: string } }
      const addr = res?.data?.address
      if (!addr) return { ok: false, error: 'exchange returned no address' }
      const addresses: DepositAddressEntry[] = [{
        address: addr,
        tag: res.data?.tag || undefined
      }]
      cachedSetAddresses(accountId, coin, network, addresses)
      return { ok: true, addresses }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'failed' }
    }
  }

  // Phemex: use custom API client.
  if (creds?.exchange === 'phemex') {
    const cached = cachedGetAddresses(accountId, coin, network)
    if (cached) return { ok: true, addresses: cached.addresses }
    try {
      const entry = await phemexApi.getDepositAddress(creds, coin, network)
      if (!entry) return { ok: false, error: 'exchange returned no address' }
      const addresses = [entry]
      cachedSetAddresses(accountId, coin, network, addresses)
      return { ok: true, addresses }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'failed' }
    }
  }

  const key = addressKey(accountId, coin, network)
  const cached = cachedGetAddresses(accountId, coin, network)
  if (cached) return { ok: true, addresses: cached.addresses }
  const existing = addressInFlight.get(key)
  if (existing) return existing

  const task = (async (): Promise<AddressResult> => {
    const started = Date.now()
    try {
      const client = getClient(accountId)
      const collected: DepositAddressEntry[] = []

      if (
        (client.has as Record<string, boolean>)['fetchDepositAddressesByNetwork']
      ) {
        try {
          const byNet = (await withTimeout(
            (
              client as unknown as {
                fetchDepositAddressesByNetwork: (code: string) => Promise<unknown>
              }
            ).fetchDepositAddressesByNetwork(coin.toUpperCase()),
            ADDRESS_TIMEOUT_MS,
            'fetchDepositAddressesByNetwork'
          )) as unknown
          const entries: RawDeposit[] = Array.isArray(byNet)
            ? (byNet as RawDeposit[])
            : byNet && typeof byNet === 'object'
              ? (Object.values(byNet as Record<string, unknown>) as RawDeposit[])
              : []
          for (const e of entries) {
            if (!e?.address) continue
            const entryNet = e.network ?? ''
            if (sameNetworkFamily(entryNet, network)) {
              const mapped = toEntry(e)
              if (mapped) collected.push(mapped)
            }
          }
        } catch (err) {
          console.warn(
            '[exchanges] fetchDepositAddressesByNetwork failed, falling back:',
            err instanceof Error ? err.message : err
          )
        }
      }

      if (collected.length === 0) {
        const single = (await withTimeout(
          client.fetchDepositAddress(coin.toUpperCase(), { network }),
          ADDRESS_TIMEOUT_MS,
          'fetchDepositAddress'
        )) as RawDeposit
        const mapped = toEntry(single)
        if (mapped) collected.push(mapped)
      }

      const unique = dedupe(collected)
      if (unique.length === 0) {
        return { ok: false, error: 'exchange returned no address' }
      }
      cachedSetAddresses(accountId, coin, network, unique)
      console.log(
        `[exchanges] getDepositAddresses ${accountId}/${coin}/${network} ok · ${unique.length} addr · ${Date.now() - started}ms`
      )
      return { ok: true, addresses: unique }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'failed'
      console.error(
        `[exchanges] getDepositAddresses ${accountId}/${coin}/${network} FAIL · ${Date.now() - started}ms · ${message}`
      )
      return { ok: false, error: message }
    }
  })().finally(() => addressInFlight.delete(key))

  addressInFlight.set(key, task)
  return task
}

// ---------------- Deposit addresses for whitelist ----------------

/**
 * Resolve deposit addresses for the given coin/family pairs. Used by the Setup
 * tab so each exchange's whitelist section can show *other* exchanges'
 * deposit addresses for cross-exchange transfers. Pair set comes from the
 * user's prefs (editable in the UI).
 *
 * Reuses the same caches warmup already fills for popular combos, so calls
 * are usually instant; user-added combos miss cache on first fetch.
 */
export async function getDepositAddressesForPairs(
  accountId: string,
  pairs: CoinNetworkPair[]
): Promise<{
  ok: boolean
  addresses?: WhitelistDepositAddress[]
  error?: string
}> {
  try {
    const tasks = pairs.map(
      async (pair): Promise<WhitelistDepositAddress | null> => {
        const netsRes = await getNetworksForCoin(accountId, pair.coin)
        if (!netsRes.ok || !netsRes.networks) return null
        const match = netsRes.networks.find(
          (n) => n.depositEnabled && networkFamily(n.network) === pair.family
        )
        if (!match) return null
        const r = await getDepositAddresses(accountId, pair.coin, match.network)
        if (!r.ok || !r.addresses?.length) return null
        const first = r.addresses[0]
        return {
          coin: pair.coin,
          exchangeCode: match.network,
          family: pair.family,
          familyLabel: familyLabel(pair.family),
          address: first.address,
          tag: first.tag
        }
      }
    )
    const hits = (await Promise.all(tasks)).filter(
      (h): h is WhitelistDepositAddress => h !== null
    )
    // Preserve the order the user supplied; they curated it.
    const order = new Map<string, number>()
    pairs.forEach((p, i) => order.set(`${p.coin}::${p.family}`, i))
    hits.sort(
      (a, b) =>
        (order.get(`${a.coin}::${a.family}`) ?? 99) -
        (order.get(`${b.coin}::${b.family}`) ?? 99)
    )
    return { ok: true, addresses: hits }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'failed'
    return { ok: false, error: message }
  }
}

// ---------------- Preflight (CEX) ----------------

/**
 * Dry-run checks for a CEX withdrawal: no actual submit. Probes signed
 * API access, confirms the network supports the coin, amount meets minimum,
 * balance is sufficient in the withdraw-type wallet, and address format is
 * plausible for the chain.
 */
export async function preflightCexWithdraw(
  input: WithdrawInput
): Promise<PreflightResult> {
  const checks: PreflightCheck[] = []
  const info: { label: string; value: string }[] = []

  const creds = getExchangeCreds(input.accountId)
  checks.push({
    label: 'Account creds found',
    status: creds ? 'ok' : 'fail',
    detail: creds ? `${creds.exchange} · ${creds.label}` : 'vault locked?'
  })
  if (!creds) return { ok: false, checks, info }

  // Public reach.
  const publicProbe = await probeExchangeStep(creds.exchange)
  checks.push({
    label: 'Public endpoint reachable',
    status: publicProbe.status === 'ok' ? 'ok' : 'warn',
    detail: publicProbe.latencyMs
      ? `${publicProbe.latencyMs}ms`
      : publicProbe.detail
  })

  // Signed probe.
  const signed = await runSignedProbe(creds)
  checks.push({
    label: 'Signed API access',
    status: signed.status === 'ok' ? 'ok' : 'fail',
    detail: signed.latencyMs ? `${signed.latencyMs}ms` : signed.detail
  })

  // Network metadata.
  const netRes = await getNetworksForCoin(input.accountId, input.coin)
  const net = netRes.networks?.find((n) => n.network === input.network)
  checks.push({
    label: `Network ${input.network} exists for ${input.coin}`,
    status: net ? 'ok' : 'fail',
    detail: net ? net.name : 'not found in fetchCurrencies'
  })

  if (net) {
    checks.push({
      label: 'Network supports withdraw',
      status: net.withdrawEnabled ? 'ok' : 'fail',
      detail: net.withdrawEnabled ? 'enabled' : 'disabled by exchange'
    })
    checks.push({
      label: 'Amount meets minimum',
      status:
        input.amount >= (net.minWithdraw ?? 0) && input.amount > 0
          ? 'ok'
          : 'fail',
      detail: `min ${net.minWithdraw} · amount ${input.amount}`
    })
    info.push(
      { label: 'Network', value: `${input.network} · ${net.name}` },
      { label: 'Fee', value: `${net.fee} ${input.coin}` },
      { label: 'Minimum', value: `${net.minWithdraw} ${input.coin}` }
    )
  }

  // Withdraw-type balance.
  const balRes = await getBalances(input.accountId)
  const withdrawType = WITHDRAW_TYPE[creds.exchange] ?? 'spot'
  const walletAmount =
    balRes.balances
      ?.filter(
        (b) =>
          b.asset === input.coin.toUpperCase() && b.accountType === withdrawType
      )
      .reduce((s, b) => s + b.free, 0) ?? 0
  const requiredTotal = input.amount // the exchange deducts fee from this on most exchanges
  checks.push({
    label: `Balance in ${withdrawType}`,
    status: walletAmount >= requiredTotal ? 'ok' : 'fail',
    detail: `${walletAmount} available · need ${requiredTotal}`
  })

  info.push({
    label: 'Amount',
    value: `${input.amount} ${input.coin}`
  })
  info.push({
    label: 'Destination',
    value: `${input.address.slice(0, 8)}…${input.address.slice(-6)}${input.tag ? ` (tag ${input.tag})` : ''}`
  })

  const ok = checks.every((c) => c.status === 'ok' || c.status === 'warn')
  return { ok, checks, info }
}

// ---------------- Withdraw ----------------

/**
 * Map a raw error message from ccxt/exchange into a user-friendly hint.
 * Returns undefined if nothing useful to say.
 */
function hintFromError(message: string): string | undefined {
  const m = message.toLowerCase()
  if (m.includes('whitelist') || m.includes('address book') || m.includes('invalid withdrawal address') || m.includes('double check input')) {
    return 'Address must be added to the exchange withdrawal whitelist first, or check that the amount meets the minimum for this network.'
  }
  if (
    m.includes('email') &&
    (m.includes('confirm') || m.includes('verification') || m.includes('verify'))
  ) {
    return 'Check your email — the exchange sent a confirmation link you need to click before the withdrawal is processed.'
  }
  if (
    m.includes('2fa') ||
    m.includes('two-factor') ||
    m.includes('google auth')
  ) {
    return 'Two-factor authentication is required on this account. Complete 2FA on the exchange website.'
  }
  if (m.includes('api key') && m.includes('permission')) {
    return 'API key is missing the "Withdraw" permission. Edit the key on the exchange and enable withdrawals.'
  }
  if (m.includes('insufficient')) {
    return 'Not enough balance (fee is on top of the amount).'
  }
  if (m.includes('minimum')) {
    return 'Amount is below the minimum withdrawal for this network.'
  }
  if (m.includes('forbidden') || m.includes('ip')) {
    return 'IP not allowed. Check the API key IP whitelist on the exchange.'
  }
  return undefined
}

export async function submitWithdraw(
  input: WithdrawInput
): Promise<WithdrawSubmitResult> {
  const creds = getExchangeCreds(input.accountId)
  if (!creds) return { ok: false, error: 'account not found (vault locked?)' }

  // Server-side guards. The renderer enforces these too, but a compromised
  // renderer or skipped preflight must not be able to bypass them.
  if (!input.address || !isValidForNetwork(input.network, input.address)) {
    return { ok: false, error: 'destination address does not match the selected network' }
  }
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { ok: false, error: 'invalid amount' }
  }

  // Fee + min-withdraw from cached networks if available.
  const cachedNetworks = currenciesCache.get(input.accountId)
  const networkInfo = cachedNetworks
    ? sliceNetworks(cachedNetworks.data, input.coin).find(
        (n) => n.network === input.network
      )
    : undefined
  const feeFromCache = networkInfo?.fee ?? 0
  const minWithdraw = networkInfo?.minWithdraw ?? 0
  if (minWithdraw > 0 && input.amount < minWithdraw) {
    return {
      ok: false,
      error: `below minimum: ${minWithdraw} ${input.coin.toUpperCase()} on ${input.network}`
    }
  }

  const record = await addPendingWithdrawal({
    exchangeAccountId: input.accountId,
    exchangeLabel: creds.label,
    exchangeId: creds.exchange,
    coin: input.coin.toUpperCase(),
    network: input.network,
    amount: input.amount,
    fee: feeFromCache,
    address: input.address,
    tag: input.tag,
    destLabel: input.destLabel
  })

  // Phemex: use custom API client for withdrawal.
  if (creds.exchange === 'phemex') {
    try {
      console.log(
        `[phemex] withdraw ${input.coin} → ${mask(input.address)} via ${input.network}`
      )
      const res = await phemexApi.createWithdraw(
        creds, input.coin, input.address, input.amount, input.network, input.tag
      )
      await updateWithdrawal(record.id, {
        status: 'pending',
        exchangeTxId: res.id
      })
      balanceCache.delete(input.accountId)
      return { ok: true, recordId: record.id }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'failed'
      const hint = hintFromError(message)
      await updateWithdrawal(record.id, { status: 'failed', error: message, hint })
      console.error(`[phemex] withdraw FAIL · ${message}`)
      return { ok: false, error: message, hint }
    }
  }

  try {
    const client = getClient(input.accountId)
    console.log(
      `[exchanges] withdraw ${input.accountId} · ${input.coin} → ${mask(input.address)} via ${input.network}`
    )
    const res = (await withTimeout(
      client.withdraw(
        input.coin.toUpperCase(),
        input.amount,
        input.address,
        input.tag,
        { network: input.network }
      ),
      WITHDRAW_TIMEOUT_MS,
      'withdraw'
    )) as { id?: string; txid?: string; info?: Record<string, unknown> }

    const exchangeTxId =
      (typeof res.id === 'string' && res.id) ||
      (typeof res.txid === 'string' && res.txid) ||
      undefined

    await updateWithdrawal(record.id, {
      status: 'pending',
      exchangeTxId
    })
    balanceCache.delete(input.accountId)
    return { ok: true, recordId: record.id }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'failed'
    const hint = hintFromError(message)
    await updateWithdrawal(record.id, {
      status: 'failed',
      error: message,
      hint
    })
    console.error(
      `[exchanges] withdraw ${input.accountId} FAIL · ${message}`
    )
    return { ok: false, error: message, hint }
  }
}

/**
 * Look up a deposit on a CEX by on-chain tx hash. Used to flip the status
 * of an EVM→CEX transfer from 'processing' → 'ok' once the exchange credits
 * it. Returns null if the exchange has no fetchDeposits, the deposit isn't
 * visible yet, or on any error.
 */
export async function findCexDepositByTx(
  accountId: string,
  coin: string,
  txHash: string
): Promise<'ok' | 'processing' | null> {
  try {
    const client = getClient(accountId)
    if (!(client.has as Record<string, boolean>)['fetchDeposits']) return null
    const since = Date.now() - 24 * 60 * 60 * 1000 // last 24h
    const list = (await withTimeout(
      client.fetchDeposits(coin.toUpperCase(), since, 50),
      ADDRESS_TIMEOUT_MS,
      'fetchDeposits'
    )) as Array<{
      txid?: string | null
      status?: string
    }>
    const target = txHash.toLowerCase()
    const match = list.find(
      (d) => typeof d.txid === 'string' && d.txid.toLowerCase() === target
    )
    if (!match) return null
    const raw = (match.status ?? '').toLowerCase()
    if (['ok', 'done', 'success', 'credited', 'confirmed'].includes(raw))
      return 'ok'
    return 'processing'
  } catch (err) {
    console.warn(
      `[exchanges] findCexDepositByTx ${accountId}/${coin}/${txHash} failed:`,
      err instanceof Error ? err.message : err
    )
    return null
  }
}

/**
 * Called by the withdrawals poller to refresh a single in-flight withdrawal.
 */
export async function fetchWithdrawalStatus(
  accountId: string,
  exchangeTxId: string,
  coin: string
): Promise<{
  status: WithdrawStatus
  chainTxHash?: string
  error?: string
} | null> {
  // Phemex: use custom API client for status polling.
  const creds = getExchangeCreds(accountId)
  if (creds?.exchange === 'phemex') {
    try {
      const result = await phemexApi.getWithdrawStatus(creds, exchangeTxId, coin)
      if (!result) return null
      return {
        status: phemexApi.mapPhemexStatus(result.status),
        chainTxHash: result.txHash
      }
    } catch {
      return null
    }
  }

  try {
    const client = getClient(accountId)
    // ccxt: `fetchWithdrawal(id, code)` or fall back to `fetchWithdrawals(code)`.
    type Hit = {
      id?: string
      txid?: string | null
      status?: string
    }
    let hit: Hit | null = null
    if ((client.has as Record<string, boolean>)['fetchWithdrawal']) {
      const r = (await withTimeout(
        (
          client as unknown as {
            fetchWithdrawal: (id: string, code: string) => Promise<unknown>
          }
        ).fetchWithdrawal(exchangeTxId, coin.toUpperCase()),
        ADDRESS_TIMEOUT_MS,
        'fetchWithdrawal'
      )) as Hit
      hit = r
    } else if ((client.has as Record<string, boolean>)['fetchWithdrawals']) {
      const list = (await withTimeout(
        client.fetchWithdrawals(coin.toUpperCase(), undefined, 20),
        ADDRESS_TIMEOUT_MS,
        'fetchWithdrawals'
      )) as Hit[]
      hit = list.find((r) => r.id === exchangeTxId) ?? null
    } else {
      return null
    }
    if (!hit) return null
    const raw = (hit.status ?? '').toLowerCase()
    const status: WithdrawStatus =
      raw === 'ok' || raw === 'done' || raw === 'success'
        ? 'ok'
        : raw === 'failed' || raw === 'canceled' || raw === 'cancelled'
          ? 'failed'
          : raw === 'pending' || raw === 'submitting'
            ? 'pending'
            : 'processing'
    return { status, chainTxHash: hit.txid ?? undefined }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'failed'
    console.warn(
      `[exchanges] fetchWithdrawalStatus ${accountId}/${exchangeTxId} failed: ${message}`
    )
    return null
  }
}

// ---------------- Internal transfer ----------------

export async function transferInternal(
  input: InternalTransferInput
): Promise<InternalTransferResult> {
  const creds = getExchangeCreds(input.accountId)
  if (!creds) return { ok: false, error: 'account not found (vault locked?)' }
  if (input.fromType === input.toType) {
    return { ok: false, error: 'source and destination type are the same' }
  }
  if (input.amount <= 0) {
    return { ok: false, error: 'amount must be > 0' }
  }
  try {
    const client = getClient(input.accountId)
    const fromCcxt = ccxtTransferType(creds.exchange, input.fromType)
    const toCcxt = ccxtTransferType(creds.exchange, input.toType)
    console.log(
      `[exchanges] transfer ${input.accountId} · ${input.amount} ${input.coin}: ${input.fromType} → ${input.toType}` +
        (fromCcxt !== input.fromType || toCcxt !== input.toType
          ? ` (ccxt: ${fromCcxt} → ${toCcxt})`
          : '')
    )
    await withTimeout(
      client.transfer(
        input.coin.toUpperCase(),
        input.amount,
        fromCcxt,
        toCcxt
      ),
      ADDRESS_TIMEOUT_MS,
      'transfer'
    )
    // Force next balance read to be fresh; skip TTL.
    balanceCache.delete(input.accountId)
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'failed'
    const hint = hintFromError(message)
    console.error(
      `[exchanges] transfer ${input.accountId} FAIL · ${message}`
    )
    return { ok: false, error: message, hint }
  }
}

// ---------------- Warmup ----------------

/**
 * Fire-and-forget background prefetch of balances, currencies and a handful of
 * common deposit addresses for every configured CEX account. Reduces wait
 * times for the user's next click to ~0.
 */
export async function warmup(): Promise<{ started: number }> {
  let accounts: ReturnType<typeof listExchangeAccounts>
  try {
    accounts = listExchangeAccounts()
  } catch {
    return { started: 0 }
  }
  let started = 0
  for (const acc of accounts) {
    started++
    // Balances
    getBalances(acc.accountId, { forceRefresh: true }).catch(() => undefined)
    // Currencies (populates per-coin network slices)
    loadCurrencies(acc.accountId)
      .then(() => {
        // Popular deposit addresses, per coin.
        for (const coin of PREFETCH_COINS) {
          const networks = PREFETCH_NETWORKS_BY_COIN[coin]
          if (!networks) continue
          // Pull the account's *actual* network codes for this coin so we
          // pre-fetch using the right code on this exchange (e.g. "BEP20"
          // vs "BSC").
          const slice = sliceNetworks(
            currenciesCache.get(acc.accountId)?.data ?? {},
            coin
          )
          const supportedCodes = slice
            .filter((n) => n.depositEnabled)
            .map((n) => n.network)
          for (const target of networks) {
            const match = supportedCodes.find((c) =>
              sameNetworkFamily(c, target)
            )
            if (!match) continue
            getDepositAddresses(acc.accountId, coin, match).catch(
              () => undefined
            )
          }
        }
      })
      .catch((err) => {
        console.warn(
          `[exchanges] warmup currencies ${acc.accountId} failed:`,
          err instanceof Error ? err.message : err
        )
      })
  }
  console.log(`[exchanges] warmup kicked for ${started} account(s)`)
  return { started }
}
