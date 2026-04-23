import { useEffect, useState } from "react";
import { api } from "../api.js";

type Mode = "wallet->cex" | "cex->cex";

const CEX_META: Record<
  string,
  { label: string; bg: string; text: string; short: string }
> = {
  binance: {
    label: "Binance",
    bg: "bg-yellow-500",
    text: "text-black",
    short: "BN",
  },
  bybit: {
    label: "Bybit",
    bg: "bg-orange-500",
    text: "text-white",
    short: "BY",
  },
  gate: {
    label: "Gate.io",
    bg: "bg-blue-500",
    text: "text-white",
    short: "GT",
  },
  mexc: { label: "MEXC", bg: "bg-green-500", text: "text-white", short: "MX" },
  kucoin: {
    label: "KuCoin",
    bg: "bg-teal-500",
    text: "text-white",
    short: "KC",
  },
};

const CHAIN_META: Record<string, { label: string; bg: string; text: string }> =
  {
    ethereum: { label: "Ethereum", bg: "bg-indigo-600", text: "text-white" },
    bsc: { label: "BSC", bg: "bg-yellow-400", text: "text-black" },
    polygon: { label: "Polygon", bg: "bg-purple-600", text: "text-white" },
    arbitrum: { label: "Arbitrum", bg: "bg-blue-600", text: "text-white" },
    base: { label: "Base", bg: "bg-blue-400", text: "text-white" },
    optimism: { label: "Optimism", bg: "bg-red-500", text: "text-white" },
  };

function ExchangeIcon({ exchange }: { exchange: string }) {
  const m = CEX_META[exchange] ?? {
    bg: "bg-neutral-600",
    text: "text-white",
    short: exchange.slice(0, 2).toUpperCase(),
  };
  return (
    <span
      className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold ${m.bg} ${m.text} shrink-0`}
    >
      {m.short}
    </span>
  );
}

function WalletIcon({ kind }: { kind: string }) {
  const isEvm = kind === "evm";
  return (
    <span
      className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold shrink-0 ${isEvm ? "bg-indigo-600 text-white" : "bg-purple-600 text-white"}`}
    >
      {isEvm ? "EVM" : "SOL"}
    </span>
  );
}

export default function Transfer() {
  const [mode, setMode] = useState<Mode>("wallet->cex");
  const [wallets, setWallets] = useState<any[]>([]);
  const [exchanges, setExchanges] = useState<any[]>([]);

  const [walletId, setWalletId] = useState("");
  const [fromCexId, setFromCexId] = useState("");
  const [toCexId, setToCexId] = useState("");

  const [asset, setAsset] = useState("USDT");
  const [network, setNetwork] = useState("");
  const [amount, setAmount] = useState("");

  const [evmChain, setEvmChain] = useState("ethereum");
  const [tokenAddress, setTokenAddress] = useState("");
  const [splMint, setSplMint] = useState("");

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  // New states for balances and networks
  const [walletBalances, setWalletBalances] = useState<any[]>([]);
  const [loadingBalances, setLoadingBalances] = useState(false);
  const [cexCurrencies, setCexCurrencies] = useState<any>(null);
  const [loadingCurrencies, setLoadingCurrencies] = useState(false);
  const [fromCexBalances, setFromCexBalances] = useState<[string, any][]>([]);
  const [loadingFromCex, setLoadingFromCex] = useState(false);
  const [depositInfo, setDepositInfo] = useState<any>(null);
  const [loadingDeposit, setLoadingDeposit] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    (async () => {
      setWallets(await api.wallets.list());
      setExchanges(await api.exchanges.list());
    })();
  }, []);

  const selectedWallet = wallets.find((w) => w.id === walletId);

  // Fetch balances when wallet or chain changes
  useEffect(() => {
    if (mode !== "wallet->cex" || !selectedWallet) return;

    (async () => {
      setLoadingBalances(true);
      setWalletBalances([]);
      try {
        if (selectedWallet.kind === "evm") {
          const res = await api.balances.evmAll({
            chain: evmChain,
            address: selectedWallet.address,
          });
          // sort by amount descending (assuming amount is string integer)
          res.sort((a: any, b: any) => Number(b.amount) - Number(a.amount));
          setWalletBalances(res);
        } else if (selectedWallet.kind === "solana") {
          // Sol only fetches SOL for now
          const res = await api.balances.sol({
            address: selectedWallet.address,
          });
          setWalletBalances([{ symbol: "SOL", amount: res.toString() }]);
        }
      } catch (e: any) {
        console.error(e);
      }
      setLoadingBalances(false);
    })();
  }, [selectedWallet, evmChain, mode]);

  // Fetch target cex networks
  useEffect(() => {
    if (!toCexId) return;
    (async () => {
      setLoadingCurrencies(true);
      try {
        const cur = await api.cex.currencies(toCexId);
        setCexCurrencies(cur);
      } catch (e) {
        console.error(e);
      }
      setLoadingCurrencies(false);
    })();
  }, [toCexId]);

  // Fetch source CEX balances for cex->cex
  useEffect(() => {
    if (!fromCexId || mode !== "cex->cex") {
      setFromCexBalances([]);
      return;
    }
    (async () => {
      setLoadingFromCex(true);
      setFromCexBalances([]);
      try {
        const b = await api.balances.cex(fromCexId);
        const entries = (Object.entries(b) as [string, any][])
          .filter(([, info]) => Number(info.total) > 0)
          .sort((a, b) => Number(b[1].total) - Number(a[1].total));
        setFromCexBalances(entries);
      } catch (e) {
        console.error(e);
      }
      setLoadingFromCex(false);
    })();
  }, [fromCexId, mode]);

  // Fetch deposit address for cex->cex validation
  useEffect(() => {
    if (!toCexId || !asset || !network || mode !== "cex->cex") {
      setDepositInfo(null);
      return;
    }
    (async () => {
      setLoadingDeposit(true);
      setDepositInfo(null);
      try {
        const info = await api.cex.depositAddress({
          id: toCexId,
          code: asset,
          network,
        });
        setDepositInfo(info);
      } catch (e: any) {
        setDepositInfo({ error: e.message });
      }
      setLoadingDeposit(false);
    })();
  }, [toCexId, asset, network, mode]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setResult(null);
    setBusy(true);
    try {
      if (mode === "wallet->cex") {
        const res = await api.transfer.walletToCex({
          walletId,
          toExchangeId: toCexId,
          asset,
          network: network || undefined,
          amount,
          evmChain: selectedWallet?.kind === "evm" ? evmChain : undefined,
          tokenAddress:
            selectedWallet?.kind === "evm" && tokenAddress
              ? tokenAddress
              : undefined,
          splMint:
            selectedWallet?.kind === "solana" && splMint ? splMint : undefined,
        });
        setResult(res);
      } else {
        const res = await api.transfer.cexToCex({
          fromExchangeId: fromCexId,
          toExchangeId: toCexId,
          asset,
          network,
          amount,
        });
        setResult(res);
      }
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const validNetworks = cexCurrencies?.[asset]?.networks
    ? Object.keys(cexCurrencies[asset].networks)
    : [];

  return (
    <div className="max-w-2xl space-y-4">
      <h2 className="text-xl font-semibold">Transfer</h2>

      <div className="flex gap-2">
        <button
          className={`btn-ghost ${mode === "wallet->cex" ? "bg-neutral-800" : ""}`}
          onClick={() => setMode("wallet->cex")}
        >
          Wallet → CEX
        </button>
        <button
          className={`btn-ghost ${mode === "cex->cex" ? "bg-neutral-800" : ""}`}
          onClick={() => setMode("cex->cex")}
        >
          CEX → CEX
        </button>
      </div>

      <form onSubmit={submit} className="card space-y-3">
        {mode === "wallet->cex" ? (
          <>
            <div>
              <label className="label">From wallet</label>
              <div className="flex flex-wrap gap-2 mt-1">
                {wallets.length === 0 && (
                  <span className="text-xs text-neutral-500">No wallets.</span>
                )}
                {wallets.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => setWalletId(w.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${walletId === w.id ? "border-blue-500 bg-neutral-800" : "border-neutral-700 bg-neutral-900 hover:bg-neutral-800"}`}
                  >
                    <WalletIcon kind={w.kind} />
                    <div className="text-left">
                      <div className="text-sm font-medium leading-none">
                        {w.label}
                      </div>
                      <div className="text-xs text-neutral-500 mt-0.5">
                        {w.kind}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            {selectedWallet?.kind === "evm" && (
              <div>
                <label className="label">EVM chain</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {Object.entries(CHAIN_META).map(([key, m]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setEvmChain(key)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm transition-colors ${evmChain === key ? "border-blue-500 bg-neutral-800" : "border-neutral-700 bg-neutral-900 hover:bg-neutral-800"}`}
                    >
                      <span className={`w-3 h-3 rounded-full ${m.bg}`} />
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Wallet Balances picker */}
            {selectedWallet && (
              <div className="bg-neutral-900 border border-neutral-800 p-2 rounded">
                <label className="label">Select Asset from Balance</label>
                {loadingBalances ? (
                  <div className="text-xs text-neutral-500">
                    Loading balances...
                  </div>
                ) : walletBalances.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    {walletBalances.map((b, i) => (
                      <div
                        key={i}
                        className={`p-2 rounded cursor-pointer border ${b.symbol === asset ? "border-primary-500 bg-neutral-800" : "border-neutral-700 hover:bg-neutral-800"}`}
                        onClick={() => {
                          setAsset(b.symbol);
                          if (selectedWallet.kind === "evm")
                            setTokenAddress(b.address || "");
                          if (selectedWallet.kind === "solana") setSplMint("");
                        }}
                      >
                        <div className="text-sm font-bold">{b.symbol}</div>
                        <div className="text-xs text-neutral-400 break-all">
                          {b.amount}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-neutral-500">
                    No balances found or unsupported.
                  </div>
                )}
              </div>
            )}

            {/* Manual token overrides */}
            {(selectedWallet?.kind === "evm" ||
              selectedWallet?.kind === "solana") && (
              <div>
                <button
                  type="button"
                  className="text-xs text-neutral-500 hover:text-neutral-300"
                  onClick={() => setShowAdvanced((v) => !v)}
                >
                  {showAdvanced
                    ? "▲ Hide advanced"
                    : "▼ Advanced (token contract)"}
                </button>
                {showAdvanced && (
                  <>
                    {selectedWallet.kind === "evm" && (
                      <div className="mt-2">
                        <label className="label">
                          Token contract (leave empty for native)
                        </label>
                        <input
                          className="input font-mono"
                          value={tokenAddress}
                          onChange={(e) => setTokenAddress(e.target.value)}
                          placeholder="0x..."
                        />
                      </div>
                    )}
                    {selectedWallet.kind === "solana" && (
                      <div className="mt-2">
                        <label className="label">
                          SPL mint (leave empty for SOL)
                        </label>
                        <input
                          className="input font-mono"
                          value={splMint}
                          onChange={(e) => setSplMint(e.target.value)}
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <div>
              <label className="label">From exchange</label>
              <div className="flex flex-wrap gap-2 mt-1">
                {exchanges.length === 0 && (
                  <span className="text-xs text-neutral-500">
                    No exchanges.
                  </span>
                )}
                {exchanges.map((x) => (
                  <button
                    key={x.id}
                    type="button"
                    onClick={() => {
                      setFromCexId(x.id);
                      setAsset("");
                      setAmount("");
                    }}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${fromCexId === x.id ? "border-blue-500 bg-neutral-800" : "border-neutral-700 bg-neutral-900 hover:bg-neutral-800"}`}
                  >
                    <ExchangeIcon exchange={x.exchange} />
                    <div className="text-left">
                      <div className="text-sm font-medium leading-none">
                        {x.label}
                      </div>
                      <div className="text-xs text-neutral-500 mt-0.5">
                        {x.exchange}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Available balance picker */}
            {fromCexId && (
              <div className="bg-neutral-900 border border-neutral-800 p-2 rounded">
                <label className="label">
                  Available balance (click to select)
                </label>
                {loadingFromCex ? (
                  <div className="text-xs text-neutral-500">
                    Loading balances…
                  </div>
                ) : fromCexBalances.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    {fromCexBalances.map(([sym, info]) => (
                      <div
                        key={sym}
                        className={`p-2 rounded cursor-pointer border ${sym === asset ? "border-blue-500 bg-neutral-800" : "border-neutral-700 hover:bg-neutral-800"}`}
                        onClick={() => {
                          setAsset(sym);
                        }}
                      >
                        <div className="text-sm font-bold">{sym}</div>
                        <div className="text-xs text-neutral-400">
                          Free: {Number(info.free).toFixed(4)}
                        </div>
                        <div className="text-xs text-neutral-600">
                          Total: {Number(info.total).toFixed(4)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-neutral-500 mt-1">
                    No balance found.
                  </div>
                )}
              </div>
            )}
          </>
        )}

        <div>
          <label className="label">To exchange</label>
          <div className="flex flex-wrap gap-2 mt-1">
            {exchanges.length === 0 && (
              <span className="text-xs text-neutral-500">No exchanges.</span>
            )}
            {exchanges.map((x) => (
              <button
                key={x.id}
                type="button"
                onClick={() => setToCexId(x.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${toCexId === x.id ? "border-blue-500 bg-neutral-800" : "border-neutral-700 bg-neutral-900 hover:bg-neutral-800"}`}
              >
                <ExchangeIcon exchange={x.exchange} />
                <div className="text-left">
                  <div className="text-sm font-medium leading-none">
                    {x.label}
                  </div>
                  <div className="text-xs text-neutral-500 mt-0.5">
                    {x.exchange}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="label">Asset</label>
            {mode === "cex->cex" ? (
              <div
                className={`input flex items-center ${asset ? "text-white" : "text-neutral-500"}`}
              >
                {asset || "Pick from balance above"}
              </div>
            ) : (
              <input
                className="input"
                value={asset}
                onChange={(e) => setAsset(e.target.value)}
                required
              />
            )}
          </div>
          <div>
            <label className="label">
              Network {mode === "cex->cex" ? "(required)" : "(CEX network)"}
              {loadingCurrencies && (
                <span className="text-xs text-neutral-500 ml-2">
                  Loading...
                </span>
              )}
            </label>

            {/* If we loaded networks for this asset on the destination CEX, show a dropdown */}
            {validNetworks.length > 0 ? (
              <select
                className="input"
                value={network}
                onChange={(e) => setNetwork(e.target.value)}
              >
                <option value="">Select matching CEX network...</option>
                {validNetworks.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="input"
                value={network}
                onChange={(e) => setNetwork(e.target.value)}
                placeholder="e.g. ERC20, BEP20, SOL"
                required={mode === "cex->cex"}
              />
            )}
          </div>
          <div>
            <label className="label">Amount</label>
            <div className="flex gap-1">
              <input
                className="input flex-1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
              {mode === "cex->cex" && asset && fromCexBalances.length > 0 && (
                <button
                  type="button"
                  className="btn-ghost text-xs px-2"
                  onClick={() => {
                    const found = fromCexBalances.find(
                      ([sym]) => sym === asset,
                    );
                    if (found) setAmount(String(found[1].free ?? ""));
                  }}
                >
                  Max
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Deposit address validation for cex->cex */}
        {mode === "cex->cex" && (loadingDeposit || depositInfo) && (
          <div className="bg-neutral-900 border border-neutral-800 rounded p-3 text-xs space-y-1">
            <div className="text-neutral-400 font-medium">
              Destination deposit address
            </div>
            {loadingDeposit && (
              <div className="text-neutral-500">Fetching…</div>
            )}
            {depositInfo?.error && (
              <div className="text-red-400">{depositInfo.error}</div>
            )}
            {depositInfo && !depositInfo.error && (
              <>
                <div className="font-mono break-all text-neutral-200">
                  {depositInfo.address}
                </div>
                {depositInfo.tag && (
                  <div className="text-yellow-400">
                    Memo / Tag: {depositInfo.tag}
                  </div>
                )}
                <div className="text-green-500">
                  ✓ Address verified for {asset} / {network}
                </div>
              </>
            )}
          </div>
        )}

        {err && <div className="text-sm text-red-400">{err}</div>}
        {result && (
          <pre className="text-xs bg-neutral-950 p-3 rounded overflow-auto">
            {JSON.stringify(result, null, 2)}
          </pre>
        )}

        <button className="btn" disabled={busy}>
          {busy ? "Submitting…" : "Submit transfer"}
        </button>
      </form>
    </div>
  );
}
