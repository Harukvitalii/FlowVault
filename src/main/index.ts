import { app, BrowserWindow, ipcMain, session, shell } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// ESM build: polyfill CommonJS-style __dirname so `join(__dirname, …)` keeps
// working after electron-vite emits index.mjs.
const __dirname = dirname(fileURLToPath(import.meta.url))
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
  pingMany,
  pingRpc,
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
import { getSolanaBalances, sendSolanaTransfer } from './solana'
import {
  clear as clearWithdrawals,
  list as listWithdrawals,
  remove as removeWithdrawal,
  setStatusFetcher,
  startPoller as startWithdrawalsPoller,
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

/** Lightweight runtime guard — ensures a value is a non-empty string. */
function str(v: unknown): string {
  if (typeof v !== 'string' || !v) throw new Error('expected non-empty string')
  return v
}
function num(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error('expected finite number')
  return v
}
function obj(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('expected object')
  return v as Record<string, unknown>
}

let mainWindow: BrowserWindow | null = null

function createWindow() {
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
      sandbox: true
    }
  })

  mainWindow = win
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  win.on('ready-to-show', () => {
    win.show()
    if (isDev) win.webContents.openDevTools({ mode: 'detach' })
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
    win.loadURL(process.env['ELECTRON_RENDERER_URL']!)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
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
  // Defense in depth: deny every renderer permission request (mic, camera,
  // geolocation, notifications, midi, etc.). The app never asks for any.
  session.defaultSession.setPermissionRequestHandler((_w, _p, callback) =>
    callback(false)
  )
  session.defaultSession.setPermissionCheckHandler(() => false)

  // Load on-disk caches (networks + deposit addresses) so first session-clicks
  // don't hit the network.
  await loadFromDisk()
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
      apiKey: str(o.apiKey),
      secret: str(o.secret),
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
      if (!Array.isArray(pairs)) throw new Error('expected array')
      return getDepositAddressesForPairs(str(accountId), pairs as CoinNetworkPair[])
    }
  )
  ipcMain.handle('exchanges:test', (_e, accountId: unknown) =>
    testConnection(str(accountId))
  )
  ipcMain.handle('exchanges:warmup', () => warmup())
  ipcMain.handle('exchanges:withdraw', (_e, input: unknown) => {
    const o = obj(input)
    return submitWithdraw({
      accountId: str(o.accountId),
      coin: str(o.coin),
      network: str(o.network),
      amount: num(o.amount),
      address: str(o.address),
      tag: typeof o.tag === 'string' ? o.tag : undefined,
      destLabel: typeof o.destLabel === 'string' ? o.destLabel : undefined
    })
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
    return submitEvmSend({
      walletId: str(o.walletId),
      coin: str(o.coin),
      amount: num(o.amount),
      chainId: num(o.chainId),
      toAddress: str(o.toAddress),
      destCexAccountId: typeof o.destCexAccountId === 'string' ? o.destCexAccountId : undefined,
      destLabel: typeof o.destLabel === 'string' ? o.destLabel : undefined
    })
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
  ipcMain.handle('solana:send', (_e, input: unknown) => {
    const o = obj(input)
    const walletId = str(o.walletId)
    const w = getWalletKeyAndNetwork(walletId)
    if (!w || w.network !== 'SOL') {
      return { ok: false, error: 'wallet not found or not a Solana wallet' }
    }
    return sendSolanaTransfer({
      secretKey: w.privateKey,
      toAddress: str(o.toAddress),
      coin: str(o.coin),
      amount: num(o.amount)
    })
  })

  // Prefs
  ipcMain.handle('prefs:get', () => getPrefs())
  ipcMain.handle('prefs:save', (_e, prefs: unknown) => savePrefs(obj(prefs) as unknown as UserPrefs))

  // RPC
  ipcMain.handle('rpc:list', () => listRpcs())
  ipcMain.handle('rpc:save', (_e, rpcs: unknown) => {
    if (!Array.isArray(rpcs)) throw new Error('expected array')
    return saveRpcs(rpcs as RpcEntry[])
  })
  ipcMain.handle('rpc:detect', (_e, url: unknown) => detectChain(str(url)))
  ipcMain.handle('rpc:ping', (_e, url: unknown) => pingRpc('once', str(url)))
  ipcMain.handle(
    'rpc:pingMany',
    (_e, entries: unknown) => {
      if (!Array.isArray(entries)) throw new Error('expected array')
      return pingMany(entries as { id: string; url: string }[])
    }
  )

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
