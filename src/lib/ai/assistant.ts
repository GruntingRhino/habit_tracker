import prisma from "@/lib/prisma";
import { normalizePriority } from "@/lib/areas";
import { chat, parseJson } from "@/lib/ai/llm";
import { routeMessage } from "@/lib/ai/router";
import { applyCapture, applyComplete, type ItemAction } from "@/lib/ai/capture";
import { buildSnapshot, describeItem, getOpenItems } from "@/lib/ai/context";
import { planDay } from "@/lib/ai/planner";
import { parseWhen, parseWhenFrom } from "@/lib/ai/when";
import { reportError } from "@/lib/monitoring";

type Source = "web" | "telegram";

interface ItemRef {
  type: "todo" | "task" | "project" | "reminder";
  id: string;
  title: string;
}

interface Awaiting {
  kind: "triage" | "reminder_time" | "prioritize";
  refs: ItemRef[];
}

export interface AssistantReply {
  id: string;
  reply: string;
  actions: ItemAction[];
  awaiting: Awaiting | null;
}

const AREA_EMOJI: Record<string, string> = {
  physical: "💪",
  mental: "🧠",
  financial: "💰",
  spiritual: "🙏",
  work: "💼",
  general: "📌",
};

const TYPE_LABEL: Record<ItemAction["type"], string> = {
  todo: "To-do",
  project: "Project",
  task: "Task",
  routine: "Routine",
  reminder: "Reminder",
  meal: "Meal",
  workout: "Workout",
  journal: "Journal",
  note: "Note",
};

export function describeActions(actions: ItemAction[]) {
  return actions
    .filter((a) => !(a.type === "todo" && actions.some((b) => b.type === "reminder" && b.title === a.title)))
    .map((a) => {
      const verb = a.op === "complete" ? "✅ Done" : TYPE_LABEL[a.type];
      return `${AREA_EMOJI[a.area ?? "general"] ?? "📌"} ${verb}: ${a.title}${a.detail ? ` — ${a.detail}` : ""}`;
    })
    .join("\n");
}

async function save(
  userId: string,
  source: Source,
  reply: string,
  actions: ItemAction[] = [],
  awaiting: Awaiting | null = null
): Promise<AssistantReply> {
  const msg = await prisma.chatMessage.create({
    data: {
      userId,
      role: "assistant",
      content: reply,
      source,
      actions: actions.length ? (actions as object[]) : undefined,
      awaiting: awaiting ? (awaiting as object) : undefined,
    },
  });
  return { id: msg.id, reply, actions, awaiting };
}

export async function handleMessage(userId: string, text: string, source: Source): Promise<AssistantReply> {
  const trimmed = text.trim().slice(0, 2000);
  await prisma.chatMessage.create({ data: { userId, role: "user", content: trimmed, source } });

  try {
    // 1. Is this an answer to a clarifying question asked in the last 30 minutes?
    const last = await prisma.chatMessage.findFirst({
      where: { userId, role: "assistant" },
      orderBy: { createdAt: "desc" },
    });
    const awaiting = last?.awaiting as Awaiting | null | undefined;
    if (awaiting && last && Date.now() - last.createdAt.getTime() < 30 * 60_000 && looksLikeAnswer(trimmed)) {
      await prisma.chatMessage.update({ where: { id: last.id }, data: { awaiting: undefined } });
      const handled = await handleAnswer(userId, awaiting, trimmed, source);
      if (handled) return handled;
    }

    // 2. Route with the model.
    const routed = await routeMessage(trimmed);

    switch (routed.intent) {
      case "capture": {
        const actions = await applyCapture(userId, routed.items, trimmed, source);
        const ask = clarifyFor(actions);
        const reply = [describeActions(actions) || "Saved.", questionFor(ask)].filter(Boolean).join("\n\n");
        return save(userId, source, reply, actions, ask);
      }
      case "complete": {
        const { actions, missed } = await applyComplete(userId, routed.items);
        const lines = [describeActions(actions)];
        if (missed.length) lines.push(`Couldn't find: ${missed.join(", ")}`);
        return save(userId, source, lines.filter(Boolean).join("\n") || "Nothing matched.", actions);
      }
      case "question":
        return save(userId, source, await answerQuestion(userId, trimmed));
      case "prioritize":
        return startPrioritize(userId, source);
      case "replan": {
        const plan = await planDay(userId, { force: true, note: trimmed });
        return save(userId, source, `New plan for today:\n${plan.items.map((i, n) => `${n + 1}. ${i.title}${i.reason ? ` — ${i.reason}` : ""}`).join("\n")}`);
      }
      default:
        return save(userId, source, "👍 Tell me anything to track — tasks, projects, reminders, meals, workouts or how your day went.");
    }
  } catch (error) {
    reportError({ context: "assistant.handleMessage", error, userId });
    // Never lose the input.
    const todo = await prisma.todo.create({ data: { userId, title: trimmed.slice(0, 300), source } });
    const action: ItemAction = { op: "create", type: "todo", id: todo.id, title: todo.title, area: "general", href: "/todos", detail: "model unavailable, saved as-is" };
    return save(userId, source, describeActions([action]), [action]);
  }
}

function looksLikeAnswer(text: string) {
  // Short replies, numbered answers, or priority/date words are treated as answers.
  return text.length < 200 && !/^(remind me|add |i need to|i have to)/i.test(text);
}

/** Ask one short question when several new items have no priority or date. */
function clarifyFor(actions: ItemAction[]): Awaiting | null {
  const reminderNoTime = actions.find((a) => a.type === "todo" && a.detail === "no time given");
  if (reminderNoTime) {
    return { kind: "reminder_time", refs: [{ type: "todo", id: reminderNoTime.id, title: reminderNoTime.title }] };
  }
  const bare = actions.filter(
    (a) => a.op === "create" && (a.type === "project" || a.type === "todo") && !a.detail
  );
  if (bare.length >= 2) {
    return { kind: "triage", refs: bare.map((a) => ({ type: a.type as ItemRef["type"], id: a.id, title: a.title })) };
  }
  return null;
}

export function questionFor(awaiting: Awaiting | null): string | null {
  if (!awaiting) return null;
  if (awaiting.kind === "reminder_time") return `When should I remind you about "${awaiting.refs[0]?.title}"?`;
  const list = awaiting.refs.map((r, i) => `${i + 1}. ${r.title}`).join("\n");
  if (awaiting.kind === "triage") return `Which of these matters most, and any deadlines?\n${list}\n(e.g. "2 is urgent, 1 by Friday")`;
  return `${list}\nWhich of these have hard deadlines, and which would move your life forward the most?`;
}

const ANSWER_SCHEMA = {
  type: "object",
  properties: {
    updates: {
      type: "array",
      items: {
        type: "object",
        properties: {
          n: { type: "integer" },
          priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
          when: { type: "string" },
        },
        required: ["n"],
      },
    },
  },
  required: ["updates"],
};

const ANSWER_SYSTEM = `You apply Abhay's answer to a numbered list of his items. Reply with minified JSON only: {"updates":[{"n":1,"priority":"high","when":"friday"}]}.
- n is the item number from the list.
- priority: urgent (must happen now/very soon), high (most important), medium, low (can wait). If he orders items, the first is high, the last is low.
- when: copy any deadline phrase for that item exactly as he wrote it.
- Only include items he mentioned or ranked.
Example list: 1. Finish thesis 2. File taxes 3. Plan retreat
Example answer: taxes are due april 15 and most important, thesis next, retreat can wait
{"updates":[{"n":2,"priority":"high","when":"april 15"},{"n":1,"priority":"medium"},{"n":3,"priority":"low"}]}`;

async function handleAnswer(userId: string, awaiting: Awaiting, text: string, source: Source): Promise<AssistantReply | null> {
  if (awaiting.kind === "reminder_time") {
    const when = parseWhen(text);
    const ref = awaiting.refs[0];
    if (!when || !ref) return null;
    const todo = await prisma.todo.update({ where: { id: ref.id }, data: { dueAt: when.date } });
    const reminder = await prisma.reminder.create({ data: { userId, text: todo.title, fireAt: when.date, todoId: todo.id } });
    const action: ItemAction = { op: "create", type: "reminder", id: reminder.id, title: todo.title, area: todo.area, href: "/todos", detail: `Telegram · ${when.date.toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })}` };
    return save(userId, source, describeActions([action]), [action]);
  }

  const list = awaiting.refs.map((r, i) => `${i + 1}. ${r.title}`).join(" ");
  const result = await chat({
    messages: [
      { role: "system", content: ANSWER_SYSTEM },
      { role: "user", content: `List: ${list}\nAnswer: ${text}` },
    ],
    schema: ANSWER_SCHEMA,
    maxTokens: 200,
    timeoutMs: 90_000,
  });
  const parsed = parseJson<{ updates?: { n: number; priority?: string; when?: string }[] }>(result.content);
  const updates = (parsed?.updates ?? []).filter((u) => awaiting.refs[u.n - 1]);
  if (!updates.length) return null;

  const lines: string[] = [];
  for (const u of updates) {
    const ref = awaiting.refs[u.n - 1];
    const priority = u.priority ? normalizePriority(u.priority) : undefined;
    const due = parseWhenFrom(u.when, text)?.date;
    if (ref.type === "todo") await prisma.todo.update({ where: { id: ref.id }, data: { priority, dueAt: due } });
    if (ref.type === "task") await prisma.projectTask.update({ where: { id: ref.id }, data: { priority, dueDate: due } });
    if (ref.type === "project") await prisma.project.update({ where: { id: ref.id }, data: { priority, deadline: due } });
    lines.push(`• ${ref.title}: ${[priority, due ? `due ${due.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}` : null].filter(Boolean).join(", ")}`);
  }
  return save(userId, source, `Updated:\n${lines.join("\n")}`);
}

async function startPrioritize(userId: string, source: Source): Promise<AssistantReply> {
  const items = (await getOpenItems(userId, 30)).filter((i) => i.type !== "task").slice(0, 8);
  if (!items.length) return save(userId, source, "You have nothing open right now. 🎉");
  const awaiting: Awaiting = { kind: "prioritize", refs: items.map((i) => ({ type: i.type, id: i.id, title: i.title })) };
  return save(userId, source, `Let's sort these out.\n${questionFor(awaiting)}`, [], awaiting);
}

const QA_SYSTEM = `You are Abhay's personal assistant inside his life tracker. Answer his question using ONLY the data given. Be direct and brief: at most 4 short lines or bullets. If the data doesn't answer it, say so. Never invent tasks or numbers.`;

async function answerQuestion(userId: string, question: string) {
  const snapshot = await buildSnapshot(userId);
  const result = await chat({
    messages: [
      { role: "system", content: QA_SYSTEM },
      { role: "user", content: `${question}\n\n[data]\n${snapshot}` },
    ],
    temperature: 0.3,
    maxTokens: 220,
    timeoutMs: 120_000,
  });
  return result.content.trim() || "I couldn't work that out from your data.";
}

export { describeItem };
