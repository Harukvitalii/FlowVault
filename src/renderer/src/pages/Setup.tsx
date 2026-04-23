import { useState } from "react";
import { api } from "../api.js";

export default function Setup({ onDone }: { onDone: () => void }) {
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (pwd.length < 8) return setErr("Password must be at least 8 characters");
    if (pwd !== pwd2) return setErr("Passwords do not match");
    setBusy(true);
    try {
      await api.vault.create(pwd);
      onDone();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-full flex items-center justify-center p-6">
      <form onSubmit={submit} className="card w-full max-w-md space-y-4">
        <h1 className="text-xl font-semibold">Create master password</h1>
        <p className="text-sm text-neutral-400">
          This password encrypts all keys stored locally. It is never sent
          anywhere and cannot be recovered if lost.
        </p>
        <div>
          <label className="label">Master password</label>
          <input
            type="password"
            className="input"
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            autoFocus
          />
        </div>
        <div>
          <label className="label">Confirm</label>
          <input
            type="password"
            className="input"
            value={pwd2}
            onChange={(e) => setPwd2(e.target.value)}
          />
        </div>
        {err && <div className="text-sm text-red-400">{err}</div>}
        <button className="btn w-full" disabled={busy}>
          {busy ? "Creating…" : "Create vault"}
        </button>
      </form>
    </div>
  );
}
