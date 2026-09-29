import { Bot, InlineKeyboard } from "grammy";
import { addDays, addHours } from "date-fns";
import prisma from "@/lib/prisma";
import { handleMessage, undoMessage, type AssistantReply, type ReplyMeta } from "@/lib/ai/assistant";
import { planDay } from "@/lib/ai/planner";
import { getOwner } from "@/lib/owner";
import { getStartOfDay } from "@/lib/utils";
import { interactive } from "@/lib/brain/signals";
import { esc, formatBrief, formatScores } from "./format";

const token = process.env.TELEGRAM_BOT_TOKEN;
const ownerChatId = Number(process.env.TELEGRAM_OWNER_CHAT_ID || 0);

export const bot = token ? new Bot(token) : null;

export function isTelegramConfigured() {
  return Boolean(bot && ownerChatId);
}

export async function sendToOwner(text: string, keyboard?: InlineKeyboard) {
  if (!bot || !ownerChatId) {
    console.log(`[telegram disabled] ${text}`);
    return null;
  }
  return bot.api.sendMessage(ownerChatId, text, {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...(keyboard ? { reply_markup: keyboard } : {}),
  });
}

export function reminderKeyboard(id: string) {
  return new InlineKeyboard().text("✅ Done", `rd:${id}`).text("⏰ 1h", `rs:${id}`).text("📅 Tomorrow", `rt:${id}`);
}

export function setupBot() {
  if (!bot) return;

  // Anyone else who finds the bot gets nothing but their chat id (for first-time setup).
  bot.use(async (ctx, next) => {
    const chatId = ctx.chat?.id;
    if (!ownerChatId) {
      if (ctx.message) await ctx.reply(`Set TELEGRAM_OWNER_CHAT_ID=${chatId} on the server to link this chat.`);
      return;
    }
    if (chatId !== ownerChatId) return;
    await next();
  });

  // While he's talking to the bot the background brain pauses; afterwards it re-checks his scores.
  bot.use((_ctx, next) => interactive(() => next()));

  bot.command("start", (ctx) => ctx.reply("LiveImproved is connected. Text me anything to track it. /today shows your plan, /replan rebuilds it, /score shows last night's scores."));

  bot.command("today", async (ctx) => {
    const owner = await getOwner();
    const { text, keyboard } = await formatBrief(owner.id, "morning");
    await ctx.reply(text, { parse_mode: "HTML", reply_markup: keyboard });
  });

  bot.command("replan", async (ctx) => {
    await ctx.replyWithChatAction("typing");
    const owner = await getOwner();
    await planDay(owner.id, { force: true });
    const { text, keyboard } = await formatBrief(owner.id, "morning");
    await ctx.reply(text, { parse_mode: "HTML", reply_markup: keyboard });
  });

  bot.command("score", async (ctx) => {
    const owner = await getOwner();
    const latest = await prisma.categoryScore.findFirst({ where: { userId: owner.id }, orderBy: { date: "desc" } });
    await ctx.reply(latest ? formatScores(latest) : "No scores yet.", { parse_mode: "HTML" });
  });

  bot.on("message:text", async (ctx) => {
    const owner = await getOwner();
    const typing = setInterval(() => ctx.replyWithChatAction("typing").catch(() => undefined), 4500);
    await ctx.replyWithChatAction("typing").catch(() => undefined);
    try {
      const result = await handleMessage(owner.id, ctx.message.text, "telegram");
      await ctx.reply(esc(result.reply), { parse_mode: "HTML", reply_markup: replyKeyboard(result) });
    } finally {
      clearInterval(typing);
    }
  });

  bot.on("callback_query:data", async (ctx) => {
    const owner = await getOwner();
    const [kind, a, b] = ctx.callbackQuery.data.split(":");
    let note = "";

    // Tapped a quick-reply option: answer as if typed.
    if (kind === "opt" && a && b) {
      const msg = await prisma.chatMessage.findFirst({ where: { id: a, userId: owner.id } });
      const option = (msg?.meta as ReplyMeta | null)?.options?.[Number(b)];
      await ctx.answerCallbackQuery();
      if (!option) return;
      await ctx.editMessageReplyMarkup().catch(() => undefined);
      await ctx.reply(`<i>› ${esc(option)}</i>`, { parse_mode: "HTML" });
      await ctx.replyWithChatAction("typing").catch(() => undefined);
      const result = await handleMessage(owner.id, option, "telegram");
      await ctx.reply(esc(result.reply), { parse_mode: "HTML", reply_markup: replyKeyboard(result) });
      return;
    }

    if (kind === "undo" && a) {
      if (await undoMessage(owner.id, a)) note = "↩︎ Undone";
    } else if ((kind === "rd" || kind === "rs" || kind === "rt") && a) {
      const reminder = await prisma.reminder.findFirst({ where: { id: a, userId: owner.id } });
      if (reminder) {
        if (kind === "rd") {
          if (reminder.recurrence === "none") await prisma.reminder.update({ where: { id: a }, data: { status: "done" } });
          if (reminder.todoId) await prisma.todo.updateMany({ where: { id: reminder.todoId }, data: { status: "done", completedAt: new Date() } });
          note = "✅ Done";
        } else {
          const fireAt = kind === "rs" ? addHours(new Date(), 1) : (() => { const d = addDays(getStartOfDay(new Date()), 1); d.setHours(9); return d; })();
          if (reminder.recurrence === "none") {
            await prisma.reminder.update({ where: { id: a }, data: { status: "pending", fireAt } });
          } else {
            await prisma.reminder.create({ data: { userId: owner.id, text: reminder.text, fireAt, todoId: reminder.todoId } });
          }
          note = kind === "rs" ? "⏰ Snoozed 1h" : "📅 Moved to tomorrow 9am";
        }
      }
    } else if (kind === "pd" && a && b) {
      const now = new Date();
      if (a === "todo") await prisma.todo.updateMany({ where: { id: b, userId: owner.id }, data: { status: "done", completedAt: now } });
      if (a === "task") await prisma.projectTask.updateMany({ where: { id: b, project: { userId: owner.id } }, data: { status: "completed", completedAt: now } });
      if (a === "routine") {
        const date = getStartOfDay(now);
        await prisma.habitLog.upsert({ where: { habitId_date: { habitId: b, date } }, update: { completed: true }, create: { habitId: b, date, completed: true } });
      }
      note = "✅ Done";
    }

    await ctx.answerCallbackQuery({ text: note || "OK" });
    if (note && ctx.callbackQuery.message) {
      const original = ctx.callbackQuery.message.text ?? "";
      if (kind === "pd") {
        // Refresh the brief so ticked items disappear from the keyboard.
        const { text, keyboard } = await formatBrief(owner.id, "morning");
        await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: keyboard }).catch(() => undefined);
      } else {
        await ctx.editMessageText(`${esc(original)}\n\n<i>${note}</i>`, { parse_mode: "HTML" }).catch(() => undefined);
      }
    }
  });

  bot.catch((err) => console.error("telegram error", err.error));
}

function replyKeyboard(result: AssistantReply) {
  const options = result.meta?.options ?? [];
  if (!options.length && !result.actions.length) return undefined;
  const keyboard = new InlineKeyboard();
  options.forEach((o, i) => keyboard.text(o, `opt:${result.id}:${i}`).row());
  if (result.actions.length) keyboard.text("↩︎ Undo", `undo:${result.id}`);
  return keyboard;
}
