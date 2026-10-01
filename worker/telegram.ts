import { Bot, InlineKeyboard } from "grammy";
import { addDays, addHours } from "date-fns";
import prisma from "@/lib/prisma";
import { handleMessage, undoMessage, type AssistantReply, type ReplyMeta } from "@/lib/ai/assistant";
import { planDay } from "@/lib/ai/planner";
import { getOwner } from "@/lib/users";
import { getStartOfDay } from "@/lib/utils";
import { interactive } from "@/lib/brain/signals";
import { contextFor, runAs } from "@/lib/request-context";

/** The person each incoming update belongs to (set by the first middleware). */
const people = new WeakMap<object, { id: string; name: string | null; pronouns: string }>();
import { describeWeek, weekScore } from "@/lib/weekly";
import { esc, formatBrief, formatScores } from "./format";

const token = process.env.TELEGRAM_BOT_TOKEN;
const ownerChatId = Number(process.env.TELEGRAM_OWNER_CHAT_ID || 0);

export const bot = token ? new Bot(token) : null;

export function isTelegramConfigured() {
  return Boolean(bot && ownerChatId);
}

/** A person's Telegram chat: linked in the app (User.telegramChatId); the owner's also from the env. */
async function chatIdFor(userId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { telegramChatId: true, email: true, integrations: true } });
  if (!u?.integrations) return null;
  if (u?.telegramChatId) return Number(u.telegramChatId);
  const owner = await getOwner();
  return userId === owner.id && ownerChatId ? ownerChatId : null;
}

export async function sendToUser(userId: string, text: string, keyboard?: InlineKeyboard) {
  const chat = bot ? await chatIdFor(userId) : null;
  if (!bot || !chat) {
    console.log(`[telegram not linked for ${userId}] ${text}`);
    return null;
  }
  return bot.api.sendMessage(chat, text, {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...(keyboard ? { reply_markup: keyboard } : {}),
  });
}

/** Health alerts and other owner-only messages. */
export async function sendToOwner(text: string, keyboard?: InlineKeyboard) {
  return sendToUser((await getOwner()).id, text, keyboard);
}

type Person = { id: string; name: string | null; pronouns: string };
/** Who this chat belongs to: a linked chat, or the owner's chat from the env. */
async function personForChat(chatId: number): Promise<Person | null> {
  const linked = await prisma.user.findUnique({ where: { telegramChatId: String(chatId) }, select: { id: true, name: true, pronouns: true } });
  if (linked) return linked;
  if (ownerChatId && chatId === ownerChatId) {
    const o = await getOwner();
    return { id: o.id, name: o.name, pronouns: o.pronouns };
  }
  return null;
}

export function reminderKeyboard(id: string) {
  return new InlineKeyboard().text("✅ Done", `rd:${id}`).text("⏰ 1h", `rs:${id}`).text("📅 Tomorrow", `rt:${id}`);
}

export function setupBot() {
  if (!bot) return;

  // Only linked chats get in. Someone with a code from the app (Profile → Connect Telegram) links with "/link CODE".
  bot.use(async (ctx, next) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    const person = await personForChat(chatId);
    if (person) {
      people.set(ctx, person);
      return next();
    }
    const code = ctx.message?.text?.match(/^\/(?:link|start)\s+([A-Z0-9]{6,12})\s*$/i)?.[1]?.toUpperCase();
    if (code) {
      const u = await prisma.user.findUnique({ where: { telegramLinkCode: code } });
      if (u?.integrations) {
        await prisma.user.update({ where: { id: u.id }, data: { telegramChatId: String(chatId), telegramLinkCode: null } });
        await ctx.reply(`Linked, ${u.name ?? "you're in"}! Text me anything to track it. /today shows your plan, /score your scores.`);
        return;
      }
    }
    if (ctx.message) await ctx.reply("This bot is private. To connect it, open LiveImproved → Profile → Connect Telegram and send me the code shown there.");
  });

  // While someone talks to the bot the background brain pauses; afterwards it re-checks their scores.
  // Everything below runs as that person.
  bot.use((ctx, next) => {
    const p = people.get(ctx)!;
    return interactive(() => runAs(contextFor(p, { priority: "interactive" }), () => next()), undefined, p.id);
  });

  bot.command("start", (ctx) => ctx.reply("LiveImproved is connected. Text me anything to track it. /today shows your plan, /replan rebuilds it, /score shows last night's scores."));

  bot.command("today", async (ctx) => {
    const owner = people.get(ctx)!;
    const { text, keyboard } = await formatBrief(owner.id, "morning");
    await ctx.reply(text, { parse_mode: "HTML", reply_markup: keyboard });
  });

  bot.command("replan", async (ctx) => {
    await ctx.replyWithChatAction("typing");
    const owner = people.get(ctx)!;
    await planDay(owner.id, { force: true });
    const { text, keyboard } = await formatBrief(owner.id, "morning");
    await ctx.reply(text, { parse_mode: "HTML", reply_markup: keyboard });
  });

  bot.command("score", async (ctx) => {
    const owner = people.get(ctx)!;
    const latest = await prisma.categoryScore.findFirst({ where: { userId: owner.id }, orderBy: { date: "desc" } });
    const week = describeWeek(await weekScore(owner.id));
    await ctx.reply(latest ? `${formatScores(latest)}\n\n📈 ${esc(week)}` : "No scores yet.", { parse_mode: "HTML" });
  });

  bot.on("message:text", async (ctx) => {
    const owner = people.get(ctx)!;
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
    const owner = people.get(ctx)!;
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
