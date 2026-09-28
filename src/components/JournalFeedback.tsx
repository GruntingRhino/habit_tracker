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
      .then((d: { scores?: Score[] } | null) => setScore([...(d?.scores ?? [])].reverse().find((s) => s.journalFeedback) ?? null))
      .catch(() => undefined);
  }, []);

  if (!score?.journalFeedback) return null;
  return (
    <section className="mt-10">
      <p className="min-label mb-2">
        Spark on your journal · {format(new Date(score.date), "EEE MMM d")}
        {score.journalScore != null ? ` · ${score.journalScore}/10` : ""}
      </p>
      <p className="text-sm leading-relaxed" style={{ color: "var(--ink-300)" }}>
        {score.journalFeedback}
      </p>
    </section>
  );
}
