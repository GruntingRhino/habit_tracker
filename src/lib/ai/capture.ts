import prisma from "@/lib/prisma";
import { applyPlanToProject } from "@/lib/ai/goalplan";
import { estimateMealInBackground } from "@/lib/ai/nutrition";
import { inBackground } from "@/lib/background";
import { parseFoods } from "@/lib/nutrition-parse";
import { normalizeArea, normalizePriority } from "@/lib/areas";
import { recomputeCategoryScoreForDate } from "@/lib/category-score";
import { getStartOfDay } from "@/lib/utils";
import type { RoutedItem } from "@/lib/ai/router";
import { findWhenInText, parseWhenFrom } from "@/lib/ai/when";
import { detectAssessment, headsUpTime } from "@/lib/study";
import { noteSession } from "@/lib/training";
import { deleteEvent } from "@/lib/calendar";

/** A change made by the assistant; stored on the chat message so it can be undone. */
export interface ItemAction {
  op: "create" | "complete" | "append" | "update";
  /** "plan": a goal plan in progress (id = conversation id); undone by undoMessage, not here. */
  type: "todo" | "project" | "task" | "routine" | "reminder" | "meal" | "workout" | "journal" | "note" | "plan" | "schedule" | "measurement" | "event";
  id: string;
  title: string;
  area?: string;
  href: string;
  detail?: string;
  /** previous value for reversible edits (journal append; plan JSON for a plan update) */
  prev?: string | null;
}

const ALL_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri"];

function tokens(s: string) {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2 && !["the", "and", "for", "with", "project", "finish"].includes(t))
  );
}

/** Token-overlap similarity in [0,1]. Good enough for matching "thesis" → "Finish thesis". */
export function similarity(a: string, b: string) {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  let hit = 0;
  for (const t of ta) if (tb.has(t) || [...tb].some((x) => x.startsWith(t) || t.startsWith(x))) hit++;
  return hit / Math.min(ta.size, tb.size);
}

export function bestMatch<T extends { title: string }>(needle: string, list: T[], min = 0.5): T | null {
  let best: T | null = null;
  let score = min;
  for (const item of list) {
    const s = similarity(needle, item.title);
    if (s >= score) {
      best = item;
      score = s;
    }
  }
  return best;
}

function fmt(date: Date) {
  return date.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export async function applyCapture(
  userId: string,
  items: RoutedItem[],
  originalText: string,
  source: "web" | "telegram"
): Promise<ItemAction[]> {
  const actions: ItemAction[] = [];
  const projects = await prisma.project.findMany({
    where: { userId, status: { not: "completed" } },
    select: { id: true, title: true, area: true },
  });

  for (const item of items) {
    const area = normalizeArea(item.area);
    const priority = normalizePriority(item.priority);
    const when = parseWhenFrom(item.when, originalText) ?? (items.length === 1 ? findWhenInText(originalText) : null);

    switch (item.kind) {
      case "project": {
        const existing = bestMatch(item.title, projects, 0.8);
        if (existing) {
          actions.push({ op: "create", type: "project", id: existing.id, title: existing.title, area: existing.area, href: `/todos?project=${existing.id}`, detail: "already tracked" });
          break;
        }
        const project = await prisma.project.create({
          data: { userId, title: item.title, area, priority, deadline: when?.date ?? null },
        });
        projects.push({ id: project.id, title: project.title, area: project.area });
        actions.push({ op: "create", type: "project", id: project.id, title: project.title, area, href: `/todos?project=${project.id}`, detail: when ? `due ${fmt(when.date)}` : undefined });
        break;
      }
      case "task": {
        const project = item.project ? bestMatch(item.project, projects, 0.5) : null;
        if (!project) {
          const todo = await prisma.todo.create({ data: { userId, title: item.title, area, priority, dueAt: when?.date ?? null, source } });
          actions.push({ op: "create", type: "todo", id: todo.id, title: todo.title, area, href: "/todos" });
          break;
        }
        const last = await prisma.projectTask.findFirst({ where: { projectId: project.id, parentTaskId: null }, orderBy: { order: "desc" } });
        const task = await prisma.projectTask.create({
          data: { projectId: project.id, title: item.title, area, priority, dueDate: when?.date ?? null, order: (last?.order ?? -1) + 1 },
        });
        actions.push({ op: "create", type: "task", id: task.id, title: task.title, area, href: `/todos?project=${project.id}`, detail: `in ${project.title}` });
        break;
      }
      case "routine": {
        const days = item.repeat === "weekdays" ? WEEKDAYS : ALL_DAYS;
        const lower = originalText.toLowerCase();
        const timeOfDay = /morning|wake|am\b/.test(lower) ? "morning" : /night|evening|bed|pm\b/.test(lower) ? "evening" : "any";
        const habit = await prisma.habit.create({
          data: { userId, name: item.title, area, category: area === "work" ? "focus" : area === "spiritual" ? "general" : area, targetDays: days, timeOfDay },
        });
        actions.push({ op: "create", type: "routine", id: habit.id, title: habit.name, area, href: "/habits", detail: item.repeat === "weekdays" ? "weekdays" : "daily" });
        break;
      }
      case "reminder": {
        const fireAt = when?.date ?? null;
        if (fireAt) {
          const reminder = await prisma.reminder.create({
            data: { userId, text: item.title, fireAt, recurrence: item.repeat ?? "none" },
          });
          const repeat = item.repeat && item.repeat !== "none" ? ` · ${item.repeat}` : "";
          actions.push({ op: "create", type: "reminder", id: reminder.id, title: item.title, area, href: "/todos", detail: `${fmt(fireAt)}${repeat}` });
        } else {
          // No usable time: keep it as a to-do and ask when.
          const todo = await prisma.todo.create({ data: { userId, title: item.title, area, priority, source } });
          actions.push({ op: "create", type: "todo", id: todo.id, title: todo.title, area, href: "/todos", detail: "no time given" });
        }
        break;
      }
      case "meal": {
        const eaten = item.done !== false;
        const lower = item.title.toLowerCase() + " " + originalText.toLowerCase();
        // The model guesses a slot even when none was said; only trust a slot named in the text.
        const said = /\b(breakfast|lunch|dinner|snack)\b/.exec(lower)?.[1];
        const hour = new Date().getHours();
        const category = said ?? (hour < 11 ? "breakfast" : hour < 16 ? "lunch" : hour < 22 ? "dinner" : "snack");
        // "Lunch" or "Meal" isn't a name: use the foods instead ("Jasmine rice, salmon, cucumber…").
        const generic = /^(breakfast|lunch|dinner|brunch|snack|meal|food|dessert|something|stuff)$/i.test(item.title.trim());
        const foods = generic ? parseFoods(originalText).map((f) => f.text) : [];
        const mealName = foods.length ? `${foods.slice(0, 3).join(", ")}${foods.length > 3 ? "…" : ""}`.replace(/^./, (c) => c.toUpperCase()) : item.title;
        const meal = await prisma.meal.create({
          data: {
            userId,
            name: mealName,
            sourceText: items.filter((i) => i.kind === "meal").length === 1 ? originalText.slice(0, 600) : item.title,
            category,
            status: eaten ? "eaten" : "planned",
            plannedFor: eaten ? new Date() : when?.date ?? null,
          },
        });
        // Eaten meals get nutrition filled in after the reply (the Nutrition tab shows it).
        if (eaten) inBackground(() => estimateMealInBackground(meal.id, items.filter((i) => i.kind === "meal").length === 1 ? originalText : item.title));
        actions.push({ op: "create", type: "meal", id: meal.id, title: meal.name, area: "physical", href: "/meals", detail: eaten ? `ate · ${category}` : `planned · ${category}` });
        break;
      }
      case "workout": {
        // "ran a 5k in 24 minutes" is a duration, not a future time: a done workout is never planned.
        if (item.done === false || (item.done !== true && when && when.date.getTime() > Date.now())) {
          const todo = await prisma.todo.create({
            data: { userId, title: `Workout: ${item.title}`, area: "physical", priority, dueAt: when?.date ?? null, source },
          });
          actions.push({ op: "create", type: "todo", id: todo.id, title: todo.title, area: "physical", href: "/todos", detail: "planned workout" });
          break;
        }
        const routines = await prisma.weightRoutine.findMany({ where: { userId }, select: { id: true, name: true } });
        const match = bestMatch(item.title, routines.map((r) => ({ ...r, title: r.name })), 0.5);
        const routine = match ?? (await prisma.weightRoutine.create({ data: { userId, name: item.title } }));
        const session = await prisma.workoutSession.create({ data: { userId, routineId: routine.id, notes: originalText.slice(0, 500) } });
        await noteSession(userId, routine.name);
        const day = getStartOfDay(new Date());
        await prisma.dailyEntry.upsert({
          where: { userId_date: { userId, date: day } },
          update: { workoutCompleted: true, workoutRoutineName: routine.name },
          create: { userId, date: day, workoutCompleted: true, workoutRoutineName: routine.name },
        });
        await recomputeCategoryScoreForDate(userId, day);
        actions.push({ op: "create", type: "workout", id: session.id, title: routine.name, area: "physical", href: "/habits#workouts", detail: "logged" });
        break;
      }
      case "journal": {
        const day = getStartOfDay(new Date());
        const entry = await prisma.dailyEntry.findUnique({ where: { userId_date: { userId, date: day } } });
        const text = originalText.trim();
        const notes = entry?.notes ? `${entry.notes}\n\n${text}` : text;
        const saved = await prisma.dailyEntry.upsert({
          where: { userId_date: { userId, date: day } },
          update: { notes },
          create: { userId, date: day, notes },
        });
        actions.push({ op: "append", type: "journal", id: saved.id, title: "Journal", area, href: "/entry", detail: "added to today", prev: entry?.notes ?? null });
        // Only one journal append per message: the whole text went in.
        return actions;
      }
      case "note": {
        const content = originalText
          .replace(/^\s*(notes?\s*[:\-]|jot( this| that)? down|write( this| that)? down( that)?|save (this|that)|remember (this|that)|keep in mind( that)?)\s*[:\-]?\s*/i, "")
          .trim();
        const note = await prisma.note.create({ data: { userId, title: item.title.slice(0, 120), content: content || originalText } });
        actions.push({ op: "create", type: "note", id: note.id, title: note.title, area, href: "/entry?tab=notes" });
        break;
      }
      case "todo":
      default: {
        // A test/quiz/essay with a date: kept as a high-priority to-do, plus a reminder the evening before.
        const assessment = when ? detectAssessment(item.title, originalText) : null;
        const todo = await prisma.todo.create({
          data: { userId, title: item.title, area: assessment ? "work" : area, priority: assessment ? "high" : priority, dueAt: when?.date ?? null, source },
        });
        actions.push({ op: "create", type: "todo", id: todo.id, title: todo.title, area: assessment ? "work" : area, href: "/todos", detail: when ? `due ${fmt(when.date)}` : undefined });
        const heads = assessment && when ? headsUpTime(when.date) : null;
        if (heads) {
          const reminder = await prisma.reminder.create({ data: { userId, text: `${item.title} tomorrow`, fireAt: heads, todoId: todo.id } });
          actions.push({ op: "create", type: "reminder", id: reminder.id, title: `${item.title} tomorrow`, area: "work", href: "/todos", detail: fmt(heads) });
        }
      }
    }
  }
  return actions;
}

/** Mark items done by fuzzy title match across to-dos, project tasks, projects and routines. */
export async function applyComplete(userId: string, items: RoutedItem[]): Promise<{ actions: ItemAction[]; missed: string[] }> {
  const [todos, tasks, projects, habits] = await Promise.all([
    prisma.todo.findMany({ where: { userId, status: "open" }, select: { id: true, title: true, area: true } }),
    prisma.projectTask.findMany({ where: { project: { userId }, status: { notIn: ["completed", "cancelled"] } }, select: { id: true, title: true, area: true, projectId: true } }),
    prisma.project.findMany({ where: { userId, status: { not: "completed" } }, select: { id: true, title: true, area: true } }),
    prisma.habit.findMany({ where: { userId, isActive: true }, select: { id: true, name: true, area: true } }),
  ]);
  const actions: ItemAction[] = [];
  const missed: string[] = [];
  const now = new Date();
  const today = getStartOfDay(now);

  for (const item of items) {
    const todo = bestMatch(item.title, todos);
    if (todo) {
      await prisma.todo.update({ where: { id: todo.id }, data: { status: "done", completedAt: now } });
      actions.push({ op: "complete", type: "todo", id: todo.id, title: todo.title, area: todo.area, href: "/todos" });
      continue;
    }
    const task = bestMatch(item.title, tasks);
    if (task) {
      await prisma.projectTask.update({ where: { id: task.id }, data: { status: "completed", completedAt: now } });
      actions.push({ op: "complete", type: "task", id: task.id, title: task.title, area: task.area ?? undefined, href: `/todos?project=${task.projectId}` });
      continue;
    }
    const habit = bestMatch(item.title, habits.map((h) => ({ ...h, title: h.name })));
    if (habit) {
      await prisma.habitLog.upsert({
        where: { habitId_date: { habitId: habit.id, date: today } },
        update: { completed: true },
        create: { habitId: habit.id, date: today, completed: true },
      });
      actions.push({ op: "complete", type: "routine", id: habit.id, title: habit.name, area: habit.area, href: "/habits" });
      continue;
    }
    const project = bestMatch(item.title, projects, 0.6);
    if (project) {
      await prisma.project.update({ where: { id: project.id }, data: { status: "completed", completedAt: now } });
      actions.push({ op: "complete", type: "project", id: project.id, title: project.title, area: project.area, href: `/todos?project=${project.id}` });
      continue;
    }
    missed.push(item.title);
  }
  if (actions.some((a) => a.type === "routine")) await recomputeCategoryScoreForDate(userId, today);
  return { actions, missed };
}

export async function undoActions(userId: string, actions: ItemAction[]): Promise<number> {
  let undone = 0;
  const today = getStartOfDay(new Date());
  for (const a of [...actions].reverse()) {
    try {
      if (a.type === "plan") {
        // Conversation state; handled by undoMessage.
      } else if (a.op === "update" && a.type === "project") {
        if (a.prev) await applyPlanToProject(userId, a.id, JSON.parse(a.prev));
      } else if (a.op === "append" && a.type === "journal") {
        await prisma.dailyEntry.updateMany({ where: { id: a.id, userId }, data: { notes: a.prev ?? null } });
      } else if (a.op === "complete") {
        if (a.type === "todo") await prisma.todo.updateMany({ where: { id: a.id, userId }, data: { status: "open", completedAt: null } });
        if (a.type === "task") await prisma.projectTask.updateMany({ where: { id: a.id, project: { userId } }, data: { status: "todo", completedAt: null } });
        if (a.type === "project") await prisma.project.updateMany({ where: { id: a.id, userId }, data: { status: "active", completedAt: null } });
        if (a.type === "routine") await prisma.habitLog.deleteMany({ where: { habitId: a.id, date: today } });
      } else if (a.detail === "already tracked") {
        continue;
      } else {
        if (a.type === "todo") await prisma.todo.deleteMany({ where: { id: a.id, userId } });
        if (a.type === "project") await prisma.project.deleteMany({ where: { id: a.id, userId } });
        if (a.type === "task") await prisma.projectTask.deleteMany({ where: { id: a.id, project: { userId } } });
        if (a.type === "routine") await prisma.habit.deleteMany({ where: { id: a.id, userId } });
        if (a.type === "reminder") await prisma.reminder.deleteMany({ where: { id: a.id, userId } });
        if (a.type === "meal") await prisma.meal.deleteMany({ where: { id: a.id, userId } });
        if (a.type === "workout") await prisma.workoutSession.deleteMany({ where: { id: a.id, userId } });
        if (a.type === "note") await prisma.note.deleteMany({ where: { id: a.id, userId } });
        if (a.type === "schedule") await prisma.scheduleBlock.deleteMany({ where: { id: a.id, userId } });
        if (a.type === "measurement") await prisma.bodyMeasurement.deleteMany({ where: { id: a.id, userId } });
        if (a.type === "event") await deleteEvent(userId, a.id);
      }
      undone++;
    } catch {
      // Item already gone — nothing to undo.
    }
  }
  return undone;
}
