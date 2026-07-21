"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AccountSettings({
  confirmationSource,
  forwardingToken,
}: {
  confirmationSource: string;
  forwardingToken: string | null;
}) {
  const router = useRouter();
  const [source, setSource] = useState(confirmationSource);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState("");

  async function saveSource(next: string) {
    setSource(next);
    setBusy(true);
    await fetch("/api/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmationSource: next }),
    });
    setBusy(false);
    router.refresh();
  }

  async function deleteAccount() {
    if (confirmDelete !== "DELETE") return;
    setBusy(true);
    const res = await fetch("/api/account", { method: "DELETE" });
    setBusy(false);
    if (res.ok) window.location.href = "/login";
  }

  return (
    <div className="space-y-6">
      <div className="card space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Confirmation source
        </h2>
        <p className="text-sm text-muted">
          How Vanish reads the confirm-this-request emails brokers send.
        </p>
        <select
          className="select max-w-xs"
          value={source}
          onChange={(e) => saveSource(e.target.value)}
          disabled={busy}
        >
          <option value="none">Not set</option>
          <option value="forwarding">Forwarding address (recommended)</option>
          <option value="gmail">Connected Gmail (requires verification)</option>
        </select>
        {source === "forwarding" && (
          <p className="text-xs text-muted">
            Auto-forward broker confirmation emails to:{" "}
            <code className="text-gray-300">
              confirm+{forwardingToken ?? "<token>"}@yourdomain
            </code>
          </p>
        )}
      </div>

      <div className="card space-y-3 border-bad/40">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-bad">
          Delete account
        </h2>
        <p className="text-sm text-muted">
          Permanently purges your fingerprint, listings, evidence, and requests.
          This cannot be undone. Type <code className="text-gray-300">DELETE</code> to confirm.
        </p>
        <div className="flex gap-2">
          <input
            className="input max-w-[160px]"
            value={confirmDelete}
            onChange={(e) => setConfirmDelete(e.target.value)}
            placeholder="DELETE"
          />
          <button
            className="btn"
            style={{ background: "#e5484d" }}
            disabled={busy || confirmDelete !== "DELETE"}
            onClick={deleteAccount}
          >
            Delete my account
          </button>
        </div>
      </div>
    </div>
  );
}
