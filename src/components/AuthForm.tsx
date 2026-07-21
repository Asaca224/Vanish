"use client";

import { useState } from "react";

export function AuthForm() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(mode === "login" ? "/api/login" : "/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), password }),
    });
    if (!res.ok) {
      setBusy(false);
      setError((await res.json()).error ?? "Something went wrong");
      return;
    }
    // Session cookie is set; go to the app (root routes to onboarding/dashboard).
    window.location.href = "/";
  }

  return (
    <form onSubmit={submit} className="space-y-4 text-left">
      <div>
        <label className="label">Email</label>
        <input
          className="input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
      </div>
      <div>
        <label className="label">Password</label>
        <input
          className="input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          minLength={mode === "signup" ? 8 : undefined}
          required
        />
        {mode === "signup" && (
          <p className="mt-1 text-xs text-muted">At least 8 characters.</p>
        )}
      </div>
      {error && <p className="text-sm text-bad">{error}</p>}
      <button className="btn w-full" disabled={busy || !email || !password}>
        {busy ? "…" : mode === "login" ? "Log in" : "Create account"}
      </button>
      <p className="text-center text-xs text-muted">
        {mode === "login" ? "No account yet?" : "Already have an account?"}{" "}
        <button
          type="button"
          className="text-accent hover:underline"
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            setError(null);
          }}
        >
          {mode === "login" ? "Sign up" : "Log in"}
        </button>
      </p>
    </form>
  );
}
