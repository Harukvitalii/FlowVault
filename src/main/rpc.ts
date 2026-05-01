import { BrowserWindow } from 'electron'
import { KNOWN_CHAINS } from '../shared/chains'
import { listRpcs } from './vault'
import type { ChainDetectResult, RpcEntry, RpcPingResult } from '../shared/types'

const TIMEOUT_MS = 4000
const DETECT_TIMEOUT_MS = 5000

async function jsonRpc<T>(
  url: string,
  method: string,
  params: unknown[],
  timeoutMs: number
): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: controller.signal
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = (await res.json()) as { result?: T; error?: { message?: string } }
    if (body.error) throw new Error(body.error.message ?? 'rpc error')
    if (body.result === undefined) throw new Error('empty result')
    return body.result
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Reject loopback / RFC-1918 / link-local / unique-local hosts so a
 * compromised renderer cannot turn the main process into an HTTP relay
 * to internal LAN services. Hostnames are accepted (resolution happens
 * inside fetch); only literal private IPs are blocked here.
 */
function isPrivateHost(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase()
  if (h === 'localhost' || h === '0.0.0.0' || h === '::' || h === '::1') return true
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (v4) {
    const a = Number(v4[1])
    const b = Number(v4[2])
    if (a === 10) return true                        // 10.0.0.0/8
    if (a === 127) return true                       // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true          // 169.254.0.0/16 link-local
    if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
    if (a === 192 && b === 168) return true          // 192.168.0.0/16
    if (a >= 224) return true                        // multicast / reserved
    return false
  }
  if (/^fc[0-9a-f]{2}:/i.test(h) || /^fd[0-9a-f]{2}:/i.test(h)) return true   // IPv6 ULA fc00::/7
  if (/^fe[89ab][0-9a-f]:/i.test(h)) return true                              // IPv6 link-local fe80::/10
  return false
}

function isValidRpcUrl(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
  if (isPrivateHost(parsed.hostname)) return false
  return true
}

export async function pingRpc(id: string, url: string): Promise<RpcPingResult> {
  if (!isValidRpcUrl(url)) {
    return { id, latencyMs: null, error: 'invalid URL — must be http(s)' }
  }
  const started = performance.now()
  try {
    const result = await jsonRpc<string>(url, 'eth_blockNumber', [], TIMEOUT_MS)
    const latencyMs = Math.round(performance.now() - started)
    if (typeof result !== 'string')
      return { id, latencyMs: null, error: 'bad response' }
    return { id, latencyMs }
  } catch (err) {
    return {
      id,
      latencyMs: null,
      error: err instanceof Error ? err.message : 'unknown'
    }
  }
}

export async function pingMany(
  entries: { id: string; url: string }[]
): Promise<RpcPingResult[]> {
  const results = await Promise.all(
    entries.map((e) => pingRpc(e.id, e.url))
  )
  // Feed the background latency table so consumers always get fresh data.
  for (const r of results) {
    latencyTable.set(r.id, { latencyMs: r.latencyMs, ts: Date.now() })
  }
  return results
}

// ---------------- Background latency table ----------------

type Latency = { latencyMs: number | null; ts: number }
const latencyTable = new Map<string, Latency>()
const BG_PING_INTERVAL_MS = 30_000
let bgTimer: NodeJS.Timeout | null = null

/**
 * Sort a chain's configured RPCs by most-recent latency (fastest first,
 * unknown last, failures last of all). Safe to call before any pings —
 * returns the original order.
 */
export function bestRpcsForChain(
  rpcs: RpcEntry[],
  chainId: number
): RpcEntry[] {
  return rpcs
    .filter((r) => r.chainId === chainId)
    .slice()
    .sort((a, b) => {
      const la = latencyTable.get(a.id)?.latencyMs ?? null
      const lb = latencyTable.get(b.id)?.latencyMs ?? null
      if (la == null && lb == null) return 0
      if (la == null) return 1
      if (lb == null) return -1
      return la - lb
    })
}

export function latestLatencies(): Record<string, Latency> {
  return Object.fromEntries(latencyTable)
}

async function runBackgroundPing() {
  try {
    const rpcs = listRpcs()
    if (rpcs.length === 0) return
    await pingMany(rpcs.map((r) => ({ id: r.id, url: r.url })))
    broadcastLatencies()
  } catch {
    // Vault may be locked — silently skip.
  }
}

function broadcastLatencies(): void {
  const snapshot = latestLatencies()
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('rpc:latencies', snapshot)
  }
}

/** Trigger an immediate ping round (e.g. for a manual Refresh button) and
 *  push results to all renderers. Coalesces into the same broadcast channel
 *  used by the periodic background pinger. */
export async function refreshLatenciesNow(): Promise<void> {
  await runBackgroundPing()
}

export function startBackgroundPinger() {
  if (bgTimer) return
  // Kick first round soon but not immediately (give vault a moment to unlock).
  setTimeout(() => runBackgroundPing(), 2000)
  bgTimer = setInterval(runBackgroundPing, BG_PING_INTERVAL_MS)
}

export function stopBackgroundPinger() {
  if (bgTimer) {
    clearInterval(bgTimer)
    bgTimer = null
  }
}

export async function detectChain(url: string): Promise<ChainDetectResult> {
  if (!isValidRpcUrl(url)) {
    return { ok: false, error: 'invalid URL — must be http(s)' }
  }
  const started = performance.now()
  try {
    const hex = await jsonRpc<string>(url, 'eth_chainId', [], DETECT_TIMEOUT_MS)
    const chainId = parseInt(hex, 16)
    if (!Number.isFinite(chainId) || chainId <= 0)
      return { ok: false, error: 'invalid chainId' }
    return {
      ok: true,
      chainId,
      name: KNOWN_CHAINS[chainId],
      latencyMs: Math.round(performance.now() - started)
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'failed' }
  }
}
