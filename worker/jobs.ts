import { addDays, format } from "date-fns";
import prisma from "@/lib/prisma";
import { getOwner } from "@/lib/owner";
import { planDay } from "@/lib/ai/planner";
import { judgeDay } from "@/lib/ai/judge";
import { SCORED_AREAS } from "@/lib/areas";
import { getStartOfDay } from "@/lib/utils";
import { reportError } from "@/lib/monitoring";
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
  await judgeDay(owner.id, date, { think: false });
  const score = await prisma.categoryScore.findUnique({ where: { userId_date: { userId: owner.id, date: getStartOfDay(date) } } });
  if (score) await sendToOwner(formatScores(score));
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

  const avg = (k: (typeof SCORED_AREAS)[number] | "overall") =>
    scores.length ? (scores.reduce((s, x) => s + x[k], 0) / scores.length).toFixed(1) : "–";

  const lines = [`🗓 <b>Weekly review</b> · ${format(weekAgo, "MMM d")}–${format(addDays(today, -1), "MMM d")}`, ""];
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
  await sendToOwner(lines.join("\n"));
}

export const JOBS = {
  reminders: sendDueReminders,
  plan: planToday,
  morning: morningBrief,
  evening: eveningReview,
  judge: () => nightlyJudge(),
  "judge-yesterday": () => nightlyJudge(addDays(new Date(), -1)),
  weekly: weeklyDigest,
} as const;
