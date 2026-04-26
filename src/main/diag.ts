import ccxt from 'ccxt'
import { createHash, createHmac } from 'node:crypto'
import type {
  ConnectionTestStep,
  ExchangeId
} from '../shared/types'

const SIGNED_TIMEOUT_MS = 8000

/** Remove non-printable / control characters from exchange API responses. */
function stripNonPrintable(s: string): string {
  return s.replace(/[^\x20-\x7E\t\n]/g, '')
}

type Creds = {
  exchange: ExchangeId
  apiKey: string
  secret: string
  passphrase?: string
}

type ProbeOpts = {
  url: string
  method: string
  headers: Record<string, string>
  body?: string
}

async function doProbe(opts: ProbeOpts): Promise<ConnectionTestStep> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SIGNED_TIMEOUT_MS)
  const started = Date.now()
  try {
    const res = await fetch(opts.url, {
      method: opts.method,
      headers: opts.headers,
      body: opts.body,
      signal: controller.signal
    })
    const latencyMs = Date.now() - started
    const text = await res.text()
    if (!res.ok) {
      return {
        name: 'signed',
        status: 'fail',
        latencyMs,
        detail: `HTTP ${res.status} · ${stripNonPrintable(text.slice(0, 220))}`
      }
    }
    return {
      name: 'signed',
      status: 'ok',
      latencyMs,
      detail: stripNonPrintable(text.slice(0, 140))
    }
  } catch (err) {
    const latencyMs = Date.now() - started
    return {
      name: 'signed',
      status: 'fail',
      latencyMs,
      detail: err instanceof Error ? err.message : 'unknown'
    }
  } finally {
    clearTimeout(timer)
  }
}

function binanceSigned(creds: Creds): ProbeOpts {
  const timestamp = Date.now()
  const query = `timestamp=${timestamp}&recvWindow=5000`
  const sig = createHmac('sha256', creds.secret).update(query).digest('hex')
  return {
    url: `https://api.binance.com/api/v3/account?${query}&signature=${sig}`,
    method: 'GET',
    headers: { 'X-MBX-APIKEY': creds.apiKey }
  }
}

function gateSigned(creds: Creds): ProbeOpts {
  const method = 'GET'
  const path = '/api/v4/account/detail'
  const query = ''
  const body = ''
  const bodyHash = createHash('sha512').update(body).digest('hex')
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const signPayload = `${method}\n${path}\n${query}\n${bodyHash}\n${timestamp}`
  const sig = createHmac('sha512', creds.secret)
    .update(signPayload)
    .digest('hex')
  return {
    url: `https://api.gateio.ws${path}`,
    method: 'GET',
    headers: {
      KEY: creds.apiKey,
      SIGN: sig,
      Timestamp: timestamp,
      'Content-Type': 'application/json'
    }
  }
}

function okxSigned(creds: Creds): ProbeOpts | null {
  if (!creds.passphrase) return null
  const method = 'GET'
  const path = '/api/v5/account/config'
  const body = ''
  const timestamp = new Date().toISOString()
  const prehash = timestamp + method + path + body
  const sig = createHmac('sha256', creds.secret)
    .update(prehash)
    .digest('base64')
  return {
    url: `https://www.okx.com${path}`,
    method: 'GET',
    headers: {
      'OK-ACCESS-KEY': creds.apiKey,
      'OK-ACCESS-SIGN': sig,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': creds.passphrase,
      'Content-Type': 'application/json'
    }
  }
}

/**
 * Fallback signed probe using ccxt for exchanges where we haven't
 * implemented native HMAC. A fresh short-lived client is used so this
 * doesn't pollute the main exchange client cache.
 */
async function ccxtSignedProbe(creds: Creds): Promise<ConnectionTestStep> {
  const started = Date.now()
  try {
    const Ctor = (ccxt as unknown as Record<
      string,
      new (cfg: Record<string, unknown>) => {
        has: Record<string, boolean>
        fetchBalance: () => Promise<unknown>
      }
    >)[creds.exchange]
    if (!Ctor) {
      return {
        name: 'signed',
        status: 'skip',
        detail: `no ccxt class for ${creds.exchange}`
      }
    }
    const client = new Ctor({
      apiKey: creds.apiKey,
      secret: creds.secret,
      password: creds.passphrase,
      enableRateLimit: false,
      timeout: SIGNED_TIMEOUT_MS
    })
    await client.fetchBalance()
    return {
      name: 'signed',
      status: 'ok',
      latencyMs: Date.now() - started,
      detail: 'ccxt signed call ok'
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'failed'
    return {
      name: 'signed',
      status: 'fail',
      latencyMs: Date.now() - started,
      detail: message.slice(0, 220)
    }
  }
}

export async function runSignedProbe(creds: Creds): Promise<ConnectionTestStep> {
  // Native HMAC where implemented — bypasses ccxt for deeper diagnosis.
  if (creds.exchange === 'binance') return doProbe(binanceSigned(creds))
  if (creds.exchange === 'gate') return doProbe(gateSigned(creds))
  if (creds.exchange === 'okx') {
    const opts = okxSigned(creds)
    if (!opts) {
      return {
        name: 'signed',
        status: 'skip',
        detail: 'missing passphrase for OKX'
      }
    }
    return doProbe(opts)
  }
  // Everything else: ccxt-backed probe.
  return ccxtSignedProbe(creds)
}
