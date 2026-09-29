import prisma from "@/lib/prisma";
import { PRIORITY_RANK } from "@/lib/areas";
import { getDayOfWeek, getStartOfDay } from "@/lib/utils";
import { addDays, format } from "date-fns";

export interface OpenItem {
  type: "todo" | "task" | "project";
  id: string;
  title: string;
  area: string;
  priority: string;
  due: Date | null;
  projectTitle?: string;
  projectId?: string;
}

/** Open to-dos, project tasks and projects, sorted by priority then due date. */
export async function getOpenItems(userId: string, limit = 40): Promise<OpenItem[]> {
  const [todos, tasks, projects] = await Promise.all([
    prisma.todo.findMany({ where: { userId, status: "open" }, take: 100 }),
    prisma.projectTask.findMany({
      where: { project: { userId, status: { not: "completed" } }, status: { notIn: ["completed", "cancelled"] }, parentTaskId: null },
      include: { project: { select: { title: true, area: true } } },
      take: 100,
    }),
    prisma.project.findMany({ where: { userId, status: { notIn: ["completed", "archived"] } }, take: 50 }),
  ]);
  const items: OpenItem[] = [
    ...todos.map((t) => ({ type: "todo" as const, id: t.id, title: t.title, area: t.area, priority: t.priority, due: t.dueAt })),
    ...tasks.map((t) => ({
      type: "task" as const,
      id: t.id,
      title: t.title,
      area: t.area ?? t.project.area,
      priority: t.priority,
      due: t.dueDate,
      projectTitle: t.project.title,
      projectId: t.projectId,
    })),
    ...projects.map((p) => ({ type: "project" as const, id: p.id, title: p.title, area: p.area, priority: p.priority, due: p.deadline })),
  ];
  return items.sort(compareItems).slice(0, limit);
}

export function compareItems(a: { priority: string; due: Date | null }, b: { priority: string; due: Date | null }) {
  const now = Date.now();
  const overdueA = a.due && a.due.getTime() < now ? 0 : 1;
  const overdueB = b.due && b.due.getTime() < now ? 0 : 1;
  if (overdueA !== overdueB) return overdueA - overdueB;
  const pr = (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2);
  if (pr !== 0) return pr;
  const da = a.due?.getTime() ?? Infinity;
  const db = b.due?.getTime() ?? Infinity;
  return da - db;
}

/** " → DUE TOMORROW" etc., so the model never has to do date math. */
function relativeDue(due: Date | null, today: Date) {
  if (!due) return "";
  const days = Math.round((getStartOfDay(due).getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return " → OVERDUE";
  if (days === 0) return " → DUE TODAY";
  if (days === 1) return " → DUE TOMORROW";
  if (days < 7) return ` → due in ${days} days`;
  return "";
}

export function describeItem(i: OpenItem) {
  const due = i.due ? `, due ${format(i.due, "EEE MMM d")}` : "";
  const proj = i.projectTitle ? ` [${i.projectTitle}]` : i.type === "project" ? " [project]" : "";
  return `${i.title}${proj} (${i.area}, ${i.priority}${due})`;
}

export async function getTodayRoutines(userId: string, date = new Date()) {
  const day = getStartOfDay(date);
  const dow = getDayOfWeek(day);
  const habits = await prisma.habit.findMany({
    where: { userId, isActive: true, targetDays: { has: dow } },
    include: { logs: { where: { date: day }, take: 1 } },
    orderBy: { createdAt: "asc" },
  });
  return habits.map((h) => ({ id: h.id, name: h.name, area: h.area, timeOfDay: h.timeOfDay, done: h.logs[0]?.completed === true }));
}

/** Compact snapshot for answering questions. Kept small so the context never balloons. */
export async function buildSnapshot(userId: string) {
  const today = getStartOfDay(new Date());
  const [items, routines, plan, scores, weekDone] = await Promise.all([
    getOpenItems(userId, 15),
    getTodayRoutines(userId),
    prisma.dayPlan.findUnique({ where: { userId_date: { userId, date: today } } }),
    prisma.categoryScore.findMany({ where: { userId }, orderBy: { date: "desc" }, take: 3 }),
    prisma.todo.count({ where: { userId, status: "done", completedAt: { gte: addDays(today, -7) } } }),
  ]);
  const lines: string[] = [];
  const now = new Date();
  lines.push(`Now: ${format(now, "EEEE MMM d, h:mm a")}. Tomorrow is ${format(addDays(now, 1), "EEEE MMM d")}.`);
  const [openTodos, openTasks, activeProjects] = await Promise.all([
    prisma.todo.count({ where: { userId, status: "open" } }),
    prisma.projectTask.count({ where: { project: { userId, status: { notIn: ["completed", "archived"] } }, status: { notIn: ["completed", "cancelled"] } } }),
    prisma.project.count({ where: { userId, status: { notIn: ["completed", "archived"] } } }),
  ]);
  lines.push(`Counts: ${openTodos} open to-dos, ${activeProjects} active projects with ${openTasks} open tasks.`);
  const planItems = (plan?.items as { title: string }[] | null) ?? [];
  if (planItems.length) lines.push(`Today's plan: ${planItems.map((p) => p.title).join("; ")}`);
  if (routines.length) lines.push(`Routines today: ${routines.map((r) => `${r.name}${r.done ? " ✓" : ""}`).join("; ")}`);
  if (items.length) lines.push(`Open items:\n${items.map((i) => `- ${describeItem(i)}${relativeDue(i.due, today)}`).join("\n")}`);
  if (scores.length)
    lines.push(
      `Recent scores /10:\n${scores
        .map((s) => `- ${format(s.date, "EEE MMM d")}: overall ${s.overall.toFixed(1)}, physical ${s.physical.toFixed(1)}, mental ${s.mental.toFixed(1)}, financial ${s.financial.toFixed(1)}, spiritual ${s.spiritual.toFixed(1)}`)
        .join("\n")}`
    );
  lines.push(`To-dos completed in last 7 days: ${weekDone}`);
  return lines.join("\n");
}
