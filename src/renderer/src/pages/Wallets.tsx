import { useEffect, useState } from "react";
import { api } from "../api.js";

export default function Wallets() {
  const [list, setList] = useState<any[]>([]);
  const [kind, setKind] = useState<"evm" | "solana">("evm");
  const [label, setLabel] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setList(await api.wallets.list());
  }
  useEffect(() => {
    refresh();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await api.wallets.add({ kind, label, privateKey: privateKey.trim() });
      setLabel("");
      setPrivateKey("");
      await refresh();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Remove this wallet? The encrypted key will be deleted."))
      return;
    await api.wallets.remove(id);
    await refresh();
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <h2 className="text-xl font-semibold">Wallets</h2>

      <form onSubmit={add} className="card space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Kind</label>
            <select
              className="input"
              value={kind}
              onChange={(e) => setKind(e.target.value as any)}
            >
              <option value="evm">EVM</option>
              <option value="solana">Solana</option>
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
          <label className="label">
            Private key{" "}
            {kind === "evm"
              ? "(hex, with or without 0x)"
              : "(base58 or JSON array)"}
          </label>
          <textarea
            className="input font-mono text-xs"
            rows={3}
            value={privateKey}
            onChange={(e) => setPrivateKey(e.target.value)}
            required
          />
          <div className="text-xs text-neutral-500 mt-1">
            Encrypted with your master password before being stored.
          </div>
        </div>
        {err && <div className="text-sm text-red-400">{err}</div>}
        <button className="btn" disabled={busy}>
          {busy ? "Adding…" : "Add wallet"}
        </button>
      </form>

      <div className="space-y-2">
        {list.map((w) => (
          <div key={w.id} className="card flex items-center justify-between">
            <div>
              <div className="font-medium">{w.label}</div>
              <div className="text-xs text-neutral-400 font-mono">
                {w.kind} · {w.address}
              </div>
            </div>
            <button className="btn-danger" onClick={() => remove(w.id)}>
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
