/**
 * "Ask AI" on one to-do or project: he tells it what he wants and it changes that item.
 *
 *   "make a plan" / "break it down" → a to-do becomes a project with a dated checklist
 *   anything else ("write a recipe for this", "move it to friday 6pm", "add buy eggs") → the model
 *   returns edit operations (title, description, due, priority, checklist add/complete/remove),
 *   code applies them
 *
 * Every change returns a snapshot of the item as it was, so the UI can undo it in one tap.
 */
import { addDays, differenceInCalendarDays } from "date-fns";
import prisma from "@/lib/prisma";
import { chat } from "@/lib/ai/llm";
import { breakDownProject } from "@/lib/ai/breakdown";
import { findWhenInText } from "@/lib/ai/when";
import { normalizePriority } from "@/lib/areas";
import { getStartOfDay } from "@/lib/utils";
import { bestMatch } from "@/lib/ai/capture";

export type ItemRef = { type: "todo" | "project"; id: string };

export interface Snapshot {
  kind: "todo" | "project" | "converted";
  todo?: { id: string; title: string; notes: string | null; dueAt: string | null; priority: string; area: string; status: string };
  project?: { id: string; title: string; description: string | null; deadline: string | null; priority: string; status: string };
  tasks?: { id: string; title: string; description: string | null; status: string; dueDate: string | null; order: number; priority: string }[];
  /** For "converted": the project that replaced the to-do. */
  projectId?: string;
}

export interface ItemAiResult {
  reply: string;
  changes: string[];
  item: ItemRef;
  snapshot: Snapshot | null;
}

export const PLAN_ASK = /\b(plan|break (it |this |that )?(down|up)|steps|checklist|roadmap|to-?do list for)\b/i;

/** Dates for n checklist items: spread from tomorrow to the day before the deadline, else one a day (7pm). */
export function spreadDates(n: number, deadline: Date | null, now = new Date()): Date[] {
  const start = addDays(getStartOfDay(now), 1);
  const out: Date[] = [];
  // Finish the day before the deadline, so the last step isn't a same-day scramble.
  const span = deadline ? Math.max(0, differenceInCalendarDays(getStartOfDay(deadline), start) - 1) : n - 1;
  for (let i = 0; i < n; i++) {
    const d = addDays(start, n === 1 ? span : Math.round((i * span) / (n - 1)));
    d.setHours(19, 0, 0, 0);
    out.push(deadline && d > deadline ? new Date(deadline) : d);
  }
  return out;
}

async function snapshotProject(id: string): Promise<Snapshot> {
  const p = await prisma.project.findUniqueOrThrow({ where: { id }, include: { tasks: { orderBy: { order: "asc" } } } });
  return {
    kind: "project",
    project: { id: p.id, title: p.title, description: p.description, deadline: p.deadline?.toISOString() ?? null, priority: p.priority, status: p.status },
    tasks: p.tasks.map((t) => ({ id: t.id, title: t.title, description: t.description, status: t.status, dueDate: t.dueDate?.toISOString() ?? null, order: t.order, priority: t.priority })),
  };
}

function snapshotTodo(t: { id: string; title: string; notes: string | null; dueAt: Date | null; priority: string; area: string; status: string }): Snapshot {
  return { kind: "todo", todo: { id: t.id, title: t.title, notes: t.notes, dueAt: t.dueAt?.toISOString() ?? null, priority: t.priority, area: t.area, status: t.status } };
}

/** A to-do becomes a project (same title, description, due date, priority, area). */
export async function convertToProject(userId: string, todoId: string) {
  const t = await prisma.todo.findFirstOrThrow({ where: { id: todoId, userId } });
  const project = await prisma.project.create({
    data: { userId, title: t.title, description: t.notes, deadline: t.dueAt, priority: t.priority, area: t.area === "general" ? "work" : t.area },
  });
  await prisma.reminder.updateMany({ where: { todoId: t.id }, data: { todoId: null } });
  await prisma.todo.delete({ where: { id: t.id } });
  return { project, snapshot: { ...snapshotTodo(t), kind: "converted" as const, projectId: project.id } };
}

/** Make a plan: a dated checklist on the project (a to-do is converted first). */
export async function planItem(userId: string, ref: ItemRef, instruction = "", now = new Date()): Promise<ItemAiResult> {
  let projectId = ref.id;
  let snapshot: Snapshot;
  if (ref.type === "todo") {
    const c = await convertToProject(userId, ref.id);
    projectId = c.project.id;
    snapshot = c.snapshot;
  } else {
    await prisma.project.findFirstOrThrow({ where: { id: ref.id, userId } });
    snapshot = await snapshotProject(ref.id);
  }
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, include: { tasks: { select: { title: true, order: true } } } });
  const details = [project.description, instruction && !/^\s*(make|create|build|write)?\s*(me\s+)?(a\s+)?plan\s*(for (it|this))?\s*[.!]?\s*$/i.test(instruction) ? `He asked: ${instruction}` : null, project.tasks.length ? `Already has: ${project.tasks.map((t) => t.title).join("; ")}` : null]
    .filter(Boolean)
    .join("\n");
  const drafts = await breakDownProject(project.title, details || null);
  if (!drafts.length) {
    return { reply: "The AI couldn't make a checklist right now — the project is still there, try again in a minute.", changes: ref.type === "todo" ? ["Made it a project"] : [], item: { type: "project", id: projectId }, snapshot };
  }
  const existing = new Set(project.tasks.map((t) => t.title.toLowerCase()));
  const fresh = drafts.filter((d) => !existing.has(d.title.toLowerCase()));
  const dates = spreadDates(fresh.length, project.deadline, now);
  const base = Math.max(-1, ...project.tasks.map((t) => t.order)) + 1;
  for (const [i, d] of fresh.entries()) {
    await prisma.projectTask.create({ data: { projectId, title: d.title, priority: d.priority, estimatedMinutes: d.estimatedMinutes, dueDate: dates[i], order: base + i } });
  }
  return {
    reply: `${ref.type === "todo" ? "Made it a project with" : "Added"} a ${fresh.length}-step checklist${project.deadline ? ", dated up to the deadline" : ", one step a day"}.`,
    changes: [...(ref.type === "todo" ? ["Made it a project"] : []), ...fresh.map((d, i) => `+ ${d.title} (${dates[i].toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })})`)],
    item: { type: "project", id: projectId },
    snapshot,
  };
}

// ---- edits: code reads the instruction; the model only writes content -------------------------

export interface ParsedEdit {
  due?: Date | null;
  priority?: "low" | "medium" | "high" | "urgent";
  title?: string;
  add?: { title: string; when: Date | null }[];
  complete?: string[];
  remove?: string[];
  /** Anything that needs writing (a recipe, notes, a list…): goes to the model as a content request. */
  write?: string;
}

const WHEN_WORDS = /\b(today|tonight|tomorrow|mon(day)?|tue(s(day)?)?|wed(nesday)?|thu(rs(day)?)?|fri(day)?|sat(urday)?|sun(day)?|next week|this weekend|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{1,2}(:\d{2})?\s*(am|pm)|\d{1,2}\/\d{1,2})\b/i;

/** Read the simple parts of an instruction without the model. Clauses: "move to fri 6pm, make it urgent, add buy board sat". */
export function parseEdit(instruction: string, now = new Date()): ParsedEdit {
  const out: ParsedEdit = {};
  const leftovers: string[] = [];
  for (const raw of instruction.split(/\s*(?:,|;|\band then\b|\balso\b|\band\b(?=\s+(?:move|make|add|mark|remove|delete|drop|rename|call|set|push|change|due|it'?s|write|clear)))\s*/i)) {
    const c = raw.trim();
    if (!c) continue;
    let m: RegExpMatchArray | null;
    if ((m = c.match(/^(?:rename(?: it)?(?: to)?|call it|change the title to|title:?)\s+(.+)$/i))) {
      out.title = m[1].replace(/^["“']|["”']$/g, "").trim();
    } else if (/\b(no|clear|remove) (the )?(due )?date\b|\bno deadline\b/i.test(c)) {
      out.due = null;
    } else if ((m = c.match(/\b(urgent|high|medium|low)\b(?:\s+priority)?/i)) && /\b(priority|urgent|make it|set)\b/i.test(c)) {
      out.priority = m[1].toLowerCase() as ParsedEdit["priority"];
    } else if ((m = c.match(/^(?:add|new|include)\s+(?:a\s+)?(?:step|item|task|checklist item)?\s*(?:to\s+)?:?\s*(.+)$/i))) {
      const when = findWhenInText(m[1], now);
      const title = (when?.text ? m[1].replace(when.text, "") : m[1]).replace(/\s+(on|by|at|for)\s*$/i, "").replace(/\s+/g, " ").trim();
      if (title) (out.add ??= []).push({ title: title.charAt(0).toUpperCase() + title.slice(1), when: when?.date ?? null });
    } else if ((m = c.match(/^(?:mark|tick|check)(?: off)?\s+(.+?)(?:\s+(?:as\s+)?(?:done|complete|finished))?$/i)) || (m = c.match(/^(.+?)\s+(?:is|are)\s+(?:done|finished|complete)$/i))) {
      (out.complete ??= []).push(m[1].replace(/^(the|my)\s+/i, "").trim());
    } else if ((m = c.match(/^(?:remove|delete|drop)\s+(?:the\s+)?(?:step\s+)?(.+)$/i))) {
      (out.remove ??= []).push(m[1].trim());
    } else if (/^(move|push|reschedule|change|set|make)\b.*\b(to|for|due|it)\b/i.test(c) || /^due\b/i.test(c) || (/^(move|push|reschedule)\b/i.test(c) && WHEN_WORDS.test(c))) {
      const when = findWhenInText(c, now);
      if (when) out.due = when.date;
      else leftovers.push(c);
    } else leftovers.push(c);
  }
  const rest = leftovers.join(", ").trim();
  // Only real writing requests go to the model ("hmm" isn't one).
  if (rest && /\b(write|make|create|give|draft|list|recipe|notes?|outline|ideas?|details?|describe|explain|summar\w*|packing|grocery|shopping|ingredients?|script|checklist of|questions?|tips?|workout|meal)\b/i.test(rest)) out.write = rest;
  return out;
}

// Byte-stable for the prompt cache.
const WRITE_SYSTEM = `You write content for one item in Abhay's task app: a recipe, notes, a list, an outline, details, whatever he asks.
Write only the content itself: no greeting, no preamble, no JSON. Plain text with short lines; use "-" for list items and "1." for steps. Be specific and practical. US units (oz, cups, lb, °F for ovens).`;

/** The model writes the requested content; returns null if it didn't produce usable text. */
async function writeContent(title: string, current: string | null, request: string): Promise<string | null> {
  const result = await chat({
    messages: [
      { role: "system", content: WRITE_SYSTEM },
      { role: "user", content: `Item: ${title}\n${current ? `Current notes:\n${current.slice(0, 1200)}\n` : ""}\nWrite: ${request}` },
    ],
    temperature: 0.5,
    maxTokens: 600,
    timeoutMs: 240_000,
  });
  const text = result.content
    .replace(/^```[a-z]*\n?|```$/g, "")
    .replace(/^(sure|here( is|'s)|okay|ok)[^\n]*:\s*\n/i, "")
    .trim();
  // A small model sometimes answers in JSON anyway: take the text out of it, or give up.
  if (/^[{[]/.test(text)) return null;
  return text.length >= 20 ? text.slice(0, 9000) : null;
}

const fmtWhen = (d: Date) => d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Anything he asks for on an item that isn't a plan. */
export async function editItem(userId: string, ref: ItemRef, instruction: string, now = new Date()): Promise<ItemAiResult> {
  const isProject = ref.type === "project";
  const todo = isProject ? null : await prisma.todo.findFirstOrThrow({ where: { id: ref.id, userId } });
  const project = isProject ? await prisma.project.findFirstOrThrow({ where: { id: ref.id, userId }, include: { tasks: { orderBy: { order: "asc" } } } }) : null;
  const snapshot = isProject ? await snapshotProject(ref.id) : snapshotTodo(todo!);
  const title = isProject ? project!.title : todo!.title;
  const description = isProject ? project!.description : todo!.notes;
  const e = parseEdit(instruction, now);
  const changes: string[] = [];
  const data: Record<string, unknown> = {};

  if (e.title && e.title !== title) {
    data.title = e.title.slice(0, 200);
    changes.push(`Title → ${e.title}`);
  }
  if (e.due !== undefined) {
    data[isProject ? "deadline" : "dueAt"] = e.due;
    changes.push(e.due ? `Due → ${fmtWhen(e.due)}` : "Cleared the due date");
  }
  if (e.priority && e.priority !== (isProject ? project!.priority : todo!.priority)) {
    data.priority = normalizePriority(e.priority);
    changes.push(`Priority → ${e.priority}`);
  }
  if (e.write) {
    const text = await writeContent(title, description, e.write);
    if (text) {
      data[isProject ? "description" : "notes"] = description ? `${description.trim()}\n\n${text}` : text;
      changes.push("Wrote it into the description");
    }
  }
  if (Object.keys(data).length) {
    if (isProject) await prisma.project.update({ where: { id: ref.id }, data });
    else await prisma.todo.update({ where: { id: ref.id }, data });
  }

  // Checklist edits. On a plain to-do, adding steps makes it a project.
  let projectId = isProject ? ref.id : null;
  let converted: Awaited<ReturnType<typeof convertToProject>> | null = null;
  if (e.add?.length && !projectId) {
    converted = await convertToProject(userId, ref.id);
    projectId = converted.project.id;
    changes.unshift("Made it a project");
  }
  if (projectId) {
    const tasks = await prisma.projectTask.findMany({ where: { projectId, parentTaskId: null }, orderBy: { order: "asc" } });
    let order = Math.max(-1, ...tasks.map((t) => t.order)) + 1;
    for (const a of e.add ?? []) {
      await prisma.projectTask.create({ data: { projectId, title: a.title.slice(0, 200), dueDate: a.when, order: order++ } });
      changes.push(`+ ${a.title}${a.when ? ` (${a.when.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })})` : ""}`);
    }
    const find = (name: string) => bestMatch(name, tasks, 0.5);
    for (const name of e.complete ?? []) {
      const t = find(name);
      if (t && t.status !== "completed") {
        await prisma.projectTask.update({ where: { id: t.id }, data: { status: "completed", completedAt: now } });
        changes.push(`✓ ${t.title}`);
      }
    }
    for (const name of e.remove ?? []) {
      const t = find(name);
      if (t) {
        await prisma.projectTask.delete({ where: { id: t.id } }).catch(() => undefined);
        changes.push(`− ${t.title}`);
      }
    }
  }

  if (!changes.length) {
    return {
      reply: e.write ? "The AI couldn't write that right now — try again in a minute, or phrase it like “write a recipe for this”." : "I couldn't tell what to change. Try “move to Friday 6pm”, “add buy eggs Saturday”, “make it urgent” or “write notes for this”.",
      changes,
      item: ref,
      snapshot: null,
    };
  }
  const item: ItemRef = projectId ? { type: "project", id: projectId } : ref;
  const snap: Snapshot = converted ? { ...converted.snapshot, todo: snapshot.todo } : snapshot;
  return { reply: "Done.", changes, item, snapshot: snap };
}

/** Route his request: plans go to the planner, everything else to the editor. */
export async function askItem(userId: string, ref: ItemRef, instruction: string, now = new Date()): Promise<ItemAiResult> {
  if (PLAN_ASK.test(instruction) && !/\b(recipe|description|notes?)\b/i.test(instruction)) return planItem(userId, ref, instruction, now);
  return editItem(userId, ref, instruction, now);
}

/** Put an item back the way it was before an AI change. */
export async function restoreSnapshot(userId: string, s: Snapshot) {
  if (s.kind === "converted" && s.todo && s.projectId) {
    await prisma.project.deleteMany({ where: { id: s.projectId, userId } });
    await prisma.todo.create({
      data: { id: s.todo.id, userId, title: s.todo.title, notes: s.todo.notes, dueAt: s.todo.dueAt ? new Date(s.todo.dueAt) : null, priority: s.todo.priority, area: s.todo.area, status: s.todo.status },
    });
    return { type: "todo" as const, id: s.todo.id };
  }
  if (s.kind === "todo" && s.todo) {
    await prisma.todo.updateMany({
      where: { id: s.todo.id, userId },
      data: { title: s.todo.title, notes: s.todo.notes, dueAt: s.todo.dueAt ? new Date(s.todo.dueAt) : null, priority: s.todo.priority },
    });
    return { type: "todo" as const, id: s.todo.id };
  }
  if (s.kind === "project" && s.project) {
    const p = s.project;
    const owned = await prisma.project.findFirst({ where: { id: p.id, userId } });
    if (!owned) return null;
    await prisma.project.update({ where: { id: p.id }, data: { title: p.title, description: p.description, deadline: p.deadline ? new Date(p.deadline) : null, priority: p.priority, status: p.status } });
    const keep = new Set((s.tasks ?? []).map((t) => t.id));
    await prisma.projectTask.deleteMany({ where: { projectId: p.id, id: { notIn: [...keep] } } });
    for (const t of s.tasks ?? []) {
      const data = { title: t.title, description: t.description, status: t.status, dueDate: t.dueDate ? new Date(t.dueDate) : null, order: t.order, priority: t.priority };
      await prisma.projectTask.upsert({ where: { id: t.id }, update: data, create: { id: t.id, projectId: p.id, ...data } });
    }
    return { type: "project" as const, id: p.id };
  }
  return null;
}
