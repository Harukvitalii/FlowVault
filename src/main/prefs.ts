import { app } from 'electron'
import { existsSync } from 'node:fs'
import { chmod, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { CoinNetworkPair, UserPrefs } from '../shared/types'

const FILE = 'prefs.json'

const DEFAULT_SELECTION: CoinNetworkPair[] = [
  { coin: 'USDT', family: 'TRX' },
  { coin: 'USDT', family: 'BSC' },
  { coin: 'USDT', family: 'ETH' },
  { coin: 'USDT', family: 'ARB' },
  { coin: 'USDT', family: 'BASE' },
  { coin: 'USDT', family: 'SOL' },
  { coin: 'USDC', family: 'ETH' },
  { coin: 'USDC', family: 'BASE' },
  { coin: 'USDC', family: 'ARB' },
  { coin: 'USDC', family: 'SOL' },
  { coin: 'USDC', family: 'BSC' },
  { coin: 'USDT', family: 'APT' },
  { coin: 'USDC', family: 'APT' },
  { coin: 'ETH', family: 'ETH' },
  { coin: 'ETH', family: 'ARB' },
  { coin: 'ETH', family: 'BASE' },
  { coin: 'ETH', family: 'OP' },
  { coin: 'BTC', family: 'BTC' }
]

let cached: UserPrefs | null = null

const filePath = () => join(app.getPath('userData'), FILE)

function defaultPrefs(): UserPrefs {
  return { whitelistSelection: DEFAULT_SELECTION.slice() }
}

function sanitize(raw: unknown): UserPrefs {
  const out = defaultPrefs()
  if (!raw || typeof raw !== 'object') return out
  const sel = (raw as { whitelistSelection?: unknown }).whitelistSelection
  if (!Array.isArray(sel)) return out
  const cleaned = sel
    .filter(
      (p): p is CoinNetworkPair =>
        !!p &&
        typeof (p as CoinNetworkPair).coin === 'string' &&
        typeof (p as CoinNetworkPair).family === 'string'
    )
    .map((p) => ({ coin: p.coin.toUpperCase(), family: p.family.toUpperCase() }))
  // De-dupe by coin::family.
  const seen = new Set<string>()
  const unique: CoinNetworkPair[] = []
  for (const p of cleaned) {
    const key = `${p.coin}::${p.family}`
    if (!seen.has(key)) {
      seen.add(key)
      unique.push(p)
    }
  }
  const depositsEnabled = (raw as { depositsEnabled?: unknown }).depositsEnabled
  const skipPreflight = (raw as { skipPreflight?: unknown }).skipPreflight
  const rawProxy = (raw as { proxy?: unknown }).proxy
  let proxy: UserPrefs['proxy'] | undefined
  if (rawProxy && typeof rawProxy === 'object') {
    const p = rawProxy as Record<string, unknown>
    const url = typeof p.url === 'string' ? p.url : ''
    const enabled = typeof p.enabled === 'boolean' ? p.enabled : false
    const validUrl = url.length > 0 && /^https?:\/\//i.test(url)
    if (validUrl) {
      proxy = {
        enabled,
        url,
        username: typeof p.username === 'string' ? p.username : undefined,
        password: typeof p.password === 'string' ? p.password : undefined
      }
    }
  }
  return {
    whitelistSelection: unique,
    depositsEnabled: depositsEnabled === false ? false : undefined,
    skipPreflight: skipPreflight === true ? true : undefined,
    proxy
  }
}

export async function getPrefs(): Promise<UserPrefs> {
  if (cached) return cached
  try {
    const path = filePath()
    if (!existsSync(path)) {
      cached = defaultPrefs()
      return cached
    }
    const raw = await readFile(path, 'utf8')
    cached = sanitize(JSON.parse(raw))
    return cached
  } catch (err) {
    console.warn(
      '[prefs] load failed:',
      err instanceof Error ? err.message : err
    )
    cached = defaultPrefs()
    return cached
  }
}

export async function savePrefs(next: UserPrefs): Promise<{ ok: boolean }> {
  try {
    const clean = sanitize(next)
    await writeFile(filePath(), JSON.stringify(clean, null, 2), { mode: 0o600 })
    await chmod(filePath(), 0o600).catch(() => undefined)
    cached = clean
    return { ok: true }
  } catch (err) {
    console.warn(
      '[prefs] save failed:',
      err instanceof Error ? err.message : err
    )
    return { ok: false }
  }
}
