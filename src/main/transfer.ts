import { randomBytes } from "crypto";
import { vault } from "./vault.js";
import * as evm from "./web3/evm.js";
import * as sol from "./web3/solana.js";
import * as cex from "./exchanges/ccxt.js";
import type { EvmChain, TxHistoryItem } from "../shared/types.js";

// ---------- Wallet -> CEX ----------
export interface WalletToCexParams {
  walletId: string;
  toExchangeId: string; // our stored exchange id
  asset: string; // code, e.g. USDT, ETH, SOL
  network?: string; // CEX network code (e.g. ERC20, BEP20, TRC20, SOL)
  amount: string;
  // EVM routing
  evmChain?: EvmChain;
  rpcId?: string;
  tokenAddress?: string; // ERC20 token contract; omit for native
  // Solana routing
  splMint?: string;
}

export async function walletToCex(
  p: WalletToCexParams,
): Promise<TxHistoryItem> {
  const wallets = vault.listWallets();
  const w = wallets.find((x) => x.id === p.walletId);
  if (!w) throw new Error("Wallet not found");
  const creds = vault.getExchangeCreds(p.toExchangeId);

  // 1. Get deposit address from CEX
  const dep = await cex.fetchDepositAddress(
    creds.exchange,
    creds.apiKey,
    creds.secret,
    p.asset,
    p.network,
    creds.password,
  );

  // 2. Send from wallet
  let txid = "";
  if (w.kind === "evm") {
    if (!p.evmChain) throw new Error("evmChain required");
    const rc = evm.resolveChain(p.evmChain, vault.listRpcs(), p.rpcId);
    const pk = vault.getWalletPrivateKey(w.id);
    try {
      if (p.tokenAddress) {
        txid = await evm.sendErc20(
          rc,
          pk,
          p.tokenAddress,
          dep.address,
          p.amount,
        );
      } else {
        txid = await evm.sendNative(rc, pk, dep.address, p.amount);
      }
    } finally {
      // best-effort wipe
      void pk;
    }
  } else if (w.kind === "solana") {
    const sk = vault.getWalletPrivateKey(w.id);
    const rpcs = vault.listRpcs();
    const rpc = rpcs.find(
      (r) => r.chain === "custom" && r.name.toLowerCase().includes("sol"),
    )?.url;
    if (p.splMint) {
      txid = await sol.sendSpl(rpc, sk, p.splMint, dep.address, p.amount);
    } else {
      txid = await sol.sendSol(rpc, sk, dep.address, p.amount);
    }
  } else {
    throw new Error("Unsupported wallet kind");
  }

  const item: TxHistoryItem = {
    id: randomBytes(6).toString("hex"),
    ts: Date.now(),
    kind: "wallet->cex",
    from: w.label,
    to: `${creds.exchange}${p.network ? ":" + p.network : ""}`,
    asset: p.asset,
    network: p.network || (w.kind === "solana" ? "SOL" : p.evmChain || ""),
    amount: p.amount,
    status: "submitted",
    txidOrWithdrawId: txid,
  };
  await vault.appendHistory(item);
  return item;
}

// ---------- CEX -> CEX ----------
export interface CexToCexParams {
  fromExchangeId: string;
  toExchangeId: string;
  asset: string;
  network: string;
  amount: string;
}

export async function cexToCex(p: CexToCexParams): Promise<TxHistoryItem> {
  const src = vault.getExchangeCreds(p.fromExchangeId);
  const dst = vault.getExchangeCreds(p.toExchangeId);

  const dep = await cex.fetchDepositAddress(
    dst.exchange,
    dst.apiKey,
    dst.secret,
    p.asset,
    p.network,
    dst.password,
  );

  const wres = await cex.withdraw(
    src.exchange,
    src.apiKey,
    src.secret,
    p.asset,
    p.amount,
    dep.address,
    p.network,
    dep.tag,
    src.password,
  );

  const item: TxHistoryItem = {
    id: randomBytes(6).toString("hex"),
    ts: Date.now(),
    kind: "cex->cex",
    from: src.exchange,
    to: dst.exchange,
    asset: p.asset,
    network: p.network,
    amount: p.amount,
    status: "submitted",
    txidOrWithdrawId: wres.id,
  };
  await vault.appendHistory(item);
  return item;
}
