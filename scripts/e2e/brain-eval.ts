/**
 * Live check of the brain's model calls (real model, test DB): live grading, claim extraction,
 * summaries. Prints everything for a human read, and fails on anything not traceable to the input.
 *
 *   OLLAMA_BASE_URL=http://127.0.0.1:11437 DATABASE_URL=postgresql://test@127.0.0.1:55432/li_e2e \
 *     npx tsx --tsconfig tsconfig.json scripts/e2e/brain-eval.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import prisma from "@/lib/prisma";
import { getStartOfDay } from "@/lib/utils";
import { buildFacts, gradeDay } from "@/lib/brain/scores";
import { extractChunk, nextChunk, grounding, quotedPart, worthExtracting } from "@/lib/brain/extract";
import { consolidateCategory } from "@/lib/brain/consolidate";
import { ev } from "@/lib/brain/ingest";
import { BrainStore } from "@/lib/brain/storage";
import { seed } from "./seed";

if (!/test|e2e/.test(process.env.DATABASE_URL ?? "")) throw new Error("Refusing: not a test database");

const SAID = [
  "honestly i keep scrolling tiktok when i'm supposed to be studying for chem",
  "remind me to call grandma at 6",
  "i learn way better when someone shows me in person than from reading",
  "i want to get my first amateur mma fight by next summer",
  "i had eggs and toast",
  "my phone is the worst, every time it buzzes i lose like 20 minutes",
  "mornings are rough for me, i don't really wake up until like 11",
  "i've been praying before bed every night this week and it helps me sleep",
  "what's on today?",
  "i always put off my english essays until the night before",
  "when i'm stressed i just go hit the bag for a bit",
  "i hate running but i love sparring",
  "grinding on the business idea again tonight, i want to make 1k a month by december",
  "i work best with music on, lofi or drill",
  "i don't really like reading books",
  "my brother is always on his phone lol",
  "i used to play fortnite a lot but i quit last year",
];

async function main() {
  const failures: string[] = [];
  const { userId } = await seed();
  const today = getStartOfDay(new Date());

  // ---- live grading -------------------------------------------------------------------------
  await prisma.dailyEntry.upsert({
    where: { userId_date: { userId, date: today } },
    update: { sleepHours: 6, screenTimeHours: 5, steps: 9000, moneySpent: 45, notes: "Long day. Prayed this morning, grateful for the gym session." },
    create: { userId, date: today, sleepHours: 6, screenTimeHours: 5, steps: 9000, moneySpent: 45, notes: "Long day. Prayed this morning, grateful for the gym session." },
  });
  await prisma.user.update({ where: { id: userId }, data: { nutritionTargets: { calories: 2600, protein: 160, carbs: 300, fat: 85 } } });
  const at = (h: number) => new Date(today.getTime() + h * 3_600_000);
  const routine = await prisma.weightRoutine.create({ data: { userId, name: "Pull day" } });
  await prisma.workoutSession.create({ data: { userId, routineId: routine.id, date: at(16), exerciseLogs: { create: [{ exerciseName: "Deadlift", weight: 275, sets: 3, reps: "5" }, { exerciseName: "Pull-ups", sets: 4, reps: "8" }, { exerciseName: "Rows", weight: 135, sets: 3, reps: "10" }] } } });
  await prisma.meal.createMany({
    data: [
      { userId, name: "Oatmeal with banana", category: "breakfast", status: "eaten", plannedFor: at(8), calories: 420, protein: 14, carbs: 75, fat: 8, micros: { fiber: 8, potassium: 600, magnesium: 90, sodium: 150, sugar: 18 } },
      { userId, name: "Chicken rice bowl", category: "lunch", status: "eaten", plannedFor: at(13), calories: 750, protein: 55, carbs: 90, fat: 15, micros: { fiber: 4, potassium: 700, sodium: 1100, iron: 3, zinc: 4 } },
      { userId, name: "Two slices of pizza", category: "dinner", status: "eaten", plannedFor: at(20), calories: 600, protein: 24, carbs: 70, fat: 24, micros: { sodium: 1300, calcium: 400, sugar: 8 } },
    ],
  });
  for (const final of [false, true]) {
    const facts = await buildFacts(userId, today, { final });
    const t0 = Date.now();
    const r = await gradeDay(userId, today, { facts, final });
    console.log(`\n=== grade (${final ? "final" : "live"}) — model ${r.usedModel}, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    console.log(facts.facts.map((f) => `  [${f.area}] ${f.n}. ${f.text} (w${f.weight})`).join("\n"));
    const texts = new Set(facts.facts.map((f) => f.text));
    const opts = new Set(facts.options.map((o) => o.text));
    for (const [a, g] of Object.entries(r.rationale)) {
      console.log(`  ${a}: ${r.scores[a as keyof typeof r.scores] ?? "–"}\n     why: ${g.why.join(" | ") || "(none)"}\n     improve: ${g.improve ?? "-"}${g.more?.length ? ` / ${g.more.join(" / ")}` : ""}${g.noData ? "  [no data]" : ""}`);
      for (const w of g.why) if (!texts.has(w)) failures.push(`grade why not a fact: ${w}`);
      if (g.improve && !opts.has(g.improve)) failures.push(`grade improve not an option: ${g.improve}`);
    }
    if (!r.usedModel) failures.push("grading fell back to rules (model not used)");
  }

  if (process.env.GRADE_ONLY) {
    console.log(failures.length ? `\n✗ ${failures.join("\n")}` : "\n✓ grading traceable");
    process.exit(failures.length ? 1 : 0);
  }
  // ---- extraction ---------------------------------------------------------------------------
  const store = new BrainStore(fs.mkdtempSync(path.join(os.tmpdir(), "brain-eval-")));
  const all = SAID.map((s, i) => ev(`eval:${i}`, new Date(Date.now() - (SAID.length - i) * 60_000), "said", `He said (evening): "${s}"`, "said"));
  // Same filter as the loop: requests and questions never reach the model.
  let queue = all.filter(worthExtracting);
  console.log(`  ${all.length - queue.length} request/question lines skipped`);
  console.log("\n=== extraction");
  while (queue.length) {
    const chunk = nextChunk(queue);
    queue = queue.slice(chunk.length);
    const t0 = Date.now();
    const r = await extractChunk(store, chunk);
    console.log(`  chunk of ${chunk.length}: proposed ${r.proposed}, kept ${r.kept} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    for (const o of r.outcomes) console.log(`    ${o}`);
  }
  const cats = fs.readdirSync(store.p("observations")).map((f) => f.replace(".jsonl", ""));
  let kept = 0;
  for (const c of cats) {
    for (const o of store.readObservations(c)) {
      kept++;
      const src = all.find((e) => o.evidence.includes(e.id))!;
      const g = grounding(o.claim, quotedPart(src.text));
      if (g.score < 0.5) failures.push(`ungrounded claim kept: ${o.claim}`);
    }
  }
  if (kept < 5) failures.push(`only ${kept} claims learned from ${SAID.length} lines`);

  // ---- summaries ----------------------------------------------------------------------------
  console.log("\n=== summaries");
  for (const c of cats) {
    const r = await consolidateCategory(store, userId, c as never, [], {}, { useModel: true });
    console.log(`  ${c}: ${r.content.summary ?? "(none)"}  [${r.content.beliefs.length} beliefs]`);
  }

  console.log(failures.length ? `\n✗ ${failures.length} problem(s):\n${failures.map((f) => `  - ${f}`).join("\n")}` : "\n✓ everything traceable to the input");
  await prisma.$disconnect();
  process.exit(failures.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
