/**
 * "Ask AI" on an item, against a real Postgres with the model scripted.
 * Run: DATABASE_URL=postgresql://test@127.0.0.1:55432/li_test npx vitest run itemai
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatOptions } from "@/lib/ai/llm";

const DB = process.env.DATABASE_URL ?? "";
const enabled = /test/.test(DB);

let written = "";
let breakdown: unknown = { tasks: [{ title: "Pick a topic", priority: "high" }, { title: "Build the model", priority: "medium" }, { title: "Make the poster", priority: "medium" }] };
const seen: string[] = [];

vi.mock("@/lib/ai/llm", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/ai/llm")>();
  return {
    ...real,
    chat: vi.fn(async (opts: ChatOptions) => {
      const sys = opts.messages[0].content;
      seen.push(opts.messages[opts.messages.length - 1].content);
      const content = sys.startsWith("Break Abhay's project") ? JSON.stringify(breakdown) : sys.startsWith("You write content for one item") ? written : '{"intent":"chat","items":[]}';
      return { content, evalCount: 0, promptEvalCount: 0, durationMs: 0 };
    }),
  };
});

const { default: prisma } = await import("@/lib/prisma");
const { askItem, parseEdit, restoreSnapshot, spreadDates } = await import("../itemai");

describe("reading edits without the model", () => {
  const now = new Date(2026, 8, 30, 21);
  it.each([
    ["move it to friday at 6pm and make it high priority", { priority: "high" }],
    ["due tomorrow 5pm, urgent", { priority: "urgent" }],
    ["rename to Science fair 2026", { title: "Science fair 2026" }],
    ["mark pick a topic done", { complete: ["pick a topic"] }],
    ["book bus is done, drop pack", { complete: ["book bus"], remove: ["pack"] }],
    ["write notes for this", { write: "write notes for this" }],
    ["hmm", {}],
  ])("%s", (text, want) => expect(parseEdit(text, now)).toMatchObject(want));
  it("dates and steps", () => {
    const a = parseEdit("add a step to buy a tri-fold board on saturday", now);
    expect(a.add?.[0].title).toBe("Buy a tri-fold board");
    expect(a.add?.[0].when?.getDay()).toBe(6);
    const b = parseEdit("move it to friday at 6pm", now);
    expect([b.due?.getDay(), b.due?.getHours()]).toEqual([5, 18]);
    expect(parseEdit("no due date", now).due).toBeNull();
  });
});

describe("checklist dates", () => {
  const now = new Date(2026, 8, 30, 20);
  it("spread from tomorrow to the deadline, 7pm", () => {
    const d = spreadDates(3, new Date(2026, 9, 10, 9), now);
    expect(d.map((x) => x.getDate())).toEqual([1, 5, 9]);
    expect(d[0].getHours()).toBe(19);
  });
  it("one a day without a deadline", () => {
    expect(spreadDates(3, null, now).map((x) => x.getDate())).toEqual([1, 2, 3]);
  });
});

describe.skipIf(!enabled)("Ask AI on an item", () => {
  let userId = "";
  beforeEach(async () => {
    userId = (await prisma.user.create({ data: { email: `item-${Date.now()}${Math.random()}@test.local` } })).id;
    seen.length = 0;
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("'make a plan' turns a to-do into a project with a dated checklist, and undo turns it back", async () => {
    const due = new Date(Date.now() + 10 * 86_400_000);
    const todo = await prisma.todo.create({ data: { userId, title: "Science fair", notes: "Due at school", dueAt: due, priority: "high", area: "work" } });
    const r = await askItem(userId, { type: "todo", id: todo.id }, "make a plan");
    expect(r.item.type).toBe("project");
    const project = await prisma.project.findUniqueOrThrow({ where: { id: r.item.id }, include: { tasks: { orderBy: { order: "asc" } } } });
    expect(project).toMatchObject({ title: "Science fair", description: "Due at school", priority: "high" });
    expect(project.deadline?.getTime()).toBe(due.getTime());
    expect(project.tasks.map((t) => t.title)).toEqual(["Pick a topic", "Build the model", "Make the poster"]);
    expect(project.tasks.every((t) => t.dueDate && t.dueDate <= due)).toBe(true);
    expect(await prisma.todo.count({ where: { userId } })).toBe(0);

    await restoreSnapshot(userId, r.snapshot!);
    expect(await prisma.project.count({ where: { userId } })).toBe(0);
    expect(await prisma.todo.findUnique({ where: { id: todo.id } })).toMatchObject({ title: "Science fair", notes: "Due at school", priority: "high" });
  });

  it("writes content into the description (a recipe) and undo restores the old one", async () => {
    const project = await prisma.project.create({ data: { userId, title: "Dinner: chicken rice bowl", description: "For tonight" } });
    written = "Recipe:\n- 6 oz chicken breast\n- 1 cup rice\n1. Cook rice\n2. Grill chicken";
    const r = await askItem(userId, { type: "project", id: project.id }, "make a recipe for this meal");
    expect(r.changes).toEqual(["Wrote it into the description"]);
    const d = (await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).description!;
    expect(d.startsWith("For tonight\n\nRecipe:")).toBe(true); // kept what was there
    expect(seen.join("\n")).toContain("Write: make a recipe for this meal");
    await restoreSnapshot(userId, r.snapshot!);
    expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).description).toBe("For tonight");
  });

  it("edits due date, priority and the checklist; undo puts it all back", async () => {
    const project = await prisma.project.create({ data: { userId, title: "Trip", tasks: { create: [{ title: "Book bus", order: 0 }, { title: "Pack", order: 1 }] } } });
    const r = await askItem(userId, { type: "project", id: project.id }, "due friday 6pm, urgent, book bus is done, drop pack, add charge phone thursday");
    expect(seen).toEqual([]); // no model needed
    const p = await prisma.project.findUniqueOrThrow({ where: { id: project.id }, include: { tasks: { orderBy: { order: "asc" } } } });
    expect(p.priority).toBe("urgent");
    expect(p.deadline?.getDay()).toBe(5);
    expect(p.deadline?.getHours()).toBe(18);
    expect(p.tasks.map((t) => `${t.title}:${t.status}`)).toEqual(["Book bus:completed", "Charge phone:todo"]);
    expect(p.tasks[1].dueDate?.getDay()).toBe(4);
    expect(r.changes).toEqual(expect.arrayContaining(["Priority → urgent", "✓ Book bus", "− Pack"]));
    expect(r.changes.some((c) => c.startsWith("+ Charge phone (Thu"))).toBe(true);

    await restoreSnapshot(userId, r.snapshot!);
    const back = await prisma.project.findUniqueOrThrow({ where: { id: project.id }, include: { tasks: { orderBy: { order: "asc" } } } });
    expect(back.priority).toBe("medium");
    expect(back.deadline).toBeNull();
    expect(back.tasks.map((t) => `${t.title}:${t.status}`)).toEqual(["Book bus:todo", "Pack:todo"]);
  });

  it("adding checklist items to a plain to-do makes it a project", async () => {
    const todo = await prisma.todo.create({ data: { userId, title: "Clean room" } });
    const r = await askItem(userId, { type: "todo", id: todo.id }, "add desk, add closet");
    expect(r.item.type).toBe("project");
    expect((await prisma.projectTask.findMany({ where: { projectId: r.item.id } })).map((t) => t.title).sort()).toEqual(["Closet", "Desk"]);
  });

  it("unclear requests, or JSON junk from the model, change nothing — and never the title", async () => {
    const todo = await prisma.todo.create({ data: { userId, title: "Call bank" } });
    let r = await askItem(userId, { type: "todo", id: todo.id }, "hmm");
    expect([r.changes, r.snapshot]).toEqual([[], null]);
    expect(r.reply).toMatch(/couldn't tell what to change/);
    written = `{"title":"Call bank','description':"`;
    r = await askItem(userId, { type: "todo", id: todo.id }, "write notes for this");
    expect(r.changes).toEqual([]);
    expect(await prisma.todo.findUniqueOrThrow({ where: { id: todo.id } })).toMatchObject({ title: "Call bank", notes: null });
  });

  it("chat: 'make a plan for the science fair' plans the existing item instead of a new goal", async () => {
    const { handleMessage } = await import("@/lib/ai/assistant");
    await prisma.todo.create({ data: { userId, title: "Science fair project", dueAt: new Date(Date.now() + 7 * 86_400_000) } });
    const r = await handleMessage(userId, "make a plan for the science fair project", "web");
    expect(r.reply).toMatch(/Made it a project with a 3-step checklist/);
    expect(r.actions.map((a) => a.title)).toEqual(["Pick a topic", "Build the model", "Make the poster"]);
    expect(await prisma.project.count({ where: { userId } })).toBe(1);
    const conv = await prisma.conversation.findUnique({ where: { id: r.conversationId } });
    expect(conv?.plan).toBeNull(); // no goal interview
  });
});
