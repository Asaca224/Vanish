"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Evidence = { url: string; snippet: string };
type Proposal = {
  id: string;
  name: string;
  domain: string;
  optOutUrl: string | null;
  removalMethod: string;
  optOutEmail: string | null;
  requiresCaptcha: boolean;
  requiresId: boolean;
  discoveryConfidence: number | null;
  notes: string | null;
  evidence: Evidence[];
};

export function ProposalQueue({ proposals }: { proposals: Proposal[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function review(brokerId: string, action: "approve" | "reject") {
    setBusyId(brokerId);
    setError(null);
    const res = await fetch("/api/admin/discovery/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brokerId, action }),
    });
    setBusyId(null);
    if (!res.ok) {
      setError((await res.json()).error ?? "Review failed");
      return;
    }
    router.refresh();
  }

  if (proposals.length === 0) {
    return (
      <div className="card text-sm text-muted">
        No proposals awaiting review. Run discovery to surface candidates.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-bad">{error}</p>}
      {proposals.map((p) => (
        <div key={p.id} className="card space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-medium">
                {p.name}{" "}
                <span className="text-sm text-muted">({p.domain})</span>
              </div>
              <div className="mt-1 text-xs text-muted">
                {p.removalMethod}
                {p.optOutUrl ? ` · ${p.optOutUrl}` : ""}
                {p.optOutEmail ? ` · ${p.optOutEmail}` : ""}
                {p.requiresCaptcha ? " · CAPTCHA" : ""}
                {p.requiresId ? " · ID" : ""}
                {p.discoveryConfidence != null
                  ? ` · confidence ${Math.round(p.discoveryConfidence * 100)}%`
                  : ""}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                className="btn"
                onClick={() => review(p.id, "approve")}
                disabled={busyId === p.id}
              >
                Approve → live
              </button>
              <button
                className="btn-ghost"
                onClick={() => review(p.id, "reject")}
                disabled={busyId === p.id}
              >
                Reject
              </button>
            </div>
          </div>

          {p.evidence?.length > 0 && (
            <div className="rounded-md border border-edge bg-ink p-3">
              <div className="mb-1 text-xs uppercase tracking-wide text-muted">
                Evidence
              </div>
              <ul className="space-y-1 text-xs text-gray-300">
                {p.evidence.slice(0, 4).map((e, i) => (
                  <li key={i}>
                    <span className="text-muted">{e.url}</span> — “{e.snippet}”
                  </li>
                ))}
              </ul>
            </div>
          )}
          {p.notes && <p className="text-xs text-muted">{p.notes}</p>}
        </div>
      ))}
    </div>
  );
}
