import { after, NextRequest, NextResponse } from "next/server";
import { setBackgroundRunner } from "@/lib/background";
import { z } from "zod";
import { getOwnerSession } from "@/lib/owner";
import prisma from "@/lib/prisma";
import { handleMessage } from "@/lib/ai/assistant";
import { reportError } from "@/lib/monitoring";

export const maxDuration = 300;

// Let post-reply work (memory compaction, meal nutrition) finish after the response on Vercel.
setBackgroundRunner((task) => after(task));

/** The floating coach resumes the latest web conversation if it's this recent. */
const RESUME_MS = 6 * 60 * 60_000;

const postSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  conversationId: z.string().min(1).nullish(),
});

/** ?conversationId=… loads that conversation; otherwise the most recent web one, if still fresh. */
export async function GET(req: NextRequest) {
  const session = await getOwnerSession();
  const requested = req.nextUrl.searchParams.get("conversationId");
  const conv = requested
    ? await prisma.conversation.findFirst({ where: { id: requested, userId: session.user.id } })
    : await prisma.conversation.findFirst({
        where: { userId: session.user.id, source: "web", updatedAt: { gte: new Date(Date.now() - RESUME_MS) } },
        orderBy: { updatedAt: "desc" },
      });
  if (!conv) return NextResponse.json({ conversation: null, messages: [] }, { status: requested ? 404 : 200 });
  const messages = await prisma.chatMessage.findMany({
    where: { conversationId: conv.id },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, role: true, content: true, actions: true, meta: true, source: true, createdAt: true },
  });
  return NextResponse.json({
    conversation: { id: conv.id, title: conv.title, saved: conv.saved },
    messages: messages.reverse(),
  });
}

/**
 * Streams newline-delimited JSON events:
 *   {"type":"conversation","id"} → {"type":"status","text"}* / {"type":"token","text"}* → {"type":"done","reply"} | {"type":"error"}
 */
export async function POST(req: NextRequest) {
  const session = await getOwnerSession();
  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "message is required" }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // Client went away; the reply is still saved to the conversation.
        }
      };
      try {
        const reply = await handleMessage(session.user.id, parsed.data.message, "web", {
          conversationId: parsed.data.conversationId,
          onConversation: (id) => send({ type: "conversation", id }),
          onToken: (text) => send({ type: "token", text }),
          onStatus: (text) => send({ type: "status", text }),
        });
        send({ type: "done", reply });
      } catch (error) {
        reportError({ context: "api.chat.POST", error });
        send({ type: "error", error: "Something went wrong" });
      } finally {
        try {
          controller.close();
        } catch {}
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" },
  });
}
