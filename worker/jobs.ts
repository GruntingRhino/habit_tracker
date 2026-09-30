import { addDays, format } from "date-fns";
import prisma from "@/lib/prisma";
import { getOwner } from "@/lib/owner";
import { planDay } from "@/lib/ai/planner";
import { judgeDay } from "@/lib/ai/judge";
import { SCORED_AREAS } from "@/lib/areas";
import { getStartOfDay } from "@/lib/utils";
import { reportError } from "@/lib/monitoring";
import { readRationale } from "@/lib/score-rationale";
import { scoreLinks } from "@/lib/brain/jobs";
import { fmtHeight, fmtLb, measurementTrend, readBody, updateBody } from "@/lib/body";
import { workerHealthCheck } from "@/lib/health";
import { refreshNews } from "@/lib/news";
import { syncGoogle } from "@/lib/google";
import { describeWeek, weekScore } from "@/lib/weekly";
import { blockStatus } from "@/lib/training";
import { esc, formatBrief, formatScores } from "./format";
import { reminderKeyboard, sendToOwner } from "./telegram";

function nextOccurrence(date: Date, recurrence: string): Date | null {
  if (recurrence === "daily") return addDays(date, 1);
  if (recurrence === "weekly") return addDays(date, 7);
  if (recurrence === "weekdays") {
    let d = addDays(date, 1);
    while (d.getDay() === 0 || d.getDay() === 6) d = addDays(d, 1);
    return d;
  }
  return null;
}

let sendingReminders = false;

export async function sendDueReminders() {
  if (sendingReminders) return;
  sendingReminders = true;
  try {
    const due = await prisma.reminder.findMany({
      where: { status: "pending", fireAt: { lte: new Date() } },
      orderBy: { fireAt: "asc" },
      take: 20,
    });
    for (const r of due) {
      const msg = await sendToOwner(`⏰ <b>${esc(r.text)}</b>`, reminderKeyboard(r.id));
      let next = nextOccurrence(r.fireAt, r.recurrence);
      while (next && next.getTime() <= Date.now()) next = nextOccurrence(next, r.recurrence);
      await prisma.reminder.update({
        where: { id: r.id },
        data: next
          ? { fireAt: next, sentAt: new Date(), telegramMessageId: msg?.message_id ?? null }
          : { status: "sent", sentAt: new Date(), telegramMessageId: msg?.message_id ?? null },
      });
    }
  } catch (error) {
    reportError({ context: "worker.reminders", error });
  } finally {
    sendingReminders = false;
  }
}

export async function planToday() {
  const owner = await getOwner();
  await planDay(owner.id, { force: true });
}

export async function morningBrief() {
  const owner = await getOwner();
  const { text, keyboard } = await formatBrief(owner.id, "morning");
  await sendToOwner(text, keyboard);
}

export async function eveningReview() {
  const owner = await getOwner();
  const { text, keyboard } = await formatBrief(owner.id, "evening");
  await sendToOwner(text, keyboard);
}

export async function nightlyJudge(date = new Date()) {
  const owner = await getOwner();
  await judgeDay(owner.id, date);
  const score = await prisma.categoryScore.findUnique({ where: { userId_date: { userId: owner.id, date: getStartOfDay(date) } } });
  if (score) await sendToOwner(`${formatScores(score)}\n\n📈 ${esc(describeWeek(await weekScore(owner.id, date)))}`);
}

export async function weeklyDigest() {
  const owner = await getOwner();
  const userId = owner.id;
  const today = getStartOfDay(new Date());
  const weekAgo = addDays(today, -7);
  const [scores, doneTodos, doneTasks, openCount, stale, habits] = await Promise.all([
    prisma.categoryScore.findMany({ where: { userId, date: { gte: weekAgo } }, orderBy: { date: "asc" } }),
    prisma.todo.findMany({ where: { userId, status: "done", completedAt: { gte: weekAgo } }, select: { area: true } }),
    prisma.projectTask.findMany({ where: { project: { userId }, status: "completed", completedAt: { gte: weekAgo } }, select: { area: true, project: { select: { area: true } } } }),
    prisma.todo.count({ where: { userId, status: "open" } }),
    prisma.project.findMany({ where: { userId, status: "active", updatedAt: { lt: addDays(today, -14) } }, select: { title: true } }),
    prisma.habit.findMany({ where: { userId, isActive: true }, select: { name: true, targetDays: true, logs: { where: { date: { gte: weekAgo }, completed: true }, select: { id: true } } } }),
  ]);

  const byArea: Record<string, number> = {};
  for (const t of doneTodos) byArea[t.area] = (byArea[t.area] ?? 0) + 1;
  for (const t of doneTasks) {
    const a = t.area ?? t.project.area;
    byArea[a] = (byArea[a] ?? 0) + 1;
  }

  // Areas with no data that day are left out of the average rather than counted as 0.
  const avg = (k: (typeof SCORED_AREAS)[number] | "overall") => {
    const rows = k === "overall" ? scores : scores.filter((x) => !readRationale(x.rationale)[k].noData);
    return rows.length ? (rows.reduce((s, x) => s + x[k], 0) / rows.length).toFixed(1) : "–";
  };

  const lines = [`🗓 <b>Sunday review</b> · ${format(weekAgo, "MMM d")}–${format(addDays(today, -1), "MMM d")}`, ""];
  lines.push(`<b>Average score:</b> ${avg("overall")}/10`);
  lines.push(SCORED_AREAS.map((a) => `${a}: ${avg(a)}`).join(" · "));
  lines.push("", "<b>Completed by area</b>");
  lines.push(Object.keys(byArea).length ? Object.entries(byArea).map(([a, n]) => `${a}: ${n}`).join(" · ") : "nothing marked done");
  lines.push(`Open to-dos: ${openCount}`);
  if (habits.length) {
    lines.push("", "<b>Habits</b>");
    for (const h of habits) lines.push(`${esc(h.name)}: ${h.logs.length}/${h.targetDays.length}`);
  }
  if (stale.length) {
    lines.push("", "<b>Stale projects (14+ days untouched)</b>");
    lines.push(stale.map((p) => `• ${esc(p.title)}`).join("\n"));
  }

  // Sunday review: one pattern and one small experiment for the week.
  const links = await scoreLinks(userId).catch(() => [] as string[]);
  if (links.length) lines.push("", "<b>Pattern</b>", esc(links[0]));
  const weakest = [...SCORED_AREAS].filter((a) => avg(a) !== "–").sort((a, b) => Number(avg(a)) - Number(avg(b)))[0] ?? null;
  if (weakest) {
    const tips = scores.flatMap((s) => readRationale(s.rationale)[weakest].improve ?? []);
    const common = tips.sort((a, b) => tips.filter((t) => t === b).length - tips.filter((t) => t === a).length)[0];
    lines.push("", "<b>Experiment for this week</b>", `${weakest[0].toUpperCase()}${weakest.slice(1)} was your lowest area (${avg(weakest)}).${common ? ` Try: ${esc(common)}.` : ""}`);
  }
  lines.push("", ...(await weeklyCheckIn(userId)));
  await sendToOwner(lines.join("\n"));
}

/**
 * Weekly body check-in: if he weighed in the last 2 days (journal or chat), run the check-in now
 * (trend → calories, weight → protein etc.); otherwise ask for this morning's weight.
 */
export async function weeklyCheckIn(userId: string, now = new Date()) {
  const body = await readBody();
  const recent = await prisma.dailyEntry.findFirst({ where: { userId, weightLb: { not: null }, date: { gte: addDays(getStartOfDay(now), -1) } }, orderBy: { date: "desc" } });
  const lines = ["⚖️ <b>Weekly check-in</b>"];
  if (recent?.weightLb) {
    const r = await updateBody(userId, {}, { checkIn: true, now });
    lines.push(`Weight ${fmtLb(recent.weightLb)}${body.heightIn ? ` · ${fmtHeight(body.heightIn)}` : ""}`);
    if (r.changed.length) lines.push(`Targets updated: ${esc(r.changed.join(", "))}`);
    lines.push(...r.lines.map(esc));
  } else {
    lines.push(`Last weight: ${body.weightLb ? `${fmtLb(body.weightLb)}${body.measuredAt ? ` (${body.measuredAt})` : ""}` : "none yet"}.`);
    lines.push("Weigh yourself tomorrow morning (after the bathroom, before eating) and reply like <b>135 lb</b>. Your protein, calories, carbs and fat update from it.");
  }
  // Monthly tape measurements (his rule: judge physique over months, not mirrors).
  const tape = await measurementTrend(userId, now);
  if (!tape.lastDate || now.getTime() - tape.lastDate.getTime() > 27 * 86_400_000) {
    lines.push("📏 Monthly measurements: reply like <b>waist 29, chest 36, shoulders 45, arms 12, thighs 21</b> (inches, relaxed, same time of day).");
  } else if (tape.ratio) lines.push(`Shoulder-to-waist ${tape.ratio}${tape.change.waist ? ` · waist ${tape.change.waist.delta >= 0 ? "+" : ""}${tape.change.waist.delta}" in ${Math.round(tape.change.waist.days / 7)} wk` : ""}`);
  // Training block: ~6 weeks, keep it while lifts still progress.
  const block = await blockStatus(userId, now);
  if (block.weeks >= 6) {
    lines.push(
      block.tracked && block.stalled / block.tracked < 0.5
        ? `🏋️ ${esc(block.name)}: week ${block.weeks}, most lifts still progressing — you can run it up to 2 more weeks, then switch to Upper ${block.next}.`
        : `🏋️ ${esc(block.name)}: week ${block.weeks}${block.tracked ? `, ${block.stalled}/${block.tracked} lifts stalled` : ""} — time to switch to Upper ${block.next} (tell me “switch to upper ${block.next.toLowerCase()}”).`
    );
  } else lines.push(`🏋️ ${esc(block.name)}: week ${block.weeks + 1} of ~6.`);
  const measured = body.history?.filter((h) => h.heightIn).pop();
  if (!measured || now.getTime() - new Date(measured.date).getTime() > 30 * 86_400_000) lines.push("Also: height check (you're still growing) — reply like <b>6'0\"</b>.");
  return lines;
}

export async function nightlyNews() {
  const owner = await getOwner();
  const s = await refreshNews(owner.id);
  if (s.items.length < 20) throw new Error(`only ${s.items.length} news items (${s.errors.join("; ")})`);
}

export async function googleSync() {
  const owner = await getOwner();
  if (!(await prisma.googleAccount.findUnique({ where: { userId: owner.id } }))) return;
  const r = await syncGoogle(owner.id);
  if (!r.ok) throw new Error(r.error);
}

export async function healthCheck() {
  const msg = await workerHealthCheck();
  if (msg) await sendToOwner(msg);
}

export const JOBS = {
  health: healthCheck,
  news: nightlyNews,
  google: googleSync,
  reminders: sendDueReminders,
  plan: planToday,
  morning: morningBrief,
  evening: eveningReview,
  judge: () => nightlyJudge(),
  "judge-yesterday": () => nightlyJudge(addDays(new Date(), -1)),
  weekly: weeklyDigest,
} as const;
