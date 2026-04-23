import { useEffect, useState } from "react";
import { api } from "../api.js";

export default function History() {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => {
    api.history.list().then(setItems);
  }, []);

  return (
    <div className="max-w-4xl">
      <h2 className="text-xl font-semibold mb-4">History</h2>
      {items.length === 0 && (
        <div className="text-neutral-500 text-sm">No transactions yet.</div>
      )}
      <div className="space-y-2">
        {items.map((x) => (
          <div key={x.id} className="card text-sm">
            <div className="flex justify-between">
              <div>
                <div className="font-medium">
                  {x.from} → {x.to}
                </div>
                <div className="text-neutral-400 text-xs">
                  {x.amount} {x.asset} · {x.network} ·{" "}
                  {new Date(x.ts).toLocaleString()}
                </div>
              </div>
              <div className="text-xs text-neutral-500">{x.kind}</div>
            </div>
            {x.txidOrWithdrawId && (
              <div className="text-xs font-mono mt-2 text-neutral-400 break-all">
                {x.txidOrWithdrawId}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
