"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Listing = {
  id: string;
  profileUrl: string | null;
  matchConfidence: number;
  status: string;
  broker: { name: string; domain: string; removalMethod: string };
};

export function ListingsReview({ initial }: { initial: Listing[] }) {
  const router = useRouter();
  const [listings, setListings] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch("/api/listings");
    if (res.ok) setListings((await res.json()).listings);
    router.refresh();
  }

  async function scan() {
    setBusy(true);
    setError(null);
    setMsg(null);
    const res = await fetch("/api/listings", { method: "POST" });
    setBusy(false);
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Scan failed");
      return;
    }
    setMsg(`Added ${json.created} candidate listing(s) to review.`);
    await refresh();
  }

  async function review(id: string, action: "confirm" | "reject") {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/listings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "Failed");
      return;
    }
    await refresh();
  }

  const candidates = listings.filter((l) => l.status === "candidate");
  const confirmed = listings.filter((l) => l.status === "confirmed");
  const rejected = listings.filter((l) => l.status === "rejected");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted">
          {candidates.length} to review · {confirmed.length} confirmed ·{" "}
          {rejected.length} not me
        </div>
        <button className="btn" onClick={scan} disabled={busy}>
          {busy ? "Scanning…" : "Scan for listings"}
        </button>
      </div>
      {msg && <p className="text-sm text-good">{msg}</p>}
      {error && <p className="text-sm text-bad">{error}</p>}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Review queue ({candidates.length})
        </h2>
        {candidates.length === 0 ? (
          <div className="card text-sm text-muted">
            Nothing to review. Hit “Scan for listings” to propose brokers where
            you may be listed, then confirm the ones that are you.
          </div>
        ) : (
          candidates.map((l) => (
            <div key={l.id} className="card flex items-center justify-between">
              <div>
                <div className="font-medium">{l.broker.name}</div>
                <div className="text-xs text-muted">
                  {l.broker.domain} · {l.broker.removalMethod} ·{" "}
                  {Math.round(l.matchConfidence * 100)}% match
                  {l.profileUrl && (
                    <>
                      {" · "}
                      <a
                        href={l.profileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-accent hover:underline"
                      >
                        verify ↗
                      </a>
                    </>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <button className="btn" onClick={() => review(l.id, "confirm")} disabled={busy}>
                  This is me
                </button>
                <button className="btn-ghost" onClick={() => review(l.id, "reject")} disabled={busy}>
                  Not me
                </button>
              </div>
            </div>
          ))
        )}
      </section>

      {confirmed.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            Confirmed — removal requested ({confirmed.length})
          </h2>
          <div className="card">
            <table className="w-full text-sm">
              <tbody>
                {confirmed.map((l) => (
                  <tr key={l.id} className="border-t border-edge first:border-0">
                    <td className="py-2">{l.broker.name}</td>
                    <td className="py-2 text-muted">{l.broker.removalMethod}</td>
                    <td className="py-2 text-right text-xs text-good">confirmed</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
