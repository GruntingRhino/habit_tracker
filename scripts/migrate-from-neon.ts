/**
 * One-off: copy the owner's data from the old Neon database into the local Postgres.
 *
 *   SOURCE_DATABASE_URL=<neon url> DATABASE_URL=<local url> OWNER_EMAIL=you@x.com \
 *   [MERGE_EMAILS=other@x.com,...] npx tsx scripts/migrate-from-neon.ts
 *
 * Run `prisma db push` against DATABASE_URL first. Only columns present in both
 * schemas are copied; rows already present are skipped, so it is safe to re-run.
 * MERGE_EMAILS folds other old accounts' rows into the owner (per-day conflicts skipped).
 */
import { Client } from "pg";

const src = new Client({ connectionString: process.env.SOURCE_DATABASE_URL });
const dst = new Client({ connectionString: process.env.DATABASE_URL });
const ownerEmail = (process.env.OWNER_EMAIL ?? "").toLowerCase();
const mergeEmails = (process.env.MERGE_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

// [table, filter relative to the old user ids ($1), userId column to rewrite]
const TABLES: [string, string, string | null][] = [
  ["DailyEntry", `"userId" = ANY($1)`, "userId"],
  ["CategoryScore", `"userId" = ANY($1)`, "userId"],
  ["Meal", `"userId" = ANY($1)`, "userId"],
  ["Habit", `"userId" = ANY($1)`, "userId"],
  ["HabitLog", `"habitId" IN (SELECT id FROM "Habit" WHERE "userId" = ANY($1))`, null],
  ["Project", `"userId" = ANY($1)`, "userId"],
  ["ProjectTask", `"projectId" IN (SELECT id FROM "Project" WHERE "userId" = ANY($1))`, null],
  ["Note", `"userId" = ANY($1)`, "userId"],
  ["WeightRoutine", `"userId" = ANY($1)`, "userId"],
  ["WeightExercise", `"routineId" IN (SELECT id FROM "WeightRoutine" WHERE "userId" = ANY($1))`, null],
  ["WorkoutSession", `"userId" = ANY($1)`, "userId"],
  ["WorkoutExerciseLog", `"sessionId" IN (SELECT id FROM "WorkoutSession" WHERE "userId" = ANY($1))`, null],
];

async function columns(client: Client, table: string) {
  const r = await client.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
    [table]
  );
  return new Set(r.rows.map((row) => row.column_name as string));
}

async function main() {
  if (!ownerEmail) throw new Error("OWNER_EMAIL is required");
  await src.connect();
  await dst.connect();

  const users = await src.query(`SELECT id, email, name, "createdAt" FROM "User" WHERE lower(email) = ANY($1)`, [[ownerEmail, ...mergeEmails]]);
  const owner = users.rows.find((u) => u.email.toLowerCase() === ownerEmail);
  if (!owner) throw new Error(`No user ${ownerEmail} in source`);
  const oldIds = users.rows.map((u) => u.id as string);
  console.log(`Owner ${owner.email} (${owner.id}); merging ${oldIds.length - 1} other account(s)`);

  // The owner keeps their id so every foreign key lines up.
  await dst.query(
    `INSERT INTO "User" (id, email, name, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (email) DO NOTHING`,
    [owner.id, owner.email.toLowerCase(), owner.name, owner.createdAt]
  );
  const dstOwner = await dst.query(`SELECT id FROM "User" WHERE email = $1`, [owner.email.toLowerCase()]);
  const ownerId = dstOwner.rows[0].id as string;

  await dst.query("BEGIN");
  try {
    for (const [table, where, userCol] of TABLES) {
      const [srcCols, dstCols] = await Promise.all([columns(src, table), columns(dst, table)]);
      const shared = [...srcCols].filter((c) => dstCols.has(c));
      const rows = (await src.query(`SELECT ${shared.map((c) => `"${c}"`).join(", ")} FROM "${table}" WHERE ${where}`, [oldIds])).rows;
      let inserted = 0;
      for (const row of rows) {
        if (userCol) row[userCol] = ownerId;
        const values = shared.map((c) => row[c]);
        const placeholders = shared.map((_, i) => `$${i + 1}`).join(", ");
        await dst.query("SAVEPOINT r");
        try {
          const res = await dst.query(
            `INSERT INTO "${table}" (${shared.map((c) => `"${c}"`).join(", ")}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
            values
          );
          inserted += res.rowCount ?? 0;
          await dst.query("RELEASE SAVEPOINT r");
        } catch (error) {
          await dst.query("ROLLBACK TO SAVEPOINT r");
          console.warn(`  skip ${table} ${row.id}: ${(error as Error).message}`);
        }
      }
      console.log(`${table.padEnd(20)} ${inserted}/${rows.length}`);
    }

    // Backfill the new `area` columns from what we already know.
    await dst.query(`UPDATE "Habit" SET area = CASE category WHEN 'discipline' THEN 'work' WHEN 'focus' THEN 'work' WHEN 'physical' THEN 'physical' WHEN 'financial' THEN 'financial' WHEN 'mental' THEN 'mental' WHEN 'spiritual' THEN 'spiritual' ELSE 'general' END WHERE area = 'general'`);
    await dst.query(`UPDATE "Meal" SET status = 'saved' WHERE status IS NULL`);
    await dst.query("COMMIT");
  } catch (error) {
    await dst.query("ROLLBACK");
    throw error;
  }

  await src.end();
  await dst.end();
  console.log("Done.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
