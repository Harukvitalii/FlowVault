/**
 * Deposit monitor — polls all CEX exchanges for recent deposits,
 * persists to disk, and broadcasts to the renderer.
 * Only fetches new deposits from the API; known records are served from disk.
 */

import { app, BrowserWindow } from 'electron'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { getExchangeCreds, listExchanges } from './vault'
import { getPrefs } from './prefs'
import type { DepositRecord, DepositStatus, ExchangeId } from '../shared/types'
import type { Exchange } from 'ccxt'

const FILE = 'deposits.json'
const POLL_INTERVAL_MS = 30_000
const LOOKBACK_MS = 48 * 60 * 60 * 1000 // 48h
const MAX_RECORDS = 1000

let records: DepositRecord[] = []
let loaded = false
let pollTimer: NodeJS.Timeout | null = null
let writeTimer: NodeJS.Timeout | null = null
let getClientFn: ((accountId: string) => Exchange) | null = null

const filePath = () => join(app.getPath('userData'), FILE)

export function setClientGetter(fn: (accountId: string) => Exchange) {
  getClientFn = fn
}

// ---- Persistence ----

async function load() {
  if (loaded) return
  loaded = true
  if (!existsSync(filePath())) return
  try {
    const raw = await readFile(filePath(), 'utf8')
    const parsed = JSON.parse(raw) as DepositRecord[]
    if (Array.isArray(parsed)) records = parsed
  } catch (err) {
    console.warn('[deposits] load failed:', err instanceof Error ? err.message : err)
  }
}

function scheduleWrite() {
  if (writeTimer) clearTimeout(writeTimer)
  writeTimer = setTimeout(() => {
    writeTimer = null
    const tmp = filePath() + '.tmp'
    writeFile(tmp, JSON.stringify(records))
      .then(() => rename(tmp, filePath()))
      .catch((err) => {
        console.warn('[deposits] write failed:', err instanceof Error ? err.message : err)
      })
  }, 2000)
}

function broadcast() {
  const snapshot = records.slice()
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('deposits:updated', snapshot)
  }
}

// ---- Status mapping ----

function mapStatus(raw: string): DepositStatus {
  const s = raw.toLowerCase()
  if (['ok', 'done', 'success', 'credited', 'confirmed'].includes(s)) return 'ok'
  if (['processing', 'confirming'].includes(s)) return 'processing'
  return 'pending'
}

function mapPhemexDepositStatus(raw: string): DepositStatus {
  const s = raw.toLowerCase()
  if (s === 'success' || s === 'confirmed') return 'ok'
  if (s === 'securitychecking' || s === 'amlcsapprove') return 'processing'
  return 'pending'
}

// ---- Polling ----

async function pollAccount(
  accountId: string,
  label: string,
  exchangeId: ExchangeId
): Promise<DepositRecord[]> {
  if (exchangeId === 'phemex') return pollPhemex(accountId, label)
  if (!getClientFn) return []

  const client = getClientFn(accountId)
  if (!(client.has as Record<string, boolean>)['fetchDeposits']) return []

  const since = Date.now() - LOOKBACK_MS
  const raw = (await client.fetchDeposits(undefined, since, 100)) as Array<{
    id?: string
    txid?: string | null
    currency?: string
    amount?: number
    address?: string
    network?: string
    status?: string
    timestamp?: number
  }>

  const now = Date.now()
  return raw
    .filter((d) => d.currency && d.amount && d.amount > 0)
    .map((d) => ({
      id: `dep-${accountId}-${d.id ?? d.txid ?? d.timestamp ?? now}`,
      exchangeAccountId: accountId,
      exchangeLabel: label,
      exchangeId,
      coin: (d.currency ?? '').toUpperCase(),
      network: d.network ?? '',
      amount: d.amount ?? 0,
      address: d.address ?? '',
      txHash: d.txid ?? undefined,
      status: mapStatus(d.status ?? 'pending'),
      depositedAt: d.timestamp ?? now,
      firstSeenAt: now
    }))
}

async function pollPhemex(accountId: string, label: string): Promise<DepositRecord[]> {
  const creds = getExchangeCreds(accountId)
  if (!creds) return []
  try {
    const phemexApi = await import('./phemex')
    const data = await phemexApi.getDepositHistory(creds)
    const now = Date.now()
    const cutoff = now - LOOKBACK_MS
    return data
      .filter((d) => d.createdAt >= cutoff && d.amount > 0)
      .map((d) => ({
        id: `dep-${accountId}-${d.id}`,
        exchangeAccountId: accountId,
        exchangeLabel: label,
        exchangeId: 'phemex' as ExchangeId,
        coin: d.currency.toUpperCase(),
        network: d.chainName,
        amount: d.amount,
        address: d.address,
        txHash: d.txHash ?? undefined,
        status: mapPhemexDepositStatus(d.status),
        depositedAt: d.createdAt,
        firstSeenAt: now
      }))
  } catch (err) {
    console.warn(`[deposits] phemex ${accountId} failed:`, err instanceof Error ? err.message : err)
    return []
  }
}

async function runPoll() {
  await load()
  const prefs = await getPrefs()
  if (prefs.depositsEnabled === false) {
    if (records.length > 0) {
      records = []
      scheduleWrite()
      broadcast()
    }
    return
  }

  let accounts: ReturnType<typeof listExchanges>
  try {
    accounts = listExchanges()
  } catch {
    return
  }

  const knownIds = new Set(records.map((r) => r.id))
  let changed = false

  for (const acc of accounts) {
    const creds = getExchangeCreds(acc.accountId)
    if (!creds) continue
    try {
      const fresh = await pollAccount(acc.accountId, acc.label, creds.exchange)
      for (const d of fresh) {
        const existing = records.find((r) => r.id === d.id)
        if (!existing) {
          // New deposit
          records.unshift(d)
          changed = true
        } else if (existing.status !== d.status) {
          // Status updated
          existing.status = d.status
          if (d.txHash) existing.txHash = d.txHash
          changed = true
        }
      }
    } catch (err) {
      console.warn(
        `[deposits] ${acc.accountId} (${creds.exchange}) failed:`,
        err instanceof Error ? err.message : err
      )
    }
  }

  // Prune old records beyond max
  if (records.length > MAX_RECORDS) {
    records = records.slice(0, MAX_RECORDS)
    changed = true
  }

  if (changed) {
    records.sort((a, b) => b.depositedAt - a.depositedAt)
    scheduleWrite()
    broadcast()
  }
}

// ---- Public API ----

export async function list(): Promise<DepositRecord[]> {
  await load()
  return records.slice().sort((a, b) => b.depositedAt - a.depositedAt)
}

export function startPoller() {
  if (pollTimer) return
  pollTimer = setInterval(() => {
    runPoll().catch(() => undefined)
  }, POLL_INTERVAL_MS)
  setTimeout(() => runPoll().catch(() => undefined), 5000)
}

export function stopPoller() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

export async function wipeDeposits(): Promise<void> {
  records = []
  loaded = false
  if (existsSync(filePath())) {
    const { unlink } = await import('node:fs/promises')
    await unlink(filePath())
  }
}
