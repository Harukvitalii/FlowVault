import { useEffect, useState } from "react";
import { api } from "../api.js";

const EXCHANGES = ["binance", "bybit", "mexc", "gate", "kucoin"] as const;

export default function Exchanges() {
  const [list, setList] = useState<any[]>([]);
  const [exchange, setExchange] =
    useState<(typeof EXCHANGES)[number]>("binance");
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [secret, setSecret] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setList(await api.exchanges.list());
  }
  useEffect(() => {
    refresh();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await api.exchanges.add({
        exchange,
        label,
        apiKey: apiKey.trim(),
        secret: secret.trim(),
        password: password.trim() || undefined,
      });
      setLabel("");
      setApiKey("");
      setSecret("");
      setPassword("");
      await refresh();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Remove this exchange?")) return;
    await api.exchanges.remove(id);
    await refresh();
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <h2 className="text-xl font-semibold">Exchanges</h2>

      <form onSubmit={add} className="card space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Exchange</label>
            <select
              className="input"
              value={exchange}
              onChange={(e) => setExchange(e.target.value as any)}
            >
              {EXCHANGES.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Label</label>
            <input
              className="input"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
            />
          </div>
        </div>
        <div>
          <label className="label">API Key</label>
          <input
            className="input font-mono"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label">API Secret</label>
          <input
            className="input font-mono"
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            required
          />
        </div>
        {exchange === "kucoin" && (
          <div>
            <label className="label">Passphrase (KuCoin)</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        )}
        <div className="text-xs text-neutral-500">
          Credentials are encrypted with your master password. Grant only
          withdrawal-to-whitelisted-addresses permission.
        </div>
        {err && <div className="text-sm text-red-400">{err}</div>}
        <button className="btn" disabled={busy}>
          {busy ? "Adding…" : "Add exchange"}
        </button>
      </form>

      <div className="space-y-2">
        {list.map((e) => (
          <div key={e.id} className="card flex items-center justify-between">
            <div>
              <div className="font-medium">
                {e.label}{" "}
                <span className="text-neutral-500 text-xs">({e.exchange})</span>
              </div>
            </div>
            <button className="btn-danger" onClick={() => remove(e.id)}>
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
