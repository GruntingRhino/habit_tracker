"use client";

import { useCallback, useState } from "react";
import { Section } from "@/components/ui";
import { useLoad } from "@/hooks/useAssistantChat";

interface Me {
  name: string | null;
  username: string | null;
  telegram: boolean;
}

const input = { background: "var(--bg-elev-1)", border: "1px solid var(--stroke-2)", color: "var(--ink-100)" } as const;

/** Your login, Telegram link, and log out. */
export default function AccountSection() {
  const [me, setMe] = useState<Me | null>(null);
  const [pw, setPw] = useState({ current: "", next: "" });
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [link, setLink] = useState<{ code: string; link: string | null } | null>(null);
  const load = useCallback(async () => {
    const r = await fetch("/api/auth/me").catch(() => null);
    if (r?.ok) setMe(await r.json());
  }, []);
  useLoad(load);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch("/api/auth/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pw) }).catch(() => null);
    const body = await r?.json().catch(() => null);
    setPwMsg(r?.ok ? "Password changed. Other devices are logged out." : body?.error ?? "Couldn't change it.");
    if (r?.ok) setPw({ current: "", next: "" });
  }
  async function connectTelegram() {
    const r = await fetch("/api/telegram/link", { method: "POST" }).catch(() => null);
    if (r?.ok) setLink(await r.json());
  }
  async function disconnectTelegram() {
    await fetch("/api/telegram/link", { method: "DELETE" }).catch(() => null);
    setLink(null);
    void load();
  }
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    window.location.replace("/login");
  }

  return (
    <Section label="Account">
      <p className="min-sub mb-3">
        Logged in as <span style={{ color: "var(--ink-200)" }}>{me?.username ?? "…"}</span>
        {" · "}
        <button className="min-link underline-offset-2 hover:underline" onClick={logout}>
          Log out
        </button>
      </p>

      <p className="mb-1 text-sm" style={{ color: "var(--ink-200)" }}>
        Telegram {me?.telegram ? "· connected" : ""}
      </p>
      {me?.telegram ? (
        <button className="min-link mb-4 text-xs" onClick={disconnectTelegram}>
          Disconnect Telegram
        </button>
      ) : link ? (
        <p className="min-sub mb-4">
          {link.link ? (
            <>
              <a className="min-link underline" href={link.link} target="_blank" rel="noreferrer">
                Open the bot
              </a>{" "}
              and tap Start, or send it{" "}
            </>
          ) : (
            "Send the bot "
          )}
          <code style={{ color: "var(--ink-100)" }}>/link {link.code}</code>. Then refresh this page.
        </p>
      ) : (
        <button className="min-link mb-4 text-xs" onClick={connectTelegram}>
          Connect Telegram (reminders, briefs, chat)
        </button>
      )}

      <form onSubmit={changePassword} className="space-y-2">
        <p className="text-sm" style={{ color: "var(--ink-200)" }}>
          Change password
        </p>
        <input className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={input} type="password" autoComplete="current-password" placeholder="Current password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required />
        <input className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={input} type="password" autoComplete="new-password" placeholder="New password (10+ characters)" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required />
        <button type="submit" className="rounded-lg px-3 py-1.5 text-sm" style={{ background: "var(--ink-100)", color: "var(--bg-base)" }}>
          Change password
        </button>
        {pwMsg && <p className="min-sub">{pwMsg}</p>}
      </form>
    </Section>
  );
}
