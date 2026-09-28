"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";

interface Status {
  model: string;
  up: boolean;
  telegram: boolean;
  timezone: string;
  owner: string | null;
}

const SCHEDULE = [
  ["Every minute", "Send due reminders to Telegram"],
  ["6:30 am", "Spark plans your day (thinking mode)"],
  ["7:00 am", "Morning brief on Telegram"],
  ["9:00 pm", "Evening check-in + journal prompt"],
  ["11:30 pm", "Spark scores your day /10 and reviews the journal"],
  ["Sunday 6:00 pm", "Weekly review digest"],
];

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 text-sm" style={{ borderBottom: "1px solid var(--stroke-1)" }}>
      <span style={{ color: "var(--ink-400)" }}>{label}</span>
      <span className="text-right" style={{ color: "var(--ink-100)" }}>
        {children}
      </span>
    </div>
  );
}

function Dot({ ok }: { ok: boolean }) {
  return <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: ok ? "var(--good)" : "var(--bad)" }} />;
}

export default function SettingsPage() {
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => undefined);
  }, []);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold" style={{ color: "var(--ink-100)" }}>
        Settings
      </h1>

      <section className="rounded-2xl p-5" style={{ background: "var(--bg-elev-1)", border: "1px solid var(--stroke-1)" }}>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--ink-400)" }}>
          System
        </h2>
        {status ? (
          <>
            <Row label="Model">
              <Dot ok={status.up} />
              {status.model} {status.up ? "· loaded" : "· offline"}
            </Row>
            <Row label="Telegram">
              <Dot ok={status.telegram} />
              {status.telegram ? "Connected" : "Not configured"}
            </Row>
            <Row label="Access">Tailscale only · {status.owner ?? "owner"}</Row>
            <Row label="Timezone">{status.timezone}</Row>
          </>
        ) : (
          <p className="text-sm" style={{ color: "var(--ink-500)" }}>
            Loading…
          </p>
        )}
      </section>

      <section className="rounded-2xl p-5" style={{ background: "var(--bg-elev-1)", border: "1px solid var(--stroke-1)" }}>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--ink-400)" }}>
          Schedule
        </h2>
        {SCHEDULE.map(([when, what]) => (
          <Row key={when} label={when}>
            {what}
          </Row>
        ))}
        <p className="mt-3 text-xs" style={{ color: "var(--ink-500)" }}>
          Telegram commands: /today, /replan, /score. Any other message is filed just like the chat.
        </p>
      </section>

      <section className="rounded-2xl p-5" style={{ background: "var(--bg-elev-1)", border: "1px solid var(--stroke-1)" }}>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--ink-400)" }}>
          Data
        </h2>
        <a href="/api/export" className="btn btn-outline btn-sm inline-flex items-center gap-2">
          <Download className="h-4 w-4" /> Export everything (JSON)
        </a>
        <p className="mt-2 text-xs" style={{ color: "var(--ink-500)" }}>
          The database is also backed up nightly on the server (14 days kept).
        </p>
      </section>
    </div>
  );
}
