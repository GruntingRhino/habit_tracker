/**
 * Runs scripted conversations (including Undo presses) through the real handler and the live
 * model, and prints the transcript for review. Test database only.
 * Usage: DATABASE_URL=postgresql://…/li_test OLLAMA_BASE_URL=http://127.0.0.1:11435 npx tsx --tsconfig tsconfig.json scripts/chat-scenarios.ts
 */
if (!/test/.test(process.env.DATABASE_URL ?? "")) {
  console.error("Refusing to run: DATABASE_URL must point at a test database.");
  process.exit(1);
}
import prisma from "@/lib/prisma";
import { handleMessage, undoMessage } from "@/lib/ai/assistant";

type Step = string | { undo: number } | { seed: string };
const scenarios: Record<string, Step[]> = {
  "1 your case: goal → undo → keep talking": ["I want to get really good at MMA", { undo: 0 }, "yeah i want to do striking, wrestling and cardio", "is my plan still there?", "ok make the plan again", "Grappling"],
  "2 finished plan → undo → talk → did you": ["I want to learn to cook", "just make the plan", { undo: 1 }, "yeah I mostly want to do quick dinners", "did you save the plan?", "bring it back"],
  "3 revise then undo revision": ["help me save money", "just make the plan", "make the plan easier", { undo: 2 }, "what changed?", "cool thanks"],
  "4 capture/undo/redo": ["just crushed a 5k run in 24 minutes!", { undo: 0 }, "wait why'd you undo that", "ok log it again", "did you log my run?"],
  "5 triage + undo + answer": ["I need to file my taxes and fix my bike", { undo: 0 }, "2 is urgent"],
  "6 don't remind me": ["remind me friday at 3pm to email my advisor", "actually don't remind me", "did you cancel it?"],
  "7 hybrid + chat": ["remind me tomorrow at 5pm to pack my gym bag, also what should I eat before class?", "lol thanks", "what's on my plate today?", "I'm kinda stressed about school tbh"],
};

(async () => {
  const user = await prisma.user.create({ data: { email: `live${Date.now()}@test.local` } });
  for (const [name, steps] of Object.entries(scenarios)) {
    console.log(`\n══════ ${name}`);
    let cid: string | null = null;
    const replies: string[] = [];
    for (const step of steps) {
      if (typeof step === "object" && "seed" in step) {
        await prisma.todo.create({ data: { userId: user.id, title: step.seed } });
        continue;
      }
      if (typeof step === "object") {
        const r = await undoMessage(user.id, replies[step.undo]);
        console.log(`  ⟲ [Undo on reply #${step.undo}] → ${JSON.stringify(r)}`);
        continue;
      }
      const t = Date.now();
      const r = await handleMessage(user.id, step, "web", { conversationId: cid });
      cid = r.conversationId;
      replies.push(r.id);
      const acts = r.actions.map((a) => `${a.op}:${a.type}:"${a.title}"`).join(", ");
      console.log(`  U: ${step}\n  A${replies.length - 1} (${((Date.now() - t) / 1000).toFixed(0)}s): ${r.reply.replace(/\n+/g, " / ").slice(0, 320)}${acts ? `\n     ⚙ ${acts}` : ""}${r.meta?.options?.length ? `\n     ☐ ${r.meta.options.join(" | ")}` : ""}`);
    }
  }
  const counts = await Promise.all([prisma.project.count({ where: { userId: user.id } }), prisma.todo.count({ where: { userId: user.id } }), prisma.reminder.count({ where: { userId: user.id } })]);
  console.log(`\nleft over → projects ${counts[0]}, todos ${counts[1]}, reminders ${counts[2]}`);
  await prisma.$disconnect();
  process.exit(0);
})();
