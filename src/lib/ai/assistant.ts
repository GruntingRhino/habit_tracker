import prisma from "@/lib/prisma";
import { keywordArea } from "@/lib/ai/router";
import { parseMeasurements, recordMeasurements } from "@/lib/body";
import { buildSchedule, describeSchedule, fmt12, parseScheduleBlock, parseSleepTimes, readPrefs, writePrefs } from "@/lib/schedule";
import { readTraining, todaysTraining, writeTraining } from "@/lib/training";
import { parseBodyUpdate, recordBodyUpdate } from "@/lib/body";
import { Prisma } from "@/generated/prisma";
import { normalizePriority } from "@/lib/areas";
import { chat, parseJson } from "@/lib/ai/llm";
import { NEGATED_CAPTURE, routeMessage } from "@/lib/ai/router";
import { applyCapture, applyComplete, undoActions, type ItemAction } from "@/lib/ai/capture";
import { buildSnapshot, describeItem, getOpenItems } from "@/lib/ai/context";
import { planDay } from "@/lib/ai/planner";
import { parseWhen, parseWhenFrom } from "@/lib/ai/when";
import { reportError } from "@/lib/monitoring";
import { inBackground } from "@/lib/background";
import { parseFoods } from "@/lib/nutrition-parse";
import { questionsFor, type AmountQuestion } from "@/lib/nutrition-ask";
import { reestimateMeal } from "@/lib/ai/nutrition";
import { compactIfNeeded, noteInMemory, resolveConversation, titleFrom, type PlanDraft, type PlanState } from "@/lib/ai/conversation";
import { CAPTURE_SIGNAL, companionReply, hasChatPart, HELP_QUESTION, HELP_TEXT, isAssistantCommand, isChatQuestion, isDataQuestion, isSmallTalk, OUT_OF_BOUNDS, OUT_OF_BOUNDS_TEXT, tidy, WHO_ARE_YOU, WHO_TEXT } from "@/lib/ai/companion";
import {
  applyPlanToProject,
  buildPlan,
  CANCEL_PLAN,
  createPlanProject,
  goalTitle,
  looksLikeGoal,
  wantsPlan,
  NEW_PLAN,
  nextQuestion,
  PLAN_AGAIN,
  renderPlan,
  REVISE_PLAN,
  SKIP_QUESTIONS,
  topicLabel,
} from "@/lib/ai/goalplan";

type Source = "web" | "telegram";

interface ItemRef {
  type: "todo" | "task" | "project" | "reminder";
  id: string;
  title: string;
}

interface Awaiting {
  kind: "triage" | "reminder_time" | "prioritize" | "meal_amount";
  refs: ItemRef[];
  /** meal_amount: which meal, what he wrote, answers so far, questions left. */
  meal?: { id: string; text: string; answers: Record<number, string>; queue: AmountQuestion[] };
}

export interface ReplyMeta {
  options?: string[];
  plan?: PlanDraft;
  /** Set once he presses Undo: what was reversed, phrased for the model's context. */
  undone?: string[];
  undoneAt?: string;
}

const SWITCH_BLOCK = /\b(switch|move|start|go|change)\s+(?:to\s+)?upper\s+([abc])\b/i;
const WHAT_TO_LIFT = /\b(what|which)\b.*\b(lift|train|workout|work out|hit)\b.*\b(today|tonight|now)\b|\btoday'?s (workout|lifts?)\b|\bwhat do i (lift|do at the gym)\b/i;
const MY_SCHEDULE = /\b(my|today'?s|the) (schedule|timeline)\b|\bwhat'?s (my|the) (day|schedule)\b|\bplan (out )?my day\b|\btime ?block\b/i;

export interface AssistantReply {
  id: string;
  conversationId: string;
  reply: string;
  actions: ItemAction[];
  awaiting: Awaiting | null;
  meta: ReplyMeta | null;
}

export interface HandleOptions {
  conversationId?: string | null;
  /** Streamed reply text (free-form chat only; structured replies arrive whole). */
  onToken?: (text: string) => void;
  /** Progress note for slow steps ("Building your plan…"). */
  onStatus?: (text: string) => void;
  onConversation?: (id: string) => void;
}

/** Everything a turn needs to write its reply into the right conversation. */
interface Turn {
  userId: string;
  source: Source;
  conversationId: string;
  userMessageId: string;
  opts: HandleOptions;
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
  routine: "Habit",
  reminder: "Reminder",
  meal: "Meal",
  workout: "Workout",
  journal: "Journal",
  note: "Note",
  plan: "Plan",
  schedule: "Schedule",
  measurement: "Measurement",
};

export function describeActions(actions: ItemAction[]) {
  return actions
    .filter((a) => a.type !== "plan")
    .filter((a) => !(a.type === "todo" && actions.some((b) => b.type === "reminder" && b.title === a.title)))
    .map((a) => {
      const verb = a.op === "complete" ? "✅ Done" : TYPE_LABEL[a.type];
      return `${AREA_EMOJI[a.area ?? "general"] ?? "📌"} ${verb}: ${a.title}${a.detail ? ` — ${a.detail}` : ""}`;
    })
    .join("\n");
}

/** What an undo reversed, in words the chat model reads later. */
function undoneLabel(a: ItemAction) {
  if (a.type === "plan") return `The plan "${a.title}" was cancelled`;
  if (a.op === "update") return `The changes to the plan "${a.title}" were reverted`;
  if (a.op === "complete") return `"${a.title}" is marked not done again`;
  if (a.op === "append") return `The journal note was removed`;
  return `${TYPE_LABEL[a.type]} "${a.title}" was deleted`;
}

async function save(
  turn: Turn,
  reply: string,
  { actions = [], awaiting = null, meta = null }: { actions?: ItemAction[]; awaiting?: Awaiting | null; meta?: ReplyMeta | null } = {}
): Promise<AssistantReply> {
  const msg = await prisma.chatMessage.create({
    data: {
      userId: turn.userId,
      conversationId: turn.conversationId,
      role: "assistant",
      content: reply,
      source: turn.source,
      actions: actions.length ? (actions as object[]) : undefined,
      awaiting: awaiting ? (awaiting as object) : undefined,
      meta: meta ? (meta as object) : undefined,
    },
  });
  return { id: msg.id, conversationId: turn.conversationId, reply, actions, awaiting, meta };
}

const FILE_IT = /\bremind me\b|^\s*notes?\s*[:\-]/i;

export async function handleMessage(userId: string, text: string, source: Source, opts: HandleOptions = {}): Promise<AssistantReply> {
  const trimmed = text.trim().slice(0, 2000);
  const conv = await resolveConversation(userId, source, opts.conversationId);
  opts.onConversation?.(conv.id);
  const userMsg = await prisma.chatMessage.create({ data: { userId, conversationId: conv.id, role: "user", content: trimmed, source } });
  // Touches updatedAt so the conversation sorts to the top of history.
  await prisma.conversation.update({ where: { id: conv.id }, data: { title: conv.title === "New chat" ? titleFrom(trimmed) : undefined } });
  const turn: Turn = { userId, source, conversationId: conv.id, userMessageId: userMsg.id, opts };

  // Chat and planning failures get an apology; filing failures fall back to saving the input.
  const flags = { conversational: false };
  try {
    const last = await prisma.chatMessage.findFirst({
      where: { conversationId: conv.id, role: "assistant" },
      orderBy: { createdAt: "desc" },
    });
    const lastActions = (last?.actions as ItemAction[] | null) ?? [];
    const recent = Boolean(last && Date.now() - last.createdAt.getTime() < 30 * 60_000);
    const undoneSince = await undosSinceLastTurn(conv.id, userMsg.id);
    const awaiting = recent ? (last?.awaiting as Awaiting | null) : null;
    const wantsFiling = CAPTURE_SIGNAL.test(trimmed) && !NEGATED_CAPTURE.test(trimmed) && !NOTE_QUESTION.test(trimmed);

    // 1. An answer to the clarifying question just asked ("2 is urgent", "at 6pm").
    if (awaiting && last && looksLikeAnswer(trimmed)) {
      await prisma.chatMessage.update({ where: { id: last.id }, data: { awaiting: Prisma.DbNull } });
      const handled = await handleAnswer(turn, awaiting, trimmed);
      if (handled) return handled;
    }

    // 2. Things only the app knows for sure: answered from state, never by the model.
    const plan = conv.plan as PlanState | null;
    if (NEGATED_CAPTURE.test(trimmed)) return await cancelLast(turn, trimmed, undoneSince);
    if (PLAN_STATUS.test(trimmed) || (STOPPED_ASKING.test(trimmed) && plan && plan.stage !== "asking")) return save(turn, planStatus(plan));
    if (!awaiting && LIST_REFERENCE.test(trimmed)) {
      if (undoneSince.length) return save(turn, `Nothing to update: those were undone (${undoneSince.map(lowerFirst).join("; ")}).`);
      return save(turn, `Which item do you mean? I don't have a numbered list open right now, so tell me its name (e.g. "the essay is due friday").`);
    }
    if (undoneSince.length && ABOUT_UNDO.test(trimmed)) return save(turn, undoAnswer(undoneSince));
    // Tape measurements ("waist 29, chest 36"): before weight/height so "shoulders 48 in" isn't a height.
    const measures = !awaiting ? parseMeasurements(trimmed) : null;
    if (measures) return save(turn, await recordMeasurements(userId, measures));
    // His week: "school 7:40 to 2:20 on weekdays", "practice tuesdays and thursdays 5-7pm".
    const block = !awaiting ? parseScheduleBlock(trimmed) : null;
    if (block) {
      const row = await prisma.scheduleBlock.create({ data: { userId, title: block.title, days: block.days, start: block.start, end: block.end, source: turn.source } });
      const days = block.days.length === 7 ? "every day" : block.days.join(" ").replace("mon tue wed thu fri", "weekdays").replace("sat sun", "weekends");
      return save(turn, `Added to your week: ${block.title}, ${days} ${fmt12(block.start)}–${fmt12(block.end)}. Your daily schedule plans around it.`, {
        actions: [{ op: "create", type: "schedule", id: row.id, title: block.title, area: "general", href: "/todos?tab=today", detail: `${days} ${fmt12(block.start)}–${fmt12(block.end)}` }],
      });
    }
    const sleepTimes = !awaiting && /\b(wake|get up|alarm|bed|asleep|sleep at)\b/i.test(trimmed) ? parseSleepTimes(trimmed) : null;
    if (sleepTimes && !CAPTURE_SIGNAL.test(trimmed)) {
      await writePrefs({ ...(await readPrefs()), ...sleepTimes });
      const p = await readPrefs();
      return save(turn, `Got it: ${p.wake ? `up at ${fmt12(p.wake)}, ` : ""}bed at ${fmt12(p.bedtime)}${p.weekendBedtime ? ` (${fmt12(p.weekendBedtime)} on weekends)` : ""}. Your schedule uses it.`);
    }
    if (SWITCH_BLOCK.test(trimmed)) {
      const letter = trimmed.match(SWITCH_BLOCK)![2].toUpperCase() as "A" | "B" | "C";
      await writeTraining({ ...(await readTraining()), upperBlock: letter, blockStartedAt: new Date().toISOString().slice(0, 10) });
      return save(turn, `Switched to Upper ${letter}, starting today. Upper days use it from now on.`);
    }
    if (WHAT_TO_LIFT.test(trimmed)) {
      const t = await todaysTraining(userId);
      if (!t.plans.length) return save(turn, "Rest or recovery today by your split. Easy walk and posture work if you want.");
      return save(turn, ["Today's lifts (last time → today):", ...t.plans.flatMap((p) => [`${p.name}${p.deload ? " — deload suggested: ~half the sets, same weights" : ""}`, ...p.exercises.map((e) => `- ${e.name}: ${e.suggestion.last ? `${e.suggestion.last} → ` : ""}${e.suggestion.next}`)])].join("\n"));
    }
    if (MY_SCHEDULE.test(trimmed)) {
      const s = await buildSchedule(userId);
      const lines = describeSchedule(s, new Date());
      return save(turn, lines.length ? ["Rest of today:", ...lines].join("\n") : "Nothing left on today's schedule.");
    }
    // Weight / height / age ("134 lb", "i'm 6'1 now"): logged and targets recomputed, no model.
    const bodyUpdate = !awaiting ? parseBodyUpdate(trimmed) : null;
    if (bodyUpdate && !/\b(ate|had|eat|lift|bench|squat|deadlift|press|curl|row|x\d|sets?|reps?)\b/i.test(trimmed)) return save(turn, await recordBodyUpdate(userId, bodyUpdate));
    const lastSentence = trimmed.split(/(?<=[.!])\s+/).pop() ?? trimmed;
    if (DID_YOU.test(lastSentence)) return save(turn, await didYouAnswer(turn, lastSentence));
    if (REDO.test(trimmed) && !(plan && PLAN_AGAIN.test(trimmed) && plan.stage !== "done" && plan.stage !== "asking")) {
      const redone = await redoLast(turn, flags);
      if (redone) return redone;
    }

    // 3. Goal planning state.
    if (plan?.stage === "asking" && !FILE_IT.test(trimmed)) {
      flags.conversational = true;
      if (NEW_PLAN.test(trimmed) && looksLikeGoal(trimmed)) return await startPlan(turn, trimmed);
      return await continuePlan(turn, plan, trimmed);
    }
    if ((plan?.stage === "cancelled" || plan?.stage === "undone") && PLAN_AGAIN.test(trimmed)) {
      flags.conversational = true;
      return await resumePlan(turn, plan);
    }
    if (plan?.stage === "done" && REVISE_PLAN.test(trimmed)) {
      flags.conversational = true;
      return await finishPlan(turn, plan, trimmed);
    }

    // 4. Cheap paths that skip the router.
    if (OUT_OF_BOUNDS.test(trimmed)) return save(turn, OUT_OF_BOUNDS_TEXT);
    if (HELP_QUESTION.test(trimmed)) return save(turn, HELP_TEXT);
    if (WHO_ARE_YOU.test(trimmed)) return save(turn, WHO_TEXT);
    const due = DUE_QUESTION.exec(trimmed);
    if (due) return save(turn, await dueAnswer(userId, due[1].toLowerCase()));
    if (!wantsFiling && NOTE_QUESTION.test(trimmed) && !isDataQuestion(trimmed)) {
      const found = await noteAnswer(userId, trimmed);
      if (found) return save(turn, found);
      flags.conversational = true;
      return await chatReply(turn, trimmed, `He's asking about something personal. No saved note matches, so tell him you don't have that saved and he can save it with "note: …". Don't guess.`);
    }
    if (!wantsFiling && isDataQuestion(trimmed)) {
      flags.conversational = true; // a question is never filed as a to-do, even if the model fails
      return save(turn, await answerQuestion(userId, trimmed));
    }
    if (!wantsFiling && (isSmallTalk(trimmed) || isChatQuestion(trimmed) || isAssistantCommand(trimmed))) {
      flags.conversational = true;
      return await chatReply(turn, trimmed);
    }
    if (looksLikeGoal(trimmed)) {
      flags.conversational = true;
      // Only an explicit "make me a plan" runs the planner. A how-to question gets an answer; a
      // stated goal is saved as a goal to keep him accountable, with no steps made up for him.
      if (wantsPlan(trimmed)) return await startPlan(turn, trimmed);
      if (/^\s*(how|what|which|should|can|could)\b|\?\s*$/i.test(trimmed)) return await chatReply(turn, trimmed);
      const actions = await applyCapture(userId, [{ kind: "project", title: goalTitle(trimmed), area: keywordArea(trimmed) ?? "general", priority: "medium" }], trimmed, source);
      return save(turn, describeActions(actions), { actions });
    }
    // "He's a golden retriever": a statement continuing the conversation, not something to file.
    if (!wantsFiling && FACT_STATEMENT.test(trimmed) && trimmed.length < 160) {
      flags.conversational = true;
      return await chatReply(turn, trimmed);
    }
    // "Finished the literature review": tick off the matching open item before asking the model anything.
    if (COMPLETION_START.test(trimmed) && !/\?\s*$/.test(trimmed)) {
      const object = trimmed.replace(COMPLETION_START, "").replace(/^\s*(the|my|a|an)\s+/i, "").replace(/[.!]+$/, "").trim();
      if (object) {
        const done = await applyComplete(userId, [{ kind: "todo", title: object, area: "general" }]);
        if (done.actions.length) return save(turn, describeActions(done.actions), { actions: done.actions });
      }
    }
    // A long reflection (like a reply to the evening check-in) is a journal entry, not a pile of to-dos.
    if (!wantsFiling && trimmed.length > 220 && !/\?\s*$/.test(trimmed)) {
      const actions = await applyCapture(userId, [{ kind: "journal", title: "Reflection", area: "mental" }], trimmed, source);
      const talk = await sideReply(turn, trimmed, actions);
      return save(turn, [describeActions(actions), talk].filter(Boolean).join("\n\n"), { actions });
    }
    // Right after an undo he's reacting to it, not asking to file something new.
    if (undoneSince.length && !wantsFiling) {
      flags.conversational = true;
      const note = `Since his last message he pressed Undo: ${undoneSince.join("; ")}. If his message is about that, say in one short sentence that it was undone and he can ask for it again. Don't act as if you changed, set or scheduled anything.`;
      return await chatReply(turn, trimmed, note);
    }

    // 5. Route with the model. Mid-conversation (last reply was plain chat, recently), lean toward chat.
    const midChat = recent && !awaiting && lastActions.length === 0 && !wantsFiling;
    return await routeAndReply(turn, trimmed, midChat, flags);
  } catch (error) {
    reportError({ context: "assistant.handleMessage", error, userId });
    if (flags.conversational) return save(turn, "Sorry, I lost my train of thought there. Mind sending that again?");
    // Never lose the input.
    const todo = await prisma.todo.create({ data: { userId, title: trimmed.slice(0, 300), source } });
    const action: ItemAction = { op: "create", type: "todo", id: todo.id, title: todo.title, area: "general", href: "/todos", detail: "model unavailable, saved as-is" };
    return save(turn, describeActions([action]), { actions: [action] });
  } finally {
    // Runs after the reply is written; the next turn finds a compacted context.
    inBackground(() => compactIfNeeded(conv.id));
  }
}

/** The router picks the tool; its result is applied and replied to. */
async function routeAndReply(turn: Turn, trimmed: string, midChat: boolean, flags: { conversational: boolean }) {
  const { userId, source } = turn;
  {
    const routed = await routeMessage(trimmed, { midChat });

    switch (routed.intent) {
      case "capture": {
        // "Finished the literature review" is a completion even when the model hears a new task.
        if (COMPLETION_START.test(trimmed) && routed.items.every((i) => i.kind === "todo" || i.kind === "task" || i.kind === "project")) {
          const done = await applyComplete(userId, routed.items.map((i) => ({ ...i, title: i.title.replace(/^(finish|complete|do)\s+/i, "") })));
          if (done.actions.length && !done.missed.length) return save(turn, describeActions(done.actions), { actions: done.actions });
        }
        const actions = await applyCapture(userId, routed.items, trimmed, source);
        // A meal missing an amount that matters: ask instead of guessing (it's saved with typical portions meanwhile).
        const mealAsk = await mealQuestion(actions);
        const ask = mealAsk ?? clarifyFor(actions);
        const talk = actions.some((a) => a.type === "journal") || hasChatPart(trimmed) ? await sideReply(turn, trimmed, actions) : "";
        const reply = [describeActions(actions) || "Saved.", talk, questionFor(ask)].filter(Boolean).join("\n\n");
        return save(turn, reply, { actions, awaiting: ask, meta: mealAsk?.meal ? { options: mealAsk.meal.queue[0].options.map((o) => o.label) } : null });
      }
      case "complete": {
        const { actions, missed } = await applyComplete(userId, routed.items);
        if (!actions.length) {
          // Nothing tracked matched ("I finished everything on my list!"): celebrate, don't just say "couldn't find".
          flags.conversational = true;
          return await chatReply(turn, trimmed, `He says he finished "${missed.join(", ")}", which doesn't match anything he's tracking, so nothing was marked done. Congratulate him briefly; if it sounds like a specific item, mention you couldn't find it on his lists.`);
        }
        const lines = [describeActions(actions)];
        if (missed.length) lines.push(`Couldn't find: ${missed.join(", ")}`);
        if (hasChatPart(trimmed)) lines.push(await sideReply(turn, trimmed, actions));
        return save(turn, lines.filter(Boolean).join("\n\n") || "Nothing matched.", { actions });
      }
      case "question":
        flags.conversational = true;
        return save(turn, await answerQuestion(userId, trimmed));
      case "prioritize":
        return startPrioritize(turn);
      case "replan": {
        const plan = await planDay(userId, { force: true, note: trimmed });
        return save(turn, `New plan for today:\n${plan.items.map((i, n) => `${n + 1}. ${i.title}${i.reason ? ` — ${i.reason}` : ""}`).join("\n")}`);
      }
      default:
        flags.conversational = true;
        return await chatReply(turn, trimmed);
    }
  }
}

async function chatReply(turn: Turn, text: string, note?: string) {
  const reply = await companionReply(turn.conversationId, turn.userMessageId, text, turn.opts.onToken, note);
  return save(turn, reply || "🙂");
}

/** The conversational half of a message that also filed something. Never fails the turn: the items are already saved. */
async function sideReply(turn: Turn, text: string, actions: ItemAction[]) {
  try {
    const done = describeActions(actions).replace(/^\S+ /gm, "").replace(/\n/g, "; ");
    const note = `The app just saved: ${done || "nothing"}. It's shown above your reply, so don't list it again; just answer the rest of his message.`;
    const reply = await companionReply(turn.conversationId, turn.userMessageId, text, turn.opts.onToken, note);
    return dropEchoes(reply, actions.map((a) => a.title), text);
  } catch (error) {
    reportError({ context: "assistant.sideReply", error, userId: turn.userId });
    return "";
  }
}

const words = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9']+/g)?.filter((w) => w.length > 2 && !STOP.has(w)) ?? []);
const STOP = new Set(["the", "and", "for", "you", "your", "are", "all", "set", "got", "its", "it's", "what", "should", "with", "this", "that"]);

/** Drop sentences that restate the saved items or repeat his question back. */
export function dropEchoes(reply: string, titles: string[], userText: string) {
  const asked = [...(userText.match(/[^.?!,]*\?/g) ?? [])].map(words);
  const kept = reply
    .split(/(?<=[.!?])\s+|\n+/)
    .filter((sentence) => {
      const w = words(sentence);
      if (!w.size) return true;
      const overlap = (t: Set<string>) => (t.size ? [...t].filter((x) => w.has(x)).length / t.size : 0);
      // Only short sentences that are mostly the item restated; real advice that mentions it stays.
      if (titles.some((t) => words(t).size >= 2 && overlap(words(t)) >= 0.66 && w.size <= words(t).size + 5)) return false;
      if (/\?\s*$/.test(sentence) && asked.some((q) => q.size >= 2 && overlap(q) >= 0.75)) return false;
      return true;
    });
  return kept.join(" ").replace(/\s+-\s/g, "\n- ").trim();
}

const DUE_QUESTION = /^\s*(?:so |ok |and |hey )?(?:what'?s|what is|whats|anything|is anything|what do i have|what have i got)\s+(?:due\s+)?(today|tomorrow|this week|overdue)\??\s*$|^\s*(?:what'?s|what is|anything)\s+(overdue)\??\s*$/i;

/** "What's due tomorrow?": straight from the database; small models can't filter dates reliably. */
async function dueAnswer(userId: string, when: string) {
  const items = await getOpenItems(userId, 100);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = 86_400_000;
  const [from, to, label] =
    when === "overdue" ? [0, today.getTime(), "overdue"]
    : when === "today" ? [today.getTime(), today.getTime() + day, "due today"]
    : when === "tomorrow" ? [today.getTime() + day, today.getTime() + 2 * day, "due tomorrow"]
    : [today.getTime(), today.getTime() + 7 * day, "due this week"];
  const hits = items.filter((i) => i.due && i.due.getTime() >= from && i.due.getTime() < to);
  if (!hits.length) return `Nothing ${label}.`;
  return `${label.charAt(0).toUpperCase() + label.slice(1)}:\n${hits.map((i) => `- ${i.title}${i.projectTitle ? ` (${i.projectTitle})` : ""}${when === "this week" || when === "overdue" ? ` · ${i.due!.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}` : ""}`).join("\n")}`;
}

const FACT_STATEMENT = /^\s*(he|she|it|they|that|this|there|we)('s| is| was|'re| are| were| has| had| looks| seems)\b/i;
const COMPLETION_START = /^\s*(i |i've |ive )?(just |already |finally )?(finished|completed|done with|paid|submitted|turned in|wrapped up|knocked out|took care of|crossed off)\b/i;
const NOTE_QUESTION = /^\s*((anyway|so|ok|okay|wait|hey|um|and|btw|also|oh|quick question)[,\s]+)*(what'?s|what is|whats|where'?s|where is|do you (know|remember)|remind me what|what was) (my|the|our) [\w\s'-]{2,40}\??\s*$/i;
const NOTE_STOP = new Set(["what", "whats", "what's", "where", "wheres", "is", "my", "the", "our", "was", "do", "you", "know", "remember", "remind", "me"]);

/** "What's my garage code?" → looked up in his notes. */
async function noteAnswer(userId: string, text: string) {
  const terms = (text.toLowerCase().match(/[a-z0-9']+/g) ?? []).map((w) => w.replace(/'s$|s'$/, "")).filter((w) => w.length > 2 && !NOTE_STOP.has(w));
  if (!terms.length) return null;
  const notes = await prisma.note.findMany({
    where: { userId, OR: terms.flatMap((t) => [{ title: { contains: t, mode: "insensitive" as const } }, { content: { contains: t, mode: "insensitive" as const } }]) },
    take: 20,
  });
  const scored = notes
    .map((n) => ({ n, score: terms.filter((t) => `${n.title} ${n.content ?? ""}`.toLowerCase().includes(t)).length }))
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best || best.score < Math.min(2, terms.length)) return null;
  return `From your notes: ${best.n.title}${best.n.content ? `: ${best.n.content}` : ""}`;
}

// ── State answers ────────────────────────────────────────────────────────────

const PLAN_STATUS =
  /\b(is|are|where'?s|where is|do i (still )?have|what happened to|did you (delete|remove|keep|save|make|cancel)|is there)\b.{0,30}\bplan\b[^.!]{0,25}(\?|$)/i;
const STOPPED_ASKING = /\bwhy did you stop( asking)?\b|\bwhat happened to (the|my|your) questions\b/i;
/** "1 is due friday", "#2 is urgent": only meaningful as an answer to a numbered question. */
const LIST_REFERENCE = /^\s*#?\d{1,2}\s*(is|are|should|can|by|due|first|last|then|,)\b/i;
const ABOUT_UNDO =
  /\bwhy'?d you undo\b|\bwhy did you undo\b|^(ok |so |wait |but |and )*(did|is|was|are|were|has|have|where)\b.*\b(it|that|this|them|they|set|saved|there|still|deleted|gone|removed|scheduled)\b|\bwhat (changed|happened)\b|\bwhy did you (stop|delete|remove|cancel)\b|\bwhere did (it|that|the \w+) go\b/i;

/** Undo labels recorded since his previous message (the one before this turn). */
async function undosSinceLastTurn(conversationId: string, currentUserMessageId: string) {
  const previous = await prisma.chatMessage.findFirst({
    where: { conversationId, role: "user", id: { not: currentUserMessageId } },
    orderBy: { createdAt: "desc" },
  });
  if (!previous) return [];
  const recent = await prisma.chatMessage.findMany({ where: { conversationId, role: "assistant" }, orderBy: { createdAt: "desc" }, take: 30, select: { meta: true } });
  return recent.flatMap((m) => {
    const meta = (m.meta ?? {}) as ReplyMeta;
    return meta.undoneAt && new Date(meta.undoneAt) > previous.createdAt ? meta.undone ?? [] : [];
  });
}

function lowerFirst(s: string) {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function undoAnswer(labels: string[]) {
  const back = labels.every((l) => /were reverted/.test(l))
    ? "The plan is back to how it was before."
    : labels.some((l) => /plan/i.test(l))
      ? `Say "make the plan again" if you want it back.`
      : "Just ask again if you want it back.";
  return `That was undone: ${labels.map(lowerFirst).join("; ")}. ${back}`;
}

const DID_YOU = /^(ok |so |wait |but |and |hey )*(did|have) you (save|saved|log|logged|add|added|set|track|tracked|create|created|make|made|record|recorded|remind|schedule|scheduled|put)\b[^?]*\??\s*$/i;
const REDO =
  /\b(log|add|save|set|put|do|make|create|track|record)\b.{0,15}\b(it|that|them|this)\b.{0,10}\b(again|back)\b|\b(redo|undo the undo|bring (it|that|them) back|put (it|that|them) back)\b/i;

/** "Did you save my breakfast?": looked up in what this chat actually did. */
async function didYouAnswer(turn: Turn, text: string) {
  const recent = await prisma.chatMessage.findMany({
    where: { conversationId: turn.conversationId, role: "assistant", createdAt: { gte: new Date(Date.now() - 24 * 60 * 60_000) } },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { actions: true, meta: true },
  });
  const subject = words(text.replace(DID_YOU_LEAD, ""));
  const generic = !subject.size || [...subject].every((w) => ["it", "that", "this", "them", "my"].includes(w));
  const matches = (title: string) => generic || [...words(title)].some((w) => subject.has(w)) || [...subject].some((w) => title.toLowerCase().includes(w));
  for (const m of recent) {
    const meta = (m.meta ?? {}) as ReplyMeta;
    const acts = ((m.actions as ItemAction[] | null) ?? []).filter((a) => a.type !== "plan");
    const hit = acts.find((a) => matches(a.title));
    if (hit) return `Yes: ${describeActions([hit]).replace(/^\S+ /, "")}.`;
    const undone = meta.undone?.find((l) => matches(l));
    if (undone) return `No, that was undone: ${lowerFirst(undone)}. Just ask again if you want it back.`;
  }
  return "I don't see that in this chat. Tell me what to add and I'll do it.";
}
const DID_YOU_LEAD = /^.*?\b(did|have) you \w+\b/i;

/** "Log it again": re-run the message behind the most recently undone reply. */
async function redoLast(turn: Turn, flags: { conversational: boolean }) {
  const undone = await prisma.chatMessage.findMany({
    where: { conversationId: turn.conversationId, role: "assistant", createdAt: { gte: new Date(Date.now() - 2 * 60 * 60_000) } },
    orderBy: { createdAt: "desc" },
    take: 15,
  });
  const target = undone.find((m) => ((m.meta ?? {}) as ReplyMeta).undone?.length);
  if (!target) return null;
  if (((target.meta ?? {}) as ReplyMeta).undone?.some((l) => /plan/i.test(l))) {
    const conv = await prisma.conversation.findUnique({ where: { id: turn.conversationId } });
    const plan = conv?.plan as PlanState | null;
    if (plan && (plan.stage === "undone" || plan.stage === "cancelled")) {
      flags.conversational = true;
      return resumePlan(turn, plan);
    }
  }
  const source = await prisma.chatMessage.findFirst({
    where: { conversationId: turn.conversationId, role: "user", createdAt: { lt: target.createdAt } },
    orderBy: { createdAt: "desc" },
  });
  if (!source) return null;
  flags.conversational = true; // never file "log it again" itself as a to-do
  return routeAndReply(turn, source.content, false, flags);
}

function planStatus(plan: PlanState | null) {
  if (!plan) return `There's no plan in this chat yet. Tell me a goal ("I want to get good at…") and I'll build one with you.`;
  const title = plan.plan?.title ?? goalTitle(plan.goal);
  if (plan.stage === "done") return `Yes, "${title}" is saved as a project.`;
  if (plan.stage === "undone") return `You undid "${title}", so it's gone. Say "make the plan again" if you want it back.`;
  if (plan.stage === "cancelled") return `You cancelled the plan for "${title}" before it was finished. Say "make the plan again" to pick up where we left off.`;
  return `It's still in progress: ${plan.pending ?? "a couple more questions and I'll build it."}`;
}

/** "Don't remind me", "cancel that": undo his most recent matching action instead of filing anything. */
async function cancelLast(turn: Turn, text: string, undoneSince: string[]) {
  const wanted = /remind/i.test(text) ? ["reminder"] : /to-?do|task/i.test(text) ? ["todo", "task"] : /note/i.test(text) ? ["note"] : null;
  const candidates = await prisma.chatMessage.findMany({
    where: { conversationId: turn.conversationId, role: "assistant", createdAt: { gte: new Date(Date.now() - 2 * 60 * 60_000) } },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  const target = candidates.find((m) => {
    const acts = (m.actions as ItemAction[] | null) ?? [];
    return acts.length > 0 && (!wanted || acts.some((a) => wanted.includes(a.type) || (a.type === "todo" && wanted.includes("reminder") && a.detail === "no time given")));
  });
  if (!target) {
    return save(turn, undoneSince.length ? "That's already removed." : "There's nothing recent for me to cancel.");
  }
  const result = await undoMessage(turn.userId, target.id);
  return save(turn, `Okay, done: ${(result?.labels ?? []).map(lowerFirst).join("; ")}.`);
}

// ── Goal planning ────────────────────────────────────────────────────────────

async function setPlan(turn: Turn, state: PlanState, title?: string) {
  await prisma.conversation.update({ where: { id: turn.conversationId }, data: { plan: state as object, title } });
}

function planStarted(turn: Turn, state: PlanState): ItemAction {
  return { op: "create", type: "plan", id: turn.conversationId, title: goalTitle(state.goal), href: "/chat", detail: "planning" };
}

/** Saying a goal starts a plan (an undoable action) and asks the first question. */
async function startPlan(turn: Turn, goal: string) {
  turn.opts.onStatus?.("Thinking about your goal…");
  const state: PlanState = { goal: goal.slice(0, 300), qa: [], stage: "asking" };
  const q = await nextQuestion(state);
  if (!q) return finishPlan(turn, state);
  Object.assign(state, { pending: q.question, options: q.options, topic: q.topic + 1 });
  await setPlan(turn, state, titleFrom(goalTitle(goal)));
  return save(turn, q.question, { actions: [planStarted(turn, state)], meta: { options: q.options } });
}

async function continuePlan(turn: Turn, state: PlanState, text: string) {
  if (CANCEL_PLAN.test(text)) {
    await setPlan(turn, { ...state, stage: "cancelled" });
    return save(turn, `No problem, I dropped the plan. Say "make the plan again" if you change your mind.`);
  }
  // A real question mid-interview gets answered, then the pending question is asked again.
  if (/\?\s*$/.test(text) && text.length > 12 && !SKIP_QUESTIONS.test(text) && state.pending) {
    const reply = await companionReply(turn.conversationId, turn.userMessageId, text, turn.opts.onToken, `You're in the middle of asking him: "${state.pending}". Answer his question only; the app re-asks yours after.`);
    turn.opts.onToken?.(`\n\n${state.pending}`);
    return save(turn, `${reply}\n\n${state.pending}`, { meta: { options: state.options ?? [] } });
  }
  const skip = SKIP_QUESTIONS.test(text);
  if (!skip) state.qa.push({ q: state.pending ?? "", a: text.slice(0, 300), label: topicLabel((state.topic ?? 1) - 1) });
  const q = skip ? null : await nextQuestion(state);
  if (!q) return finishPlan(turn, state);
  Object.assign(state, { pending: q.question, options: q.options, topic: q.topic + 1 });
  await setPlan(turn, state);
  return save(turn, q.question, { meta: { options: q.options } });
}

/** Build the plan and save it as a project (or rework the existing one). Both are undoable. */
async function finishPlan(turn: Turn, state: PlanState, revision?: string) {
  turn.opts.onStatus?.(revision ? "Reworking your plan…" : "Building your plan… (this can take 1–2 minutes)");
  const plan = await buildPlan(state, revision);
  if (!plan) {
    if (!revision) await setPlan(turn, { ...state, stage: "asking" });
    return save(turn, revision ? "I couldn't rework the plan just now. Try asking again in a sec." : `I couldn't put the plan together just now. Say "make the plan" to try again.`);
  }

  let action: ItemAction;
  let projectId = revision ? state.projectId : undefined;
  if (projectId && state.plan && (await applyPlanToProject(turn.userId, projectId, plan))) {
    action = { op: "update", type: "project", id: projectId, title: plan.title, area: plan.area, href: `/todos?project=${projectId}`, detail: "plan updated", prev: JSON.stringify(state.plan) };
  } else {
    projectId = await createPlanProject(turn.userId, plan);
    action = { op: "create", type: "project", id: projectId, title: plan.title, area: plan.area, href: `/todos?project=${projectId}`, detail: `plan · ${plan.steps.length} steps` };
  }
  await setPlan(turn, { ...state, stage: "done", pending: undefined, options: undefined, plan, projectId }, `Plan: ${plan.title}`);
  return save(turn, renderPlan(plan), { actions: [action], meta: { plan } });
}

/** "Make the plan again" after a cancel or undo. */
async function resumePlan(turn: Turn, state: PlanState) {
  if (state.stage === "undone" && state.plan) {
    const projectId = await createPlanProject(turn.userId, state.plan);
    const action: ItemAction = { op: "create", type: "project", id: projectId, title: state.plan.title, area: state.plan.area, href: `/todos?project=${projectId}`, detail: `plan · ${state.plan.steps.length} steps` };
    await setPlan(turn, { ...state, stage: "done", projectId });
    return save(turn, renderPlan(state.plan), { actions: [action], meta: { plan: state.plan } });
  }
  if (state.pending) {
    const resumed: PlanState = { ...state, stage: "asking" };
    await setPlan(turn, resumed);
    return save(turn, state.pending, { actions: [planStarted(turn, resumed)], meta: { options: state.options ?? [] } });
  }
  return finishPlan(turn, { ...state, stage: "asking" });
}

// ── Undo ─────────────────────────────────────────────────────────────────────

/**
 * Reverse everything a reply did, and make the conversation know it: the plan state, any
 * pending clarifying question, the message itself (read by the chat model as a note), and the
 * compacted memory if the message was already summarized. Returns null if there's nothing to undo.
 */
export async function undoMessage(userId: string, messageId: string) {
  const msg = await prisma.chatMessage.findFirst({ where: { id: messageId, userId } });
  const actions = (msg?.actions as ItemAction[] | null) ?? [];
  if (!msg || !actions.length) return null;

  const undone = await undoActions(userId, actions);
  const labels = actions.filter((a) => a.detail !== "already tracked").map(undoneLabel);
  const meta = (msg.meta ?? {}) as ReplyMeta;

  if (msg.conversationId) {
    const conv = await prisma.conversation.findUnique({ where: { id: msg.conversationId } });
    const plan = conv?.plan as PlanState | null;
    let next: PlanState | null = null;
    if (plan) {
      const createdHere = actions.find((a) => a.type === "project" && a.op === "create" && a.id === plan.projectId);
      const updatedHere = actions.find((a) => a.type === "project" && a.op === "update" && a.id === plan.projectId);
      if (actions.some((a) => a.type === "plan")) {
        // Undoing the start undoes the whole plan, including a project it already produced.
        if (plan.projectId) await prisma.project.deleteMany({ where: { id: plan.projectId, userId } });
        if (plan.stage === "asking") next = { ...plan, stage: "cancelled" };
        else if (plan.stage === "done") next = { ...plan, stage: "undone", projectId: undefined };
      } else if (createdHere) {
        next = { ...plan, stage: "undone", projectId: undefined };
      } else if (updatedHere?.prev) {
        next = { ...plan, plan: JSON.parse(updatedHere.prev) as PlanDraft };
      }
    }
    // Later revisions of a plan project that's now gone are moot: mark them undone too.
    const removedProjects = actions.filter((a) => a.type === "project" && a.op === "create").map((a) => a.id);
    if (actions.some((a) => a.type === "plan") && plan?.projectId) removedProjects.push(plan.projectId);
    if (removedProjects.length) {
      const later = await prisma.chatMessage.findMany({ where: { conversationId: msg.conversationId, id: { not: msg.id }, createdAt: { gt: msg.createdAt } } });
      for (const m of later) {
        const acts = (m.actions as ItemAction[] | null) ?? [];
        const moot = acts.filter((a) => a.type === "project" && a.op === "update" && removedProjects.includes(a.id));
        if (!moot.length) continue;
        await prisma.chatMessage.update({
          where: { id: m.id },
          data: {
            actions: acts.filter((a) => !moot.includes(a)) as object[],
            meta: { ...((m.meta ?? {}) as ReplyMeta), undone: moot.map((a) => `The changes to the plan "${a.title}" are gone too, because the plan was undone`) } as object,
          },
        });
      }
    }
    const folded = conv?.memoryUpTo && msg.createdAt <= conv.memoryUpTo;
    await prisma.conversation.update({
      where: { id: msg.conversationId },
      data: {
        ...(next ? { plan: next as object } : {}),
        ...(folded ? { memory: noteInMemory(conv.memory, `Undone by Abhay: ${labels.join("; ")}`) } : {}),
      },
    });
    // A pending "which matters most?" about items that no longer exist must not catch his next message.
    await prisma.chatMessage.updateMany({ where: { conversationId: msg.conversationId }, data: { awaiting: Prisma.DbNull } });
  }

  await prisma.chatMessage.update({
    where: { id: msg.id },
    data: {
      actions: [],
      awaiting: Prisma.DbNull,
      meta: { ...meta, options: undefined, undone: labels, undoneAt: new Date().toISOString() } as object,
      content: `${msg.content}\n\n↩︎ Undone`,
    },
  });
  return { undone, labels };
}

function looksLikeAnswer(text: string) {
  // Short replies, numbered answers, or priority/date words are treated as answers.
  return text.length < 200 && !/\?\s*$/.test(text) && !/^(remind me|add |i need to|i have to)/i.test(text);
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
  if (awaiting.kind === "meal_amount") return awaiting.meal?.queue[0]?.prompt ?? null;
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

async function handleAnswer(turn: Turn, awaiting: Awaiting, text: string): Promise<AssistantReply | null> {
  const { userId } = turn;
  if (awaiting.kind === "meal_amount" && awaiting.meal) return answerMealAmount(turn, awaiting.meal, text);
  if (awaiting.kind === "reminder_time") {
    const when = parseWhen(text);
    const ref = awaiting.refs[0];
    if (!when || !ref) return null;
    const todo = await prisma.todo.findFirst({ where: { id: ref.id, userId } });
    if (!todo) return null;
    await prisma.todo.update({ where: { id: todo.id }, data: { dueAt: when.date } });
    const reminder = await prisma.reminder.create({ data: { userId, text: todo.title, fireAt: when.date, todoId: todo.id } });
    const action: ItemAction = { op: "create", type: "reminder", id: reminder.id, title: todo.title, area: todo.area, href: "/todos", detail: `Telegram · ${when.date.toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })}` };
    return save(turn, describeActions([action]), { actions: [action] });
  }

  const list = awaiting.refs.map((r, i) => `${i + 1}. ${r.title}`).join(" ");
  // "3 is urgent, 1 can wait, 2 by friday" is parsed exactly; the model only handles free-form answers.
  const direct = parseNumberedAnswer(text, awaiting.refs.length);
  const result = direct.length ? null : await chat({
    messages: [
      { role: "system", content: ANSWER_SYSTEM },
      { role: "user", content: `List: ${list}\nAnswer: ${text}` },
    ],
    schema: ANSWER_SCHEMA,
    maxTokens: 200,
    timeoutMs: 90_000,
  });
  const parsed = result ? parseJson<{ updates?: { n: number; priority?: string; when?: string }[] }>(result.content) : null;
  const updates = (direct.length ? direct : parsed?.updates ?? []).filter((u) => awaiting.refs[u.n - 1]);
  if (!updates.length) return null;

  const lines: string[] = [];
  for (const u of updates) {
    const ref = awaiting.refs[u.n - 1];
    const priority = u.priority ? normalizePriority(u.priority) : undefined;
    const due = parseWhenFrom(u.when, text)?.date;
    // updateMany: an item deleted since the question was asked is skipped, not an error.
    let count = 0;
    if (ref.type === "todo") count = (await prisma.todo.updateMany({ where: { id: ref.id, userId }, data: { priority, dueAt: due } })).count;
    if (ref.type === "task") count = (await prisma.projectTask.updateMany({ where: { id: ref.id, project: { userId } }, data: { priority, dueDate: due } })).count;
    if (ref.type === "project") count = (await prisma.project.updateMany({ where: { id: ref.id, userId }, data: { priority, deadline: due } })).count;
    if (!count) continue;
    lines.push(`• ${ref.title}: ${[priority, due ? `due ${due.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}` : null].filter(Boolean).join(", ")}`);
  }
  if (!lines.length) return null;
  return save(turn, `Updated:\n${lines.join("\n")}`);
}

const PRIORITY_WORDS: [RegExp, string][] = [
  [/\b(urgent|asap|right away|immediately|top priority|most important|first)\b/i, "urgent"],
  [/\b(important|high|soon|next)\b/i, "high"],
  [/\b(can wait|whenever|low|not urgent|no rush|later|last)\b/i, "low"],
  [/\b(medium|normal|middle)\b/i, "medium"],
];

/** Clauses like "3 is urgent", "1 can wait", "#2 by friday". */
export function parseNumberedAnswer(text: string, max: number) {
  const updates: { n: number; priority?: string; when?: string }[] = [];
  for (const clause of text.split(/[,;]|\band\b|\.\s/i)) {
    const m = clause.match(/(?:^|\s|#)(\d{1,2})\b(.*)$/);
    if (!m) continue;
    const n = Number(m[1]);
    if (n < 1 || n > max) continue;
    const rest = m[2];
    const priority = PRIORITY_WORDS.find(([re]) => re.test(rest))?.[1];
    const when = rest.match(/\b(by|on|due|before)\s+(.+)$/i)?.[2]?.trim();
    if (priority || when) updates.push({ n, priority, when });
  }
  return updates;
}

/** The first eaten meal in these actions that needs an amount → a meal_amount question. */
async function mealQuestion(actions: ItemAction[]): Promise<Awaiting | null> {
  for (const a of actions.filter((x) => x.type === "meal" && x.op === "create" && /^ate/.test(x.detail ?? ""))) {
    const meal = await prisma.meal.findUnique({ where: { id: a.id }, select: { sourceText: true } });
    if (!meal?.sourceText) continue;
    const queue = questionsFor(parseFoods(meal.sourceText));
    if (queue.length) return { kind: "meal_amount", refs: [], meal: { id: a.id, text: meal.sourceText, answers: {}, queue } };
  }
  return null;
}

const TYPICAL_WORDS = /^(skip|typical|normal|regular|usual|idk|i don'?t know|not sure|dunno|average|whatever|no idea)\b/i;
const AMOUNT_WORDS = /\d|\b(half|quarter|a|an|one|two|three|small|medium|large|big|handful|cup|cups|tbsp|tsp|oz|ounces?|grams?|ml|liters?|litres?|bottle|can|slice|piece|scoop)\b/i;

async function answerMealAmount(turn: Turn, meal: NonNullable<Awaiting["meal"]>, text: string): Promise<AssistantReply | null> {
  const q = meal.queue[0];
  if (!q) return null;
  const said = text.trim().toLowerCase();
  const option = q.options.find((o) => said === o.label.toLowerCase() || said.includes(o.label.toLowerCase()));
  const amount = option?.amount ?? (TYPICAL_WORDS.test(said) ? "typical" : AMOUNT_WORDS.test(said) ? said.replace(/\b(about|around|like|roughly|maybe|it was|i had|i think)\b/g, "").trim() : null);
  if (!amount) return null; // not an answer: carry on as a normal message (the meal keeps typical portions)
  const answers = { ...meal.answers, [q.key]: amount };
  const rest = meal.queue.slice(1);
  if (rest.length) {
    const next: Awaiting = { kind: "meal_amount", refs: [], meal: { ...meal, answers, queue: rest } };
    return save(turn, rest[0].prompt, { awaiting: next, meta: { options: rest[0].options.map((o) => o.label) } });
  }
  const draft = await reestimateMeal(meal.id, meal.text, answers);
  const lines = draft.items.map((i) => `• ${i.name} (${i.amount}): ${i.calories} kcal`).join("\n");
  return save(turn, `Updated: ${draft.totals.calories} kcal · P ${Math.round(draft.totals.protein)}g · C ${Math.round(draft.totals.carbs)}g · F ${Math.round(draft.totals.fat)}g\n${lines}`);
}

async function startPrioritize(turn: Turn): Promise<AssistantReply> {
  const { userId } = turn;
  const items = (await getOpenItems(userId, 30)).filter((i) => i.type !== "task").slice(0, 8);
  if (!items.length) return save(turn, "You have nothing open right now. 🎉");
  const awaiting: Awaiting = { kind: "prioritize", refs: items.map((i) => ({ type: i.type, id: i.id, title: i.title })) };
  return save(turn, `Let's sort these out.\n${questionFor(awaiting)}`, { awaiting });
}

const QA_SYSTEM = `You are Abhay's personal assistant inside his life tracker. Answer his question using ONLY the data given. Be direct and brief: at most 4 short lines or bullets. If the data doesn't answer it, say so. Never invent tasks or numbers.`;

async function answerQuestion(userId: string, question: string) {
  const snapshot = await buildSnapshot(userId);
  const result = await chat({
    messages: [
      { role: "system", content: QA_SYSTEM },
      // Data first, question last: consecutive questions reuse the cached data prefix.
      { role: "user", content: `[data]\n${snapshot}\n\nQuestion: ${question}` },
    ],
    temperature: 0.3,
    maxTokens: 220,
    timeoutMs: 120_000,
  });
  return tidy(result.content) || "I couldn't work that out from your data.";
}

export { describeItem };
