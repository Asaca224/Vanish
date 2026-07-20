"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Attribute = {
  id: string;
  type: string;
  value: string;
  verified?: boolean;
};

const TYPES: { value: string; label: string; why: string }[] = [
  { value: "name", label: "Name", why: "Primary search key across brokers." },
  { value: "alias", label: "Alias / prior name", why: "Maiden names and nicknames get listed too." },
  { value: "email", label: "Email", why: "Correlates listings and receives confirmations." },
  { value: "phone", label: "Phone", why: "People-search sites index phone numbers." },
  { value: "address_current", label: "Address (current)", why: "Strongest match/disambiguation signal." },
  { value: "address_prior", label: "Address (prior)", why: "Old addresses persist on broker sites." },
  { value: "dob", label: "DOB (YYYY or YYYY-MM-DD)", why: "Only used to tell you apart from namesakes." },
  { value: "relative", label: "Relative (name only)", why: "Brokers list relatives — a strong match signal." },
];

export function IntakeForm({
  initialAttributes,
}: {
  initialAttributes: Attribute[];
}) {
  const router = useRouter();
  const [attributes, setAttributes] = useState<Attribute[]>(initialAttributes);
  const [type, setType] = useState("name");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const why = TYPES.find((t) => t.value === type)?.why;

  async function refresh() {
    const list = await fetch("/api/identity");
    if (list.ok) setAttributes((await list.json()).attributes);
    router.refresh();
  }

  async function addAttribute(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/identity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attributes: [{ type, value: value.trim() }] }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "Failed to add");
      return;
    }
    setValue("");
    await refresh();
  }

  async function removeAttribute(id: string) {
    setBusy(true);
    await fetch(`/api/identity/${id}`, { method: "DELETE" });
    setBusy(false);
    setAttributes((prev) => prev.filter((a) => a.id !== id));
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <form onSubmit={addAttribute} className="card space-y-4">
        <div className="grid gap-4 md:grid-cols-[220px_1fr_auto] md:items-end">
          <div>
            <label className="label">Type</label>
            <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Value</label>
            <input
              className="input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Encrypted before storage"
            />
          </div>
          <button className="btn" disabled={busy || !value.trim()}>
            Add
          </button>
        </div>
        {why && <p className="text-xs text-muted">Why we ask: {why}</p>}
        {error && <p className="text-sm text-bad">{error}</p>}
      </form>

      <div className="card">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Your fingerprint ({attributes.length})
        </h2>
        {attributes.length === 0 ? (
          <p className="text-sm text-muted">Nothing added yet.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {attributes.map((a) => (
                <tr key={a.id} className="border-t border-edge">
                  <td className="py-2 pr-4 text-muted">{a.type.replace(/_/g, " ")}</td>
                  <td className="py-2">{a.value}</td>
                  <td className="py-2 text-right">
                    <button
                      className="text-xs text-bad hover:underline"
                      onClick={() => removeAttribute(a.id)}
                      disabled={busy}
                    >
                      remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
