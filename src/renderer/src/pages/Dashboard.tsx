import { useEffect, useState, useCallback } from "react";
import { api } from "../api.js";

export default function Dashboard() {
  const [wallets, setWallets] = useState<any[]>([]);
  const [exchanges, setExchanges] = useState<any[]>([]);
  const [cexBalances, setCexBalances] = useState<Record<string, any>>({});
  const [walletBalances, setWalletBalances] = useState<Record<string, any[]>>(
    {},
  );
  const [walletBusy, setWalletBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [ws, exs] = await Promise.all([
        api.wallets.list(),
        api.exchanges.list(),
      ]);
      setWallets(ws);
      setExchanges(exs);
    })();
  }, []);

  const refreshWalletBalances = useCallback(async (walletList: any[]) => {
    if (walletList.length === 0) return;
    setWalletBusy(true);
    const out: Record<string, any[]> = {};
    await Promise.all(
      walletList.map(async (w) => {
        try {
          if (w.kind === "evm") {
            const res = await api.balances.evmAll({
              chain: "ethereum",
              address: w.address,
            });
            out[w.id] = res.filter((b: any) => Number(b.amount) > 0);
          } else if (w.kind === "solana") {
            const res = await api.balances.sol({ address: w.address });
            out[w.id] = [{ symbol: "SOL", amount: res.amount }];
          }
        } catch {
          out[w.id] = [];
        }
      }),
    );
    setWalletBalances((prev) => ({ ...prev, ...out }));
    setWalletBusy(false);
  }, []);

  useEffect(() => {
    if (wallets.length === 0) return;
    refreshWalletBalances(wallets);
    const id = setInterval(() => refreshWalletBalances(wallets), 30_000);
    return () => clearInterval(id);
  }, [wallets, refreshWalletBalances]);

  const refreshCex = useCallback(async () => {
    setBusy(true);
    setErr(null);
    const out: Record<string, any> = {};
    for (const e of exchanges) {
      try {
        out[e.id] = await api.balances.cex(e.id);
      } catch (x: any) {
        out[e.id] = { error: x.message };
      }
    }
    setCexBalances(out);
    setBusy(false);
  }, [exchanges]);

  useEffect(() => {
    if (exchanges.length === 0) return;
    refreshCex();
    const interval = setInterval(() => {
      refreshCex();
    }, 10000); // 10s auto refresh
    return () => clearInterval(interval);
  }, [exchanges, refreshCex]);

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-semibold">Wallets</h2>
          {walletBusy && (
            <span className="text-xs text-neutral-500">Refreshing…</span>
          )}
        </div>
        <div className="grid gap-2">
          {wallets.length === 0 && (
            <div className="text-neutral-500 text-sm">No wallets yet.</div>
          )}
          {wallets.map((w) => {
            const bals = walletBalances[w.id];
            return (
              <div key={w.id} className="card">
                <div className="font-medium">{w.label}</div>
                <div className="text-xs text-neutral-400">
                  {w.kind} · {w.address}
                </div>
                {bals && bals.length > 0 && (
                  <div className="mt-2 grid grid-cols-3 md:grid-cols-6 gap-1 text-xs">
                    {bals.map((b: any, i: number) => (
                      <div
                        key={i}
                        className="bg-neutral-800/50 rounded px-2 py-1"
                      >
                        <div className="text-neutral-300">{b.symbol}</div>
                        <div className="text-neutral-500">
                          {Number(b.amount).toFixed(4)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {bals !== undefined && bals.length === 0 && (
                  <div className="text-xs text-neutral-600 mt-1">
                    No balances (ethereum)
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-semibold">Exchanges</h2>
          <button
            className="btn-ghost"
            onClick={refreshCex}
            disabled={busy || exchanges.length === 0}
          >
            {busy ? "Loading…" : "Refresh balances"}
          </button>
        </div>
        {err && <div className="text-red-400 text-sm">{err}</div>}
        <div className="grid gap-2">
          {exchanges.length === 0 && (
            <div className="text-neutral-500 text-sm">No exchanges yet.</div>
          )}
          {exchanges.map((e) => {
            const b = cexBalances[e.id];
            return (
              <div key={e.id} className="card">
                <div className="font-medium">
                  {e.label}{" "}
                  <span className="text-neutral-500 text-xs">
                    ({e.exchange})
                  </span>
                </div>
                {b?.error && (
                  <div className="text-red-400 text-xs mt-1">{b.error}</div>
                )}
                {b && !b.error && (
                  <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-1 text-xs">
                    {Object.entries(b).map(([asset, info]: any) => (
                      <div
                        key={asset}
                        className="bg-neutral-800/50 rounded px-2 py-1"
                      >
                        <div className="text-neutral-300">{asset}</div>
                        <div className="text-neutral-500">{info.total}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
