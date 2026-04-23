import { useEffect, useState } from "react";
import { api } from "../api.js";

const DEFAULT_RPCS = [
  { chain: "ethereum", chainId: 1, url: "https://cloudflare-eth.com" },
  { chain: "bsc", chainId: 56, url: "https://binance.llamarpc.com" },
  { chain: "polygon", chainId: 137, url: "https://polygon-rpc.com" },
  { chain: "arbitrum", chainId: 42161, url: "https://arb1.arbitrum.io/rpc" },
  { chain: "base", chainId: 8453, url: "https://mainnet.base.org" },
  { chain: "optimism", chainId: 10, url: "https://mainnet.optimism.io" },
];

export default function Rpcs() {
  const [rpcs, setRpcs] = useState<any[]>([]);
  const [chain, setChain] = useState("ethereum");
  const [chainId, setChainId] = useState("1");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [pings, setPings] = useState<Record<string, number | "error" | null>>(
    {},
  );
  const [defaultPings, setDefaultPings] = useState<
    Record<string, number | "error" | null>
  >({});
  // per-chain override edit state: chain -> draft url string | null (null = not editing)
  const [overrideDraft, setOverrideDraft] = useState<Record<string, string>>(
    {},
  );
  const [overrideEditing, setOverrideEditing] = useState<
    Record<string, boolean>
  >({});
  const [overrideBusy, setOverrideBusy] = useState<Record<string, boolean>>({});

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const list = await api.rpcs.list();
    setRpcs(list);

    // Ping custom RPCs
    list.forEach(async (r: any) => {
      try {
        const ping = await api.rpcs.ping(r.url);
        setPings((p) => ({ ...p, [r.id]: ping }));
      } catch {
        setPings((p) => ({ ...p, [r.id]: "error" }));
      }
    });

    // Ping effective URL for each default chain (override if set, else default)
    DEFAULT_RPCS.forEach(async (d) => {
      const override = list.find((r: any) => r.chain === d.chain);
      const effectiveUrl = override?.url ?? d.url;
      try {
        const ping = await api.rpcs.ping(effectiveUrl);
        setDefaultPings((p) => ({ ...p, [d.chain]: ping }));
      } catch {
        setDefaultPings((p) => ({ ...p, [d.chain]: "error" }));
      }
    });
  }

  async function saveOverride(d: (typeof DEFAULT_RPCS)[number]) {
    const newUrl = overrideDraft[d.chain]?.trim();
    if (!newUrl) return;
    setOverrideBusy((b) => ({ ...b, [d.chain]: true }));
    // Remove existing override for this chain if any
    const existing = rpcs.find((r) => r.chain === d.chain);
    if (existing) await api.rpcs.remove(existing.id);
    await api.rpcs.add({
      chain: d.chain,
      chainId: d.chainId,
      name: d.chain,
      url: newUrl,
    });
    setOverrideEditing((e) => ({ ...e, [d.chain]: false }));
    setOverrideBusy((b) => ({ ...b, [d.chain]: false }));
    load();
  }

  async function resetOverride(chain: string) {
    const existing = rpcs.find((r) => r.chain === chain);
    if (existing) {
      await api.rpcs.remove(existing.id);
      load();
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    await api.rpcs.add({ chain, chainId: parseInt(chainId), name, url });
    setChain("");
    setChainId("");
    setName("");
    setUrl("");
    load();
  }

  async function remove(id: string) {
    await api.rpcs.remove(id);
    load();
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-xl font-semibold mb-2">RPC Nodes</h2>

      <div>
        <h3 className="text-sm font-semibold text-neutral-400 mb-2">
          Default RPCs
        </h3>
        <div className="grid gap-2">
          {DEFAULT_RPCS.map((d) => {
            const override = rpcs.find((r) => r.chain === d.chain);
            const effectiveUrl = override?.url ?? d.url;
            const ping = defaultPings[d.chain];
            const ok = ping !== undefined && ping !== "error" && ping !== null;
            const statusColor =
              ping === undefined
                ? "bg-yellow-500"
                : ok
                  ? "bg-green-500"
                  : "bg-red-500";
            const isEditing = overrideEditing[d.chain] ?? false;
            const busy = overrideBusy[d.chain] ?? false;

            return (
              <div key={d.chain} className="card space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium capitalize flex items-center gap-2">
                      {d.chain}
                      {override && (
                        <span className="text-xs text-blue-400 bg-blue-950 px-1.5 py-0.5 rounded">
                          overridden
                        </span>
                      )}
                    </div>
                    <div
                      className={`text-xs mt-0.5 ${override ? "text-blue-300" : "text-neutral-400"}`}
                    >
                      {effectiveUrl}
                    </div>
                    {override && (
                      <div className="text-xs text-neutral-600">
                        default: {d.url}
                      </div>
                    )}
                    <div className="text-xs mt-1 flex items-center gap-1.5">
                      <span
                        className={`w-2 h-2 rounded-full inline-block ${statusColor}`}
                      />
                      {ping === undefined
                        ? "Testing…"
                        : ping === "error" || ping === null
                          ? "Unreachable"
                          : `${ping}ms`}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {override && !isEditing && (
                      <button
                        className="btn-ghost text-xs text-red-400"
                        onClick={() => resetOverride(d.chain)}
                      >
                        Reset
                      </button>
                    )}
                    <button
                      className="btn-ghost text-xs"
                      onClick={() => {
                        setOverrideDraft((prev) => ({
                          ...prev,
                          [d.chain]: effectiveUrl,
                        }));
                        setOverrideEditing((prev) => ({
                          ...prev,
                          [d.chain]: !isEditing,
                        }));
                      }}
                    >
                      {isEditing ? "Cancel" : "Override"}
                    </button>
                  </div>
                </div>

                {isEditing && (
                  <div className="flex gap-2">
                    <input
                      className="input flex-1 text-xs font-mono"
                      value={overrideDraft[d.chain] ?? ""}
                      onChange={(e) =>
                        setOverrideDraft((prev) => ({
                          ...prev,
                          [d.chain]: e.target.value,
                        }))
                      }
                      placeholder="https://your-rpc.example.com"
                      onKeyDown={(e) => e.key === "Enter" && saveOverride(d)}
                    />
                    <button
                      className="btn text-xs px-3"
                      disabled={busy}
                      onClick={() => saveOverride(d)}
                    >
                      {busy ? "Saving…" : "Save"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-neutral-400 mb-2">
          Custom RPCs (additional chains)
        </h3>
        <div className="grid gap-2">
          {rpcs.filter((r) => !DEFAULT_RPCS.find((d) => d.chain === r.chain))
            .length === 0 && (
            <div className="text-sm text-neutral-500">
              No additional custom RPCs.
            </div>
          )}
          {rpcs
            .filter((r) => !DEFAULT_RPCS.find((d) => d.chain === r.chain))
            .map((r) => (
              <div
                key={r.id}
                className="card flex justify-between items-center"
              >
                <div>
                  <div className="font-medium">{r.name}</div>
                  <div className="text-xs text-neutral-400">
                    {r.chain} ({r.chainId}) · {r.url}
                  </div>
                  <div className="text-xs text-neutral-500 mt-1">
                    Ping:{" "}
                    {pings[r.id] === "error"
                      ? "Error"
                      : pings[r.id]
                        ? `${pings[r.id]}ms`
                        : "Testing..."}
                  </div>
                </div>
                <button
                  className="btn-ghost text-red-400"
                  onClick={() => remove(r.id)}
                >
                  Remove
                </button>
              </div>
            ))}
        </div>
      </div>

      <form onSubmit={add} className="card space-y-3">
        <h3 className="font-semibold">Add Custom RPC</h3>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">Chain slug</label>
            <input
              className="input"
              value={chain}
              onChange={(e) => setChain(e.target.value)}
              placeholder="mychain"
              required
            />
          </div>
          <div>
            <label className="label">Chain ID</label>
            <input
              className="input"
              type="number"
              value={chainId}
              onChange={(e) => setChainId(e.target.value)}
              placeholder="1"
              required
            />
          </div>
        </div>
        <div>
          <label className="label">Label</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label">RPC URL</label>
          <input
            className="input"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
          />
        </div>
        <button className="btn w-full">Add RPC</button>
      </form>
    </div>
  );
}
