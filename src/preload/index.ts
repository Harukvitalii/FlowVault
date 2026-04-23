import { contextBridge, ipcRenderer } from "electron";

const invoke = (channel: string, ...args: unknown[]) =>
  ipcRenderer.invoke(channel, ...args);

const api = {
  vault: {
    status: () => invoke("vault:status"),
    create: (password: string) => invoke("vault:create", password),
    unlock: (password: string) => invoke("vault:unlock", password),
    lock: () => invoke("vault:lock"),
  },
  wallets: {
    list: () => invoke("wallets:list"),
    add: (p: { kind: "evm" | "solana"; label: string; privateKey: string }) =>
      invoke("wallets:add", p),
    remove: (id: string) => invoke("wallets:remove", id),
  },
  exchanges: {
    list: () => invoke("exchanges:list"),
    add: (p: {
      exchange: string;
      label: string;
      apiKey: string;
      secret: string;
      password?: string;
    }) => invoke("exchanges:add", p),
    remove: (id: string) => invoke("exchanges:remove", id),
  },
  rpcs: {
    list: () => invoke("rpcs:list"),
    add: (p: { chain: string; chainId: number; name: string; url: string }) =>
      invoke("rpcs:add", p),
    remove: (id: string) => invoke("rpcs:remove", id),
    ping: (url: string) => invoke("rpcs:ping", url),
  },
  balances: {
    evmAll: (p: {
      chain: string;
      rpcId?: string;
      address: string;
      token?: string;
    }) => invoke("balance:evmAll", p),
    evm: (p: {
      chain: string;
      rpcId?: string;
      address: string;
      token?: string;
    }) => invoke("balance:evm", p),
    sol: (p: { rpcUrl?: string; address: string; mint?: string }) =>
      invoke("balance:sol", p),
    cex: (id: string) => invoke("balance:cex", id),
  },
  cex: {
    depositAddress: (p: { id: string; code: string; network?: string }) =>
      invoke("cex:depositAddress", p),
    currencies: (id: string) => invoke("cex:currencies", id),
  },
  transfer: {
    walletToCex: (p: unknown) => invoke("transfer:walletToCex", p),
    cexToCex: (p: unknown) => invoke("transfer:cexToCex", p),
  },
  history: {
    list: () => invoke("history:list"),
  },
};

contextBridge.exposeInMainWorld("api", api);

export type Api = typeof api;
