"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Run = {
  id: string;
  trigger: string;
  startedAt: string;
  finishedAt: string | null;
  stats: Record<string, unknown> | null;
  error: string | null;
};

export function DiscoveryConsole({
  runs,
  aiEnabled,
}: {
  runs: Run[];
  aiEnabled: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    setBusy(true);
    setError(null);
    setResult(null);
    const res = await fetch("/api/admin/discovery", { method: "POST" });
    setBusy(false);
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Discovery run failed");
      return;
    }
    const r = json.result;
    setResult(
      `Found ${r.candidatesFound}, proposed ${r.proposed}, duplicates ${r.duplicates}, rejected ${r.rejected}.`,
    );
    router.refresh();
  }

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Discovery console
        </h2>
        <button className="btn" onClick={search} disabled={busy}>
          {busy ? "Searching…" : "Search for new aggregators"}
        </button>
      </div>

      {!aiEnabled && (
        <p className="text-xs text-warn">
          AI assist is off (set ANTHROPIC_API_KEY + AI_ASSIST_ENABLED=true). Runs
          will find nothing until it&apos;s enabled.
        </p>
      )}
      {result && <p className="text-sm text-good">{result}</p>}
      {error && <p className="text-sm text-bad">{error}</p>}

      <div>
        <div className="mb-2 text-xs uppercase tracking-wide text-muted">
          Run history
        </div>
        {runs.length === 0 ? (
          <p className="text-sm text-muted">No runs yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted">
                <th className="pb-2">When</th>
                <th className="pb-2">Trigger</th>
                <th className="pb-2">Result</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => {
                const s = (r.stats ?? {}) as Record<string, number>;
                return (
                  <tr key={r.id} className="border-t border-edge">
                    <td className="py-2 text-muted">
                      {new Date(r.startedAt).toISOString().slice(0, 16).replace("T", " ")}
                    </td>
                    <td className="py-2">{r.trigger}</td>
                    <td className="py-2 text-muted">
                      {r.error
                        ? `error: ${r.error.slice(0, 60)}`
                        : `found ${s.candidatesFound ?? 0}, proposed ${s.proposed ?? 0}, dup ${s.duplicates ?? 0}, rej ${s.rejected ?? 0}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
