import ccxt, { type Exchange } from "ccxt";
import type { ExchangeId } from "../../shared/types.js";

export function createExchange(
  id: ExchangeId,
  apiKey: string,
  secret: string,
  password?: string,
): Exchange {
  const ctor = (ccxt as any)[id] as new (opts: any) => Exchange;
  if (!ctor) throw new Error(`Unsupported exchange: ${id}`);
  return new ctor({
    apiKey,
    secret,
    password,
    enableRateLimit: true,
    options: { defaultType: "spot" },
  });
}

export async function fetchBalances(
  id: ExchangeId,
  apiKey: string,
  secret: string,
  password?: string,
): Promise<Record<string, { free: number; used: number; total: number }>> {
  const ex = createExchange(id, apiKey, secret, password);
  const bal = await ex.fetchBalance();
  const out: Record<string, { free: number; used: number; total: number }> = {};
  for (const [asset, info] of Object.entries(bal.total || {})) {
    const total = Number(info) || 0;
    if (total > 0) {
      out[asset] = {
        total,
        free: Number((bal.free as any)?.[asset]) || 0,
        used: Number((bal.used as any)?.[asset]) || 0,
      };
    }
  }
  return out;
}

export async function fetchDepositAddress(
  id: ExchangeId,
  apiKey: string,
  secret: string,
  code: string,
  network?: string,
  password?: string,
): Promise<{ address: string; tag?: string; network?: string }> {
  const ex = createExchange(id, apiKey, secret, password);
  const params = network ? { network } : undefined;
  const addr = await ex.fetchDepositAddress(code, params);
  return {
    address: addr.address,
    tag: addr.tag,
    network: (addr as any).network,
  };
}

export async function fetchCurrencies(
  id: ExchangeId,
  apiKey: string,
  secret: string,
  password?: string,
) {
  const ex = createExchange(id, apiKey, secret, password);
  await ex.loadMarkets();
  return ex.currencies;
}

export async function withdraw(
  id: ExchangeId,
  apiKey: string,
  secret: string,
  code: string,
  amount: string,
  address: string,
  network?: string,
  tag?: string,
  password?: string,
): Promise<{ id: string; raw: unknown }> {
  const ex = createExchange(id, apiKey, secret, password);
  const params: Record<string, unknown> = {};
  if (network) params.network = network;
  const res = await ex.withdraw(code, Number(amount), address, tag, params);
  return { id: String(res.id ?? ""), raw: res };
}
