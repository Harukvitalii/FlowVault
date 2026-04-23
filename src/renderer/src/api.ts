// Thin wrapper that unwraps `{ ok, data, error }` envelopes from IPC.

async function call<T>(p: Promise<any>): Promise<T> {
  const res = await p;
  if (!res?.ok) throw new Error(res?.error || "IPC error");
  return res.data as T;
}

export const api = {
  vault: {
    status: () =>
      call<{ exists: boolean; unlocked: boolean }>(window.api.vault.status()),
    create: (pwd: string) => call<void>(window.api.vault.create(pwd)),
    unlock: (pwd: string) => call<void>(window.api.vault.unlock(pwd)),
    lock: () => call<void>(window.api.vault.lock()),
  },
  wallets: {
    list: () => call<any[]>(window.api.wallets.list()),
    add: (p: any) => call<any>(window.api.wallets.add(p)),
    remove: (id: string) => call<void>(window.api.wallets.remove(id)),
  },
  exchanges: {
    list: () => call<any[]>(window.api.exchanges.list()),
    add: (p: any) => call<any>(window.api.exchanges.add(p)),
    remove: (id: string) => call<void>(window.api.exchanges.remove(id)),
  },
  rpcs: {
    list: () => call<any[]>(window.api.rpcs.list()),
    add: (p: any) => call<any>(window.api.rpcs.add(p)),
    remove: (id: string) => call<void>(window.api.rpcs.remove(id)),
    ping: (url: string) => call<number>(window.api.rpcs.ping(url)),
  },
  balances: {
    evmAll: (p: any) => call<any>(window.api.balances.evmAll(p)),
    evm: (p: any) => call<any>(window.api.balances.evm(p)),
    sol: (p: any) => call<any>(window.api.balances.sol(p)),
    cex: (id: string) => call<any>(window.api.balances.cex(id)),
  },
  cex: {
    depositAddress: (p: any) => call<any>(window.api.cex.depositAddress(p)),
    currencies: (id: string) => call<any>(window.api.cex.currencies(id)),
  },
  transfer: {
    walletToCex: (p: any) => call<any>(window.api.transfer.walletToCex(p)),
    cexToCex: (p: any) => call<any>(window.api.transfer.cexToCex(p)),
  },
  history: {
    list: () => call<any[]>(window.api.history.list()),
  },
};
