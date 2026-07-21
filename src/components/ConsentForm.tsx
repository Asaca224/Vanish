"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY",
];

export function ConsentForm({
  consentText,
  consentVersion,
}: {
  consentText: string;
  consentVersion: string;
}) {
  const router = useRouter();
  const [agree, setAgree] = useState(false);
  const [state, setState] = useState("CA");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agree, consentVersion, residencyState: state }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "Failed to record authorization");
      return;
    }
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="card space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
        Authorization
      </h2>
      <p className="whitespace-pre-line rounded-md border border-edge bg-ink p-4 text-sm text-gray-300">
        {consentText}
      </p>
      <div className="max-w-[160px]">
        <label className="label">State of residence</label>
        <select className="select" value={state} onChange={(e) => setState(e.target.value)}>
          {US_STATES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-muted">CA residents get the DROP flow.</p>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={agree}
          onChange={(e) => setAgree(e.target.checked)}
          className="mt-1"
        />
        <span>
          I have read and agree to the authorization above (version {consentVersion}).
        </span>
      </label>
      {error && <p className="text-sm text-bad">{error}</p>}
      <button className="btn" disabled={busy || !agree}>
        Sign &amp; continue
      </button>
    </form>
  );
}
