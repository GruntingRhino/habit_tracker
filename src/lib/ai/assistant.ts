import prisma from "@/lib/prisma";
import { contextFor, currentContext, runAs } from "@/lib/request-context";
import { recomputeCategoryScoreForDate } from "@/lib/category-score";
import { getStartOfDay } from "@/lib/utils";
import { actionableCount, extractUpdate, isUpdate, parseWorkout, parseTodos, type Extracted } from "@/lib/ai/update";
import { needsPrep } from "@/lib/prep";
import { secondLook } from "@/lib/ai/leftovers";
import { afterBlock, CALENDAR_Q, calendarAnswer, MOVE_EVENT, moveEvent, nameMatches, newTime, rangeOf, WHEN_Q, whenAnswer } from "@/lib/ai/calendarchat";
import { isWorkoutHabit, parseHabitReports, type HabitReport } from "@/lib/ai/habitcheck";
import { MEALS_Q, mealsAnswer, TARGET_Q, targetsAnswer, REMINDERS_Q, remindersAnswer, WEEK_Q, weekAnswer, DID_I_Q, habitStatusAnswer, NUTRITION_Q, nutritionAnswer, PLATE_Q, plateAnswer, SCORE_Q, scoreAnswer } from "@/lib/ai/facts";
import * as chrono from "chrono-node";
import { addAttendees, createEvent, deleteEvent, describeEventTime, emailsIn, parseEventStatement, prepDue, updateEvent, type ParsedEvent } from "@/lib/calendar";
import { planItem } from "@/lib/ai/itemai";
import { keywordArea } from "@/lib/ai/router";
import { parseMeasurements, recordMeasurements } from "@/lib/body";
import { buildSchedule, describeSchedule, fmt12, parseScheduleBlock, parseSleepTimes, readPrefs, writePrefs } from "@/lib/schedule";
import { readTraining, todaysTraining, writeTraining } from "@/lib/training";
import { parseBodyUpdate, recordBodyUpdate } from "@/lib/body";
import { Prisma } from "@/generated/prisma";
import { normalizePriority } from "@/lib/areas";
import { chat, parseJson } from "@/lib/ai/llm";
import { NEGATED_CAPTURE, routeMessage } from "@/lib/ai/router";
import { applyCapture, applyComplete, bestMatch, undoActions, type ItemAction } from "@/lib/ai/capture";
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
  kind: "triage" | "reminder_time" | "prioritize" | "meal_amount" | "event_time" | "event_share" | "event_prep" | "meeting_when";
  /** meeting_when: the "Set up meeting with …" to-do and who it's with. */
  meeting?: { todoId: string; title: string };
  /** event_*: the calendar event being asked about (askPrep: still ask whether it needs preparing). */
  event?: { id: string; title: string; askPrep?: boolean };
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
  /** To-do titles this reply was about, so "those two" next can point at them. */
  items?: string[];
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
  sleep: "Sleep",
  measurement: "Measurement",
  event: "Calendar",
};

export function describeActions(actions: ItemAction[]) {
  return actions
    .filter((a) => a.type !== "plan")
    // A to-do with its own reminder is one line: the to-do, "I'll remind you".
    .filter((a) => !(a.type === "reminder" && actions.some((b) => b.type === "todo" && b.title === a.title)))
    // The automatic "📅 … in 1 hour" reminder that comes with an event isn't news.
    .filter((a) => !(a.type === "reminder" && a.title.startsWith("📅") && actions.some((b) => b.type === "event")))
    .map((a) => {
      const verb = a.op === "complete" ? "✅ Done" : TYPE_LABEL[a.type];
      const reminded = a.type === "todo" && actions.some((b) => b.type === "reminder" && b.title === a.title);
      if (a.type === "journal" && a.op === "append") return "🧠 Added to today's journal";
      if (a.op === "delete") return `🗑️ Removed: ${a.title}`;
      const emoji = a.type === "event" ? "📅" : a.type === "sleep" ? "😴" : a.type === "meal" ? "🍽️" : AREA_EMOJI[a.area ?? "general"] ?? "📌";
      return `${emoji} ${verb}: ${a.title}${a.detail ? ` — ${a.detail}` : ""}${reminded ? " (I'll remind you)" : ""}`;
    })
    .join("\n");
}

/** What an undo reversed, in words the chat model reads later. */
function undoneLabel(a: ItemAction) {
  if (a.type === "plan") return `The plan "${a.title}" was cancelled`;
  if (a.type === "sleep") return `The sleep log (${a.title}) was removed`;
  if (a.op === "update") return `The changes to the plan "${a.title}" were reverted`;
  if (a.op === "complete") return `"${a.title}" is marked not done again`;
  if (a.op === "append") return `The journal note was removed`;
  if (a.op === "delete") return `"${a.title}" was put back`;
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

/**
 * One message from a person. Runs as that person (their name/pronouns in prompts, their place in
 * the model queue); while waiting in line the chat shows where they are.
 */
export async function handleMessage(userId: string, text: string, source: Source, opts: HandleOptions = {}): Promise<AssistantReply> {
  const who = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, pronouns: true } });
  if (!who) return handleTurn(userId, text, source, opts);
  const onQueue = (n: number) => opts.onStatus?.(n > 0 ? `In line (#${n}) — the AI is finishing something else…` : "Thinking…");
  return runAs(contextFor(who, { priority: currentContext()?.priority ?? "interactive", onQueue }), () => handleTurn(userId, text, source, opts));
}

async function handleTurn(userId: string, text: string, source: Source, opts: HandleOptions = {}): Promise<AssistantReply> {
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
    // Sent the same thing again (the first reply was slow): don't do it twice.
    const dupe = await duplicateOf(userId, userMsg.id, trimmed);
    if (dupe) return save(turn, dupe);
    const quick = await quickReply(userId, trimmed);
    if (quick) return save(turn, quick);

    const last = await prisma.chatMessage.findFirst({
      where: { conversationId: conv.id, role: "assistant" },
      orderBy: { createdAt: "desc" },
    });
    const lastActions = (last?.actions as ItemAction[] | null) ?? [];
    const recent = Boolean(last && Date.now() - last.createdAt.getTime() < 30 * 60_000);
    const undoneSince = await undosSinceLastTurn(conv.id, userMsg.id);
    let awaiting = recent ? (last?.awaiting as Awaiting | null) : null;
    const wantsFiling = CAPTURE_SIGNAL.test(trimmed) && !NEGATED_CAPTURE.test(trimmed) && !NOTE_QUESTION.test(trimmed);

    // "How much chips?" then "dinner: chicken and rice": a new meal, not the answer.
    if (awaiting?.kind === "meal_amount" && /^\s*(breakfast|brunch|lunch|dinner|snack)\b|^\s*(i\s+)?(just\s+|also\s+)?(had|ate|drank)\b/i.test(trimmed)) awaiting = null;
    // 1. An answer to the clarifying question just asked ("2 is urgent", "at 6pm").
    if (awaiting && last && looksLikeAnswer(trimmed)) {
      await prisma.chatMessage.update({ where: { id: last.id }, data: { awaiting: Prisma.DbNull } });
      const handled = await handleAnswer(turn, awaiting, trimmed);
      if (handled) return handled;
      // Not an answer after all: the question is dropped and the message handled like any other.
      awaiting = null;
    }

    // 2. Things only the app knows for sure: answered from state, never by the model.
    const plan = conv.plan as PlanState | null;
    // "actually make that due tomorrow", "actually its at 2pm not 1", "actually it was 4 bottles": fix what was just done.
    if (!awaiting && recent && CORRECTION.test(trimmed)) {
      const fixed = await correctLast(turn, lastActions, trimmed);
      if (fixed) return fixed;
    }
    // "move the doctor appointment to 11"
    const move = MOVE_EVENT.exec(trimmed);
    if (move) {
      const moved = await moveEvent(userId, move[1], move[2]);
      if (moved) {
        const actions: ItemAction[] = moved.before ? [{ op: "update", type: "event", id: moved.event.id, title: moved.event.title, area: "general", href: "/schedule", detail: "moved", prev: JSON.stringify(moved.before) }] : [];
        return save(turn, moved.reply, { actions });
      }
    }
    // "cancel the soccer game", "delete the cleats one", "cancel the grandma reminder", "delete the big mac meal"
    const del = !awaiting ? DELETE_ITEM.exec(trimmed) : null;
    if (del) {
      const removed = await deleteByName(turn, del[1]);
      if (removed) return removed;
    }
    if (NEGATED_CAPTURE.test(trimmed)) return await cancelLast(turn, trimmed, undoneSince);
    if (PLAN_STATUS.test(trimmed) || (STOPPED_ASKING.test(trimmed) && plan && plan.stage !== "asking")) return save(turn, planStatus(plan));
    if (!awaiting && LIST_REFERENCE.test(trimmed)) {
      if (undoneSince.length) return save(turn, `Nothing to update: those were undone (${undoneSince.map(lowerFirst).join("; ")}).`);
      return save(turn, `Which item do you mean? I don't have a numbered list open right now, so tell me its name (e.g. "the essay is due friday").`);
    }
    if (undoneSince.length && ABOUT_UNDO.test(trimmed)) return save(turn, undoAnswer(undoneSince));
    // "those two items", "both of them": what was just added, not a new to-do called "Do those two items".
    if (!awaiting && THOSE.test(trimmed) && !/\b(add|remind|new)\b/i.test(trimmed)) {
      const ref = await referToLast(turn, lastActions, recent, trimmed);
      if (ref) return ref;
    }
    // A "no" to a question that's no longer open.
    if (!awaiting && /^\s*(no|nope|nah|no thanks)(,?\s*(just me|thanks|thank you|i'?m good|all good|that'?s it))?[.!]*\s*$/i.test(trimmed)) return save(turn, "Okay 👍");
    // Exact answers from his data, never the model's reading of it.
    const asking = /\?\s*$/.test(trimmed) || /^\s*(how|what|whats|what's|show|tell me|list)\b/i.test(trimmed);
    if (asking && TARGET_Q.test(trimmed)) return save(turn, await targetsAnswer(userId));
    if (asking && NUTRITION_Q.test(trimmed) && !/\b(should i eat|to eat|what (can|should) i)\b/i.test(trimmed)) return save(turn, await nutritionAnswer(userId, trimmed));
    if (asking && MEALS_Q.test(trimmed)) return save(turn, await mealsAnswer(userId));
    if (asking && REMINDERS_Q.test(trimmed)) return save(turn, await remindersAnswer(userId));
    if (asking && WEEK_Q.test(trimmed)) return save(turn, await weekAnswer(userId));
    const whenQ = WHEN_Q.exec(trimmed);
    if (whenQ) {
      const answer = await whenAnswer(userId, whenQ[1]);
      if (answer) return save(turn, answer);
    }
    // "what's on my calendar this week?", "what do i have friday?", "what's on my plate tomorrow?"
    const range = asking ? rangeOf(trimmed) : null;
    if (asking && (CALENDAR_Q.test(trimmed) || (PLATE_Q.test(trimmed) && range && range.label !== "today"))) return save(turn, await calendarAnswer(userId, trimmed));
    if (asking && SCORE_Q.test(trimmed) && /\b(my|i)\b/i.test(trimmed)) return save(turn, await scoreAnswer(userId, trimmed));
    if (/\b(did i (do|finish|get|complete) (everything|it all|all my)|am i done)\b/i.test(trimmed)) return save(turn, await plateAnswer(userId, new Date(), true));
    if ((asking && PLATE_Q.test(trimmed)) || /\b(anything left|what'?s left|what do i have left)\b/i.test(trimmed)) return save(turn, await plateAnswer(userId));
    if (DID_I_Q.test(trimmed)) {
      const status = await habitStatusAnswer(userId, trimmed);
      if (status) return save(turn, status);
    }
    // "mark call the dentist as done", "check off posture"
    const mark = MARK_DONE.exec(trimmed);
    if (mark) {
      const done = await applyComplete(userId, [{ kind: "todo", title: mark[1] ?? mark[2], area: "general" }]);
      if (done.actions.length) return save(turn, describeActions(done.actions), { actions: done.actions });
      return save(turn, `I couldn't find "${mark[1] ?? mark[2]}" on your to-dos or habits. What's it called on your list?`);
    }
    // "i feel kinda unmotivated today": into the journal, and a real reply.
    if (!awaiting && FEELING.test(trimmed) && trimmed.length < 200 && !/\?\s*$/.test(trimmed)) {
      flags.conversational = true;
      const actions = await applyCapture(userId, [{ kind: "journal", title: "Journal", area: "mental" }], trimmed, source);
      const talk = stripClaims(await companionReply(turn.conversationId, turn.userMessageId, trimmed, turn.opts.onToken, FEEL_NOTE));
      return save(turn, [talk, describeActions(actions)].filter(Boolean).join("\n\n"), { actions });
    }
    // A day update ("slept 11 to 6:40, have to study for my bio and math quiz tomorrow, …"): every piece handled.
    // A short, explicit calendar line ("add soccer game to my calendar saturday 10-12, share with …") goes to the calendar reader.
    const preview = !awaiting && !/\?\s*$/.test(trimmed) && !/\bremind me\b/i.test(trimmed) ? extractUpdate(trimmed) : null;
    const explicitCalendar = /\b(?:to|on|in)\s+(?:my|the)\s+calendar\b/i.test(trimmed) && trimmed.length < 160;
    if (preview && !explicitCalendar && !(trimmed.length < 120 && parseEventStatement(trimmed) && actionableCount(preview) < 2)) {
      const extracted = preview;
      if (isUpdate(trimmed, extracted)) return await handleUpdate(turn, trimmed, extracted);
      // "just did my posture routine", "drank 60 oz so far", "didn't read my bible": his habits, by code.
      const habits = await prisma.habit.findMany({ where: { userId, isActive: true }, select: { id: true, name: true, area: true } });
      if (parseHabitReports(trimmed, habits).length) return await handleUpdate(turn, trimmed, extracted, habits);
      const n = actionableCount(extracted);
      // "coach wants to meet thursday": one event said casually.
      if (n === 1 && extracted.events.length === 1) return await eventFromChat(turn, { ...extracted.events[0], attendees: emailsIn(trimmed) }, trimmed);
      // "chem test thursday so i need to lock in": one test → the event flow (prep to-do, then the time).
      if (n === 1 && extracted.assessments.length === 1) {
        const a = extracted.assessments[0];
        const hasTime = !!(a.start.getHours() || a.start.getMinutes());
        const end = new Date(a.start.getTime() + (hasTime ? 3_600_000 : 86_400_000));
        return await eventFromChat(turn, { title: a.title, start: a.start, end, allDay: !hasTime, hasTime, attendees: emailsIn(trimmed) }, trimmed);
      }
      // "chem test tmrw", "got maybe 6 hrs": code knows exactly what these are.
      // "i owe my mom 20 bucks": code already knows the to-do, no model needed.
      if (n >= 1 && (extracted.assessments.length || extracted.sleep || extracted.todos.some((t) => t.title.startsWith("Pay back ")))) return await handleUpdate(turn, trimmed, extracted);
    }
    // "I have a dentist appointment Friday at 3" → calendar event + prep to-do, then ask what's missing.
    const event = !awaiting ? parseEventStatement(trimmed) : null;
    if (event) return await eventFromChat(turn, event, trimmed);
    // "share the soccer game with mike@gmail.com" (no question pending)
    if (!awaiting && /\b(share|invite|send)\b/i.test(trimmed) && emailsIn(trimmed).length) {
      const shared = await shareFromChat(turn, trimmed);
      if (shared) return shared;
    }
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
    if (plan?.stage === "asking" && !FILE_IT.test(trimmed) && !offPlan(trimmed)) {
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
      if (wantsPlan(trimmed)) {
        // "make a plan for the science fair" when that's already on his list: plan that item
        // (a to-do becomes a project with a dated checklist) instead of starting a new goal.
        const target = goalTitle(trimmed).replace(/^(for|on)\s+(the|my)?\s*/i, "").replace(/^(the|my)\s+/i, "");
        const [openTodos, openProjects] = await Promise.all([
          prisma.todo.findMany({ where: { userId, status: "open" }, select: { id: true, title: true } }),
          prisma.project.findMany({ where: { userId, status: { notIn: ["completed", "archived"] } }, select: { id: true, title: true } }),
        ]);
        const project = bestMatch(target, openProjects, 0.6);
        const todo = project ? null : bestMatch(target, openTodos, 0.6);
        if (project || todo) {
          const r = await planItem(userId, project ? { type: "project", id: project.id } : { type: "todo", id: todo!.id }, trimmed);
          const tasks = await prisma.projectTask.findMany({ where: { projectId: r.item.id }, orderBy: { order: "asc" }, select: { id: true, title: true, dueDate: true } });
          const added = new Set(r.changes.filter((c) => c.startsWith("+ ")).map((c) => c.slice(2).replace(/ \([^)]*\)$/, "")));
          const actions: ItemAction[] = tasks
            .filter((t) => added.has(t.title))
            .map((t) => ({ op: "create", type: "task", id: t.id, title: t.title, area: "work", href: `/todos?project=${r.item.id}`, detail: t.dueDate ? t.dueDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : undefined }));
          return save(turn, `${r.reply} It's on your Tasks list.`, { actions });
        }
        return await startPlan(turn, trimmed);
      }
      if (/^\s*(how|what|which|should|can|could)\b|\?\s*$/i.test(trimmed)) return await chatReply(turn, trimmed);
      const actions = await applyCapture(userId, [{ kind: "project", title: goalTitle(trimmed), area: keywordArea(trimmed) ?? "general", priority: "medium" }], trimmed, source);
      return save(turn, describeActions(actions), { actions });
    }
    // "He's a golden retriever": a statement continuing the conversation, not something to file.
    if (!wantsFiling && FACT_STATEMENT.test(trimmed) && trimmed.length < 160) {
      flags.conversational = true;
      return await chatReply(turn, trimmed);
    }
    // "breakfast: 4 eggs, toast", "lunch was chicken and rice": a meal, no model needed to know that.
    const slot = MEAL_LINE.exec(trimmed);
    if (!awaiting && slot && !/\?\s*$/.test(trimmed)) {
      // Named by the dish, not the amounts: "chicken and rice, like 8 oz chicken…" → "Chicken and rice".
      const name = slot[2].split(/,?\s+(?:like|about|maybe|probably|around)\s+\d|,\s*(?:like|about|maybe)\b|\s+-\s+/)[0].replace(/^(a|an|some)\s+/i, "").replace(/[.!]+$/, "").trim().slice(0, 80);
      const actions = await applyCapture(userId, [{ kind: "meal", title: cap(name), area: "physical", done: true }], trimmed, source);
      const ask = await mealQuestion(actions);
      return save(turn, [describeActions(actions), questionFor(ask)].filter(Boolean).join("\n\n"), { actions, awaiting: ask, meta: ask?.meal ? { options: ask.meal.queue[0].options.map((o) => o.label) } : null });
    }
    // "Finished the literature review": tick off the matching open item before asking the model anything.
    if (COMPLETION_START.test(trimmed) && !/\?\s*$/.test(trimmed)) {
      const object = trimmed.replace(COMPLETION_START, "").replace(/^\s*(the|my|a|an)\s+/i, "").replace(/[.!]+$/, "").trim();
      if (object) {
        const done = await applyComplete(userId, [{ kind: "todo", title: object, area: "general" }]);
        if (done.actions.length) return save(turn, describeActions(done.actions), { actions: done.actions });
      }
    }
    // A long reflection with nothing to act on (like a reply to the evening check-in): the journal.
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
        // A single plain to-do ("I need to call the bank tomorrow"): the title is his words, not the model's paraphrase.
        const own = routed.items.length === 1 && routed.items[0].kind === "todo" ? parseTodos(trimmed, new Date()) : [];
        if (own.length === 1) routed.items[0] = { ...routed.items[0], title: own[0].title };
        // "hit legs, squats 3x8 at 185, rdls 3x10": one workout; the sets are its details, not more workouts.
        const workouts = routed.items.filter((i) => i.kind === "workout");
        const lift = workouts.length ? parseWorkout(trimmed) : null;
        if (workouts.length > 1 && (lift || /\d+\s*x\s*\d+/i.test(trimmed))) {
          const first = routed.items.indexOf(workouts[0]);
          routed.items = routed.items.filter((i, n) => i.kind !== "workout" || n === first);
        }
        const w = routed.items.findIndex((i) => i.kind === "workout");
        if (w >= 0 && lift && lift !== "Gym") routed.items[w] = { ...routed.items[w], title: lift };
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
  const reply = stripClaims(await companionReply(turn.conversationId, turn.userMessageId, text, turn.opts.onToken, note));
  return save(turn, reply || "🙂");
}

/** Sentences where the model says it did something ("I've added…", "you're all set, it's on your list"). */
const CLAIM =
  /\b(i('ve| have| just)?|i'll|we('ve)?|it'?s|they'?re|that'?s)\b[^.!?]{0,40}\b(added|created|scheduled|saved|logged|filed|booked|noted|marked|updated|set up|put (it|that|them|those)|reminded|set a reminder)\b|\b(added|put|saved|logged|scheduled)\b[^.!?]{0,30}\b(to|on|in) (your|the) (list|calendar|to-?do|to-?do list|study list|schedule|journal|plan)\b|\byou'?re all set\b/i;

/** Lines that look like the app's own receipts ("📅 Doctor — Mon 10am (on your Google Calendar)"): only code may write those. */
const RECEIPT = /^\s*(?:📅|💼|💪|📌|🍽️|✅|🗑️|🙏|🧠|💰|😴)|\b(?:to-?do|reminder|calendar|meal|workout|habit|note)\s*:|on your google calendar|i'?ll remind you|\((?:cancelled|canceled|deleted|added|saved|teamed up|no update)[^)]*\)|\[(?:reminder|to-?do|event|meal)[^\]]*\]/i;

export function stripClaims(reply: string) {
  return reply
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .filter((s) => !CLAIM.test(s) && !RECEIPT.test(s))
    .join(" ")
    .trim();
}

function stripQuestions(reply: string) {
  return reply
    .split(/(?<=[.!?])\s+/)
    .filter((s) => !/\?\s*$/.test(s))
    .join(" ")
    .trim();
}

/** The conversational half of a message that also filed something. Never fails the turn: the items are already saved. */
async function sideReply(turn: Turn, text: string, actions: ItemAction[]) {
  try {
    const done = describeActions(actions).replace(/^\S+ /gm, "").replace(/\n/g, "; ");
    const note = `The app just saved: ${done || "nothing"}. It's shown above your reply, so don't list it again; just answer the rest of his message.`;
    const reply = await companionReply(turn.conversationId, turn.userMessageId, text, turn.opts.onToken, note);
    // Beside saved items: no claims of its own (code already said what was done) and no filler questions.
    return stripQuestions(stripClaims(dropEchoes(reply, actions.map((a) => a.title), text)));
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
const COMPLETION_START = /^\s*(?:(?:ok|okay|so|yeah|yep|alright|wait|actually|and)[,\s]+)*(i |i've |ive )?(just |already |finally |actually |really )*(finished|completed|done with|paid|submitted|turned in|wrapped up|knocked out|took care of|crossed off)\b/i;
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
  if ((awaiting.kind === "event_time" || awaiting.kind === "event_share" || awaiting.kind === "event_prep") && awaiting.event) return answerEvent(turn, awaiting, text);
  if (awaiting.kind === "meeting_when" && awaiting.meeting) return answerMeeting(turn, awaiting.meeting, text);
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

// ---- calendar events from chat ------------------------------------------------------------------

const fmtDue = (d: Date) => d.toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" }).replace(":00", "");

/** A Telegram reminder before the event itself: an hour before, or 8am for an all-day event. */
async function eventReminder(userId: string, ev: { title: string; start: Date; allDay: boolean }) {
  const fireAt = ev.allDay ? new Date(ev.start.getFullYear(), ev.start.getMonth(), ev.start.getDate(), 8) : new Date(ev.start.getTime() - 3_600_000);
  if (fireAt <= new Date()) return null;
  return prisma.reminder.create({ data: { userId, text: `📅 ${ev.title}${ev.allDay ? " today" : " in 1 hour"}`, fireAt } });
}

/** "Prepare for …" to-do + reminder the evening before (or a planned project if he asked for a plan). */
async function addPrep(turn: Turn, ev: { id: string; title: string; start: Date }, text: string, actions: ItemAction[]) {
  const { userId } = turn;
  const due = prepDue(ev.start);
  // A test is studied for; everything else is prepared for.
  const prepTitle = `${/\b(quiz|test|exam|midterm|final|sat|act)\b/i.test(ev.title) ? "Study for" : "Prepare for"} ${ev.title.charAt(0).toLowerCase()}${ev.title.slice(1)}`;
  const todo = await prisma.todo.create({ data: { userId, title: prepTitle, area: "work", priority: "high", dueAt: due, source: turn.source } });
  await prisma.calendarEvent.update({ where: { id: ev.id }, data: { todoId: todo.id } });
  if (wantsPlan(text)) {
    const planned = await planItem(userId, { type: "todo", id: todo.id }, text);
    actions.push({ op: "create", type: "project", id: planned.item.id, title: prepTitle, area: "work", href: `/work?project=${planned.item.id}`, detail: planned.reply });
    return `Plan: ${planned.reply}`;
  }
  const reminder = await prisma.reminder.create({ data: { userId, text: prepTitle, fireAt: due, todoId: todo.id } });
  actions.push({ op: "create", type: "todo", id: todo.id, title: prepTitle, area: "work", href: "/work", detail: `due ${fmtDue(due)}` });
  actions.push({ op: "create", type: "reminder", id: reminder.id, title: prepTitle, area: "work", href: "/work", detail: fmtDue(due) });
  return `To-do: ${prepTitle} (${fmtDue(due)}, I'll remind you).`;
}

/** The next question about an event, if any: time → who to share with → whether it needs prep. */
function nextEventQuestion(event: { id: string; title: string; askPrep?: boolean }, hasTime: boolean, shared: boolean): { text: string; awaiting: Awaiting; options: string[] } | null {
  if (!hasTime) return { text: "What time is it?", awaiting: { kind: "event_time", refs: [], event }, options: ["All day", "Morning", "After school", "Evening"] };
  if (!shared) return { text: "Should I share it with anyone?", awaiting: { kind: "event_share", refs: [], event }, options: ["No, just me"] };
  if (event.askPrep) return { text: "Do you need to prepare for it?", awaiting: { kind: "event_prep", refs: [], event }, options: ["Yes", "No"] };
  return null;
}

/**
 * Calendar event from chat. A prep to-do only when it needs preparing (a debate tournament, a test);
 * a dentist appointment just gets a reminder before it. Unclear ones: he's asked. Then whatever's missing.
 */
async function eventFromChat(turn: Turn, ev: ParsedEvent, text: string): Promise<AssistantReply> {
  const { userId } = turn;
  // "coach wants to meet thursday after practice": the end of practice that day.
  if (!ev.hasTime) {
    const after = await afterBlock(userId, text, ev.start);
    if (after) ev = { ...ev, start: after, end: new Date(after.getTime() + 3_600_000), allDay: false, hasTime: true };
  }
  const actions: ItemAction[] = [];
  const prep = wantsPlan(text) ? "yes" : needsPrep(ev.title);
  const { event, onGoogle } = await createEvent(userId, { title: ev.title, start: ev.start, end: ev.end, allDay: ev.allDay, attendees: ev.attendees });
  actions.push({ op: "create", type: "event", id: event.id, title: ev.title, area: "general", href: "/schedule", detail: `${describeEventTime(event)}${onGoogle ? " · on Google Calendar" : ""}` });
  const lines = [`📅 ${ev.title} — ${describeEventTime(event)}${onGoogle ? " (on your Google Calendar)" : ""}.`];
  if (prep === "yes") lines.push(await addPrep(turn, event, text, actions));
  else {
    const r = await eventReminder(userId, event);
    if (r) {
      actions.push({ op: "create", type: "reminder", id: r.id, title: r.text, area: "general", href: "/schedule", detail: fmtDue(r.fireAt) });
      if (ev.hasTime) lines.push("I'll remind you an hour before.");
    }
  }
  if (ev.attendees.length) lines.push(`Shared with ${ev.attendees.join(", ")}${onGoogle ? " — they'll get a Google Calendar invite" : ""}.`);
  const q = nextEventQuestion({ id: event.id, title: ev.title, askPrep: prep === "ask" }, ev.hasTime, ev.attendees.length > 0);
  if (q) {
    lines.push(q.text);
    return save(turn, lines.join("\n"), { actions, awaiting: q.awaiting, meta: { options: q.options } });
  }
  return save(turn, lines.join("\n"), { actions });
}

/** Say the line, then ask the next question about the event (if any). */
function askNextOrDone(turn: Turn, event: NonNullable<Awaiting["event"]>, line: string, shared: boolean) {
  const q = nextEventQuestion(event, true, shared);
  return q ? save(turn, `${line}\n${q.text}`, { awaiting: q.awaiting, meta: { options: q.options } }) : save(turn, line);
}

const NO = /^\s*(no|nope|nah|no one|nobody|just me|no,? just me|not now|skip|none)\b/i;

async function answerEvent(turn: Turn, awaiting: Awaiting, text: string): Promise<AssistantReply | null> {
  const { userId } = turn;
  const ev = await prisma.calendarEvent.findFirst({ where: { id: awaiting.event!.id, userId } });
  if (!ev) return null;
  if (awaiting.kind === "event_time") {
    const day = new Date(ev.start);
    let start: Date | null = null;
    let end: Date | null = null;
    if (/\ball[- ]?day\b/i.test(text)) {
      // keep it all-day
    } else {
      // "after practice" / "after school": the end of that block in his week, if he has one.
      const after = text.match(/\bafter\s+(?:my\s+|the\s+)?([a-z]+)/i)?.[1]?.toLowerCase();
      const block = after ? await prisma.scheduleBlock.findFirst({ where: { userId, title: { contains: after, mode: "insensitive" } } }) : null;
      const blockEnd = block ? Number(block.end.slice(0, 2)) + (Number(block.end.slice(3, 5)) >= 30 ? 0.5 : 0) + 0.25 : null;
      const slot =
        blockEnd ??
        (/\bmorning\b/i.test(text) ? 9 : /\bafter school\b/i.test(text) ? 15 : /\bafter (practice|training|work|the game)\b/i.test(text) ? 17.5 : /\bafter dinner\b/i.test(text) ? 19 : /\bafternoon\b/i.test(text) ? 14 : /\b(evening|tonight)\b/i.test(text) ? 18 : /\bnoon|lunch\b/i.test(text) ? 12 : null);
      const found = slot == null ? chrono.parse(text, day, { forwardDate: false })[0] : null;
      if (slot != null) start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(slot), Math.round((slot % 1) * 60));
      else if (found && found.start.isCertain("hour")) {
        const s = found.start.date();
        let h = s.getHours();
        if (!found.start.isCertain("meridiem") && h >= 1 && h <= 6) h += 12;
        start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, s.getMinutes());
        const e = found.end?.date();
        if (e) end = new Date(day.getFullYear(), day.getMonth(), day.getDate(), e.getHours() + (!found.end!.isCertain("meridiem") && e.getHours() >= 1 && e.getHours() <= 6 ? 12 : 0), e.getMinutes());
      } else return null; // not an answer: handle the message normally
    }
    let line = "Kept it as all day.";
    if (start) {
      const r = await updateEvent(userId, ev.id, { start, end: end && end > start ? end : new Date(start.getTime() + 3_600_000), allDay: false });
      line = `Set: ${ev.title} — ${describeEventTime(r!.event)}.`;
      // The prep to-do/reminder and the event reminder follow the real time.
      if (ev.todoId) {
        const due = prepDue(start);
        await prisma.todo.updateMany({ where: { id: ev.todoId, userId, status: "open" }, data: { dueAt: due } });
        await prisma.reminder.updateMany({ where: { todoId: ev.todoId, status: "pending" }, data: { fireAt: due } });
      }
      const hourBefore = new Date(start.getTime() - 3_600_000);
      await prisma.reminder.updateMany({ where: { userId, status: "pending", text: { startsWith: `📅 ${ev.title}` } }, data: { fireAt: hourBefore, text: `📅 ${ev.title} in 1 hour` } });
    }
    return askNextOrDone(turn, awaiting.event!, line, ev.attendees.length > 0);
  }
  if (awaiting.kind === "event_prep") {
    if (/^\s*(y|yes|yeah|yep|sure|ok|okay|i do|definitely)\b/i.test(text)) {
      const actions: ItemAction[] = [];
      const line = await addPrep(turn, ev, text, actions);
      return save(turn, line, { actions });
    }
    if (NO.test(text) || /^\s*(no|nah|nope|not really)\b/i.test(text)) return save(turn, "Okay — no prep, just the reminder.");
    return null;
  }
  // event_share
  const emails = emailsIn(text);
  if (emails.length) {
    const r = await addAttendees(userId, ev.id, emails);
    return askNextOrDone(turn, awaiting.event!, `Shared ${ev.title} with ${emails.join(", ")}${r?.onGoogle ? " — they'll get a Google Calendar invite." : (await googleHint(turn.userId))}`, true);
  }
  if (NO.test(text)) return askNextOrDone(turn, awaiting.event!, "Okay, just you.", true);
  if (/^\s*(yes|yeah|yep|sure|ok|okay)\b/i.test(text) || /\b(share|invite)\b/i.test(text)) {
    return save(turn, "What's their email? (You can list a few.)", { awaiting, meta: { options: ["No, just me"] } });
  }
  return null;
}

/** "share the soccer game with mike@gmail.com": the best-matching upcoming event (or the latest one). */
async function shareFromChat(turn: Turn, text: string): Promise<AssistantReply | null> {
  const { userId } = turn;
  const emails = emailsIn(text);
  const upcoming = await prisma.calendarEvent.findMany({ where: { userId, status: "confirmed", end: { gte: new Date() } }, orderBy: { start: "asc" }, take: 50 });
  if (!upcoming.length) return null;
  const words = text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, " ").replace(/\b(share|invite|send|it|this|that|the|my|with|to|and|event|calendar)\b/gi, " ").trim();
  const match = words.length >= 3 ? bestMatch(words, upcoming, 0.5) : null;
  const target = match ?? [...upcoming].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  const r = await addAttendees(userId, target.id, emails);
  return save(turn, `Shared ${target.title} (${describeEventTime(target)}) with ${emails.join(", ")}${r?.onGoogle ? " — they'll get a Google Calendar invite." : (await googleHint(turn.userId))}`);
}

// ---- duplicates, quick replies, references ----------------------------------------------------

/** The same message again within 10 minutes (slow first reply → sent twice): say so instead of redoing it. */
async function duplicateOf(userId: string, messageId: string, text: string): Promise<string | null> {
  if (text.length < 25) return null; // "ok", "yes", "thanks" repeat on purpose
  // Asking again gets a fresh answer (the data may have changed).
  if (/\?\s*$/.test(text) || /^\s*(what|how|when|where|which|who|did|do|is|are|show|list)\b/i.test(text)) return null;
  const prev = await prisma.chatMessage.findFirst({
    where: { userId, role: "user", content: text, id: { not: messageId }, createdAt: { gte: new Date(Date.now() - 10 * 60_000) } },
    orderBy: { createdAt: "desc" },
  });
  if (!prev) return null;
  const reply = await prisma.chatMessage.findFirst({ where: { conversationId: prev.conversationId, role: "assistant", createdAt: { gte: prev.createdAt } }, orderBy: { createdAt: "asc" } });
  if (!reply) return "Still working on that one — it takes up to a minute. It'll show up in the chat where you sent it.";
  return `Already got that one (it came in twice), so I didn't add anything again. Here's what I did:\n\n${reply.content}`;
}

const GREETING = /^(hi+|hey+|hello+|yo+|sup|wh?at'?s up|wassup|howdy|good (morning|afternoon|evening)|gm|morning|evening)[\s!.,]*(abhay|bro|man|dude|there)?[\s!.]*$/i;
const THANKS = /^(thanks|thank (you|u)|thx|ty|tysm|appreciate (it|you))( (so much|a lot|man|bro))?[\s!.]*$/i;
const ACK = /^(ok(ay)?|k|cool|nice|great|bet|got it|sounds good|perfect|alright)[\s!.]*$/i;
const ADD_WHAT = /^(?:can|could|will|would) you (?:please )?(?:add|make|create|set(?: up)?|start) (?:me )?(?:a |an |another |new )?(habit|to-?do|task|reminder|project|event|note|goal)(?: for me)?(?: please)?\??$/i;

/** Greetings, thanks and "can you add a habit?" get instant, sensible replies (no model). */
async function quickReply(userId: string, text: string): Promise<string | null> {
  const t = text.trim();
  if (GREETING.test(t)) {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const due = await prisma.todo.count({ where: { userId, status: "open", dueAt: { lt: end } } });
    const hi = /morning|gm/i.test(t) ? "Morning!" : /evening/i.test(t) ? "Evening!" : "Hey!";
    return due ? `${hi} You've got ${due} thing${due === 1 ? "" : "s"} due today — say "what's on today?" for the list.` : `${hi} What's up?`;
  }
  if (THANKS.test(t)) return "Anytime 👊";
  if (ACK.test(t)) return "👍";
  const add = t.match(ADD_WHAT);
  if (add) {
    const kind = (add[1] ?? "").toLowerCase().replace("-", "");
    const example: Record<string, string> = {
      habit: `What's the habit, and which days? e.g. "stretch every night" or "read 20 pages on weekdays"`,
      todo: `What's the to-do, and when's it due? e.g. "email my counselor by friday"`,
      task: `What's the task, and when's it due? e.g. "email my counselor by friday"`,
      reminder: `What should I remind you about, and when? e.g. "remind me at 6 to take my vitamins"`,
      project: `What's the project? e.g. "project: science fair" — then open it on Work to add steps`,
      event: `What's the event and when? e.g. "debate tournament saturday 8am"`,
      note: `What should the note say? e.g. "note: locker combo 12-34-56"`,
      goal: `What's the goal? e.g. "I want to bench 185 by summer"`,
    };
    const ask = example[kind] ?? "What should I add?";
    return `Sure — ${ask.charAt(0).toLowerCase()}${ask.slice(1)}`;
  }
  return null;
}

const THOSE = /\b(those|these|both|them|the (two|three|2|3) (items|things|tasks|ones))\b/i;

/** "I just have to do those two items": point at what was just added instead of filing a new to-do. */
async function referToLast(turn: Turn, lastActions: ItemAction[], recent: boolean, text = ""): Promise<AssistantReply | null> {
  // The items the last turn was about (created or already there), in the order he asked for them.
  const last = recent ? await prisma.chatMessage.findFirst({ where: { conversationId: turn.conversationId, role: "assistant" }, orderBy: { createdAt: "desc" }, select: { meta: true } }) : null;
  const named = ((last?.meta as { items?: string[] } | null)?.items ?? []).slice();
  const n = { two: 2, "2": 2, three: 3, "3": 3, both: 2 }[(text.match(/\b(two|three|2|3|both)\b/i)?.[1] ?? "").toLowerCase()];
  if (named.length) {
    const pick = n ? named.slice(0, n) : named;
    return save(turn, `Got it — they're already on your list: ${pick.join(" · ")}. I'll keep you on them.`, { meta: { items: pick } });
  }
  const items = recent ? lastActions.filter((a) => a.op === "create" && (a.type === "todo" || a.type === "task" || a.type === "event")) : [];
  if (!items.length) {
    // Maybe they're in the message before: look a little further back in this conversation.
    const prev = await prisma.chatMessage.findMany({ where: { conversationId: turn.conversationId, role: "assistant", createdAt: { gte: new Date(Date.now() - 60 * 60_000) } }, orderBy: { createdAt: "desc" }, take: 3 });
    const earlier = prev.flatMap((m) => ((m.actions as ItemAction[] | null) ?? []).filter((a) => a.op === "create" && (a.type === "todo" || a.type === "task")));
    if (!earlier.length) return save(turn, "Which ones? Tell me the items and I'll add them.");
    items.push(...earlier);
  }
  const todos = items.filter((a) => a.type !== "event");
  return save(turn, `Got it — they're already on your list: ${todos.map((a) => a.title).join(" · ")}. I'll keep you on them.`);
}

// ---- a day update -----------------------------------------------------------------------------

const fmtWhenShort = (d: Date) => {
  const now = new Date();
  const day = d.toDateString() === now.toDateString() ? "today" : d.toDateString() === new Date(now.getTime() + 86_400_000).toDateString() ? "tomorrow" : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  return d.getHours() || d.getMinutes() ? `${day} ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(":00", "").replace(" ", "").toLowerCase()}` : day;
};

/**
 * Everything in a "here's my day" message, done by code: sleep logged, quizzes/tests on the calendar
 * with study to-dos, requested to-dos (no duplicates), meetings to set up (then asks when), and the
 * rest into the journal. The reply lists exactly what was done — nothing the code didn't do.
 */
async function handleUpdate(turn: Turn, text: string, x: Extracted, knownHabits?: { id: string; name: string; area: string }[]): Promise<AssistantReply> {
  const { userId, source } = turn;
  const actions: ItemAction[] = [];
  const lines: string[] = [];
  const open = await prisma.todo.findMany({ where: { userId, status: "open" }, select: { id: true, title: true } });
  const already: string[] = [];
  const touched: string[] = [];
  const addTodo = async (title: string, due: Date | null, priority = "medium") => {
    const dupe = open.find((o) => sameTask(o.title, title));
    if (dupe) {
      already.push(dupe.title);
      touched.push(dupe.title);
      return null;
    }
    touched.push(title.slice(0, 200));
    const todo = await prisma.todo.create({ data: { userId, title: title.slice(0, 200), dueAt: due, priority, area: keywordArea(title) ?? "work", source } });
    open.push({ id: todo.id, title: todo.title });
    actions.push({ op: "create", type: "todo", id: todo.id, title: todo.title, area: todo.area, href: "/work", detail: due ? `due ${fmtWhenShort(due)}` : undefined });
    return todo;
  };

  if (x.sleep) {
    const day = getStartOfDay(new Date());
    const before = await prisma.dailyEntry.findUnique({ where: { userId_date: { userId, date: day } }, select: { sleepHours: true } });
    const entry = await prisma.dailyEntry.upsert({
      where: { userId_date: { userId, date: day } },
      update: { sleepHours: x.sleep.hours, ...(x.sleep.bedtime ? { bedtime: x.sleep.bedtime } : {}) },
      create: { userId, date: day, sleepHours: x.sleep.hours, ...(x.sleep.bedtime ? { bedtime: x.sleep.bedtime } : {}) },
    });
    const h = Math.floor(x.sleep.minutes / 60);
    const m = x.sleep.minutes % 60;
    actions.push({ op: "update", type: "sleep", id: entry.id, title: `${h}h${m ? ` ${m}m` : ""}`, area: "physical", href: "/chat?tab=journal", detail: "logged", prev: before?.sleepHours != null ? String(before.sleepHours) : null });
  }
  for (const a of x.assessments) {
    const end = a.start.getHours() || a.start.getMinutes() ? new Date(a.start.getTime() + 3_600_000) : new Date(a.start.getTime() + 86_400_000);
    const { event, onGoogle } = await createEvent(userId, { title: a.title, start: a.start, end, allDay: !(a.start.getHours() || a.start.getMinutes()) });
    actions.push({ op: "create", type: "event", id: event.id, title: a.title, area: "work", href: "/schedule", detail: `${fmtWhenShort(a.start)}${onGoogle ? " · on Google Calendar" : ""}` });
    const due = prepDue(a.start);
    const todo = await addTodo(cap(a.prepTitle), due, "high");
    if (todo) {
      await prisma.calendarEvent.update({ where: { id: event.id }, data: { todoId: todo.id } });
      const r = await prisma.reminder.create({ data: { userId, text: todo.title, fireAt: due, todoId: todo.id } });
      actions.push({ op: "create", type: "reminder", id: r.id, title: todo.title, area: "work", href: "/work", detail: fmtWhenShort(due) });
    }
  }
  // What he asked for in this message comes first, so "those two" later means these.
  const assessmentItems = [...touched];
  touched.length = 0;
  for (const t of x.todos) await addTodo(t.title, t.due);
  touched.push(...assessmentItems);
  let ask: Awaiting | null = null;
  let question: string | null = null;
  let options: string[] | null = null;
  for (const m of x.meetings) {
    const todo = await addTodo(cap(m.title), null, "high");
    if (todo && !ask) {
      ask = { kind: "meeting_when", refs: [], meeting: { todoId: todo.id, title: m.who ? `Meeting with ${m.who}` : "Meeting" } };
      question = `When is the meeting${m.who ? ` with ${m.who}` : ""}? I'll put it on your calendar (or say "not set yet").`;
      options = ["Not set yet"];
    }
  }
  for (const e of x.events) {
    const prep = needsPrep(e.title);
    const { event, onGoogle } = await createEvent(userId, { title: e.title, start: e.start, end: e.end, allDay: e.allDay });
    actions.push({ op: "create", type: "event", id: event.id, title: e.title, area: "general", href: "/schedule", detail: `${describeEventTime(event)}${onGoogle ? " · on Google Calendar" : ""}` });
    touched.push(e.title);
    if (prep === "yes") await addPrep(turn, event, text, actions);
    else {
      const r = await eventReminder(userId, event);
      if (r) actions.push({ op: "create", type: "reminder", id: r.id, title: r.text, area: "general", href: "/schedule", detail: fmtDue(r.fireAt) });
    }
    // One follow-up at a time: the first event missing a time (or prep answer) gets the question.
    if (!ask) {
      const q = nextEventQuestion({ id: event.id, title: e.title, askPrep: prep === "ask" }, e.hasTime, false);
      if (q) {
        ask = q.awaiting;
        question = `${e.title}: ${lowerFirst(q.text)}`;
        options = q.options;
      }
    }
  }
  // Plans the patterns missed: the model proposes, code keeps only what's grounded in his words.
  for (const p of await secondLook(x.reflection)) {
    if (p.kind === "todo") {
      await addTodo(p.title, p.date);
      continue;
    }
    if (x.events.some((e) => sameTask(e.title, p.title))) continue;
    const start = p.date!;
    if (!p.hasTime) start.setHours(0, 0, 0, 0);
    const { event, onGoogle } = await createEvent(userId, { title: p.title, start, end: new Date(start.getTime() + (p.hasTime ? 3_600_000 : 86_400_000)), allDay: !p.hasTime });
    actions.push({ op: "create", type: "event", id: event.id, title: p.title, area: "general", href: "/schedule", detail: `${describeEventTime(event)}${onGoogle ? " · on Google Calendar" : ""}` });
    touched.push(p.title);
    const r = await eventReminder(userId, event);
    if (r) actions.push({ op: "create", type: "reminder", id: r.id, title: r.text, area: "general", href: "/schedule", detail: fmtDue(r.fireAt) });
  }
  // Done things: workouts tick the Workout habit, meals get nutrition estimated from just their clause.
  for (const w of x.workouts) actions.push(...(await applyCapture(userId, [{ kind: "workout", title: w, area: "physical", done: true }], w, source)));
  for (const m of x.meals) actions.push(...(await applyCapture(userId, [{ kind: "meal", title: m.name, area: "physical", done: true }], m.text, source)));
  // Habits he says he did (or didn't): ticked, or noted ("60 oz of 100"). A logged workout already ticks Workout.
  const habits = knownHabits ?? (await prisma.habit.findMany({ where: { userId, isActive: true }, select: { id: true, name: true, area: true } }));
  const reports = parseHabitReports(text, habits).filter((r) => !(isWorkoutHabit(r.habit.name) && x.workouts.length));
  for (const r of reports) actions.push(await logHabit(userId, r, habits.find((h) => h.id === r.habit.id)?.area));
  // Clauses that were only about habits aren't journal material.
  const unclaimed = x.reflection.filter((c) => !parseHabitReports(c, habits).length);
  x = { ...x, reflection: unclaimed };
  // How the day went (and anything else) goes in the journal.
  if (x.reflection.join(" ").length >= 20) {
    const j = await applyCapture(userId, [{ kind: "journal", title: "Journal", area: "mental" }], text, source);
    actions.push(...j);
  }

  if (!actions.length && !already.length) return routeAndReply(turn, text, false, { conversational: false });
  lines.push(describeActions(actions));
  if (already.length) lines.push(`Already on your list: ${[...new Set(already)].join(" · ")}`);
  // Two or more new plain to-dos: which matters most (same question the router path asks).
  if (!ask && actions.length && actions.every((a) => a.type === "todo" && a.op === "create" && !a.detail)) {
    const triage = clarifyFor(actions);
    if (triage) {
      ask = triage;
      question = questionFor(triage);
    }
  }
  if (question) lines.push(question);
  return save(turn, lines.filter(Boolean).join("\n"), { actions, awaiting: ask, meta: { ...(ask && options ? { options } : {}), items: [...new Set(touched)] } });
}

async function answerMeeting(turn: Turn, meeting: NonNullable<Awaiting["meeting"]>, text: string): Promise<AssistantReply | null> {
  const { userId } = turn;
  if (/\b(not (set|sure|yet)|idk|don'?t know|tbd|later|no idea)\b/i.test(text)) return save(turn, "Okay — it stays on your list to set up. Tell me the time once you have it.");
  const found = chrono.parse(text, new Date(), { forwardDate: true })[0];
  if (!found) return null;
  const start = found.start.date();
  const hasTime = found.start.isCertain("hour");
  if (hasTime && !found.start.isCertain("meridiem") && start.getHours() >= 1 && start.getHours() <= 6) start.setHours(start.getHours() + 12);
  if (!hasTime) start.setHours(0, 0, 0, 0);
  const end = found.end?.date() ?? new Date(start.getTime() + (hasTime ? 3_600_000 : 86_400_000));
  const { event, onGoogle } = await createEvent(userId, { title: meeting.title, start, end, allDay: !hasTime });
  // It's set up now: tick off "Set up meeting with …".
  await prisma.todo.updateMany({ where: { id: meeting.todoId, userId, status: "open" }, data: { status: "done", completedAt: new Date() } });
  const actions: ItemAction[] = [
    { op: "create", type: "event", id: event.id, title: meeting.title, area: "work", href: "/schedule", detail: `${describeEventTime(event)}${onGoogle ? " · on Google Calendar" : ""}` },
    { op: "complete", type: "todo", id: meeting.todoId, title: `Set up ${meeting.title.charAt(0).toLowerCase()}${meeting.title.slice(1)}`, area: "work", href: "/work" },
  ];
  const r = await eventReminder(userId, event);
  if (r) actions.push({ op: "create", type: "reminder", id: r.id, title: r.text, area: "work", href: "/schedule", detail: fmtDue(r.fireAt) });
  const q = nextEventQuestion({ id: event.id, title: meeting.title }, hasTime, false);
  const reply = [describeActions(actions), q?.text].filter(Boolean).join("\n");
  return save(turn, reply, { actions, awaiting: q?.awaiting ?? null, meta: q ? { options: q.options } : null });
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Tick a habit for today, or note how far he got. Undo puts the old log back. */
async function logHabit(userId: string, r: HabitReport, area = "general"): Promise<ItemAction> {
  const today = getStartOfDay(new Date());
  // "went to bed at 11:30 last night" is yesterday's habit.
  const day = r.yesterday ? new Date(today.getTime() - 86_400_000) : today;
  const notes = r.note && r.note !== "not done" ? r.note : null;
  const before = await prisma.habitLog.findUnique({ where: { habitId_date: { habitId: r.habit.id, date: day } }, select: { completed: true, notes: true } });
  await prisma.habitLog.upsert({
    where: { habitId_date: { habitId: r.habit.id, date: day } },
    update: { completed: r.done, notes },
    create: { habitId: r.habit.id, date: day, completed: r.done, notes },
  });
  await recomputeCategoryScoreForDate(userId, day);
  const prev = JSON.stringify(before);
  const when = r.yesterday ? " (last night)" : "";
  const detail = r.done
    ? notes ? `${notes}${when}` : r.yesterday ? "last night" : undefined
    : r.note === "not done" ? `not done${r.yesterday ? " yesterday" : " today"} (noted)` : / oz of /.test(r.note ?? "") ? `${r.note} — noted, not there yet` : `${r.note}${when} — missed (noted)`;
  return r.done
    ? { op: "complete", type: "routine", id: r.habit.id, title: r.habit.name, area, href: "/work?tab=habits", detail, prev, ...(r.yesterday ? { day: day.toISOString() } : {}) }
    : { op: "update", type: "routine", id: r.habit.id, title: r.habit.name, area, href: "/work?tab=habits", detail, prev, ...(r.yesterday ? { day: day.toISOString() } : {}) };
}

const DELETE_ITEM = /^\s*(?:please\s+|can you\s+)?(?:delete|remove|cancel|get rid of|take off|scratch|drop|clear)\s+(?:the\s+|my\s+)?(.+?)(?:\s+(?:one|item|todo|to-do|task|reminder))?(?:\s+(?:from|off)\s+(?:of\s+)?(?:my\s+|the\s+)?(?:list|todos?|to-?do list|reminders))?\s*[.!]*$/i;
const MARK_DONE = /^\s*(?:please\s+|can you\s+)?(?:mark|set)\s+(?:the\s+|my\s+)?(.+?)\s+(?:as\s+)?(?:done|complete|completed|finished)\s*[.!]*$|^\s*(?:please\s+|can you\s+)?(?:check|tick|cross)\s+off\s+(?:the\s+|my\s+)?(.+?)\s*[.!]*$/i;
const FEELING_WORDS = "unmotivated|tired|stressed|sad|down|anxious|lazy|burnt out|burned out|overwhelmed|bored|lonely|angry|annoyed|good|great|happy|motivated|proud|exhausted|drained|off|behind|stuck";
const FEELING = {
  test: (t: string) =>
    new RegExp(`^\\s*(?:(?:honestly|ngl|tbh|man|bro|ugh|so|lowkey|lwk)[,\\s]+)*(?:i'?m|i am|im|i feel|i felt|feeling|i'?ve been|been feeling)\\s+(?:(?:kinda|kind of|really|so|pretty|super|a bit|a little|lowkey|very|hella|mad|lwk)\\s+)*(?:${FEELING_WORDS})\\b`, "i").test(t) ||
    // "ngl kinda tired today": the whole message is the feeling.
    new RegExp(`^\\s*(?:(?:honestly|ngl|tbh|man|bro|ugh|lowkey|lwk)[,\\s]+)*(?:(?:kinda|kind of|really|so|pretty|super|a bit|lowkey|very|hella|mad)\\s+)*(?:${FEELING_WORDS})(?:\\s+(?:today|rn|right now|lol|af|asf|tbh|ngl|fr))*[.!]*\\s*$`, "i").test(t),
};
const MEAL_LINE = /^\s*(?:for\s+)?(breakfast|brunch|lunch|dinner|snack)\s*(?::|-|was|is|i had|i ate|=)\s*(.{3,})$/i;
const CORRECTION = /^\s*(?:actually|no wait|wait|sorry|oops|my bad|correction)\b[,!\s]*|^\s*(?:make (?:that|it)|change (?:that|it) to|it'?s actually|its actually)\b/i;

/** Messages that are clearly not an answer to the plan interview: handled normally, the interview waits. */
function offPlan(text: string) {
  const t = text.trim();
  if (/^(note|notes)\s*:|^(lol|lmao|haha|btw|yo|hey|thanks|thank you|who are you|what can you do)\b/i.test(t)) return true;
  // A question of his own ("what's the weather tomorrow") isn't an answer — unless it's about the plan itself.
  if ((/\?\s*$/.test(t) || /^(what|when|where|who|how|why|can you|could you|do i|did i|is there|are there)\b/i.test(t)) && /\b(my|calendar|weather|score|due|reminders?|birthday|eat|ate|protein|calories|today|tomorrow|week)\b/i.test(t)) return true;
  const x = extractUpdate(t);
  return actionableCount(x) > 0 || /\bremind me\b/i.test(t);
}

/** Fix the item just made: a new due date, a new time, a corrected amount. */
async function correctLast(turn: Turn, recentActions: ItemAction[], text: string): Promise<AssistantReply | null> {
  const { userId } = turn;
  // "no" to the share question comes between the event and "actually its at 2": look back a few replies.
  const earlier = await prisma.chatMessage.findMany({ where: { conversationId: turn.conversationId, role: "assistant", createdAt: { gte: new Date(Date.now() - 30 * 60_000) } }, orderBy: { createdAt: "desc" }, take: 4, select: { actions: true } });
  const lastActions = [...earlier.reverse().flatMap((m) => (m.actions as ItemAction[] | null) ?? []), ...recentActions];
  const body = text.replace(CORRECTION, "").replace(/^(?:make (?:that|it)|change (?:that|it) to)\s*/i, "").trim();
  const ev = [...lastActions].reverse().find((a) => a.type === "event" && (a.op === "create" || a.op === "update"));
  if (ev && /\d|\b(noon|morning|evening|tonight|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|after)\b/i.test(body)) {
    const e = await prisma.calendarEvent.findFirst({ where: { id: ev.id, userId } });
    if (e) {
      const phrase = body.replace(/^(?:it'?s|its|it is)\s+(?:at\s+)?/i, "").replace(/^at\s+/i, "");
      const moved = await newTime(userId, phrase, e.start);
      if (moved) {
        const r = await moveEvent(userId, e.title, phrase);
        if (r?.before) return save(turn, r.reply, { actions: [{ op: "update", type: "event", id: e.id, title: e.title, area: "general", href: "/schedule", detail: "moved", prev: JSON.stringify(r.before) }] });
      }
    }
  }
  const td = [...lastActions].reverse().find((a) => a.type === "todo" && a.op === "create");
  if (td && /\b(due|by|tomorrow|tonight|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next|at \d)\b/i.test(body)) {
    const w = parseWhen(body.replace(/^due\s+/i, ""));
    if (w) {
      const before = await prisma.todo.findFirst({ where: { id: td.id, userId } });
      if (before) {
        await prisma.todo.update({ where: { id: td.id }, data: { dueAt: w.date } });
        return save(turn, `💼 ${before.title} — now due ${fmtWhenShort(w.date)}`, { actions: [{ op: "update", type: "todo", id: td.id, title: before.title, area: before.area, href: "/work", detail: `due ${fmtWhenShort(w.date)}`, prev: JSON.stringify({ dueAt: before.dueAt }) }] });
      }
    }
  }
  const hb = [...lastActions].reverse().find((a) => a.type === "routine");
  const amount = body.match(/(\d+(?:\.\d+)?)\s*(oz|ounces?|bottles?|cups?|liters?|l)\b/i);
  if (hb && amount) {
    const habit = await prisma.habit.findFirst({ where: { id: hb.id, userId }, select: { id: true, name: true, area: true } });
    const report = habit ? parseHabitReports(`drank ${amount[0]} of water`, [habit])[0] : null;
    if (report) {
      const a = await logHabit(userId, report, habit!.area);
      return save(turn, describeActions([a]), { actions: [a] });
    }
  }
  return null;
}

const FEEL_NOTE = `He's telling you how he feels. Reply in 1-2 short sentences: acknowledge it plainly (never "good to know"), then suggest ONE small concrete next step from his day (one easy habit, or 10 minutes on a to-do). No lists, no lecture, no questions.`;

/** After sharing without Google: the hint to connect it, for accounts that can. */
async function googleHint(userId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { integrations: true } });
  return u?.integrations ? ". (Connect Google Calendar on the Schedule page so they get an invite.)" : ".";
}

/** Delete an open to-do or pending reminder by name. Undo recreates it. */
async function deleteByName(turn: Turn, name: string): Promise<AssistantReply | null> {
  const { userId } = turn;
  const target = name.replace(/^(the|my)\s+/i, "").trim();
  if (!target || /^(it|that|this|them|those|everything|all|that one|this one)$/i.test(target)) return null;
  const say = (a: ItemAction) => save(turn, describeActions([a]), { actions: [a] });
  const wantsKind = /\breminder\b/i.test(name) ? "reminder" : /\bmeal\b/i.test(name) ? "meal" : null;
  if (!wantsKind) {
    const events = await prisma.calendarEvent.findMany({ where: { userId, status: "confirmed", end: { gte: getStartOfDay(new Date()) } }, orderBy: { start: "asc" } });
    const ev = events.find((e) => nameMatches(target, e.title));
    if (ev) {
      await prisma.reminder.deleteMany({ where: { userId, status: "pending", text: { startsWith: `📅 ${ev.title}` } } });
      await deleteEvent(userId, ev.id);
      return say({ op: "delete", type: "event", id: ev.id, title: ev.title, area: "general", href: "/schedule", detail: "removed from your calendar", prev: JSON.stringify(ev) });
    }
    const todos = await prisma.todo.findMany({ where: { userId, status: "open" } });
    const todo = todos.find((t) => nameMatches(target, t.title)) ?? todos.find((t) => sameTask(target, t.title)) ?? bestMatch(target, todos, 0.5);
    if (todo) {
      await prisma.reminder.deleteMany({ where: { userId, todoId: todo.id, status: "pending" } });
      await prisma.todo.delete({ where: { id: todo.id } });
      return say({ op: "delete", type: "todo", id: todo.id, title: todo.title, area: todo.area, href: "/work", prev: JSON.stringify(todo) });
    }
  }
  if (wantsKind !== "meal") {
    const reminders = await prisma.reminder.findMany({ where: { userId, status: "pending" } });
    const rem = reminders.find((r) => nameMatches(target, r.text));
    if (rem) {
      await prisma.reminder.delete({ where: { id: rem.id } });
      return say({ op: "delete", type: "reminder", id: rem.id, title: rem.text, area: "general", href: "/work", prev: JSON.stringify(rem) });
    }
  }
  if (wantsKind !== "reminder") {
    const meals = await prisma.meal.findMany({ where: { userId, createdAt: { gte: new Date(Date.now() - 36 * 3_600_000) } }, orderBy: { createdAt: "desc" } });
    const meal = meals.find((m) => nameMatches(target, m.name));
    if (meal) {
      await prisma.meal.delete({ where: { id: meal.id } });
      return say({ op: "delete", type: "meal", id: meal.id, title: meal.name, area: "physical", href: "/meals", prev: JSON.stringify(meal) });
    }
  }
  return save(turn, `I couldn't find "${target}" on your calendar, to-dos, reminders or meals — what's it called?`);
}

const TASK_STOP = new Set(["for", "the", "my", "a", "an", "to", "on", "of", "and", "do", "some", "work"]);
const taskWords = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w && !TASK_STOP.has(w)).map((w) => w.replace(/(ing|s)$/, "")));
/** Same task? Every meaningful word of the shorter one is in the longer ("Study bio" = "Study for bio quiz", but not "Study math"). */
export function sameTask(a: string, b: string) {
  const [x, y] = [taskWords(a), taskWords(b)].sort((p, q) => p.size - q.size);
  return x.size > 0 && [...x].every((w) => y.has(w));
}
