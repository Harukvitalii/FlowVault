import { Agent, ProxyAgent, setGlobalDispatcher } from 'undici'
import type { UserPrefs } from '../shared/types'

function buildUri(url: string, username?: string, password?: string): string {
  if (!username && !password) return url
  const u = new URL(url)
  // URL setters percent-encode automatically — do NOT pre-encode or we
  // double-encode special chars (e.g. `@` → `%2540`) and proxy auth fails.
  if (username) u.username = username
  if (password) u.password = password
  return u.toString()
}

let currentProxyUri: string | undefined

/** Returns the active proxy URI (with embedded auth) or undefined when
 *  proxy is disabled. ccxt clients use this to set `httpsProxy`/`httpProxy`
 *  because their bundled node-fetch does NOT honor undici's global
 *  dispatcher — it goes through Node's https module directly. */
export function getProxyUri(): string | undefined {
  return currentProxyUri
}

export function applyProxyFromPrefs(prefs: UserPrefs): void {
  const p = prefs.proxy
  if (p && p.enabled && p.url && /^https?:\/\//i.test(p.url)) {
    const uri = buildUri(p.url, p.username, p.password)
    currentProxyUri = uri
    setGlobalDispatcher(new ProxyAgent({ uri }))
    return
  }
  currentProxyUri = undefined
  setGlobalDispatcher(new Agent())
}

export async function checkCurrentIp(): Promise<{
  ok: boolean
  ip?: string
  proxied: boolean
  error?: string
}> {
  const proxied = currentProxyUri !== undefined
  try {
    const res = await fetch('https://api.ipify.org?format=json', {
      signal: AbortSignal.timeout(8000)
    })
    if (!res.ok) return { ok: false, proxied, error: `HTTP ${res.status}` }
    const json = (await res.json()) as { ip?: string }
    return {
      ok: true,
      proxied,
      ip: typeof json.ip === 'string' ? json.ip : undefined
    }
  } catch (err) {
    return {
      ok: false,
      proxied,
      error: err instanceof Error ? err.message : String(err)
    }
  }
}

export async function testProxy(input: {
  url: string
  username?: string
  password?: string
}): Promise<{ ok: boolean; ip?: string; latencyMs?: number; error?: string }> {
  if (!input.url || !/^https?:\/\//i.test(input.url)) {
    return { ok: false, error: 'invalid proxy url' }
  }
  const uri = buildUri(input.url, input.username, input.password)
  const dispatcher = new ProxyAgent({ uri })
  const started = Date.now()
  try {
    const res = await fetch('https://api.ipify.org?format=json', {
      // @ts-expect-error undici dispatcher is a valid Node fetch option
      dispatcher,
      signal: AbortSignal.timeout(8000)
    })
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` }
    }
    const json = (await res.json()) as { ip?: string }
    return {
      ok: true,
      ip: typeof json.ip === 'string' ? json.ip : undefined,
      latencyMs: Date.now() - started
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err)
    }
  } finally {
    dispatcher.close().catch(() => undefined)
  }
}
