import type { RequestState } from "@prisma/client";

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="card">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-2 text-3xl font-bold">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

const STATE_COLORS: Record<RequestState, string> = {
  discovered: "bg-edge text-gray-300",
  queued: "bg-edge text-gray-300",
  in_progress: "bg-accent/20 text-accent",
  awaiting_user: "bg-warn/20 text-warn",
  submitted: "bg-accent/20 text-accent",
  awaiting_confirmation: "bg-warn/20 text-warn",
  confirmed: "bg-good/20 text-good",
  verifying: "bg-accent/20 text-accent",
  removed: "bg-good/20 text-good",
  exempt: "bg-edge text-muted",
  failed: "bg-bad/20 text-bad",
  blocked: "bg-bad/20 text-bad",
  skipped_covered_by_drop: "bg-accent/20 text-accent",
};

export function StateBadge({ state }: { state: RequestState }) {
  return (
    <span className={`badge ${STATE_COLORS[state] ?? "bg-edge text-gray-300"}`}>
      {state.replace(/_/g, " ")}
    </span>
  );
}
