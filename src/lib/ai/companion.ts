import { chat } from "@/lib/ai/llm";
import { conversationContext } from "@/lib/ai/conversation";

// Keep byte-for-byte stable for the prompt cache. Anything dynamic goes at the end of the last message.
export const CHAT_SYSTEM = `You are LiveImproved, Abhay's personal assistant and coach, living inside his life tracker. You talk like a sharp, warm friend who texts back: casual, direct, genuinely interested.
- Keep it short. Small talk: 1-2 sentences. Help or advice: at most 6 short lines, concrete and specific.
- Only end with a question when you actually need the answer. Never tack on offers like "want to go over your plan?".
- Match his energy and tone. Joke back when he jokes. Be real, not cheesy; no motivational-poster lines.
- Use the memory and earlier messages. Stay on the current topic and never re-ask something he already told you.
- If a question is too vague to answer well, ask one short clarifying question instead of guessing.
- You can't see his to-dos, schedule or scores in this mode. If he wants them, tell him to ask "what's on today?" or similar. Never invent facts about his life or data.
- You can't create, schedule, move, update or delete anything yourself; the app does that and leaves a [note] when it does. Never claim you did something no note shows.
- Lines in [brackets] are notes from the app about what it did. Trust them. If he pressed Undo on something, it's gone: don't say you'll update, use or remind him of it. If he wants it back, he can ask ("make the plan again").
- Plain text only. No headings, tables or bold. Simple "-" bullets are fine for lists.`;

export async function companionReply(
  conversationId: string,
  userMessageId: string,
  text: string,
  onToken?: (t: string) => void,
  /** What the app just did this turn, so the reply doesn't contradict it. */
  note?: string
) {
  const context = await conversationContext(conversationId, userMessageId);
  const ask = (temperature: number) =>
    chat({
      messages: [
        { role: "system", content: CHAT_SYSTEM },
        ...context,
        { role: "user", content: `${text}${note ? `\n\n[${note}]` : ""}` },
      ],
      temperature,
      maxTokens: 260,
      timeoutMs: 120_000,
      onToken,
    });
  let reply = tidy((await ask(0.7)).content);
  // A small model sometimes just repeats the message back; one retry, then drop the echoed part.
  if (isEcho(reply, text)) reply = tidy((await ask(0.9)).content);
  return stripEcho(reply, text);
}

function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

function isEcho(reply: string, text: string) {
  return !reply || norm(reply) === norm(text);
}

/** "who are you? i'm …" → "i'm …" */
function stripEcho(reply: string, text: string) {
  const lead = norm(text);
  const first = reply.split(/(?<=[?!.])\s+/)[0];
  if (lead.length >= 6 && norm(first) === lead && reply.length > first.length) return reply.slice(first.length).trim();
  return reply;
}

const GENERIC_OFFER =
  /\s*(want|would you like|do you want|wanna|care) to (talk|chat|go over|share|discuss|dig into|walk through|look at|review|know|see|hear|get)( more| some)? (about |over |through )?[^.?!]*\?\s*$/i;

/** Strip markdown the UI and Telegram would show literally, and any echoed timestamp. */
export function tidy(text: string) {
  const trimmed = text.trim();
  // Drop a generic closing offer ("Want to talk about…?") when there's a real reply before it.
  // The model sometimes parrots the app's [bracketed notes]; those are never part of a reply.
  const noNotes = trimmed
    // A written imitation of an app action row ("📌 Note: …") is not an action: keep only the words.
    .replace(/^[^\w\s"'(-]{1,3}\s*(To-do|Project|Task|Routine|Habit|Reminder|Meal|Workout|Journal|Note|✅ Done):\s*/gm, "")
    .split("\n")
    .filter((l) => !/^\s*\[.*\]\s*$/.test(l))
    .join("\n")
    .replace(/[ \t]*\[(note|notes|your reply|abhay|app|since|he )[^\]\n]{0,300}\][ \t]*[—-]?[ \t]*/gi, " ")
    .trim();
  const withoutOffer = noNotes.replace(GENERIC_OFFER, "").trim();
  return (withoutOffer.length >= 25 ? withoutOffer : noNotes)
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .trim();
}

const SMALL_TALK =
  /^(hi+|hey+|hello|yo+|sup|wh?at'?s up|wassup|howdy|good (morning|afternoon|evening|night)|gm|gn|how are (you|u)|how'?s it going|how you doing|thanks|thank (you|u)|thx|ty|lol|lmao|haha+|ok(ay)?|k|cool|nice|great|awesome|bye|see (you|ya)|night|morning|what'?s good|you there\??)\b[\s!.?,]*(\S+\s*){0,4}$/i;

/** Greetings and fillers skip the router: they're always chat, and this saves a model call. */
export function isSmallTalk(text: string) {
  return text.length <= 60 && SMALL_TALK.test(text.trim());
}

export const __test = { CHAT_SYSTEM };

// Questions about his own tracked data go to the data answerer, not chat.
const DATA_QUESTION =
  /\b(my (plan|day|tasks?|to-?dos?|lists?|schedule|projects?|scores?|week|reminders?|routines?|habits?|progress|meals?|workouts?|journal|notes?)|on (my )?(plate|today|tomorrow|deck)|due|overdue|what'?s (on|left|next|today)|how did i (do|score)|did i (finish|do|complete|log)|what (do|did) i (have|eat|log))\b/i;
const ADVICE =
  /\b(any (advice|tips|ideas|thoughts)|should i|what should i|what do you think|how (do|can|should) i|is it (ok|okay|bad|good|normal)|what'?s (the )?(best|difference|better)|do you (think|know)|can you (explain|tell me|help me understand)|why (do|does|is|are|am))\b/i;

/** A question about his own tracked data ("what's on my plate today?"). */
export function isDataQuestion(text: string) {
  return DATA_QUESTION.test(text) && (/\?\s*$/.test(text) || /^(what|whats|what's|how|did|do|which|when|show|list|tell me)\b/i.test(text.trim()));
}

/** Advice and general questions are conversation, whatever else they mention. */
export function isChatQuestion(text: string) {
  if (DATA_QUESTION.test(text)) return false;
  const core = text.trim().replace(/^((wait|ok(ay)?|so|and|also|hey|um+|hmm+|btw|actually|yo|oh|lol|real quick)[,.!\s]+)+/i, "");
  return ADVICE.test(core) || (/\?\s*$/.test(core) && /^(what|why|how|who|when|where|which|is|are|do|does|can|could|would|should|will)\b/i.test(core));
}

/** Something to file, log or remind: these go through the router even if they also ask something. */
export const CAPTURE_SIGNAL =
  /\b(remind me|add\b|put .{1,40} on my|i need to|i have to|i gotta|i'?ve got to|to-?do|log (my|this|that|a)|track (my|this|that)|jot|write (this|that) down|save (this|that)|remember (this|that)|i (just )?(ate|had|did|finished|completed|ran|lifted|trained|worked out|slept)|notes?\s*:)/i;

/** A capture that also asks something ("remind me at 5 to pack, also what should I eat?"). */
export function hasChatPart(text: string) {
  return text
    .split(/(?<=[.!?])\s+|[,;]\s*(?=(?:also|and also|btw|oh and|but|and)\b)|\s+(?:also|btw)\s+/i)
    .map((p) => p.trim())
    .some((p) => p.length > 3 && !CAPTURE_SIGNAL.test(p) && isChatQuestion(p));
}

/** Requests aimed at the assistant itself ("explain…", "write me…", "ignore previous instructions…"). Always chat. */
const ASSISTANT_COMMAND =
  /^(please |pls |can you |could you |would you |hey,? )?(explain|describe|define|summarize|translate|rewrite|rephrase|brainstorm|recommend|suggest|compare|print|repeat|reveal|pretend|act as|roleplay|ignore|forget (all|everything|your)|tell me (a|about|how|why|what|some|something|more)|give me (a|an|some|ideas|tips|examples|advice)|write( me)? (a|an|some|me)|draft|compose|help me (write|draft|understand|think|decide|figure|come up))\b/i;

export function isAssistantCommand(text: string) {
  return ASSISTANT_COMMAND.test(text.trim()) && !CAPTURE_SIGNAL.test(text);
}

export const HELP_QUESTION = /^(hey |so |ok )?(what (can|do|else can) you do|what are you for|how (do|does) (you|this|this app) work|what can i (ask|say|do here)|help|commands|how do i use (you|this))\??\s*$/i;

export const HELP_TEXT = `I'm your assistant for LiveImproved. Just talk to me normally; when you mention something to track, I file it (and every action has Undo):
- To-dos and projects: "I need to pay rent by friday"
- Reminders (sent on Telegram): "remind me tomorrow at 9 to call the bank"
- Habits: "stretch every night"
- Meals, workouts, journal: "had a burrito for lunch", "ran 3 miles", "today was rough…"
- Notes: "note: wifi password is …", then "what's my wifi password?"
- Your data: "what's on my plate today?", "how did I score yesterday?"
- Goal plans: "I want to get really good at MMA" and I'll ask a few questions and build a plan
Or just chat, ask for advice, or vent.`;

/** Bulk wipes, fake system messages, and prompt extraction. Answered by the app, never the model. */
export const OUT_OF_BOUNDS =
  /\bignore (all |any |your |the )?(previous|prior|above|earlier) (instructions|prompts?|rules)\b|^\s*(system|developer|admin)\s*:|^\s*(please |pls |can you |could you |just |now )?(delete|remove|clear|wipe|erase|complete|finish|mark)\s+(all|every|everything)\b|\b(system prompt|your (instructions|prompt|rules|guidelines))\b/i;

export const OUT_OF_BOUNDS_TEXT = `I can't do bulk changes or share my setup from chat. Nothing was changed. To finish something, tell me ("I finished the essay"); to delete things, use Undo or the item's page.`;

export const WHO_ARE_YOU = /^\s*(who|what) are you\??\s*$|^\s*what'?s your name\??\s*$|^\s*are you (a bot|an ai|real|human)\??\s*$/i;
export const WHO_TEXT = `I'm LiveImproved, your personal assistant inside this app, running on a small AI model on your own server. I chat, and I file things for you: to-dos, reminders, routines, meals, workouts, notes, and goal plans. Ask "what can you do?" for examples.`;
