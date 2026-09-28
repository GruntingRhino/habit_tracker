"use client";

import { useEffect, useState } from "react";
import { format, isToday, isYesterday } from "date-fns";
import { AREA_META, SCORED_AREAS, type ScoredArea } from "@/lib/areas";

export interface ScoreRow {
  date: string;
  physical: number;
  mental: number;
  financial: number;
  spiritual: number;
  overall: number;
  rationale: Record<string, string> | null;
  judgedBy: string | null;
}

function dayLabel(date: string) {
  const d = new Date(date);
  if (isToday(d)) return "Today so far";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "EEEE, MMM d");
}

/** The four life-area scores /10, as judged by Spark each night. */
export default function ScoreBoard() {
  const [score, setScore] = useState<ScoreRow | null | undefined>(undefined);
  const [open, setOpen] = useState<ScoredArea | null>(null);

  useEffect(() => {
    fetch("/api/scores")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: ScoreRow[]) => setScore(rows.find((r) => r.judgedBy) ?? rows[0] ?? null))
      .catch(() => setScore(null));
  }, []);

  if (score === undefined) return null;

  return (
    <div className="w-full max-w-sm select-none px-2 text-center">
      <p className="min-label mb-10">{score ? dayLabel(score.date) : "Your scores"}</p>
      <div className="grid grid-cols-2 gap-x-6 gap-y-12">
        {SCORED_AREAS.map((a) => {
          const value = score ? Math.round(score[a]) : null;
          return (
            <button key={a} onClick={() => setOpen(open === a ? null : a)} className="flex flex-col items-center">
              <span className="flex items-baseline">
                <span className="text-6xl font-extralight tabular-nums tracking-tight" style={{ color: "var(--ink-100)" }}>
                  {value ?? "–"}
                </span>
                <span className="ml-1 text-sm" style={{ color: "var(--ink-600)" }}>
                  /10
                </span>
              </span>
              <span className="mt-2 flex items-center gap-1.5 text-xs tracking-wide" style={{ color: "var(--ink-400)" }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: AREA_META[a].color }} />
                {AREA_META[a].label}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mx-auto mt-10 min-h-[2.5rem] max-w-xs text-sm leading-relaxed" style={{ color: "var(--ink-500)" }}>
        {!score
          ? "Spark scores your day every night at 11:30."
          : open && score.rationale?.[open]
            ? score.rationale[open]
            : score.judgedBy
              ? "Tap a score to see why."
              : "Live estimate — Spark judges tonight at 11:30."}
      </p>
    </div>
  );
}
