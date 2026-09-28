"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";

interface Score {
  date: string;
  journalScore: number | null;
  journalFeedback: string | null;
}

/** Spark's latest review of the journal (written by the nightly judge). */
export default function JournalFeedback() {
  const [score, setScore] = useState<Score | null>(null);

  useEffect(() => {
    fetch("/api/today")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { scores?: Score[] } | null) => {
        const latest = [...(d?.scores ?? [])].reverse().find((s) => s.journalFeedback);
        setScore(latest ?? null);
      })
      .catch(() => undefined);
  }, []);

  if (!score?.journalFeedback) return null;
  return (
    <section className="mt-8 rounded-2xl p-5" style={{ background: "var(--accent-muted)", border: "1px solid rgba(79,127,255,.25)" }}>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--blue-200)" }}>
        Spark on your journal · {format(new Date(score.date), "EEE MMM d")}
        {score.journalScore != null ? ` · ${score.journalScore}/10` : ""}
      </p>
      <p className="text-sm" style={{ color: "var(--ink-200)" }}>
        {score.journalFeedback}
      </p>
    </section>
  );
}
