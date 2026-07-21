"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Broker = {
  id: string;
  name: string;
  domain: string;
  removalMethod: string;
  status: string;
  source: string;
  caRegistered: boolean;
};

const STATUS_NEXT: Record<string, { label: string; status: string }[]> = {
  live: [{ label: "Retire", status: "retired" }],
  approved: [{ label: "Set live", status: "live" }],
  retired: [{ label: "Set live", status: "live" }],
  rejected: [{ label: "Set live", status: "live" }],
  proposed: [
    { label: "Approve → live", status: "live" },
    { label: "Reject", status: "rejected" },
  ],
};

export function BrokerTable({ brokers }: { brokers: Broker[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");

  async function setStatus(id: string, status: string) {
    setBusy(id);
    await fetch(`/api/admin/brokers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setBusy(null);
    router.refresh();
  }

  async function remove(id: string) {
    setBusy(id);
    await fetch(`/api/admin/brokers/${id}`, { method: "DELETE" });
    setBusy(null);
    router.refresh();
  }

  const filtered = brokers.filter(
    (b) =>
      !q ||
      b.name.toLowerCase().includes(q.toLowerCase()) ||
      b.domain.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div className="space-y-3">
      <input
        className="input max-w-xs"
        placeholder="Filter by name/domain…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted">
              <th className="pb-2">Broker</th>
              <th className="pb-2">Method</th>
              <th className="pb-2">Status</th>
              <th className="pb-2">Source</th>
              <th className="pb-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((b) => (
              <tr key={b.id} className="border-t border-edge">
                <td className="py-2">
                  <div className="font-medium">{b.name}</div>
                  <div className="text-xs text-muted">{b.domain}</div>
                </td>
                <td className="py-2 text-muted">{b.removalMethod}</td>
                <td className="py-2">{b.status}</td>
                <td className="py-2 text-muted">{b.source}</td>
                <td className="py-2">
                  <div className="flex items-center justify-end gap-3">
                    {(STATUS_NEXT[b.status] ?? []).map((a) => (
                      <button
                        key={a.status}
                        className="text-xs text-accent hover:underline disabled:opacity-50"
                        onClick={() => setStatus(b.id, a.status)}
                        disabled={busy === b.id}
                      >
                        {a.label}
                      </button>
                    ))}
                    <button
                      className="text-xs text-bad hover:underline disabled:opacity-50"
                      onClick={() => remove(b.id)}
                      disabled={busy === b.id}
                    >
                      delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
