import { useEffect, useState } from "react";
import Setup from "./pages/Setup.js";
import Login from "./pages/Login.js";
import Dashboard from "./pages/Dashboard.js";
import Wallets from "./pages/Wallets.js";
import Exchanges from "./pages/Exchanges.js";
import Transfer from "./pages/Transfer.js";
import History from "./pages/History.js";
import Rpcs from "./pages/Rpcs.js";
import { api } from "./api.js";

type Tab =
  | "dashboard"
  | "wallets"
  | "exchanges"
  | "rpcs"
  | "transfer"
  | "history";

export default function App() {
  const [status, setStatus] = useState<{
    exists: boolean;
    unlocked: boolean;
  } | null>(null);
  const [tab, setTab] = useState<Tab>("dashboard");

  async function refresh() {
    setStatus(await api.vault.status());
  }
  useEffect(() => {
    refresh();
  }, []);

  if (!status) return <div className="p-8 text-neutral-400">Loading…</div>;

  if (!status.exists) return <Setup onDone={refresh} />;
  if (!status.unlocked) return <Login onDone={refresh} />;

  async function lock() {
    await api.vault.lock();
    await refresh();
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "dashboard", label: "Dashboard" },
    { id: "wallets", label: "Wallets" },
    { id: "exchanges", label: "Exchanges" },
    { id: "rpcs", label: "RPCs" },
    { id: "transfer", label: "Transfer" },
    { id: "history", label: "History" },
  ];

  return (
    <div className="min-h-full flex">
      <aside className="w-56 border-r border-neutral-800 p-4 flex flex-col gap-1">
        <div className="text-lg font-semibold mb-4">Withdraw</div>
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`text-left px-3 py-2 rounded-md text-sm ${
              tab === t.id ? "bg-neutral-800" : "hover:bg-neutral-900"
            }`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
        <div className="flex-1" />
        <button className="btn-ghost" onClick={lock}>
          Lock
        </button>
      </aside>
      <main className="flex-1 p-6 overflow-auto">
        {tab === "dashboard" && <Dashboard />}
        {tab === "wallets" && <Wallets />}
        {tab === "exchanges" && <Exchanges />}
        {tab === "rpcs" && <Rpcs />}
        {tab === "transfer" && <Transfer />}
        {tab === "history" && <History />}
      </main>
    </div>
  );
}
