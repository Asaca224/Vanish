"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Attribute = {
  id: string;
  type: string;
  value: string;
  verified?: boolean;
};

const TYPES: { value: string; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "alias", label: "Alias" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "address_current", label: "Address (current)" },
  { value: "address_prior", label: "Address (prior)" },
  { value: "dob", label: "DOB (YYYY or YYYY-MM-DD)" },
  { value: "relative", label: "Relative" },
];

export function IntakeForm({
  subjectId,
  initialAttributes,
}: {
  subjectId: string | null;
  initialAttributes: Attribute[];
}) {
  const router = useRouter();
  const [attributes, setAttributes] = useState<Attribute[]>(initialAttributes);
  const [type, setType] = useState("name");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createSubject() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/subjects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "self", isOperator: true }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "Failed to create subject");
      return;
    }
    router.refresh();
  }

  async function addAttribute(e: React.FormEvent) {
    e.preventDefault();
    if (!subjectId || !value.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/identity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subjectId,
        attributes: [{ type, value: value.trim() }],
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "Failed to add attribute");
      return;
    }
    setValue("");
    // Refetch decrypted list.
    const list = await fetch(`/api/identity?subjectId=${subjectId}`);
    if (list.ok) setAttributes((await list.json()).attributes);
    router.refresh();
  }

  async function removeAttribute(id: string) {
    setBusy(true);
    await fetch(`/api/identity/${id}`, { method: "DELETE" });
    setBusy(false);
    setAttributes((prev) => prev.filter((a) => a.id !== id));
    router.refresh();
  }

  if (!subjectId) {
    return (
      <div className="card space-y-4">
        <p className="text-sm text-muted">
          Create your subject (this is you — the operator) to begin entering your
          identity fingerprint.
        </p>
        {error && <p className="text-sm text-bad">{error}</p>}
        <button className="btn" onClick={createSubject} disabled={busy}>
          Create subject
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <form onSubmit={addAttribute} className="card space-y-4">
        <div className="grid gap-4 md:grid-cols-[200px_1fr_auto] md:items-end">
          <div>
            <label className="label">Type</label>
            <select
              className="select"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
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
              placeholder="Enter value — encrypted before storage"
            />
          </div>
          <button className="btn" disabled={busy || !value.trim()}>
            Add
          </button>
        </div>
        {error && <p className="text-sm text-bad">{error}</p>}
        <p className="text-xs text-muted">
          Every value is encrypted at the app layer (AES-256-GCM) before it
          reaches the database. The plaintext is only ever reassembled
          server-side for building requests.
        </p>
      </form>

      <div className="card">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Fingerprint ({attributes.length})
        </h2>
        {attributes.length === 0 ? (
          <p className="text-sm text-muted">No attributes yet.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {attributes.map((a) => (
                <tr key={a.id} className="border-t border-edge">
                  <td className="py-2 pr-4 text-muted">
                    {a.type.replace(/_/g, " ")}
                  </td>
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
