import { NextResponse } from "next/server";
import { addDays } from "date-fns";
import { getOwnerSession } from "@/lib/owner";
import prisma from "@/lib/prisma";
import { getStartOfDay } from "@/lib/utils";
import { getOpenItems, getTodayRoutines } from "@/lib/ai/context";
import { fallbackPlan, planDay, type PlanItem } from "@/lib/ai/planner";

export const maxDuration = 300;

let planning: Promise<unknown> | null = null;

async function withStatus(items: PlanItem[]) {
  const ids = (t: string) => items.filter((i) => i.type === t).map((i) => i.id);
  const [todos, tasks, projects] = await Promise.all([
    prisma.todo.findMany({ where: { id: { in: ids("todo") } }, select: { id: true, status: true, dueAt: true } }),
    prisma.projectTask.findMany({ where: { id: { in: ids("task") } }, select: { id: true, status: true, dueDate: true } }),
    prisma.project.findMany({ where: { id: { in: ids("project") } }, select: { id: true, status: true, deadline: true } }),
  ]);
  const done = new Set([
    ...todos.filter((t) => t.status === "done").map((t) => t.id),
    ...tasks.filter((t) => t.status === "completed").map((t) => t.id),
    ...projects.filter((p) => p.status === "completed").map((p) => p.id),
  ]);
  const exists = new Set([...todos, ...tasks, ...projects].map((x) => x.id));
  return items.filter((i) => exists.has(i.id)).map((i) => ({ ...i, done: done.has(i.id) }));
}

export async function GET() {
  const session = await getOwnerSession();
  const userId = session.user.id;
  const today = getStartOfDay(new Date());

  const [plan, routines, scores, meals, reminders] = await Promise.all([
    prisma.dayPlan.findUnique({ where: { userId_date: { userId, date: today } } }),
    getTodayRoutines(userId),
    prisma.categoryScore.findMany({ where: { userId, date: { gte: addDays(today, -13) } }, orderBy: { date: "asc" } }),
    prisma.meal.findMany({ where: { userId, status: { in: ["planned", "eaten"] }, plannedFor: { gte: today, lt: addDays(today, 1) } } }),
    prisma.reminder.findMany({ where: { userId, status: "pending", fireAt: { lt: addDays(today, 1) } }, orderBy: { fireAt: "asc" } }),
  ]);

  let items: PlanItem[];
  let summary: string | null = null;
  let pending = false;
  if (plan) {
    items = plan.items as unknown as PlanItem[];
    summary = plan.summary;
  } else {
    // Show a rule-based plan instantly and let the model plan in the background.
    items = fallbackPlan(await getOpenItems(userId, 20));
    pending = true;
    planning ??= planDay(userId).finally(() => (planning = null));
  }

  return NextResponse.json({
    date: today,
    plan: { items: await withStatus(items), summary, pending, model: plan?.model ?? null },
    routines,
    meals,
    reminders,
    scores,
  });
}

export async function POST() {
  const session = await getOwnerSession();
  const plan = await planDay(session.user.id, { force: true });
  return NextResponse.json(plan);
}
