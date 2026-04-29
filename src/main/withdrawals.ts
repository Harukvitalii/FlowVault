import { app, BrowserWindow } from 'electron'
import { chmod, readFile, rename, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { findChainByShort } from './evm'
import type { WithdrawRecord, WithdrawStatus } from '../shared/types'

const FILE = 'withdrawals.json'
const POLL_INTERVAL_MS = 5_000
const POLL_MAX_AGE_MS = 24 * 60 * 60 * 1000 // 24h — stop polling after

let records: WithdrawRecord[] = []
let loadPromise: Promise<void> | null = null
let writeTimer: NodeJS.Timeout | null = null
let pollTimer: NodeJS.Timeout | null = null

type StatusUpdate = {
  status: WithdrawStatus
  chainTxHash?: string
  error?: string
  hint?: string
}

type FetchStatusFn = (rec: WithdrawRecord) => Promise<StatusUpdate | null>

let fetchStatus: FetchStatusFn | null = null

/** Wire the poller to a dispatcher that picks the right fetcher by kind. */
export function setStatusFetcher(fn: FetchStatusFn) {
  fetchStatus = fn
}

const filePath = () => join(app.getPath('userData'), FILE)

function migrateRecord(r: WithdrawRecord): WithdrawRecord {
  if (r.kind) return r
  const isEvmHash =
    typeof r.exchangeTxId === 'string' &&
    r.exchangeTxId.startsWith('0x') &&
    r.exchangeTxId.length === 66
  const looksEvm = r.exchangeLabel === 'EVM wallet' || isEvmHash
  if (looksEvm) {
    const chain = findChainByShort(r.network)
    return {
      ...r,
      kind: 'evm',
      chainId: r.chainId ?? chain?.chainId,
      chainTxHash: r.chainTxHash ?? (isEvmHash ? r.exchangeTxId : undefined)
    }
  }
  return { ...r, kind: 'cex' }
}

async function load() {
  if (loadPromise) return loadPromise
  loadPromise = (async () => {
    if (!existsSync(filePath())) return
    try {
      const raw = await readFile(filePath(), 'utf8')
      const parsed = JSON.parse(raw) as WithdrawRecord[]
      if (Array.isArray(parsed)) {
        records = parsed.map(migrateRecord)
        const migrated = records.filter((r, i) => r !== parsed[i]).length
        if (migrated > 0) {
          console.log(`[withdrawals] migrated ${migrated} legacy record(s)`)
          scheduleWrite()
        }
      }
    } catch (err) {
      console.warn(
        '[withdrawals] load failed:',
        err instanceof Error ? err.message : err
      )
    }
  })()
  return loadPromise
}

function scheduleWrite() {
  if (writeTimer) clearTimeout(writeTimer)
  writeTimer = setTimeout(() => {
    writeTimer = null
    const tmp = filePath() + '.tmp'
    writeFile(tmp, JSON.stringify(records), { mode: 0o600 })
      .then(() => rename(tmp, filePath()))
      .then(() => chmod(filePath(), 0o600).catch(() => undefined))
      .catch((err) => {
        console.warn(
          '[withdrawals] write failed:',
          err instanceof Error ? err.message : err
        )
      })
  }, 500)
}

function broadcast() {
  const snapshot = records.slice()
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('withdrawals:updated', snapshot)
  }
}

export async function list(): Promise<WithdrawRecord[]> {
  await load()
  return records
    .slice()
    .sort((a, b) => b.submittedAt - a.submittedAt)
}

export async function clear(): Promise<{ ok: boolean }> {
  await load()
  records = []
  scheduleWrite()
  broadcast()
  return { ok: true }
}

export async function remove(id: string): Promise<{ ok: boolean }> {
  await load()
  const before = records.length
  records = records.filter((r) => r.id !== id)
  if (records.length === before) return { ok: false }
  scheduleWrite()
  broadcast()
  return { ok: true }
}

export async function addPending(
  rec: Omit<WithdrawRecord, 'id' | 'submittedAt' | 'updatedAt' | 'status' | 'kind'> & {
    kind?: WithdrawRecord['kind']
  }
): Promise<WithdrawRecord> {
  await load()
  const now = Date.now()
  const full: WithdrawRecord = {
    ...rec,
    kind: rec.kind ?? 'cex',
    id: randomUUID(),
    submittedAt: now,
    updatedAt: now,
    status: 'submitting'
  }
  records.unshift(full)
  scheduleWrite()
  broadcast()
  return full
}

export async function update(
  id: string,
  patch: Partial<WithdrawRecord>
): Promise<WithdrawRecord | null> {
  await load()
  const i = records.findIndex((r) => r.id === id)
  if (i < 0) return null
  const curr = records[i]!
  const merged: WithdrawRecord = {
    ...curr,
    ...patch,
    id: curr.id,
    submittedAt: curr.submittedAt,
    updatedAt: Date.now()
  }
  records[i] = merged
  scheduleWrite()
  broadcast()
  return merged
}

async function runPoll() {
  if (!fetchStatus) return
  await load()
  const now = Date.now()
  const active = records.filter(
    (r) =>
      (r.status === 'pending' || r.status === 'processing' || r.status === 'submitting') &&
      now - r.submittedAt < POLL_MAX_AGE_MS
  )
  if (active.length === 0) return
  for (const r of active) {
    try {
      const result = await fetchStatus(r)
      if (!result) continue
      const patch: Partial<WithdrawRecord> = { status: result.status }
      if (result.chainTxHash) patch.chainTxHash = result.chainTxHash
      if (result.error !== undefined) patch.error = result.error
      if (result.hint !== undefined) patch.hint = result.hint
      if (
        patch.status !== r.status ||
        patch.chainTxHash !== r.chainTxHash ||
        patch.error !== r.error ||
        patch.hint !== r.hint
      ) {
        await update(r.id, patch)
      }
    } catch (err) {
      console.warn(
        `[withdrawals] poll ${r.id} failed:`,
        err instanceof Error ? err.message : err
      )
    }
  }
}

export function startPoller() {
  if (pollTimer) return
  pollTimer = setInterval(() => {
    runPoll().catch(() => undefined)
  }, POLL_INTERVAL_MS)
  // Kick immediately so users don't wait for first update.
  setTimeout(() => runPoll().catch(() => undefined), 1000)
}

export function stopPoller() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

/** Remove the on-disk history file (called during vault wipe). */
export async function wipeHistory(): Promise<void> {
  if (existsSync(filePath())) {
    const { unlink } = await import('node:fs/promises')
    await unlink(filePath())
  }
  records = []
  loadPromise = null
}
