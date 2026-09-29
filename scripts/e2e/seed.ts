/** Seeds a realistic owner for end-to-end tests. Test databases only. */
import { addDays } from "date-fns";
import prisma from "@/lib/prisma";
import { Prisma } from "@/generated/prisma";
import { getStartOfDay } from "@/lib/utils";

if (!/test|e2e/.test(process.env.DATABASE_URL ?? "")) throw new Error("Refusing: not a test database");

/** Wipes the owner's data (keeping the user row, which the server caches) and seeds it fresh. */
export async function seed() {
  const email = (process.env.OWNER_EMAIL ?? "e2e@test.local").toLowerCase();
  const user = await prisma.user.upsert({ where: { email }, update: { nutritionTargets: Prisma.DbNull }, create: { email, name: "Abhay" } });
  const userId = user.id;
  const where = { userId };
  await prisma.conversation.deleteMany({ where });
  await prisma.chatMessage.deleteMany({ where });
  await prisma.reminder.deleteMany({ where });
  await prisma.todo.deleteMany({ where });
  await prisma.project.deleteMany({ where });
  await prisma.habit.deleteMany({ where });
  await prisma.categoryScore.deleteMany({ where });
  await prisma.dailyEntry.deleteMany({ where });
  await prisma.note.deleteMany({ where });
  await prisma.meal.deleteMany({ where });
  await prisma.workoutSession.deleteMany({ where });
  await prisma.dayPlan.deleteMany({ where });
  const today = getStartOfDay(new Date());

  const thesis = await prisma.project.create({
    data: {
      userId, title: "Finish thesis", area: "work", priority: "high", deadline: addDays(today, 20),
      tasks: { create: [{ title: "Write chapter 2", order: 0, priority: "high" }, { title: "Literature review", order: 1 }, { title: "Format bibliography", order: 2, priority: "low" }] },
    },
  });
  await prisma.project.create({ data: { userId, title: "Launch personal website", area: "work", priority: "medium", tasks: { create: [{ title: "Pick a domain", order: 0 }] } } });
  await prisma.todo.createMany({
    data: [
      { userId, title: "Pay rent", area: "financial", priority: "urgent", dueAt: addDays(today, 1) },
      { userId, title: "Email professor about extension", area: "work", priority: "high" },
      { userId, title: "Buy groceries", area: "general" },
      { userId, title: "Call grandma", area: "general", status: "done", completedAt: addDays(today, -1) },
    ],
  });
  const habits = await Promise.all(
    [
      { name: "Read the Bible", area: "spiritual", category: "general", timeOfDay: "morning" },
      { name: "Stretch", area: "physical", category: "physical", timeOfDay: "evening" },
      { name: "Meditate 10 min", area: "mental", category: "mental", timeOfDay: "morning" },
    ].map((h) => prisma.habit.create({ data: { userId, ...h } }))
  );
  await prisma.habitLog.create({ data: { habitId: habits[0].id, date: today, completed: true } });
  for (let d = 1; d <= 3; d++) {
    const date = addDays(today, -d);
    const entry = await prisma.dailyEntry.create({ data: { userId, date, sleepHours: 7 - d * 0.5, workoutCompleted: d !== 2, notes: d === 1 ? "Good focus day, finished a draft." : null } });
    await prisma.categoryScore.create({
      data: { userId, dailyEntryId: entry.id, date, physical: 7 - d, mental: 6, financial: 5 + d, spiritual: 8, work: 7, discipline: 6, focus: 6, appearance: 5, overall: 6.5 - d * 0.3, finalized: true, judgedBy: "seed" },
    });
  }
  await prisma.note.create({ data: { userId, title: "Garage code", content: "4412" } });
  await prisma.meal.create({ data: { userId, name: "Chicken rice bowl", category: "lunch", status: "saved" } });
  await prisma.reminder.create({ data: { userId, text: "Take vitamins", fireAt: addDays(new Date(), 1), recurrence: "daily" } });
  return { userId, thesisId: thesis.id };
}

if (process.argv[1]?.endsWith("seed.ts")) seed().then((r) => (console.log(JSON.stringify(r)), prisma.$disconnect()));
