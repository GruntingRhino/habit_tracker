/**
 * The headline score is the week's: each day is graded on its own (live during the day, final at
 * 11:30pm) and the week is the average of the days that had data (Mon → today).
 *
 * A day with nothing logged at all isn't averaged in as 0: it's left out, and costs a penalty of
 * 0.5 points on every area instead. An area with no data on a day he did log other things is just
 * left out (no penalty: not every day has money to log). Today never costs a penalty — it isn't over.
 */
import { addDays, format, startOfWeek } from "date-fns";
import prisma from "@/lib/prisma";
import { SCORED_AREAS, type ScoredArea } from "@/lib/areas";
import { readRationale } from "@/lib/score-rationale";
import { getStartOfDay } from "@/lib/utils";

export const MISSED_DAY_PENALTY = 0.5;

export interface WeekDay {
  date: string;
  scores: Record<ScoredArea, number | null>;
  missed: boolean;
  today: boolean;
}

export interface WeekScore {
  start: string;
  days: WeekDay[];
  areas: Record<ScoredArea, { score: number | null; avg: number | null; days: number; penalty: number }>;
  overall: number | null;
  missedDays: number;
}

type Row = { date: Date; rationale: unknown; judgedBy: string | null } & Record<ScoredArea, number>;

/** Pure: build the week from daily rows. */
export function weekFromRows(rows: Row[], now = new Date()): WeekScore {
  const today = getStartOfDay(now);
  const start = startOfWeek(today, { weekStartsOn: 1 });
  const byDay = new Map(rows.map((r) => [getStartOfDay(r.date).getTime(), r]));
  const days: WeekDay[] = [];
  for (let d = start; d <= today; d = addDays(d, 1)) {
    const row = byDay.get(d.getTime());
    const r = row ? readRationale(row.rationale) : null;
    const v2 = !!row && !!row.rationale && typeof row.rationale === "object" && "v" in (row.rationale as object);
    const scores = Object.fromEntries(
      SCORED_AREAS.map((a) => {
        if (!row) return [a, null];
        // New grades say per area whether there was data; older rows count if they were graded.
        const has = v2 ? !r![a].noData : !!row.judgedBy || row[a] > 0;
        return [a, has ? Math.round(row[a] * 10) / 10 : null];
      })
    ) as Record<ScoredArea, number | null>;
    const isToday = d.getTime() === today.getTime();
    const missed = !isToday && SCORED_AREAS.every((a) => scores[a] == null);
    days.push({ date: format(d, "yyyy-MM-dd"), scores, missed, today: isToday });
  }
  const missedDays = days.filter((d) => d.missed).length;
  const penalty = Math.round(missedDays * MISSED_DAY_PENALTY * 10) / 10;
  const areas = Object.fromEntries(
    SCORED_AREAS.map((a) => {
      const vals = days.map((d) => d.scores[a]).filter((v): v is number => v != null);
      const avg = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
      const score = avg == null ? null : Math.max(0, Math.round((avg - penalty) * 10) / 10);
      return [a, { score, avg: avg == null ? null : Math.round(avg * 10) / 10, days: vals.length, penalty }];
    })
  ) as WeekScore["areas"];
  const scored = SCORED_AREAS.map((a) => areas[a].score).filter((v): v is number => v != null);
  return {
    start: format(start, "yyyy-MM-dd"),
    days,
    areas,
    overall: scored.length ? Math.round((scored.reduce((s, v) => s + v, 0) / scored.length) * 10) / 10 : null,
    missedDays,
  };
}

export async function weekScore(userId: string, now = new Date()): Promise<WeekScore> {
  const start = startOfWeek(getStartOfDay(now), { weekStartsOn: 1 });
  const rows = await prisma.categoryScore.findMany({
    where: { userId, date: { gte: start, lt: addDays(getStartOfDay(now), 1) } },
    select: { date: true, rationale: true, judgedBy: true, physical: true, mental: true, financial: true, spiritual: true },
  });
  return weekFromRows(rows as Row[], now);
}

/** "Week so far: 6.4 (physical 7 · mental 5.8 …), 1 missed day −0.5" for Telegram. */
export function describeWeek(w: WeekScore) {
  const parts = SCORED_AREAS.filter((a) => w.areas[a].score != null).map((a) => `${a} ${w.areas[a].score}`);
  return `Week so far: ${w.overall ?? "–"}${parts.length ? ` (${parts.join(" · ")})` : ""}${w.missedDays ? ` · ${w.missedDays} day${w.missedDays === 1 ? "" : "s"} with nothing logged: −${(w.missedDays * MISSED_DAY_PENALTY).toFixed(1)}` : ""}`;
}
