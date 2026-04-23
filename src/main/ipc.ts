import { ipcMain } from "electron";
import { vault } from "./vault.js";
import * as evm from "./web3/evm.js";
import * as sol from "./web3/solana.js";
import * as cex from "./exchanges/ccxt.js";
import * as transfer from "./transfer.js";
import type { ExchangeId, EvmChain } from "../shared/types.js";

type Handler = (...args: any[]) => any;
const handlers: Record<string, Handler> = {
  // ---- Vault lifecycle ----
  "vault:status": async () => ({
    exists: await vault.exists(),
    unlocked: vault.isUnlocked(),
  }),
  "vault:create": async (_e: unknown, password: string) =>
    vault.create(password),
  "vault:unlock": async (_e: unknown, password: string) =>
    vault.unlock(password),
  "vault:lock": async () => vault.lock(),

  // ---- Wallets ----
  "wallets:list": async () => vault.listWallets(),
  "wallets:add": async (
    _e: unknown,
    payload: { kind: "evm" | "solana"; label: string; privateKey: string },
  ) => {
    const address =
      payload.kind === "evm"
        ? evm.addressFromPrivateKey(payload.privateKey)
        : sol.addressFromSecret(payload.privateKey);
    return vault.addWallet({
      kind: payload.kind,
      label: payload.label,
      address,
      privateKey: payload.privateKey,
    });
  },
  "wallets:remove": async (_e: unknown, id: string) => vault.removeWallet(id),

  // ---- Exchanges ----
  "exchanges:list": async () => vault.listExchanges(),
  "exchanges:add": async (
    _e: unknown,
    p: {
      exchange: ExchangeId;
      label: string;
      apiKey: string;
      secret: string;
      password?: string;
    },
  ) => vault.addExchange(p),
  "exchanges:remove": async (_e: unknown, id: string) =>
    vault.removeExchange(id),

  // ---- RPCs ----
  "rpcs:list": async () => vault.listRpcs(),
  "rpcs:add": async (
    _e: unknown,
    p: { chain: EvmChain; chainId: number; name: string; url: string },
  ) => vault.addRpc(p),
  "rpcs:remove": async (_e: unknown, id: string) => vault.removeRpc(id),
  "rpcs:ping": async (_e: unknown, url: string) => evm.pingRpc(url),

  // ---- Balances ----
  "balance:evmAll": async (
    _e: unknown,
    p: { chain: EvmChain; rpcId?: string; address: string },
  ) => {
    const rc = evm.resolveChain(p.chain, vault.listRpcs(), p.rpcId);
    return evm.getWalletBalances(rc, p.address);
  },
  "balance:evm": async (
    _e: unknown,
    p: { chain: EvmChain; rpcId?: string; address: string; token?: string },
  ) => {
    const rc = evm.resolveChain(p.chain, vault.listRpcs(), p.rpcId);
    if (p.token) return evm.getErc20Balance(rc, p.token, p.address);
    return { amount: await evm.getNativeBalance(rc, p.address) };
  },
  "balance:sol": async (
    _e: unknown,
    p: { rpcUrl?: string; address: string; mint?: string },
  ) => {
    if (p.mint) return sol.getSplBalance(p.rpcUrl, p.mint, p.address);
    return { amount: await sol.getSolBalance(p.rpcUrl, p.address) };
  },
  "balance:cex": async (_e: unknown, id: string) => {
    const c = vault.getExchangeCreds(id);
    return cex.fetchBalances(c.exchange, c.apiKey, c.secret, c.password);
  },
  "cex:depositAddress": async (
    _e: unknown,
    p: { id: string; code: string; network?: string },
  ) => {
    const c = vault.getExchangeCreds(p.id);
    return cex.fetchDepositAddress(
      c.exchange,
      c.apiKey,
      c.secret,
      p.code,
      p.network,
      c.password,
    );
  },
  "cex:currencies": async (_e: unknown, id: string) => {
    const c = vault.getExchangeCreds(id);
    return cex.fetchCurrencies(c.exchange, c.apiKey, c.secret, c.password);
  },

  // ---- Transfer ----
  "transfer:walletToCex": async (_e: unknown, p: transfer.WalletToCexParams) =>
    transfer.walletToCex(p),
  "transfer:cexToCex": async (_e: unknown, p: transfer.CexToCexParams) =>
    transfer.cexToCex(p),

  // ---- History ----
  "history:list": async () => vault.listHistory(),
};

export function registerIpc() {
  for (const [channel, fn] of Object.entries(handlers)) {
    ipcMain.handle(channel, async (event, ...args) => {
      try {
        return { ok: true, data: await fn(event, ...args) };
      } catch (err: any) {
        return { ok: false, error: err?.message ?? String(err) };
      }
    });
  }
}

export const IPC_CHANNELS = Object.keys(handlers);
