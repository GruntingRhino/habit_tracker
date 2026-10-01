"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

function LoginForm() {
  const params = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) }).catch(() => null);
    if (res?.ok) {
      const next = params.get("next");
      // Only same-site paths.
      window.location.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/home");
      return;
    }
    setError((await res?.json().catch(() => null))?.error ?? "Couldn't reach the server. Try again.");
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="w-full max-w-xs space-y-3">
      <h1 className="min-h1 mb-1 text-center">LiveImproved</h1>
      <p className="min-sub mb-4 text-center">Log in to continue</p>
      <input
        className="w-full rounded-lg px-3 py-2.5 text-[15px] outline-none"
        style={{ background: "var(--bg-elev-1)", border: "1px solid var(--stroke-2)", color: "var(--ink-100)" }}
        placeholder="Username"
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        required
      />
      <input
        className="w-full rounded-lg px-3 py-2.5 text-[15px] outline-none"
        style={{ background: "var(--bg-elev-1)", border: "1px solid var(--stroke-2)", color: "var(--ink-100)" }}
        placeholder="Password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      {error && (
        <p className="text-sm" style={{ color: "var(--bad)" }} role="alert">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className="w-full rounded-lg py-2.5 text-[15px] font-medium disabled:opacity-60" style={{ background: "var(--ink-100)", color: "var(--bg-base)" }}>
        {busy ? "Logging in…" : "Log in"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center px-4" style={{ background: "var(--bg-base)" }}>
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
