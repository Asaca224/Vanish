"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Broker = {
  id: string;
  name: string;
  domain: string;
  removalMethod: string;
  optOutEmail: string | null;
};

type Draft = { to: string | null; subject: string; text: string };

export function RemovalLauncher({ brokers }: { brokers: Broker[] }) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<Record<string, boolean>>({});

  // Step 1: create the removal request + fetch the drafted email for review.
  async function prepare(broker: Broker) {
    setBusy(true);
    setError(null);
    setDraft(null);
    setOpenId(broker.id);
    try {
      const create = await fetch("/api/removals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brokerId: broker.id }),
      });
      const created = await create.json();
      if (!create.ok) throw new Error(created.error ?? "Failed to create request");
      const id = created.request.id as string;
      setRequestId(id);

      const draftRes = await fetch(`/api/removals/${id}/send-email`);
      const d = await draftRes.json();
      if (!draftRes.ok) throw new Error(d.error ?? "Failed to draft email");
      setDraft(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setOpenId(null);
    } finally {
      setBusy(false);
    }
  }

  // Step 2: user approves → send via Resend.
  async function send(brokerId: string) {
    if (!requestId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/removals/${requestId}/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Send failed");
      setSent((s) => ({ ...s, [brokerId]: true }));
      setOpenId(null);
      setDraft(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  if (brokers.length === 0) {
    return (
      <div className="card text-sm text-muted">
        No live email-channel brokers in the registry yet. Seed the registry (or
        approve discovered brokers in Admin), then come back.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-bad">{error}</p>}
      {brokers.map((b) => (
        <div key={b.id} className="card">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">{b.name}</div>
              <div className="text-xs text-muted">
                {b.domain} · emails {b.optOutEmail ?? "—"}
              </div>
            </div>
            {sent[b.id] ? (
              <span className="badge bg-good/20 text-good">sent ✓</span>
            ) : (
              <button
                className="btn-ghost"
                onClick={() => prepare(b)}
                disabled={busy}
              >
                Draft opt-out
              </button>
            )}
          </div>

          {openId === b.id && draft && (
            <div className="mt-4 space-y-3 border-t border-edge pt-4">
              <div className="text-xs text-muted">
                To: {draft.to ?? "—"} · Subject: {draft.subject}
              </div>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-edge bg-ink p-3 text-xs text-gray-300">
                {draft.text}
              </pre>
              <div className="flex gap-2">
                <button className="btn" onClick={() => send(b.id)} disabled={busy}>
                  Send via Resend
                </button>
                <button
                  className="btn-ghost"
                  onClick={() => {
                    setOpenId(null);
                    setDraft(null);
                  }}
                  disabled={busy}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
