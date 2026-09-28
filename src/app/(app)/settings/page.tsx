"use client";

import { useEffect, useState } from "react";
import { PageHeader, Section } from "@/components/ui";

interface Status {
  model: string;
  up: boolean;
  telegram: boolean;
  timezone: string;
  owner: string | null;
}

const SCHEDULE: [string, string][] = [
  ["Every minute", "Reminders → Telegram"],
  ["6:30 am", "Plan the day"],
  ["7:00 am", "Morning brief"],
  ["9:00 pm", "Evening check-in"],
  ["11:30 pm", "Score the day, review journal"],
  ["Sun 6:00 pm", "Weekly review"],
];

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-row justify-between text-sm">
      <span style={{ color: "var(--ink-500)" }}>{label}</span>
      <span className="text-right" style={{ color: "var(--ink-200)" }}>
        {children}
      </span>
    </div>
  );
}

function Dot({ ok }: { ok: boolean }) {
  return <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: ok ? "var(--good)" : "var(--bad)" }} />;
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
    <div className="min-page">
      <PageHeader title="Settings" />

      <Section label="System">
        {status ? (
          <>
            <Row label="Model">
              <Dot ok={status.up} />
              {status.model}
            </Row>
            <Row label="Telegram">
              <Dot ok={status.telegram} />
              {status.telegram ? "Connected" : "Not set up"}
            </Row>
            <Row label="Access">Tailscale · {status.owner}</Row>
            <Row label="Timezone">{status.timezone}</Row>
          </>
        ) : (
          <p className="min-sub">Loading…</p>
        )}
      </Section>

      <Section label="Schedule">
        {SCHEDULE.map(([when, what]) => (
          <Row key={when} label={when}>
            {what}
          </Row>
        ))}
        <p className="min-sub mt-3">Telegram: /today · /replan · /score. Anything else is filed like Chat.</p>
      </Section>

      <Section label="Data">
        <a href="/api/export" className="min-link" style={{ color: "var(--ink-100)" }}>
          Export everything (JSON)
        </a>
        <p className="min-sub mt-1">Backed up nightly on the server, 14 days kept.</p>
      </Section>
    </div>
  );
}
