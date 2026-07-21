"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Which manual actions are offered for a given state.
function actionsFor(state: string): { action: string; label: string }[] {
  switch (state) {
    case "awaiting_confirmation":
    case "submitted":
      return [{ action: "confirm", label: "Mark confirmed" }];
    case "confirmed":
    case "verifying":
      return [{ action: "mark_removed", label: "Mark removed" }];
    case "failed":
    case "blocked":
      return [{ action: "retry", label: "Retry" }];
    default:
      return [];
  }
}

export function RequestActions({ id, state }: { id: string; state: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const actions = actionsFor(state);
  if (actions.length === 0) return <span className="text-muted">—</span>;

  async function run(action: string) {
    setBusy(true);
    const res = await fetch(`/api/removals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setBusy(false);
    if (res.ok) router.refresh();
  }

  return (
    <div className="flex justify-end gap-2">
      {actions.map((a) => (
        <button
          key={a.action}
          className="text-xs text-accent hover:underline disabled:opacity-50"
          onClick={() => run(a.action)}
          disabled={busy}
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}
