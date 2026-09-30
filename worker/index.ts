/**
 * Long-running worker: Telegram bot (long polling, outbound only) + scheduled jobs.
 * Run with TZ set to your local timezone so cron times and "today" line up.
 */
import cron from "node-cron";
import { warmUp } from "@/lib/ai/llm";
import { JOBS } from "./jobs";
import { lastRun, recordJob } from "@/lib/health";
import { bot, isTelegramConfigured, setupBot } from "./telegram";

const tz = process.env.TZ ?? "America/New_York";

function schedule(expr: string, name: keyof typeof JOBS) {
  cron.schedule(
    expr,
    async () => {
      const started = Date.now();
      try {
        await JOBS[name]();
        if (name !== "reminders") console.log(`[job] ${name} ok in ${Date.now() - started}ms`);
        if (name !== "reminders") await recordJob(name, true);
      } catch (error) {
        console.error(`[job] ${name} failed`, error);
        await recordJob(name, false, error);
      }
    },
    { timezone: tz, noOverlap: true, name }
  );
}

async function main() {
  await warmUp();

  schedule("* * * * *", "reminders");
  schedule("*/10 * * * *", "health");
  schedule("*/5 * * * *", "google");
  schedule("30 23 * * *", "news");
  schedule("30 6 * * *", "plan");
  schedule("0 7 * * *", "morning");
  schedule("0 21 * * *", "evening");
  schedule("30 23 * * *", "judge");
  schedule("0 18 * * 0", "weekly");
  console.log(`[worker] scheduler running (${tz})`);
  // Missed last night's news (server was down)? Get it now.
  void (async () => {
    const last = await lastRun("news");
    if (!last || Date.now() - new Date(last.at).getTime() > 26 * 3_600_000 || !last.ok) {
      try {
        await JOBS.news();
        await recordJob("news", true);
      } catch (error) {
        await recordJob("news", false, error);
      }
    }
  })();

  if (bot) {
    setupBot();
    if (!isTelegramConfigured()) console.warn("[worker] TELEGRAM_OWNER_CHAT_ID not set — message the bot to get your chat id");
    await bot.api.setMyCommands([
      { command: "today", description: "Today's plan" },
      { command: "replan", description: "Rebuild today's plan" },
      { command: "score", description: "Latest daily scores" },
    ]);
    bot.start({ drop_pending_updates: false, onStart: (me) => console.log(`[worker] telegram @${me.username} polling`) });
  } else {
    console.warn("[worker] TELEGRAM_BOT_TOKEN not set — Telegram disabled");
  }
}

const stop = () => {
  bot?.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
