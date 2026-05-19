import { app, BrowserWindow, ipcMain, session, shell } from 'electron'
import { appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// ESM build: polyfill CommonJS-style __dirname so `join(__dirname, …)` keeps
// working after electron-vite emits index.mjs.
const __dirname = dirname(fileURLToPath(import.meta.url))

// Diagnostic file logger. Window-invisible-on-Windows symptom requires
// ground-truth evidence the user can copy-paste, since DevTools is gated.
let diagLogPath: string | null = null
function diag(line: string): void {
  const stamped = `[${new Date().toISOString()}] ${line}\n`
  try {
    if (!diagLogPath) {
      const dir = app.getPath('userData')
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      diagLogPath = join(dir, 'main.log')
    }
    appendFileSync(diagLogPath, stamped)
  } catch {
    // ignore — logging must never break startup
  }
  // Also surface to stdout for `npm run dev`.
  process.stdout.write(stamped)
}

process.on('uncaughtException', (err) => {
  diag(`uncaughtException: ${err?.stack ?? err}`)
})
process.on('unhandledRejection', (reason) => {
  diag(
    `unhandledRejection: ${
      reason instanceof Error ? reason.stack : String(reason)
    }`
  )
})
import {
  addWallet,
  changeMasterKey,
  createVault,
  getWalletKeyAndNetwork,
  listExchanges,
  listRpcs,
  listWallets,
  lockVault,
  removeExchange,
  removeWallet,
  saveRpcs,
  unlockVault,
  upsertExchange,
  vaultState,
  wipeVault
} from './vault'
import {
  detectChain,
  latestLatencies,
  pingMany,
  pingRpc,
  refreshLatenciesNow,
  startBackgroundPinger,
  stopBackgroundPinger
} from './rpc'
import {
  fetchWithdrawalStatus,
  getBalances,
  getClient,
  getDepositAddresses,
  getDepositAddressesForPairs,
  getNetworksForCoin,
  getWithdrawNetworks,
  invalidateAllClients,
  invalidateClient,
  preflightCexWithdraw,
  submitWithdraw,
  testConnection,
  transferInternal,
  warmup
} from './exchanges'
import { getPrefs, savePrefs } from './prefs'
import { applyProxyFromPrefs, checkCurrentIp, testProxy } from './proxy'
import {
  list as listDeposits,
  setClientGetter,
  startPoller as startDepositPoller,
  stopPoller as stopDepositPoller,
  wipeDeposits
} from './deposits'
import { checkEvmStatus, preflightEvmSend, submitEvmSend } from './evm-send'
import { loadFromDisk, wipeDiskCache } from './cache-store'
import { getEvmWalletBalances } from './evm'
import { confirmFinalized, getSolanaBalances, sendSolanaTransfer } from './solana'
import { withIdempotency } from './idempotency'
import {
  addPending as addPendingWithdrawal,
  clear as clearWithdrawals,
  list as listWithdrawals,
  remove as removeWithdrawal,
  setStatusFetcher,
  startPoller as startWithdrawalsPoller,
  update as updateWithdrawal,
  wipeHistory
} from './withdrawals'
import type {
  CoinNetworkPair,
  EvmSendInput,
  InternalTransferInput,
  UserPrefs,
  WithdrawInput
} from '../shared/types'
import type {
  ExchangeAccountInput,
  RpcEntry,
  WalletInput
} from '../shared/types'

const isDev = !!process.env['ELECTRON_RENDERER_URL']

/**
 * Throws an error whose stack does not include main-process file paths.
 * Electron forwards the full Error (message + stack) across IPC by default;
 * raw `new Error(...)` would expose `src/main/index.ts:NN` in the renderer.
 */
function ipcInputError(): Error {
  const err = new Error('invalid input')
  err.name = 'IpcInputError'
  err.stack = 'IpcInputError: invalid input'
  return err
}

/** Lightweight runtime guards — ensure a value matches the expected shape. */
function str(v: unknown): string {
  if (typeof v !== 'string' || !v) throw ipcInputError()
  return v
}
function num(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw ipcInputError()
  return v
}
function obj(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw ipcInputError()
  return v as Record<string, unknown>
}

let mainWindow: BrowserWindow | null = null

function createWindow() {
  diag(`createWindow: starting · platform=${process.platform} · isDev=${isDev}`)
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    titleBarOverlay:
      process.platform === 'win32'
        ? { color: '#061512', symbolColor: '#F0FDF4', height: 40 }
        : undefined,
    backgroundColor: '#061512',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  })

  mainWindow = win
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  // In production, immediately close DevTools if anything (default
  // accelerator, user, or otherwise) opens it. Renderer state would expose
  // unlocked-vault credentials, master-key prompt, and IPC payloads.
  if (!isDev) {
    win.webContents.on('devtools-opened', () => {
      win.webContents.closeDevTools()
    })
  }

  let readyToShowFired = false
  win.on('ready-to-show', () => {
    readyToShowFired = true
    diag('ready-to-show fired · showing window')
    win.show()
    if (isDev) win.webContents.openDevTools({ mode: 'detach' })
  })

  // Fallback: if the renderer never reaches ready-to-show within 5s, force
  // the window visible so the user sees what is broken (blank page, error
  // chrome, etc.) instead of an invisible process.
  setTimeout(() => {
    if (readyToShowFired || win.isDestroyed()) return
    diag('fallback show triggered after 5s · ready-to-show never fired')
    try {
      win.show()
    } catch (err) {
      diag(`fallback show threw: ${err instanceof Error ? err.stack : err}`)
    }
  }, 5000)

  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    diag(`did-fail-load · code=${code} · desc=${desc} · url=${url}`)
  })
  win.webContents.on('render-process-gone', (_e, details) => {
    diag(`render-process-gone · reason=${details.reason} · exitCode=${details.exitCode}`)
  })
  win.webContents.on('unresponsive', () => {
    diag('webContents unresponsive')
  })
  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    diag(`renderer console [${level}] ${message} (${sourceId}:${line})`)
  })

  win.webContents.setWindowOpenHandler((details) => {
    // Only allow https — never bare http or file:// / javascript: schemes.
    if (/^https:\/\//i.test(details.url)) {
      shell.openExternal(details.url)
    }
    return { action: 'deny' }
  })

  // Fix #6: block all renderer navigation after initial load.
  win.webContents.on('will-navigate', (event) => {
    event.preventDefault()
  })

  if (isDev) {
    const url = process.env['ELECTRON_RENDERER_URL']!
    diag(`loadURL · ${url}`)
    win.loadURL(url).catch((err) => {
      diag(`loadURL failed: ${err instanceof Error ? err.stack : err}`)
    })
  } else {
    const indexPath = join(__dirname, '../renderer/index.html')
    diag(`loadFile · path=${indexPath} · exists=${existsSync(indexPath)}`)
    win.loadFile(indexPath).catch((err) => {
      diag(`loadFile failed: ${err instanceof Error ? err.stack : err}`)
    })
  }
}

if (!app.requestSingleInstanceLock()) {
  app.exit(0)
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

app.whenReady().then(async () => {
  diag(`app ready · electron=${process.versions.electron} · node=${process.versions.node} · resourcesPath=${process.resourcesPath}`)
  // Defense in depth: deny every renderer permission request (mic, camera,
  // geolocation, notifications, midi, etc.). The app never asks for any.
  // Exception: clipboard-sanitized-write is needed for the copy buttons
  // (deposit address, tx hash, …). Read access stays denied.
  const ALLOWED_PERMS = new Set(['clipboard-sanitized-write'])
  session.defaultSession.setPermissionRequestHandler((_w, perm, callback) =>
    callback(ALLOWED_PERMS.has(perm))
  )
  session.defaultSession.setPermissionCheckHandler((_w, perm) =>
    ALLOWED_PERMS.has(perm)
  )

  // Load on-disk caches (networks + deposit addresses) so first session-clicks
  // don't hit the network.
  await loadFromDisk()
  applyProxyFromPrefs(await getPrefs())
  startBackgroundPinger()
  setStatusFetcher(async (rec) => {
    if (rec.kind === 'evm') return checkEvmStatus(rec)
    if (!rec.exchangeAccountId || !rec.exchangeTxId) return null
    return fetchWithdrawalStatus(
      rec.exchangeAccountId,
      rec.exchangeTxId,
      rec.coin
    )
  })
  startWithdrawalsPoller()
  setClientGetter(getClient)
  startDepositPoller()

  // Vault lifecycle
  ipcMain.handle('vault:state', () => vaultState())
  ipcMain.handle('vault:create', (_e, masterKey: unknown) =>
    createVault(str(masterKey))
  )
  ipcMain.handle('vault:unlock', (_e, masterKey: unknown) =>
    unlockVault(str(masterKey))
  )
  ipcMain.handle('vault:lock', () => {
    invalidateAllClients()
    stopBackgroundPinger()
    stopDepositPoller()
    return lockVault()
  })
  ipcMain.handle(
    'vault:changeMasterKey',
    (_e, oldKey: unknown, newKey: unknown) => changeMasterKey(str(oldKey), str(newKey))
  )
  ipcMain.handle('vault:wipe', async () => {
    invalidateAllClients()
    stopBackgroundPinger()
    stopDepositPoller()
    await Promise.all([wipeHistory(), wipeDiskCache(), wipeDeposits()])
    return wipeVault()
  })

  // Exchanges
  ipcMain.handle('exchanges:list', () => listExchanges())
  ipcMain.handle('exchanges:upsert', async (_e, input: unknown) => {
    const o = obj(input)
    const validated: ExchangeAccountInput = {
      exchange: str(o.exchange) as ExchangeAccountInput['exchange'],
      label: str(o.label),
      apiKey: typeof o.apiKey === 'string' && o.apiKey ? o.apiKey : undefined,
      secret: typeof o.secret === 'string' && o.secret ? o.secret : undefined,
      passphrase: typeof o.passphrase === 'string' ? o.passphrase : undefined,
      accountId: typeof o.accountId === 'string' ? o.accountId : undefined
    }
    const r = await upsertExchange(validated)
    if (r.ok && r.accountId) invalidateClient(r.accountId)
    return r
  })
  ipcMain.handle('exchanges:remove', async (_e, accountId: unknown) => {
    invalidateClient(str(accountId))
    return removeExchange(str(accountId))
  })
  ipcMain.handle('exchanges:getBalances', (_e, accountId: unknown) =>
    getBalances(str(accountId))
  )
  ipcMain.handle(
    'exchanges:getNetworks',
    (_e, accountId: unknown, coin: unknown) => getNetworksForCoin(str(accountId), str(coin))
  )
  ipcMain.handle('exchanges:getWithdrawNetworks', (_e, accountId: unknown) =>
    getWithdrawNetworks(str(accountId))
  )
  ipcMain.handle(
    'exchanges:getDepositAddressesForPairs',
    (_e, accountId: unknown, pairs: unknown) => {
      if (!Array.isArray(pairs)) throw ipcInputError()
      return getDepositAddressesForPairs(str(accountId), pairs as CoinNetworkPair[])
    }
  )
  ipcMain.handle('exchanges:test', (_e, accountId: unknown) =>
    testConnection(str(accountId))
  )
  ipcMain.handle('exchanges:warmup', () => warmup())
  ipcMain.handle('exchanges:withdraw', (_e, input: unknown) => {
    const o = obj(input)
    const submitId = typeof o.submitId === 'string' ? o.submitId : undefined
    return withIdempotency(submitId, () =>
      submitWithdraw({
        accountId: str(o.accountId),
        coin: str(o.coin),
        network: str(o.network),
        amount: num(o.amount),
        amountStr: typeof o.amountStr === 'string' ? o.amountStr : undefined,
        address: str(o.address),
        tag: typeof o.tag === 'string' ? o.tag : undefined,
        destLabel: typeof o.destLabel === 'string' ? o.destLabel : undefined,
        submitId
      })
    )
  })
  ipcMain.handle(
    'exchanges:transfer',
    (_e, input: unknown) => {
      const o = obj(input)
      return transferInternal({
        accountId: str(o.accountId),
        coin: str(o.coin),
        amount: num(o.amount),
        fromType: str(o.fromType),
        toType: str(o.toType)
      })
    }
  )
  ipcMain.handle('exchanges:preflight', (_e, input: unknown) => {
    const o = obj(input)
    return preflightCexWithdraw({
      accountId: str(o.accountId),
      coin: str(o.coin),
      network: str(o.network),
      amount: num(o.amount),
      address: str(o.address),
      tag: typeof o.tag === 'string' ? o.tag : undefined
    })
  })

  // EVM on-chain send
  ipcMain.handle('evm:preflight', (_e, input: unknown) => {
    const o = obj(input)
    return preflightEvmSend({
      walletId: str(o.walletId),
      coin: str(o.coin),
      amount: num(o.amount),
      chainId: num(o.chainId),
      toAddress: str(o.toAddress)
    })
  })
  ipcMain.handle('evm:submit', (_e, input: unknown) => {
    const o = obj(input)
    const submitId = typeof o.submitId === 'string' ? o.submitId : undefined
    return withIdempotency(submitId, () =>
      submitEvmSend({
        walletId: str(o.walletId),
        coin: str(o.coin),
        amount: num(o.amount),
        amountStr: typeof o.amountStr === 'string' ? o.amountStr : undefined,
        chainId: num(o.chainId),
        toAddress: str(o.toAddress),
        destCexAccountId: typeof o.destCexAccountId === 'string' ? o.destCexAccountId : undefined,
        destLabel: typeof o.destLabel === 'string' ? o.destLabel : undefined,
        submitId
      })
    )
  })

  // Withdrawals
  ipcMain.handle('withdrawals:list', () => listWithdrawals())
  ipcMain.handle('withdrawals:clear', () => clearWithdrawals())
  ipcMain.handle('withdrawals:remove', (_e, id: unknown) => removeWithdrawal(str(id)))
  ipcMain.handle(
    'exchanges:getDepositAddresses',
    (_e, accountId: unknown, coin: unknown, network: unknown) =>
      getDepositAddresses(str(accountId), str(coin), str(network))
  )

  // Deposits
  ipcMain.handle('deposits:list', () => listDeposits())

  // Wallets
  ipcMain.handle('wallets:list', () => listWallets())
  ipcMain.handle('wallets:add', (_e, input: unknown) => {
    const o = obj(input)
    return addWallet({
      privateKey: typeof o.privateKey === 'string' ? o.privateKey : undefined,
      address: typeof o.address === 'string' ? o.address : undefined,
      network: typeof o.network === 'string' ? o.network : undefined,
      label: typeof o.label === 'string' ? o.label : undefined
    })
  })
  ipcMain.handle('wallets:remove', (_e, id: unknown) => removeWallet(str(id)))
  ipcMain.handle('wallets:getBalances', (_e, address: unknown) =>
    getEvmWalletBalances(str(address), listRpcs())
  )
  ipcMain.handle('wallets:getSolBalances', (_e, address: unknown) =>
    getSolanaBalances(str(address))
  )
  ipcMain.handle('solana:send', async (_e, input: unknown) => {
    const o = obj(input)
    const submitId = typeof o.submitId === 'string' ? o.submitId : undefined
    return withIdempotency(submitId, async () => {
    const walletId = str(o.walletId)
    const w = getWalletKeyAndNetwork(walletId)
    if (!w || w.network !== 'SOL') {
      return { ok: false, error: 'wallet not found or not a Solana wallet' }
    }
    const coin = str(o.coin)
    const amount = num(o.amount)
    const amountStr = typeof o.amountStr === 'string' ? o.amountStr : undefined
    const toAddress = str(o.toAddress)
    const destLabel = typeof o.destLabel === 'string' ? o.destLabel : undefined

    const record = await addPendingWithdrawal({
      kind: 'evm',
      exchangeAccountId: walletId,
      exchangeLabel: 'Solana wallet',
      coin,
      network: 'SOL',
      amount,
      fee: 0,
      address: toAddress,
      destLabel
    })

    const r = await sendSolanaTransfer({
      secretKey: w.privateKey,
      toAddress,
      coin,
      amount,
      amountStr
    })
    if (r.ok && r.txHash) {
      // Confirmed (sub-second) — but Solana 'confirmed' is reorg-eligible.
      // Mark 'processing' for the UI and asynchronously upgrade to 'ok' once
      // the signature reaches 'finalized' commitment (~13s typical).
      await updateWithdrawal(record.id, {
        status: 'processing',
        exchangeTxId: r.txHash,
        chainTxHash: r.txHash
      })
      const txHash = r.txHash
      confirmFinalized(txHash)
        .then((res) => {
          if (res.ok) {
            return updateWithdrawal(record.id, { status: 'ok' })
          }
          return updateWithdrawal(record.id, {
            status: 'failed',
            error: res.error ?? 'not finalized'
          })
        })
        .catch(() => undefined)
      return { ok: true, txHash, recordId: record.id }
    }
    await updateWithdrawal(record.id, {
      status: 'failed',
      error: r.error
    })
    return { ok: false, error: r.error }
    })
  })

  // Prefs
  ipcMain.handle('prefs:get', () => getPrefs())
  ipcMain.handle('prefs:save', async (_e, prefs: unknown) => {
    const r = await savePrefs(obj(prefs) as unknown as UserPrefs)
    if (r.ok) {
      applyProxyFromPrefs(await getPrefs())
      invalidateAllClients()
    }
    return r
  })

  // Proxy
  ipcMain.handle('proxy:test', (_e, input: unknown) => {
    const o = obj(input)
    return testProxy({
      url: str(o.url),
      username: typeof o.username === 'string' ? o.username : undefined,
      password: typeof o.password === 'string' ? o.password : undefined
    })
  })
  ipcMain.handle('proxy:checkIp', () => checkCurrentIp())

  // RPC
  ipcMain.handle('rpc:list', () => listRpcs())
  ipcMain.handle('rpc:save', (_e, rpcs: unknown) => {
    if (!Array.isArray(rpcs)) throw ipcInputError()
    return saveRpcs(rpcs as RpcEntry[])
  })
  ipcMain.handle('rpc:detect', (_e, url: unknown) => detectChain(str(url)))
  ipcMain.handle('rpc:ping', (_e, url: unknown) => pingRpc('once', str(url)))
  ipcMain.handle(
    'rpc:pingMany',
    (_e, entries: unknown) => {
      if (!Array.isArray(entries)) throw ipcInputError()
      return pingMany(entries as { id: string; url: string }[])
    }
  )
  ipcMain.handle('rpc:latest', () => latestLatencies())
  ipcMain.handle('rpc:refresh', () => refreshLatenciesNow())

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}).catch((err) => {
  diag(`whenReady chain rejected: ${err instanceof Error ? err.stack : err}`)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Defensive teardown: stop every poller and interval before the main process
// exits so helper processes can't outlive the main one. Runs once even if the
// app is closed via OS signal, taskkill, or Electron's lifecycle.
let teardownDone = false
function teardown() {
  if (teardownDone) return
  teardownDone = true
  try {
    invalidateAllClients()
  } catch { /* ignore */ }
  try {
    stopBackgroundPinger()
  } catch { /* ignore */ }
  try {
    stopDepositPoller()
  } catch { /* ignore */ }
}

app.on('before-quit', teardown)
app.on('will-quit', teardown)
process.on('exit', teardown)
