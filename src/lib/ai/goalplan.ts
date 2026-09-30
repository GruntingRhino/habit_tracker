import prisma from "@/lib/prisma";
import { chat, parseJson } from "@/lib/ai/llm";
import { AREAS } from "@/lib/areas";
import type { PlanDraft, PlanState } from "@/lib/ai/conversation";

/**
 * Goal coach: "I want to get really good at MMA" → a few short clarifying questions
 * (with tap-to-answer options) → a concrete plan that can be saved as a project.
 */

/**
 * What to learn before planning, in order. Only the first question depends on the goal, so
 * only it is written by the model; the rest are fixed (instant, and a 1.7B model can't copy
 * an example into them). Each answer is stored under its label, and the planner sees a
 * labeled profile, which small models follow far better than a Q/A transcript.
 */
interface Topic {
  label: string;
  fixed?: { question: string; options: string[] };
}
const TOPICS: Topic[] = [
  { label: "Focus" },
  { label: "Level", fixed: { question: "Where are you at with it right now?", options: ["Total beginner", "Some experience", "Pretty experienced"] } },
  { label: "Success and deadline", fixed: { question: "What would success look like, and by when?", options: ["Compete or perform", "Hit a specific goal", "Get fit or healthy", "Just for fun"] } },
  { label: "Time per week", fixed: { question: "How much time can you give it each week?", options: ["Under 3 hours", "3-6 hours", "6-10 hours", "10+ hours"] } },
  { label: "Access and limits", fixed: { question: "What do you have access to (place, coach, gear), and any injuries or limits?", options: ["All set, no limits", "Need a place or coach", "Tight budget", "Have an injury"] } },
];

// "I want to…", "help me…", "how do I…" followed by a growth verb. "I need/have to" stays a task.
const GOAL_START =
  /\b(i (really )?(want to|wanna|would like to|am trying to|hope to)|i'?d (really )?like to|i'?m trying to|help me( to)?|how (do|can|should|would) i|teach me( how)?( to)?|coach me( on| in| to)?|my goal is to)\s+(get (really |very |super |way |a lot |much )?(good|better|great|fit|stronger|faster|shredded|lean|in shape|into)|become|learn|master|improve|build|start|train|lose|gain|bulk|cut|save|quit|stop|read more|run a|compete|go pro|make money|grow)\b/i;
const PLAN_REQUEST = /\b(make|build|create|give|write|design)( me)? (a |an |my )?(plan|roadmap|program|training plan|routine|schedule) (for|to)\b/i;

export function looksLikeGoal(text: string) {
  return text.length <= 400 && (GOAL_START.test(text) || PLAN_REQUEST.test(text) || PLAN_ASK.test(text));
}

// He doesn't want plans made for him by default: the interview only runs when he asks for a plan.
const PLAN_ASK = /\bhelp me plan\b|\bplan (it|this|that) out\b|\b(turn|make) (it|this|that) (into )?a plan\b|\bplan for (it|this|that)\b/i;
export function wantsPlan(text: string) {
  return PLAN_REQUEST.test(text) || PLAN_ASK.test(text);
}


export const SKIP_QUESTIONS = /\b(just|go ahead( and)?|now)? ?(make|give|build|write|show)( me)? (the |a |my )?plan\b|\bskip\b|enough questions|that'?s (it|all|enough)|you have enough/i;
export const CANCEL_PLAN = /^\s*(cancel|stop|nevermind|never mind|forget it|nvm|quit)\b/i;
export const REVISE_PLAN = /\b(update|change|adjust|tweak|revise|rework|modify|redo)\b.*\bplan\b|\bplan\b.*\b(harder|easier|shorter|longer|less|more|lighter|heavier)\b|\bmake it (harder|easier|shorter|longer|lighter|more|less)\b/i;

const QUESTION_SCHEMA = {
  type: "object",
  properties: {
    question: { type: "string" },
    options: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 4 },
  },
  required: ["question", "options"],
};

// Keep byte-for-byte stable for the prompt cache.
const QUESTION_SYSTEM = `You are a friendly coach helping Abhay turn a goal into a plan. Ask him ONE short question: which kind, style or part of his goal he wants to focus on. Give 2-4 tap-to-answer options that are real kinds or styles of THAT goal. Reply with minified JSON only: {"question":"...","options":["...","..."]}
- question: under 14 words, casual, uses "you", names his goal.
- options: 1-4 words each.
- If his goal already says the kind or style, reply {"question":"","options":["-","-"]}.
Example: Goal: get really good at MMA
{"question":"Which side of MMA pulls you in most?","options":["Striking","Grappling","All-round","Not sure yet"]}
Example: Goal: learn to cook
{"question":"What kind of cooking do you want to get good at?","options":["Quick weeknight meals","Baking","Meal prep","Grilling"]}
Example: Goal: learn acoustic guitar
{"question":"","options":["-","-"]}`;

/** Example question → the word the goal must contain for a copy of it to make sense. */
const EXAMPLE_QUESTIONS: Record<string, string> = {
  "which side of mma pulls you in most?": "mma",
  "what kind of cooking do you want to get good at?": "cook",
};

const PLAN_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    area: { type: "string", enum: [...AREAS] },
    weekly: { type: "array", items: { type: "string" } },
    steps: {
      type: "array",
      items: {
        type: "object",
        properties: { title: { type: "string" }, when: { type: "string" } },
        required: ["title", "when"],
      },
    },
    first: { type: "string" },
  },
  required: ["title", "summary", "area", "weekly", "steps", "first"],
};

// Keep byte-for-byte stable for the prompt cache.
const PLAN_SYSTEM = `You are an expert coach. Write Abhay a realistic, specific plan for his goal, built on everything he told you. Reply with minified JSON only:
{"title":"...","summary":"...","area":"physical","weekly":["..."],"steps":[{"title":"...","when":"..."}],"first":"..."}
- title: 2-5 words. summary: 1-2 sentences on the approach and why it fits him.
- weekly: 2-4 recurring habits with how often ("Muay Thai class 3x/week").
- steps: 4-7 ordered milestones, each starts with a verb, under 12 words; when: rough timing ("Week 1", "Month 2").
- first: the one concrete thing to do today or tomorrow.
- area: physical, mental, financial, spiritual, work, or general.
Fit his level, time per week, access and limits. Use his deadline exactly: the title and the last step's "when" match it. If he gave no deadline, pick a realistic one in weeks or months. Name real specifics (techniques, drills, resources, numbers). No generic filler.
Example profile: Goal: learn acoustic guitar / Level: Total beginner / Success and deadline: play songs at a campfire in 3 months / Time per week: 30 min a day / Access and limits: owns a guitar
{"title":"Campfire Guitar in 90 Days","summary":"Daily short practice on the 4 chords behind most campfire songs, then strumming and full songs, so you can play a set by month 3.","area":"mental","weekly":["30-min practice 6x/week","Learn 1 new song every Sunday"],"steps":[{"title":"Tune up and learn G, C, D, Em","when":"Week 1"},{"title":"Switch chords cleanly at 60 bpm","when":"Week 2-3"},{"title":"Learn down-down-up-up-down-up strumming","when":"Week 3"},{"title":"Play 'Horse With No Name' start to finish","when":"Week 4"},{"title":"Add capo and 3 more songs","when":"Month 2"},{"title":"Play a 5-song set for a friend","when":"Month 3"}],"first":"Tune your guitar and learn the G chord from JustinGuitar lesson 1"}`;

function brief(state: PlanState) {
  return [`Goal: ${state.goal}`, ...state.qa.map((x) => `${x.label ?? x.q}: ${x.a}`)].join("\n");
}

export interface NextQuestion {
  question: string;
  options: string[];
  topic: number;
}

/** The next clarifying question, or null once every topic is covered. */
export async function nextQuestion(state: PlanState): Promise<NextQuestion | null> {
  const topic = state.topic ?? 0;
  const t = TOPICS[topic];
  if (!t) return null;
  if (t.fixed) return { ...t.fixed, topic };

  const result = await chat({
    messages: [
      { role: "system", content: QUESTION_SYSTEM },
      { role: "user", content: `Goal: ${state.goal}` },
    ],
    schema: QUESTION_SCHEMA,
    temperature: 0.3,
    maxTokens: 80,
    timeoutMs: 90_000,
  });
  const parsed = parseJson<{ question?: string; options?: string[] }>(result.content);
  const question = parsed?.question?.trim() ?? "";
  if (!question) return nextQuestion({ ...state, topic: topic + 1 }); // the goal already names the kind
  const needs = EXAMPLE_QUESTIONS[question.toLowerCase()];
  if (needs && !state.goal.toLowerCase().includes(needs)) {
    return { question: "What part of it do you want to focus on most?", options: [], topic };
  }
  const options = (parsed?.options ?? []).map((o) => o.trim()).filter((o) => o.length > 1 && o.length <= 40).slice(0, 4);
  return { question: question.slice(0, 200), options, topic };
}

export async function buildPlan(state: PlanState, revision?: string): Promise<PlanDraft | null> {
  const extra = revision && state.plan ? `\nCurrent plan: ${renderPlan(state.plan).replace(/\n/g, " ")}\nChange requested: ${revision}` : "";
  const result = await chat({
    messages: [
      { role: "system", content: PLAN_SYSTEM },
      { role: "user", content: `${brief(state)}${extra}` },
    ],
    schema: PLAN_SCHEMA,
    temperature: 0.4,
    maxTokens: 650,
    timeoutMs: 240_000,
  });
  const p = parseJson<Partial<PlanDraft>>(result.content);
  if (!p?.title || !p.steps?.length) return null;
  const line = (s: unknown, n: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
  return {
    title: line(p.title, 60),
    summary: line(p.summary, 400),
    area: (AREAS as readonly string[]).includes(p.area ?? "") ? p.area! : "general",
    weekly: (p.weekly ?? []).map((w) => line(w, 90)).filter(Boolean).slice(0, 5),
    steps: p.steps
      .map((s) => ({ title: line(s?.title, 120), when: line(s?.when, 30) || undefined }))
      .filter((s) => s.title)
      .slice(0, 8),
    first: line(p.first, 160),
  };
}

/** Plain-text plan for Telegram, history previews and the model's own context. */
export function renderPlan(p: PlanDraft) {
  return [
    `${p.title}`,
    p.summary,
    p.weekly.length ? `Every week:\n${p.weekly.map((w) => `- ${w}`).join("\n")}` : "",
    `Steps:\n${p.steps.map((s, i) => `${i + 1}. ${s.title}${s.when ? ` (${s.when})` : ""}`).join("\n")}`,
    p.first ? `Start now: ${p.first}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export const __test = { QUESTION_SYSTEM, PLAN_SYSTEM, GOAL_START };

function planDescription(p: PlanDraft) {
  return [p.summary, p.weekly.length ? `Every week:\n${p.weekly.map((w) => `- ${w}`).join("\n")}` : "", p.first ? `Start now: ${p.first}` : ""]
    .filter(Boolean)
    .join("\n\n");
}

function planTasks(p: PlanDraft) {
  return [
    ...(p.first ? [{ title: p.first.slice(0, 200), order: 0, priority: "high", area: p.area }] : []),
    ...p.steps.map((s, i) => ({ title: s.title, description: s.when ?? null, order: i + 1, priority: i === 0 ? "high" : "medium", area: p.area })),
  ];
}

/** A plan becomes a project: summary and weekly habits in the description, steps as ordered tasks. */
export async function createPlanProject(userId: string, p: PlanDraft) {
  const project = await prisma.project.create({
    data: { userId, title: p.title, description: planDescription(p), area: p.area, priority: "high", tasks: { create: planTasks(p) } },
  });
  return project.id;
}

/** Rewrite an existing plan project in place. False if the project no longer exists. */
export async function applyPlanToProject(userId: string, projectId: string, p: PlanDraft) {
  const project = await prisma.project.findFirst({ where: { id: projectId, userId } });
  if (!project) return false;
  await prisma.$transaction([
    prisma.projectTask.deleteMany({ where: { projectId } }),
    prisma.project.update({
      where: { id: projectId },
      data: { title: p.title, description: planDescription(p), area: p.area, tasks: { create: planTasks(p) } },
    }),
  ]);
  return true;
}

const GOAL_LEAD =
  /\b(help me plan( out| for| to| how to)?|i (really )?(want to|wanna|would like to|am trying to|hope to)|i'?d (really )?like to|i'?m trying to|help me( to)?|how (do|can|should|would) i|teach me( how)?( to)?|coach me( on| in| to)?|my goal is to|(make|build|create|give|write|design)( me)? (a |an |my )?(plan|roadmap|program|training plan|routine|schedule) (for|to))\s+/i;

/** "I want to get really good at MMA" → "Get really good at MMA". */
export function goalTitle(goal: string) {
  const lead = goal.match(GOAL_LEAD);
  const rest = lead?.index !== undefined ? goal.slice(lead.index + lead[0].length) : goal;
  const core = rest.replace(/[.!?]+$/, "").replace(/\s+(instead|please|pls|lol|tho|though)$/i, "").trim() || goal.trim();
  const title = core.length > 60 ? `${core.slice(0, 58).replace(/\s+\S*$/, "")}…` : core;
  return title.charAt(0).toUpperCase() + title.slice(1);
}

/** Explicitly starting over with a different goal while one is being planned. */
export const NEW_PLAN = /\b(new|another|different|separate) (plan|goal)\b|\binstead\b|\bforget (that|this|it)\b/i;
/** Asking for a cancelled or undone plan back. */
export const PLAN_AGAIN =
  /\b(make|build|redo|restart|start|bring back|do|create|want)\b.{0,25}\bplan\b.{0,20}\b(again|anyway|back|after all)\b|\bplan (it|that) again\b|\bbring (it|that|the plan) back\b|\b(restore|undo) (the |my |that )?(plan|undo)\b|\bi changed my mind\b/i;

export function topicLabel(index: number) {
  return TOPICS[index]?.label;
}
