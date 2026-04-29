import { app } from 'electron'
import { readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  randomBytes,
  randomUUID,
  scryptSync,
  createCipheriv,
  createDecipheriv
} from 'node:crypto'
import { privateKeyToAccount } from 'viem/accounts'
import { chainIdByName } from '../shared/chains'
import { needsPassphrase } from '../shared/exchanges'
import type {
  ExchangeAccountInput,
  ExchangeAccountMeta,
  ExchangeId,
  RpcEntry,
  WalletInput,
  WalletMeta
} from '../shared/types'

const VAULT_FILE = 'vault.enc'
/** Old single-account-per-exchange schema used these as the record key. */
const LEGACY_EXCHANGES: ExchangeId[] = ['binance', 'gate', 'okx']
/** Every exchange currently supported. New records must validate against this. */
const ALL_EXCHANGES: ExchangeId[] = [
  'binance',
  'gate',
  'okx',
  'bybit',
  'kucoin',
  'bitget',
  'htx',
  'mexc',
  'phemex'
]

type ExchangeRecord = {
  accountId: string
  exchange: ExchangeId
  label: string
  apiKey: string
  secret: string
  passphrase?: string
  createdAt: number
}

type WalletRecord = {
  id: string
  label: string
  address: string
  privateKey?: string
  /** Network family for watch-only wallets (e.g. 'ETH', 'TRX', 'SOL'). */
  network?: string
  createdAt: number
}

type VaultData = {
  exchanges: Record<string, ExchangeRecord>
  wallets: Record<string, WalletRecord>
  rpcs: RpcEntry[]
}

const emptyVault = (): VaultData => ({ exchanges: {}, wallets: {}, rpcs: [] })

let unlockedKey: Buffer | null = null
let unlockedData: VaultData | null = null
let unlockFailCount = 0
let unlockLockedUntil = 0

const vaultPath = () => join(app.getPath('userData'), VAULT_FILE)

const MIN_MASTER_KEY_LEN = 8

function deriveKey(masterKey: string, salt: Buffer): Buffer {
  return scryptSync(masterKey, salt, 32, {
    N: 1 << 17,
    r: 8,
    p: 1,
    maxmem: 256 * 1024 * 1024
  })
}

async function persist(keyForEncrypt?: Buffer, saltForFile?: Buffer) {
  const key = keyForEncrypt ?? unlockedKey
  if (!key || !unlockedData) throw new Error('vault not unlocked')
  const salt = saltForFile ?? (await readSalt())
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const payload = Buffer.concat([
    cipher.update(JSON.stringify(unlockedData), 'utf8'),
    cipher.final()
  ])
  const tag = cipher.getAuthTag()
  const tmp = vaultPath() + '.tmp'
  await writeFile(tmp, Buffer.concat([salt, iv, tag, payload]))
  await rename(tmp, vaultPath())
}

async function readSalt(): Promise<Buffer> {
  const blob = await readFile(vaultPath())
  return blob.subarray(0, 16)
}

/**
 * Migrate legacy shapes. v0: exchanges keyed by ExchangeId ('binance', etc.) with
 * `id: ExchangeId` on the record. v1 (current): keyed by uuid with `accountId` + `exchange`.
 */
function migrate(raw: unknown): VaultData {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<
    string,
    unknown
  >
  const exchanges: Record<string, ExchangeRecord> = {}
  const wallets: Record<string, WalletRecord> = {}
  const rawWallets = (data.wallets as Record<string, unknown>) ?? {}
  for (const [k, v] of Object.entries(rawWallets)) {
    if (!v || typeof v !== 'object') continue
    const w = v as Partial<WalletRecord>
    if (
      typeof w.id !== 'string' ||
      typeof w.address !== 'string'
    ) continue
    // Validate private key if present (watch-only wallets have none).
    if (w.privateKey != null && (typeof w.privateKey !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(w.privateKey))) continue
    wallets[k] = {
      id: w.id,
      label: typeof w.label === 'string' ? w.label : `Wallet`,
      address: w.address,
      privateKey: w.privateKey,
      network: typeof w.network === 'string' ? w.network : undefined,
      createdAt: typeof w.createdAt === 'number' ? w.createdAt : Date.now()
    }
  }
  const rpcsRaw: unknown[] = Array.isArray(data.rpcs) ? data.rpcs : []
  const rpcs: RpcEntry[] = rpcsRaw
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map((r) => {
      const chain = typeof r.chain === 'string' ? r.chain : 'Unknown'
      const chainIdRaw = r.chainId
      const chainId =
        typeof chainIdRaw === 'number' && chainIdRaw > 0
          ? chainIdRaw
          : chainIdByName(chain) ?? 0
      return {
        id: typeof r.id === 'string' ? r.id : randomUUID(),
        chainId,
        chain,
        url: typeof r.url === 'string' ? r.url : '',
        custom: !!r.custom
      }
    })
    .filter((r) => r.url && r.chainId > 0)

  const rawEx = (data.exchanges as Record<string, unknown>) ?? {}
  for (const [k, v] of Object.entries(rawEx)) {
    if (!v || typeof v !== 'object') continue
    const rec = v as Partial<ExchangeRecord> & { id?: ExchangeId }
    const legacy = LEGACY_EXCHANGES.includes(k as ExchangeId)
    const accountId = rec.accountId ?? (legacy ? randomUUID() : k)
    const exchange = rec.exchange ?? rec.id ?? (k as ExchangeId)
    if (!ALL_EXCHANGES.includes(exchange as ExchangeId)) continue
    exchanges[accountId] = {
      accountId,
      exchange: exchange as ExchangeId,
      label: rec.label ?? (exchange as string),
      apiKey: rec.apiKey ?? '',
      secret: rec.secret ?? '',
      passphrase: rec.passphrase,
      createdAt: rec.createdAt ?? Date.now()
    }
  }
  return { exchanges, wallets, rpcs }
}

export function vaultState(): 'empty' | 'locked' | 'unlocked' {
  if (unlockedKey) return 'unlocked'
  return existsSync(vaultPath()) ? 'locked' : 'empty'
}

export async function createVault(masterKey: string): Promise<{ ok: boolean; error?: string }> {
  if (existsSync(vaultPath())) return { ok: false, error: 'vault already exists' }
  if (masterKey.length < MIN_MASTER_KEY_LEN)
    return { ok: false, error: `master key must be ≥ ${MIN_MASTER_KEY_LEN} chars` }
  const salt = randomBytes(16)
  const key = deriveKey(masterKey, salt)
  unlockedData = emptyVault()
  unlockedKey = key
  await persist(key, salt)
  return { ok: true }
}

export async function unlockVault(
  masterKey: string
): Promise<{ ok: boolean; error?: string }> {
  // Brute-force protection: exponential backoff after failed attempts.
  const now = Date.now()
  if (now < unlockLockedUntil) {
    const waitSec = Math.ceil((unlockLockedUntil - now) / 1000)
    return { ok: false, error: `too many attempts — wait ${waitSec}s` }
  }
  if (!existsSync(vaultPath())) return { ok: false, error: 'no vault' }
  const blob = await readFile(vaultPath())
  const salt = blob.subarray(0, 16)
  const iv = blob.subarray(16, 28)
  const tag = blob.subarray(28, 44)
  const payload = blob.subarray(44)
  const key = deriveKey(masterKey, salt)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  try {
    const plain = Buffer.concat([decipher.update(payload), decipher.final()])
    unlockedData = migrate(JSON.parse(plain.toString('utf8')))
    unlockedKey = key
    unlockFailCount = 0
    return { ok: true }
  } catch {
    unlockFailCount++
    // Back off: 1s, 2s, 4s, 8s, 16s, 30s cap
    const delaySec = Math.min(30, Math.pow(2, unlockFailCount - 1))
    unlockLockedUntil = Date.now() + delaySec * 1000
    return { ok: false, error: 'wrong master key' }
  }
}

export function lockVault(): void {
  if (unlockedKey) {
    unlockedKey.fill(0)
  }
  unlockedKey = null
  unlockedData = null
}

function assertUnlocked() {
  if (!unlockedKey || !unlockedData) throw new Error('vault locked')
}

export async function changeMasterKey(
  oldKey: string,
  newKey: string
): Promise<{ ok: boolean; error?: string }> {
  assertUnlocked()
  // Validate the old key by re-deriving and attempting decryption — but do NOT
  // replace the in-memory data, so any recent upserts are preserved.
  const blob = await readFile(vaultPath())
  const oldSalt = blob.subarray(0, 16)
  const iv = blob.subarray(16, 28)
  const tag = blob.subarray(28, 44)
  const payload = blob.subarray(44)
  const oldDerived = deriveKey(oldKey, oldSalt)
  try {
    const decipher = createDecipheriv('aes-256-gcm', oldDerived, iv)
    decipher.setAuthTag(tag)
    Buffer.concat([decipher.update(payload), decipher.final()])
  } catch {
    return { ok: false, error: 'old master key is wrong' }
  }
  if (newKey.length < MIN_MASTER_KEY_LEN)
    return { ok: false, error: `new master key must be ≥ ${MIN_MASTER_KEY_LEN} chars` }
  const newSalt = randomBytes(16)
  const newDerived = deriveKey(newKey, newSalt)
  await persist(newDerived, newSalt)
  if (unlockedKey) unlockedKey.fill(0)
  unlockedKey = newDerived
  return { ok: true }
}

export async function wipeVault(): Promise<{ ok: boolean }> {
  lockVault()
  if (existsSync(vaultPath())) await unlink(vaultPath())
  return { ok: true }
}

// ---------- Exchanges ----------

function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 8) return '•'.repeat(apiKey.length)
  return `${apiKey.slice(0, 4)}…${apiKey.slice(-4)}`
}

export function listExchanges(): ExchangeAccountMeta[] {
  assertUnlocked()
  return Object.values(unlockedData!.exchanges)
    .map((x) => ({
      accountId: x.accountId,
      exchange: x.exchange,
      label: x.label,
      apiKeyPreview: maskApiKey(x.apiKey),
      hasPassphrase: !!x.passphrase,
      createdAt: x.createdAt
    }))
    .sort((a, b) => a.createdAt - b.createdAt)
}

export async function upsertExchange(
  input: ExchangeAccountInput
): Promise<{ ok: boolean; error?: string; accountId?: string }> {
  assertUnlocked()
  if (!input.label.trim()) return { ok: false, error: 'label required' }
  if (!input.apiKey.trim() || !input.secret.trim())
    return { ok: false, error: 'api key and secret required' }
  if (needsPassphrase(input.exchange) && !input.passphrase?.trim())
    return {
      ok: false,
      error: `${input.exchange} requires a passphrase`
    }

  const existing = input.accountId
    ? unlockedData!.exchanges[input.accountId]
    : null

  // Prevent duplicate labels within same exchange.
  const duplicate = Object.values(unlockedData!.exchanges).some(
    (x) =>
      x.exchange === input.exchange &&
      x.label.trim().toLowerCase() === input.label.trim().toLowerCase() &&
      x.accountId !== existing?.accountId
  )
  if (duplicate)
    return { ok: false, error: `label already used on ${input.exchange}` }

  const accountId = existing?.accountId ?? randomUUID()
  unlockedData!.exchanges[accountId] = {
    accountId,
    exchange: input.exchange,
    label: input.label.trim(),
    apiKey: input.apiKey.trim(),
    secret: input.secret.trim(),
    passphrase: input.passphrase?.trim() || undefined,
    createdAt: existing?.createdAt ?? Date.now()
  }
  await persist()
  return { ok: true, accountId }
}

export async function removeExchange(
  accountId: string
): Promise<{ ok: boolean }> {
  assertUnlocked()
  delete unlockedData!.exchanges[accountId]
  await persist()
  return { ok: true }
}

/**
 * Internal API — main process only. Never expose via IPC.
 * Used by the EVM sender in main/evm-send.ts.
 */
export function getWalletPrivateKey(walletId: string): `0x${string}` | null {
  if (!unlockedData) return null
  const w = unlockedData.wallets[walletId]
  if (!w) return null
  return w.privateKey as `0x${string}`
}

export function getWalletByAddress(address: string): {
  id: string
  privateKey: `0x${string}`
} | null {
  if (!unlockedData) return null
  const lower = address.toLowerCase()
  for (const w of Object.values(unlockedData.wallets)) {
    if (w.address.toLowerCase() === lower) {
      return { id: w.id, privateKey: w.privateKey as `0x${string}` }
    }
  }
  return null
}

/**
 * Internal API — main process only. Never expose via IPC.
 * Used by the ccxt client cache in main/exchanges.ts.
 */
export function getExchangeCreds(accountId: string):
  | {
      exchange: ExchangeId
      label: string
      apiKey: string
      secret: string
      passphrase?: string
    }
  | null {
  if (!unlockedData) return null
  const rec = unlockedData.exchanges[accountId]
  if (!rec) return null
  return {
    exchange: rec.exchange,
    label: rec.label,
    apiKey: rec.apiKey,
    secret: rec.secret,
    passphrase: rec.passphrase
  }
}

// ---------- Wallets ----------

export function listWallets(): WalletMeta[] {
  assertUnlocked()
  return Object.values(unlockedData!.wallets)
    .map((w) => ({
      id: w.id,
      label: w.label,
      address: w.address,
      network: w.network,
      canSend: !!w.privateKey,
      createdAt: w.createdAt
    }))
    .sort((a, b) => a.createdAt - b.createdAt)
}

function normalizePk(pk: string): `0x${string}` {
  const trimmed = pk.trim()
  const hex = trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`
  if (!/^0x[0-9a-fA-F]{64}$/.test(hex))
    throw new Error('private key must be 64 hex chars')
  return hex as `0x${string}`
}

export async function addWallet(
  input: WalletInput
): Promise<{ ok: boolean; wallet?: WalletMeta; error?: string }> {
  assertUnlocked()

  // Watch-only wallet: address provided directly, no private key.
  if (input.address && !input.privateKey) {
    const address = input.address.trim()
    if (!address) return { ok: false, error: 'address is required' }
    if (!input.network?.trim()) return { ok: false, error: 'network is required for watch-only wallets' }
    const duplicate = Object.values(unlockedData!.wallets).some(
      (w) => w.address.toLowerCase() === address.toLowerCase()
    )
    if (duplicate) return { ok: false, error: 'wallet already exists' }
    const id = randomUUID()
    const record: WalletRecord = {
      id,
      label:
        input.label?.trim() ||
        `Wallet ${Object.keys(unlockedData!.wallets).length + 1}`,
      address,
      network: input.network.trim(),
      createdAt: Date.now()
    }
    unlockedData!.wallets[id] = record
    await persist()
    return {
      ok: true,
      wallet: {
        id: record.id,
        label: record.label,
        address: record.address,
        network: record.network,
        canSend: false,
        createdAt: record.createdAt
      }
    }
  }

  // Full wallet: derive address from private key.
  if (!input.privateKey) return { ok: false, error: 'private key or address is required' }

  // Solana wallet
  if (input.network === 'SOL') {
    try {
      const { deriveAddress } = await import('./solana')
      const address = deriveAddress(input.privateKey)
      const duplicate = Object.values(unlockedData!.wallets).some(
        (w) => w.address === address
      )
      if (duplicate) return { ok: false, error: 'wallet already exists' }
      const id = randomUUID()
      const record: WalletRecord = {
        id,
        label: input.label?.trim() || `SOL Wallet ${Object.keys(unlockedData!.wallets).length + 1}`,
        address,
        privateKey: input.privateKey.trim(),
        network: 'SOL',
        createdAt: Date.now()
      }
      unlockedData!.wallets[id] = record
      await persist()
      return {
        ok: true,
        wallet: {
          id: record.id,
          label: record.label,
          address: record.address,
          network: 'SOL',
          canSend: true,
          createdAt: record.createdAt
        }
      }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'invalid Solana key' }
    }
  }

  // EVM wallet
  let pk: `0x${string}`
  try {
    pk = normalizePk(input.privateKey)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'bad key' }
  }
  const account = privateKeyToAccount(pk)
  const address = account.address
  const duplicate = Object.values(unlockedData!.wallets).some(
    (w) => w.address.toLowerCase() === address.toLowerCase()
  )
  if (duplicate) return { ok: false, error: 'wallet already exists' }
  const id = randomUUID()
  const record: WalletRecord = {
    id,
    label:
      input.label?.trim() ||
      `Wallet ${Object.keys(unlockedData!.wallets).length + 1}`,
    address,
    privateKey: pk,
    createdAt: Date.now()
  }
  unlockedData!.wallets[id] = record
  await persist()
  return {
    ok: true,
    wallet: {
      id: record.id,
      label: record.label,
      address: record.address,
      canSend: true,
      createdAt: record.createdAt
    }
  }
}

export async function removeWallet(id: string): Promise<{ ok: boolean }> {
  assertUnlocked()
  delete unlockedData!.wallets[id]
  await persist()
  return { ok: true }
}

// ---------- RPCs ----------

export function listRpcs(): RpcEntry[] {
  assertUnlocked()
  return unlockedData!.rpcs.slice()
}

export async function saveRpcs(rpcs: RpcEntry[]): Promise<{ ok: boolean }> {
  assertUnlocked()
  unlockedData!.rpcs = rpcs.slice()
  await persist()
  return { ok: true }
}
