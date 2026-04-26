import { app } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type {
  DepositAddressEntry,
  NetworkInfo
} from '../shared/types'

/**
 * Plain-JSON disk persistence for two non-sensitive caches:
 *  - Per-account list of networks, keyed by coin
 *  - Per-account deposit addresses, keyed by coin+network
 *
 * Loaded once at startup, written after any mutation (debounced 2s).
 * Expired entries are dropped on load so memory starts clean.
 */

const CACHE_FILE = 'exchange-cache.json'
const WRITE_DEBOUNCE_MS = 2000
const NETWORKS_TTL_MS = 5 * 60 * 1000
const ADDRESS_TTL_MS = 10 * 60 * 1000

type NetEntry = { ts: number; data: NetworkInfo[] }
type AddrEntry = { ts: number; addresses: DepositAddressEntry[] }

type Blob = {
  version: 1
  networks: Record<string, NetEntry> // key: accountId::COIN
  addresses: Record<string, AddrEntry> // key: accountId::COIN::NETWORK
}

const empty = (): Blob => ({ version: 1, networks: {}, addresses: {} })

let inMem: Blob = empty()
let writeTimer: NodeJS.Timeout | null = null

const cachePath = () => join(app.getPath('userData'), CACHE_FILE)

export async function loadFromDisk(): Promise<void> {
  const path = cachePath()
  if (!existsSync(path)) return
  try {
    const raw = await readFile(path, 'utf8')
    const parsed = JSON.parse(raw) as Partial<Blob>
    if (parsed?.version !== 1) return
    const now = Date.now()
    const next = empty()
    for (const [k, v] of Object.entries(parsed.networks ?? {})) {
      if (v && now - v.ts < NETWORKS_TTL_MS && Array.isArray(v.data)) {
        next.networks[k] = v
      }
    }
    for (const [k, v] of Object.entries(parsed.addresses ?? {})) {
      if (v && now - v.ts < ADDRESS_TTL_MS && Array.isArray(v.addresses)) {
        next.addresses[k] = v
      }
    }
    inMem = next
    const keptNetworks = Object.keys(inMem.networks).length
    const keptAddresses = Object.keys(inMem.addresses).length
    console.log(
      `[cache-store] loaded from disk · ${keptNetworks} networks · ${keptAddresses} addresses`
    )
  } catch (err) {
    console.warn(
      '[cache-store] failed to load:',
      err instanceof Error ? err.message : err
    )
  }
}

function scheduleWrite() {
  if (writeTimer) clearTimeout(writeTimer)
  writeTimer = setTimeout(() => {
    writeTimer = null
    const snapshot = JSON.stringify(inMem)
    writeFile(cachePath(), snapshot).catch((err) => {
      console.warn(
        '[cache-store] write failed:',
        err instanceof Error ? err.message : err
      )
    })
  }, WRITE_DEBOUNCE_MS)
}

export function getNetworks(accountId: string, coin: string): NetEntry | null {
  const key = `${accountId}::${coin.toUpperCase()}`
  const e = inMem.networks[key]
  if (!e) return null
  if (Date.now() - e.ts >= NETWORKS_TTL_MS) {
    delete inMem.networks[key]
    scheduleWrite()
    return null
  }
  return e
}

export function setNetworks(
  accountId: string,
  coin: string,
  data: NetworkInfo[]
) {
  const key = `${accountId}::${coin.toUpperCase()}`
  inMem.networks[key] = { ts: Date.now(), data }
  scheduleWrite()
}

export function getAddresses(
  accountId: string,
  coin: string,
  network: string
): AddrEntry | null {
  const key = `${accountId}::${coin.toUpperCase()}::${network}`
  const e = inMem.addresses[key]
  if (!e) return null
  if (Date.now() - e.ts >= ADDRESS_TTL_MS) {
    delete inMem.addresses[key]
    scheduleWrite()
    return null
  }
  return e
}

export function setAddresses(
  accountId: string,
  coin: string,
  network: string,
  addresses: DepositAddressEntry[]
) {
  const key = `${accountId}::${coin.toUpperCase()}::${network}`
  inMem.addresses[key] = { ts: Date.now(), addresses }
  scheduleWrite()
}

export function purgeAccount(accountId: string) {
  const prefix = `${accountId}::`
  let changed = false
  for (const k of Object.keys(inMem.networks)) {
    if (k.startsWith(prefix)) {
      delete inMem.networks[k]
      changed = true
    }
  }
  for (const k of Object.keys(inMem.addresses)) {
    if (k.startsWith(prefix)) {
      delete inMem.addresses[k]
      changed = true
    }
  }
  if (changed) scheduleWrite()
}

export function purgeAll() {
  inMem = empty()
  scheduleWrite()
}

/** Remove the on-disk cache file entirely (called during vault wipe). */
export async function wipeDiskCache(): Promise<void> {
  const path = cachePath()
  if (existsSync(path)) {
    const { unlink } = await import('node:fs/promises')
    await unlink(path)
  }
  inMem = empty()
}
