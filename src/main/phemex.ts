/**
 * Custom Phemex REST client for deposit/withdraw operations.
 * Bypasses ccxt for networks, deposit addresses, and withdrawals
 * because ccxt's phemex driver doesn't populate network info.
 * ccxt is still used for balances (fetchBalance works fine).
 */

import { createHmac } from 'node:crypto'
import type { DepositAddressEntry, NetworkInfo } from '../shared/types'

const BASE = 'https://api.phemex.com'
const TIMEOUT_MS = 15_000

type Creds = {
  apiKey: string
  secret: string
}

type PhemexResponse<T> = {
  code: number
  msg: string
  data: T
}

// ---- Signing ----

function sign(
  creds: Creds,
  path: string,
  queryString: string,
  body: string
): { expiry: string; signature: string } {
  const expiry = String(Math.floor(Date.now() / 1000) + 60)
  const payload = path + queryString + expiry + body
  const signature = createHmac('sha256', creds.secret)
    .update(payload)
    .digest('hex')
  return { expiry, signature }
}

async function request<T>(
  creds: Creds,
  method: 'GET' | 'POST',
  path: string,
  params?: Record<string, string>
): Promise<T> {
  let qs = ''
  let body = ''

  if (method === 'GET' && params) {
    // GET: params go in query string
    qs = Object.entries(params)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&')
  } else if (method === 'POST' && params) {
    // POST: params go in JSON body (matching ccxt's signing convention)
    body = JSON.stringify(params)
  }

  const { expiry, signature } = sign(creds, path, qs, body)

  const url = `${BASE}${path}${qs ? '?' + qs : ''}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method,
      headers: {
        'x-phemex-access-token': creds.apiKey,
        'x-phemex-request-expiry': expiry,
        'x-phemex-request-signature': signature,
        'Content-Type': 'application/json'
      },
      body: body || undefined,
      signal: controller.signal
    })
    const json = (await res.json()) as PhemexResponse<T>
    if (json.code !== 0) {
      throw new Error(`phemex ${JSON.stringify(json)}`)
    }
    return json.data
  } finally {
    clearTimeout(timer)
  }
}

// ---- Chain Config (networks for deposit) ----

type DepositChainCfg = {
  currency: string
  currencyCode: number
  minAmountRv: string
  confirmations: number
  chainCode: number
  chainName: string
  status: string // 'Active' | 'Suspend'
  contractAddress: string | null
}

export async function getDepositChains(
  creds: Creds,
  currency: string
): Promise<NetworkInfo[]> {
  const data = await request<DepositChainCfg[]>(
    creds,
    'GET',
    '/phemex-deposit/wallets/api/chainCfg',
    { currency: currency.toUpperCase() }
  )
  return data.map((c) => ({
    network: c.chainName,
    name: c.chainName,
    fee: 0,
    minWithdraw: 0,
    minDeposit: parseFloat(c.minAmountRv) || 0,
    withdrawEnabled: false, // deposit chains only — withdraw info comes from asset/info
    depositEnabled: c.status === 'Active',
    estMinutes: 0
  }))
}

// ---- Withdraw Chain Config (networks for withdrawal with fees) ----

type WithdrawChainInfo = {
  chainCode: number
  chainName: string
  status: string // 'Active' | 'Suspend'
  contractAddress: string | null
  minWithdrawAmountRv: string
  minWithdrawAmountWithFeeRv: string
  withdrawFeeRv: string
  receiveAmountRv: string
}

type WithdrawAssetInfo = {
  currency: string
  currencyCode: number
  balanceRv: string
  allAvailableBalanceRv: string
  chainInfos: WithdrawChainInfo[]
}

export async function getWithdrawChains(
  creds: Creds,
  currency: string
): Promise<NetworkInfo[]> {
  const data = await request<WithdrawAssetInfo>(
    creds,
    'GET',
    '/phemex-withdraw/wallets/api/asset/info',
    { currency: currency.toUpperCase() }
  )
  return data.chainInfos.map((c) => ({
    network: c.chainName,
    name: c.chainName,
    fee: parseFloat(c.withdrawFeeRv) || 0,
    minWithdraw: parseFloat(c.minWithdrawAmountRv) || 0,
    minDeposit: 0,
    withdrawEnabled: c.status === 'Active',
    depositEnabled: false, // withdraw chains only — deposit info comes from chainCfg
    estMinutes: 0
  }))
}

/**
 * Merged deposit+withdraw chain info for a coin.
 * Combines deposit chains (from chainCfg) with withdraw chains (from asset/info).
 */
export async function getNetworks(
  creds: Creds,
  currency: string
): Promise<NetworkInfo[]> {
  const [depositChains, withdrawChains] = await Promise.all([
    getDepositChains(creds, currency).catch(() => [] as NetworkInfo[]),
    getWithdrawChains(creds, currency).catch(() => [] as NetworkInfo[])
  ])

  // Merge by chainName
  const byName = new Map<string, NetworkInfo>()
  for (const d of depositChains) {
    byName.set(d.network, { ...d })
  }
  for (const w of withdrawChains) {
    const existing = byName.get(w.network)
    if (existing) {
      existing.fee = w.fee
      existing.minWithdraw = w.minWithdraw
      existing.withdrawEnabled = w.withdrawEnabled
    } else {
      byName.set(w.network, { ...w })
    }
  }

  return Array.from(byName.values())
    .filter((n) => n.withdrawEnabled || n.depositEnabled)
    .sort((a, b) => a.network.localeCompare(b.network))
}

// ---- Deposit Address ----

type DepositAddressResponse = {
  address: string
  tag: string
}

export async function getDepositAddress(
  creds: Creds,
  currency: string,
  chainName: string
): Promise<DepositAddressEntry | null> {
  const data = await request<DepositAddressResponse>(
    creds,
    'GET',
    '/phemex-deposit/wallets/api/depositAddress',
    { currency: currency.toUpperCase(), chainName }
  )
  if (!data.address) return null
  return {
    address: data.address,
    tag: data.tag || undefined
  }
}

// ---- Deposit History ----

type DepositHistEntry = {
  id: number
  address: string
  amountEv: number
  chainName: string
  currency: string
  createdAt: number
  status: string
  txHash: string | null
}

export type PhemexDeposit = {
  id: string
  address: string
  amount: number
  chainName: string
  currency: string
  createdAt: number
  status: string
  txHash: string | null
}

export async function getDepositHistory(
  creds: Creds
): Promise<PhemexDeposit[]> {
  const data = await request<DepositHistEntry[]>(
    creds,
    'GET',
    '/phemex-deposit/wallets/api/depositHist',
    { limit: '50' }
  )
  return data.map((d) => ({
    id: String(d.id),
    address: d.address,
    amount: d.amountEv / 1e8, // Phemex uses 8-decimal scaling
    chainName: d.chainName,
    currency: d.currency,
    createdAt: d.createdAt,
    status: d.status,
    txHash: d.txHash
  }))
}

// ---- Create Withdrawal ----

type WithdrawResponse = {
  id: number
  address: string
  amountRv: string
  chainName: string
  currency: string
  feeRv: string
  status: string
  submitedAt: number
  txHash: string | null
}

export async function createWithdraw(
  creds: Creds,
  currency: string,
  address: string,
  amount: number,
  chainName: string,
  addressTag?: string
): Promise<{ id: string; status: string }> {
  const params: Record<string, string> = {
    currency: currency.toUpperCase(),
    address,
    amount: amount.toFixed(8).replace(/\.?0+$/, ''),
    chainName
  }
  if (addressTag) params.addressTag = addressTag

  const data = await request<WithdrawResponse>(
    creds,
    'POST',
    '/phemex-withdraw/wallets/api/createWithdraw',
    params
  )
  return { id: String(data.id), status: data.status }
}

// ---- Withdrawal Status ----

type WithdrawHistEntry = {
  id: number
  address: string
  amountEv: number
  chainName: string
  currency: string
  feeEv: number
  txHash: string | null
  status: string
  submitedAt: number
}

export async function getWithdrawStatus(
  creds: Creds,
  withdrawId: string,
  currency: string
): Promise<{ status: string; txHash?: string } | null> {
  const data = await request<WithdrawHistEntry[]>(
    creds,
    'GET',
    '/phemex-withdraw/wallets/api/withdrawHist',
    { currency: currency.toUpperCase(), limit: '50' }
  )
  const match = data.find((w) => String(w.id) === withdrawId)
  if (!match) return null
  return {
    status: match.status,
    txHash: match.txHash ?? undefined
  }
}

/**
 * Map Phemex withdrawal status strings to our WithdrawStatus type.
 */
export function mapPhemexStatus(
  raw: string
): 'pending' | 'processing' | 'ok' | 'failed' {
  const s = raw.toLowerCase()
  if (s === 'success' || s === 'succeed') return 'ok'
  if (s === 'rejected' || s === 'security check failed' || s === 'expired' || s === 'cancelled')
    return 'failed'
  if (s === 'pending transfer') return 'processing'
  return 'pending'
}
