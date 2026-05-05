import { contextBridge, ipcRenderer } from 'electron'
import type { Api } from '../shared/types'

const api: Api = {
  vault: {
    state: () => ipcRenderer.invoke('vault:state'),
    create: (masterKey) => ipcRenderer.invoke('vault:create', masterKey),
    unlock: (masterKey) => ipcRenderer.invoke('vault:unlock', masterKey),
    lock: () => ipcRenderer.invoke('vault:lock'),
    changeMasterKey: (oldKey, newKey) =>
      ipcRenderer.invoke('vault:changeMasterKey', oldKey, newKey),
    wipe: () => ipcRenderer.invoke('vault:wipe')
  },
  exchanges: {
    list: () => ipcRenderer.invoke('exchanges:list'),
    upsert: (input) => ipcRenderer.invoke('exchanges:upsert', input),
    remove: (accountId) => ipcRenderer.invoke('exchanges:remove', accountId),
    getBalances: (accountId) =>
      ipcRenderer.invoke('exchanges:getBalances', accountId),
    getNetworks: (accountId, coin) =>
      ipcRenderer.invoke('exchanges:getNetworks', accountId, coin),
    getWithdrawNetworks: (accountId) =>
      ipcRenderer.invoke('exchanges:getWithdrawNetworks', accountId),
    getDepositAddressesForPairs: (accountId, pairs) =>
      ipcRenderer.invoke(
        'exchanges:getDepositAddressesForPairs',
        accountId,
        pairs
      ),
    getDepositAddresses: (accountId, coin, network) =>
      ipcRenderer.invoke(
        'exchanges:getDepositAddresses',
        accountId,
        coin,
        network
      ),
    test: (accountId) => ipcRenderer.invoke('exchanges:test', accountId),
    warmup: () => ipcRenderer.invoke('exchanges:warmup'),
    withdraw: (input) => ipcRenderer.invoke('exchanges:withdraw', input),
    transfer: (input) => ipcRenderer.invoke('exchanges:transfer', input),
    preflight: (input) => ipcRenderer.invoke('exchanges:preflight', input)
  },
  evm: {
    preflight: (input) => ipcRenderer.invoke('evm:preflight', input),
    submit: (input) => ipcRenderer.invoke('evm:submit', input)
  },
  withdrawals: {
    list: () => ipcRenderer.invoke('withdrawals:list'),
    clear: () => ipcRenderer.invoke('withdrawals:clear'),
    remove: (id) => ipcRenderer.invoke('withdrawals:remove', id),
    onUpdate: (cb) => {
      const handler = (_e: unknown, records: unknown) =>
        cb(records as Parameters<typeof cb>[0])
      ipcRenderer.on('withdrawals:updated', handler)
      return () =>
        ipcRenderer.removeListener('withdrawals:updated', handler)
    }
  },
  deposits: {
    list: () => ipcRenderer.invoke('deposits:list'),
    onUpdate: (cb) => {
      const handler = (_e: unknown, records: unknown) =>
        cb(records as Parameters<typeof cb>[0])
      ipcRenderer.on('deposits:updated', handler)
      return () =>
        ipcRenderer.removeListener('deposits:updated', handler)
    }
  },
  wallets: {
    list: () => ipcRenderer.invoke('wallets:list'),
    add: (input) => ipcRenderer.invoke('wallets:add', input),
    remove: (id) => ipcRenderer.invoke('wallets:remove', id),
    getBalances: (address) =>
      ipcRenderer.invoke('wallets:getBalances', address),
    getSolBalances: (address) =>
      ipcRenderer.invoke('wallets:getSolBalances', address)
  },
  solana: {
    send: (input) => ipcRenderer.invoke('solana:send', input)
  },
  prefs: {
    get: () => ipcRenderer.invoke('prefs:get'),
    save: (prefs) => ipcRenderer.invoke('prefs:save', prefs)
  },
  proxy: {
    test: (input) => ipcRenderer.invoke('proxy:test', input),
    checkIp: () => ipcRenderer.invoke('proxy:checkIp')
  },
  rpc: {
    list: () => ipcRenderer.invoke('rpc:list'),
    save: (rpcs) => ipcRenderer.invoke('rpc:save', rpcs),
    detect: (url) => ipcRenderer.invoke('rpc:detect', url),
    ping: (url) => ipcRenderer.invoke('rpc:ping', url),
    pingMany: (entries) => ipcRenderer.invoke('rpc:pingMany', entries),
    latest: () => ipcRenderer.invoke('rpc:latest'),
    refresh: () => ipcRenderer.invoke('rpc:refresh'),
    onLatencies: (cb) => {
      const handler = (_e: unknown, snapshot: unknown) =>
        cb(snapshot as Parameters<typeof cb>[0])
      ipcRenderer.on('rpc:latencies', handler)
      return () => ipcRenderer.removeListener('rpc:latencies', handler)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)
