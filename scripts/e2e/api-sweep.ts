/* eslint-disable @typescript-eslint/no-explicit-any -- test script: loose JSON handling on purpose */
/**
 * Exercises every API route: happy paths, validation errors, missing ids, and the access gate.
 * Usage: APP_URL=http://127.0.0.1:3101 DATABASE_URL=…/li_e2e2 npx tsx --tsconfig tsconfig.json scripts/e2e/api-sweep.ts
 */
import prisma from "@/lib/prisma";
import { seed } from "./seed";

if (!/test|e2e/.test(process.env.DATABASE_URL ?? "")) throw new Error("Refusing: not a test database");
const BASE = process.env.APP_URL ?? "http://127.0.0.1:3101";
const OWNER = { "Tailscale-User-Login": process.env.OWNER_EMAIL ?? "e2e@test.local" };

let pass = 0;
const failures: string[] = [];

async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = OWNER) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...headers, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json: json as any, text };
}

async function expect(label: string, method: string, path: string, body: unknown, want: number | number[], check?: (json: any) => string | null) {
  const r = await call(method, path, body);
  const wants = Array.isArray(want) ? want : [want];
  const problem = !wants.includes(r.status) ? `status ${r.status} (want ${wants.join("/")}) ${r.text.slice(0, 160)}` : check?.(r.json) ?? null;
  if (problem) failures.push(`${label}: ${method} ${path} → ${problem}`);
  else pass++;
  return r.json;
}

async function main() {
  const { thesisId } = await seed();
  const iso = (d: Date) => d.toISOString();
  const tomorrow = new Date(Date.now() + 86400000);

  // Old pages redirect into their new homes
  for (const [from, to] of [["/projects", "/todos"], ["/projects/abc", "/todos?project=abc"], ["/notes", "/entry?tab=notes"], ["/weights", "/habits"]]) {
    const r = await fetch(`${BASE}${from}`, { headers: OWNER, redirect: "manual" });
    if ([307, 308].includes(r.status) && (r.headers.get("location") ?? "").includes(to)) pass++;
    else failures.push(`redirect ${from}: ${r.status} → ${r.headers.get("location")}`);
  }

  // Access gate
  for (const [label, h] of [["no header", {}], ["wrong login", { "Tailscale-User-Login": "intruder@evil.com" }]] as const) {
    const r = await call("GET", "/api/todos", undefined, h);
    if (r.status === 403) pass++;
    else failures.push(`gate ${label}: ${r.status}`);
  }

  // Status, scores, export
  await expect("status", "GET", "/api/status", undefined, 200);
  await expect("scores", "GET", "/api/scores", undefined, 200, (j) => (Array.isArray(j) && j.length === 3 ? null : `expected 3 scores, got ${JSON.stringify(j).slice(0, 80)}`));
  await expect("export", "GET", "/api/export", undefined, 200, (j) => (j && typeof j === "object" && "todos" in j ? null : "export missing todos"));

  // Todos
  await expect("todos list", "GET", "/api/todos", undefined, 200, (j) => (Array.isArray(j) && j.length === 3 ? null : `open todos ${j?.length}`));
  await expect("todos done list", "GET", "/api/todos?status=done", undefined, 200, (j) => (j?.length === 1 ? null : `done todos ${j?.length}`));
  const todo = await expect("todo create", "POST", "/api/todos", { title: "Test todo", area: "work", priority: "high", dueAt: iso(tomorrow) }, [200, 201]);
  await expect("todo create empty title", "POST", "/api/todos", { title: "   " }, 400);
  await expect("todo create bad area", "POST", "/api/todos", { title: "x", area: "space" }, 400);
  await expect("todo create bad json", "POST", "/api/todos", "{not json", 400);
  await expect("todo create 301 chars", "POST", "/api/todos", { title: "x".repeat(301) }, 400);
  await expect("todo complete", "PATCH", `/api/todos/${todo?.id}`, { status: "done" }, 200);
  await expect("todo reopen + edit", "PATCH", `/api/todos/${todo?.id}`, { status: "open", title: "Renamed", dueAt: null }, 200, (j) => (j?.title === "Renamed" && j?.dueAt === null ? null : "edit not applied"));
  await expect("todo patch bad priority", "PATCH", `/api/todos/${todo?.id}`, { priority: "mega" }, 400);
  await expect("todo patch missing", "PATCH", "/api/todos/doesnotexist", { status: "done" }, 404);
  await expect("todo delete", "DELETE", `/api/todos/${todo?.id}`, undefined, [200, 204]);
  await expect("todo delete again (idempotent)", "DELETE", `/api/todos/${todo?.id}`, undefined, [200, 404]);

  // Projects and tasks
  await expect("projects list", "GET", "/api/projects", undefined, 200, (j) => (Array.isArray(j) && j.length === 2 ? null : `projects ${j?.length}`));
  await expect("project get", "GET", `/api/projects/${thesisId}`, undefined, 200, (j) => (j?.tasks?.length === 3 ? null : `tasks ${j?.tasks?.length}`));
  await expect("project get missing", "GET", "/api/projects/nope", undefined, 404);
  const project = await expect("project create", "POST", "/api/projects", { title: "E2E project", priority: "high", deadline: iso(tomorrow) }, [200, 201]);
  await expect("project create no title", "POST", "/api/projects", { priority: "high" }, 400);
  await expect("project create unknown field", "POST", "/api/projects", { title: "x", bogus: 1 }, 400);
  await expect("project patch", "PATCH", `/api/projects/${project?.id}`, { status: "on_hold" }, 200);
  const task = await expect("task create", "POST", `/api/projects/${project?.id}/tasks`, { title: "First task", priority: "high", estimatedMinutes: 30 }, [200, 201]);
  await expect("task bulk create", "PUT", `/api/projects/${project?.id}/tasks`, { tasks: [{ title: "Bulk A" }, { title: "Bulk B" }] }, [200, 201]);
  const tasks = await expect("tasks list", "GET", `/api/projects/${project?.id}/tasks`, undefined, 200, (j) => (Array.isArray(j) && j.length === 3 ? null : `tasks ${j?.length}`));
  if (Array.isArray(tasks)) {
    await expect("tasks reorder", "PATCH", `/api/projects/${project?.id}/tasks`, { tasks: tasks.map((t: any, i: number) => ({ id: t.id, order: tasks.length - i })) }, [200, 204]);
  }
  await expect("task complete", "PATCH", `/api/projects/${project?.id}/tasks/${task?.id}`, { status: "completed" }, 200);
  await expect("task bad status", "PATCH", `/api/projects/${project?.id}/tasks/${task?.id}`, { status: "exploded" }, 400);
  await expect("task delete", "DELETE", `/api/projects/${project?.id}/tasks/${task?.id}`, undefined, [200, 204]);
  await expect("task in wrong project", "PATCH", `/api/projects/${thesisId}/tasks/${task?.id}`, { status: "completed" }, 404);
  await expect("project analyze", "GET", `/api/projects/${thesisId}/analyze`, undefined, 200);
  await expect("project delete", "DELETE", `/api/projects/${project?.id}`, undefined, [200, 204]);
  const orphanTasks = await prisma.projectTask.count({ where: { projectId: project?.id } });
  if (orphanTasks === 0) pass++;
  else failures.push(`project delete left ${orphanTasks} tasks`);

  // Habits (routines)
  const habits = await expect("habits list", "GET", "/api/habits", undefined, 200, (j) => (Array.isArray(j) && j.length === 3 ? null : `habits ${j?.length}`));
  const habit = await expect("habit create", "POST", "/api/habits", { name: "Drink water", targetDays: ["mon", "wed", "fri"] }, [200, 201]);
  await expect("habit create bad day", "POST", "/api/habits", { name: "x", targetDays: ["funday"] }, 400);
  await expect("habit log", "POST", `/api/habits/${habit?.id}/log`, { completed: true }, [200, 201]);
  await expect("habit log again (toggle/upsert)", "POST", `/api/habits/${habit?.id}/log`, { completed: false }, [200, 201]);
  await expect("habit log missing", "POST", "/api/habits/nope/log", { completed: true }, 404);
  await expect("habit patch", "PATCH", `/api/habits/${habit?.id}`, { name: "Drink more water" }, 200);
  await expect("habit delete", "DELETE", `/api/habits/${habit?.id}`, undefined, [200, 204]);
  void habits;

  // Meals
  const meal = await expect("meal create", "POST", "/api/meals", { name: "Oatmeal", category: "breakfast", calories: 350 }, [200, 201]);
  await expect("meal bad category", "POST", "/api/meals", { name: "x", category: "brunch" }, 400);
  await expect("zero-calorie meal allowed (water)", "POST", "/api/meals", { name: "Water", category: "snack", calories: 0 }, 201);
  await expect("meal calories negative", "POST", "/api/meals", { name: "x", category: "lunch", calories: -1 }, 400);
  await expect("meals list", "GET", "/api/meals", undefined, 200);
  await expect("meal patch", "PATCH", `/api/meals/${meal?.id}`, { name: "Steel-cut oatmeal" }, 200);
  await expect("meal delete", "DELETE", `/api/meals/${meal?.id}`, undefined, [200, 204]);

  // Notes
  const note = await expect("note create", "POST", "/api/notes", { title: "E2E note", content: "hello" }, [200, 201]);
  await expect("note no title", "POST", "/api/notes", { content: "x" }, 400);
  await expect("notes list", "GET", "/api/notes", undefined, 200, (j) => (Array.isArray(j) && j.length === 2 ? null : `notes ${j?.length}`));
  await expect("note patch empty", "PATCH", `/api/notes/${note?.id}`, {}, 400);
  await expect("note patch", "PATCH", `/api/notes/${note?.id}`, { status: "completed" }, 200);
  await expect("note delete", "DELETE", `/api/notes/${note?.id}`, undefined, [200, 204]);

  // Reminders
  const reminders = await expect("reminders list", "GET", "/api/reminders", undefined, 200, (j) => (Array.isArray(j) && j.length >= 1 ? null : "no reminders"));
  if (Array.isArray(reminders) && reminders[0]) await expect("reminder delete", "DELETE", `/api/reminders/${reminders[0].id}`, undefined, [200, 204]);
  await expect("reminder delete missing (idempotent)", "DELETE", "/api/reminders/nope", undefined, [200, 404]);

  // Daily entries and journal
  await expect("daily entries list", "GET", "/api/daily-entries", undefined, 200, (j) => (Array.isArray(j) && j.length === 3 ? null : `entries ${j?.length}`));
  await expect("daily entry upsert", "POST", "/api/daily-entries", { sleepHours: 7.5, steps: 8000, workoutCompleted: true, workoutRoutineName: "Push day", workoutDurationMinutes: 45, workoutIntensity: "moderate" }, [200, 201]);
  await expect("daily entry workout without name", "POST", "/api/daily-entries", { workoutCompleted: true }, 400);
  await expect("daily entry bad sleep", "POST", "/api/daily-entries", { sleepHours: 30 }, 400);
  await expect("journal get", "GET", "/api/journal", undefined, 200);
  await expect("journal patch", "PATCH", "/api/journal", { notes: "E2E journal line", sleepHours: 8, rightWithGod: true }, 200);
  await expect("journal patch bad", "PATCH", "/api/journal", { sleepHours: -1 }, 400);

  // Weights
  const routine = await expect("routine create", "POST", "/api/weights/routines", { name: "Push day" }, [200, 201]);
  await expect("routine no name", "POST", "/api/weights/routines", {}, 400);
  await expect("routines list", "GET", "/api/weights/routines", undefined, 200);
  const ex = await expect("exercise add", "POST", `/api/weights/routines/${routine?.id}/exercises`, { name: "Bench press", descriptor: "3x5" }, [200, 201]);
  await expect("exercises replace", "PUT", `/api/weights/routines/${routine?.id}/exercises`, { exercises: [{ name: "Bench press" }, { name: "Overhead press" }] }, [200, 201]);
  await expect("routine get", "GET", `/api/weights/routines/${routine?.id}`, undefined, 200, (j) => (j?.exercises?.length === 2 ? null : `exercises ${j?.exercises?.length}`));
  const session = await expect("session log", "POST", "/api/weights/sessions", { routineId: routine?.id, exerciseLogs: [{ exerciseName: "Bench press", weight: 185, sets: 3, reps: "5" }] }, [200, 201]);
  await expect("session bad routine", "POST", "/api/weights/sessions", { routineId: "not-a-cuid" }, 400);
  await expect("sessions list", "GET", "/api/weights/sessions", undefined, 200);
  await expect("progression", "GET", "/api/weights/progression", undefined, 200);
  await expect("session delete", "DELETE", `/api/weights/sessions?id=${session?.id}`, undefined, [200, 204]);
  void ex;
  await expect("routine patch", "PATCH", `/api/weights/routines/${routine?.id}`, { name: "Push day A" }, 200);
  await expect("routine delete", "DELETE", `/api/weights/routines/${routine?.id}`, undefined, [200, 204]);

  // Chat API (no model needed for these)
  await expect("chat empty", "POST", "/api/chat", { message: "   " }, 400);
  await expect("chat too long", "POST", "/api/chat", { message: "x".repeat(2001) }, 400);
  await expect("chat bad json", "POST", "/api/chat", "nope", 400);
  await expect("chat get fresh", "GET", "/api/chat", undefined, 200, (j) => (j?.messages ? null : "no messages key"));
  await expect("chat get missing conversation", "GET", "/api/chat?conversationId=nope", undefined, 404);
  await expect("conversations list", "GET", "/api/chat/conversations", undefined, 200);
  await expect("conversation patch missing", "PATCH", "/api/chat/conversations/nope", { saved: true }, 404);
  await expect("conversation patch empty", "PATCH", "/api/chat/conversations/nope", {}, 400);
  await expect("undo missing", "POST", "/api/chat/undo", { messageId: "nope" }, 404);
  await expect("undo no id", "POST", "/api/chat/undo", {}, 400);

  // Conversation lifecycle without the model: seed one directly
  const owner = await prisma.user.findFirstOrThrow({ where: { email: "e2e@test.local" } });
  const old = await prisma.conversation.create({ data: { userId: owner.id, title: "Old chat", updatedAt: new Date(Date.now() - 40 * 86400000), messages: { create: { userId: owner.id, role: "user", content: "old" } } } });
  const fresh = await prisma.conversation.create({ data: { userId: owner.id, title: "Fresh chat", messages: { create: { userId: owner.id, role: "user", content: "new" } } } });
  await prisma.conversation.create({ data: { userId: owner.id, title: "Empty chat" } });
  await expect("history hides >30d and empty", "GET", "/api/chat/conversations", undefined, 200, (j) =>
    Array.isArray(j) && j.some((c: any) => c.id === fresh.id) && !j.some((c: any) => c.id === old.id) && !j.some((c: any) => c.title === "Empty chat") ? null : `got ${j?.map((c: any) => c.title)}`
  );
  await expect("star old chat", "PATCH", `/api/chat/conversations/${old.id}`, { saved: true }, 200);
  await expect("history shows starred old chat", "GET", "/api/chat/conversations", undefined, 200, (j) => (j?.some((c: any) => c.id === old.id && c.saved) ? null : "starred old chat missing"));
  await expect("rename", "PATCH", `/api/chat/conversations/${fresh.id}`, { title: "Renamed chat" }, 200);
  await expect("open conversation", "GET", `/api/chat?conversationId=${fresh.id}`, undefined, 200, (j) => (j?.conversation?.title === "Renamed chat" && j.messages.length === 1 ? null : "open failed"));
  await expect("delete conversation", "DELETE", `/api/chat/conversations/${fresh.id}`, undefined, 200);
  const leftover = await prisma.chatMessage.count({ where: { conversationId: fresh.id } });
  if (leftover === 0) pass++;
  else failures.push(`deleted conversation left ${leftover} messages`);

  // Nutrition
  const today = new Date();
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  await expect("nutrition empty day", "GET", `/api/nutrition?date=${ymd}`, undefined, 200, (j) => (j?.totals?.calories === 0 && j?.targets === null ? null : JSON.stringify(j).slice(0, 120)));
  await expect("nutrition bad date", "GET", "/api/nutrition?date=2026-13-45", undefined, 400);
  await expect("targets set", "PUT", "/api/nutrition/targets", { calories: 2200, protein: 160, carbs: 220, fat: 70 }, 200);
  await expect("targets invalid", "PUT", "/api/nutrition/targets", { calories: -5, protein: 1, carbs: 1, fat: 1 }, 400);
  await expect("estimate empty", "POST", "/api/nutrition/estimate", { text: "" }, 400);
  const draft = await expect("estimate table foods (instant)", "POST", "/api/nutrition/estimate", { text: "2 eggs and a banana" }, 200, (j) => (j?.totals?.calories === 248 && j.items.length === 2 ? null : JSON.stringify(j?.totals)));
  await expect("estimate asks how much", "POST", "/api/nutrition/estimate", { text: "a bottle of coconut water" }, 200, (j) => (j?.questions?.[0]?.prompt === "How big was the bottle of coconut water?" ? null : JSON.stringify(j?.questions)));
  await expect("estimate with an answered amount", "POST", "/api/nutrition/estimate", { text: "a bottle of coconut water", amounts: { 0: "500 ml" } }, 200, (j) => (j?.totals?.calories === 95 && j.questions.length === 0 && j.micros?.potassium === 1250 ? null : JSON.stringify(j?.totals)));
  const eaten = await expect("log eaten meal with macros + micros", "POST", "/api/meals", { name: "Eggs and banana", category: "breakfast", status: "eaten", calories: 248, protein: 13.7, carbs: 27.7, fat: 9.8, items: draft?.items, micros: draft?.micros, sourceText: "2 eggs and a banana", nutritionSource: "ai" }, 201);
  await expect("meal bad macro", "POST", "/api/meals", { name: "x", category: "lunch", protein: -1 }, 400);
  await expect("nutrition totals", "GET", `/api/nutrition?date=${ymd}`, undefined, 200, (j) => (j?.totals?.calories === 248 && j.targets?.calories === 2200 && j.meals.length === 1 && j.micros?.potassium > 400 ? null : JSON.stringify([j?.totals, j?.micros])));
  await expect("micro targets set", "PUT", "/api/nutrition/targets", { calories: 2200, protein: 160, carbs: 220, fat: 70, sodium: 2000, vitaminC: 90 }, 200);
  await expect("meal macros edit", "PATCH", `/api/meals/${eaten?.id}`, { calories: 300, protein: 20, nutritionSource: "manual" }, 200);
  await expect("nutrition totals after edit", "GET", `/api/nutrition?date=${ymd}`, undefined, 200, (j) => (j?.totals?.calories === 300 && j.totals.protein === 20 ? null : JSON.stringify(j?.totals)));
  await expect("other day is separate", "GET", "/api/nutrition?date=2020-01-01", undefined, 200, (j) => (j?.totals?.calories === 0 ? null : "leaked"));
  await expect("meal delete", "DELETE", `/api/meals/${eaten?.id}`, undefined, [200, 204]);

  // A meal logged in chat gets nutrition filled in by the background estimator (uses the model router).
  const chatRes = await call("POST", "/api/chat", { message: "had 2 eggs and a banana for breakfast" });
  const chatDone = chatRes.text.trim().split("\n").map((l) => JSON.parse(l)).find((e) => e.type === "done");
  const chatMeal = chatDone?.reply?.actions?.find((a: any) => a.type === "meal");
  if (!chatMeal) failures.push(`chat meal not logged: ${chatDone?.reply?.reply}`);
  else {
    let filled = null;
    for (let i = 0; i < 30 && !filled; i++) {
      const m = await prisma.meal.findUnique({ where: { id: chatMeal.id } });
      if (m?.calories) filled = m;
      else await new Promise((r) => setTimeout(r, 1000));
    }
    if (filled?.calories === 248 && filled.nutritionSource === "ai") pass++;
    else failures.push(`chat meal nutrition: ${filled?.calories ?? "never filled"}`);
  }

  // LLM-backed project breakdown (slow)
  await expect("project generate tasks (model)", "POST", `/api/projects/${thesisId}/generate`, {}, [200, 201]);

  console.log(`\nAPI sweep: ${pass} passed, ${failures.length} failed`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  await prisma.$disconnect();
}

main();
