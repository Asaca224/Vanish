"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DROP_CONSUMER_URL } from "@/lib/drop";

/**
 * DROP-assist flow (§3, Phase 1). DROP is assisted, NOT automated: the operator
 * submits on the authenticated privacy.ca.gov site themselves, then records the
 * submission here so Vanish can track the 45/90-day windows and mark covered
 * brokers as handled.
 */
export function DropFlow({
  subjectId,
  coveredCount,
}: {
  subjectId: string | null;
  coveredCount: number;
}) {
  const router = useRouter();
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function record() {
    if (!subjectId) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/drop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subjectId,
        requestReference: reference.trim() || undefined,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "Failed to record submission");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <ol className="space-y-4">
        <li className="card">
          <div className="text-sm font-semibold">1. Submit on the DROP site</div>
          <p className="mt-1 text-sm text-muted">
            DROP has no consumer submit-API, so you complete the identity-verified
            request yourself. A single verified request tells all{" "}
            {coveredCount > 0 ? coveredCount : "600+"} CA-registered brokers to
            delete and stop selling your data.
          </p>
          <a
            href={DROP_CONSUMER_URL}
            target="_blank"
            rel="noreferrer"
            className="btn mt-3"
          >
            Open DROP (privacy.ca.gov) ↗
          </a>
        </li>

        <li className="card">
          <div className="text-sm font-semibold">
            2. Record it here to start tracking
          </div>
          <p className="mt-1 text-sm text-muted">
            Vanish creates one bulk submission covering{" "}
            <strong>{coveredCount}</strong> CA-registered brokers, marks them{" "}
            <code className="text-gray-300">skipped_covered_by_drop</code>, and
            tracks the 45-day retrieve / 90-day finalize windows.
          </p>
          <div className="mt-3 max-w-sm">
            <label className="label">DROP reference (optional)</label>
            <input
              className="input"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. confirmation number from DROP"
            />
          </div>
          {error && <p className="mt-2 text-sm text-bad">{error}</p>}
          <button
            className="btn mt-3"
            onClick={record}
            disabled={busy || !subjectId || coveredCount === 0}
          >
            Record DROP submission
          </button>
          {!subjectId && (
            <p className="mt-2 text-xs text-warn">
              Create a subject on the Identity page first.
            </p>
          )}
          {coveredCount === 0 && subjectId && (
            <p className="mt-2 text-xs text-warn">
              No CA-registered brokers in the registry — import it first.
            </p>
          )}
        </li>
      </ol>
    </div>
  );
}
