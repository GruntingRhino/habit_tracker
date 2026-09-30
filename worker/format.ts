import { InlineKeyboard } from "grammy";
import { addDays, format } from "date-fns";
import prisma from "@/lib/prisma";
import { getTodayRoutines } from "@/lib/ai/context";
import { planDay } from "@/lib/ai/planner";
import { SCORED_AREAS } from "@/lib/areas";
import { getStartOfDay } from "@/lib/utils";
import { readRationale } from "@/lib/score-rationale";
import { bestWindow, journalPrompt } from "@/lib/brain/jobs";
import { buildSchedule, describeSchedule } from "@/lib/schedule";
import { todaysTraining } from "@/lib/training";
import { statusLine } from "@/lib/health";

const EMOJI: Record<string, string> = { physical: "💪", mental: "🧠", financial: "💰", spiritual: "🙏", work: "💼", general: "📌" };

export function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function short(s: string, n = 28) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export async function formatBrief(userId: string, kind: "morning" | "evening") {
  const today = getStartOfDay(new Date());
  const plan = await planDay(userId);
  const routines = await getTodayRoutines(userId);
  const [meals, todoStatus, taskStatus] = await Promise.all([
    prisma.meal.findMany({ where: { userId, status: "planned", plannedFor: { gte: today, lt: addDays(today, 1) } } }),
    prisma.todo.findMany({ where: { id: { in: plan.items.filter((i) => i.type === "todo").map((i) => i.id) } }, select: { id: true, status: true } }),
    prisma.projectTask.findMany({ where: { id: { in: plan.items.filter((i) => i.type === "task").map((i) => i.id) } }, select: { id: true, status: true } }),
  ]);
  const doneIds = new Set([...todoStatus, ...taskStatus].filter((x) => x.status === "done" || x.status === "completed").map((x) => x.id));
  const open = plan.items.filter((i) => !doneIds.has(i.id));
  const openRoutines = routines.filter((r) => !r.done);

  const lines: string[] = [];
  lines.push(kind === "morning" ? `☀️ <b>${format(today, "EEEE, MMM d")}</b>` : `🌙 <b>Evening check-in</b>`);
  if (kind === "morning" && plan.summary) lines.push(`<i>${esc(plan.summary)}</i>`);
  if (kind === "morning") {
    const w = await bestWindow(userId).catch(() => null);
    if (w && w.share >= 0.15) lines.push(`⏱ Your best focus window lately: <b>${w.label}</b>. Put the hardest thing there.`);
    const sched = await buildSchedule(userId).catch(() => null);
    if (sched?.blocks.length) lines.push("", "<b>Schedule</b>", ...describeSchedule(sched).map(esc));
    const training = await todaysTraining(userId).catch(() => null);
    if (training?.plans.length) lines.push("", "<b>Lifts (last → today)</b>", ...training.plans.flatMap((p) => [esc(`${p.name}${p.deload ? " — deload week suggested" : ""}`), ...p.exercises.map((e) => esc(`• ${e.name}: ${e.suggestion.last ? `${e.suggestion.last} → ` : ""}${e.suggestion.next}`))]));
    lines.push("", await statusLine().catch(() => ""));
  }
  lines.push("");
  if (kind === "evening") {
    lines.push(`Plan: ${plan.items.length - open.length}/${plan.items.length} done · Habits: ${routines.length - openRoutines.length}/${routines.length}`);
    if (open.length) lines.push("", "<b>Still open</b>");
  } else if (plan.items.length) {
    lines.push("<b>Focus</b>");
  }
  for (const [n, item] of (kind === "morning" ? plan.items : open).entries()) {
    const done = doneIds.has(item.id);
    lines.push(`${done ? "✅" : `${n + 1}.`} ${EMOJI[item.area] ?? "📌"} ${done ? `<s>${esc(item.title)}</s>` : esc(item.title)}${item.reason && !done ? ` — <i>${esc(item.reason)}</i>` : ""}`);
  }
  if (openRoutines.length) {
    lines.push("", "<b>Habits</b>", openRoutines.map((r) => `${EMOJI[r.area] ?? "🔁"} ${esc(r.name)}`).join("\n"));
  }
  if (kind === "morning" && meals.length) {
    lines.push("", "<b>Meals</b>", meals.map((m) => `🍽 ${m.category}: ${esc(m.name)}`).join("\n"));
  }
  if (kind === "evening") lines.push("", esc(await journalPrompt(userId).catch(() => "📝 How did today go? Reply with a few lines for your journal.")), "<i>Reply with a few lines for your journal.</i>");

  const keyboard = new InlineKeyboard();
  let row = 0;
  for (const item of open.slice(0, 6)) {
    if (item.type === "project") continue;
    keyboard.text(`✓ ${short(item.title)}`, `pd:${item.type}:${item.id}`).row();
    row++;
  }
  for (const r of openRoutines.slice(0, 6)) {
    keyboard.text(`✓ ${short(r.name)}`, `pd:routine:${r.id}`).row();
    row++;
  }
  return { text: lines.join("\n"), keyboard: row ? keyboard : undefined };
}

export function formatScores(s: {
  date: Date;
  overall: number;
  physical: number;
  mental: number;
  financial: number;
  spiritual: number;
  work: number;
  rationale: unknown;
  journalScore: number | null;
  journalFeedback: string | null;
}) {
  const reasons = readRationale(s.rationale);
  const lines = [`📊 <b>${format(s.date, "EEE MMM d")} — ${s.overall.toFixed(1)}/10</b>`, ""];
  for (const a of SCORED_AREAS) {
    const r = reasons[a];
    const label = `${EMOJI[a]} ${a[0].toUpperCase()}${a.slice(1)}`;
    if (r.noData) {
      lines.push(`${label}: – <i>no data yet</i>`);
      continue;
    }
    lines.push(`${label}: <b>${Math.round(s[a])}</b>${r.why.length ? ` — ${esc(r.why.join("; "))}` : ""}`);
    if (r.improve) lines.push(`   ↑ ${esc(r.improve)}`);
  }
  if (s.journalFeedback) {
    lines.push("", `📝 Journal${s.journalScore != null ? ` ${s.journalScore}/10` : ""}`, esc(s.journalFeedback));
  }
  return lines.join("\n");
}
