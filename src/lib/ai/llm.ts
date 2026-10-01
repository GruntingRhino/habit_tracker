/**
 * Minimal Ollama client for the local Spark-X2.5 model.
 *
 * Performance notes (2-core ARM box):
 * - Prompt eval is ~20-35 tok/s cold but Ollama reuses the KV cache for an identical
 *   prefix, so every caller keeps its system prompt byte-for-byte stable and puts
 *   anything dynamic (dates, lists) at the END of the last user message.
 * - Generation is ~10 tok/s, so outputs are schema-constrained and kept short.
 */

import { personalize, resolveContext } from "@/lib/request-context";

export const LLM_MODEL = process.env.LLM_MODEL ?? "sparkx2.5-abliterated:1.7b-q8";
const BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
// Set when Ollama sits behind deploy/ollama-gate.mjs (the Vercel deployment reaches it over Tailscale Funnel).
const AUTH: Record<string, string> = process.env.OLLAMA_AUTH_TOKEN
  ? { Authorization: `Bearer ${process.env.OLLAMA_AUTH_TOKEN}` }
  : {};

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  messages: ChatMessage[];
  /** JSON schema to constrain output (Ollama structured outputs). */
  schema?: object;
  think?: boolean;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  /** Called with each content chunk as it streams in. */
  onToken?: (text: string) => void;
  /** Aborting it stops the generation (Ollama drops the request when the connection closes). */
  signal?: AbortSignal;
}

export interface ChatResult {
  content: string;
  thinking?: string;
  evalCount: number;
  promptEvalCount: number;
  durationMs: number;
}

export class LlmError extends Error {}
/** The caller cancelled (e.g. background work yielding to a chat). */
export class LlmAborted extends LlmError {}

/**
 * The public link to the server (Tailscale Funnel) sometimes drops a connection during the TLS
 * handshake. Nothing reached the model yet, so those are safe to retry; anything later isn't.
 */
const RETRYABLE = /ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|UND_ERR_SOCKET|UND_ERR_CONNECT_TIMEOUT|EAI_AGAIN|ENOTFOUND/;
async function fetchRetrying(url: string, init: RequestInit, tries = 4): Promise<Response> {
  for (let i = 1; ; i++) {
    try {
      return await fetch(url, init);
    } catch (error) {
      const code = (error as { cause?: { code?: string; message?: string } }).cause;
      const retryable = error instanceof TypeError && RETRYABLE.test(`${code?.code ?? ""} ${code?.message ?? ""}`) && !init.signal?.aborted;
      if (!retryable || i >= tries) throw error;
      await new Promise((r) => setTimeout(r, 300 * i));
    }
  }
}

/** Most time a request may wait in the gate's queue before giving up (on top of its own timeout). */
const MAX_QUEUE_WAIT_MS = 6 * 60_000;

export async function chat(opts: ChatOptions): Promise<ChatResult> {
  const controller = new AbortController();
  let timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 60_000);
  const ctx = await resolveContext();
  // Prompts are written about the owner; for anyone else the names and pronouns are swapped.
  const messages = ctx ? opts.messages.map((m) => (m.role === "system" ? { ...m, content: personalize(m.content, ctx) } : m)) : opts.messages;
  const queueDeadline = Date.now() + MAX_QUEUE_WAIT_MS;
  const cancel = () => controller.abort();
  if (opts.signal?.aborted) controller.abort();
  opts.signal?.addEventListener("abort", cancel);
  const started = Date.now();
  try {
    const res = await fetchRetrying(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...AUTH,
        // The gate's queue: whose request, and how urgent (chat > scheduled jobs > background brain).
        ...(ctx ? { "X-LI-User": ctx.userId } : {}),
        "X-LI-Priority": ctx?.priority ?? process.env.LLM_PRIORITY ?? "interactive",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: LLM_MODEL,
        messages,
        // Streamed so response headers arrive at once: Node fetch aborts after 300s
        // without headers, and thinking-mode jobs can run longer than that.
        stream: true,
        think: opts.think ?? false,
        keep_alive: -1,
        ...(opts.schema ? { format: opts.schema } : {}),
        options: {
          temperature: opts.temperature ?? 0.2,
          top_p: 0.95,
          num_predict: opts.maxTokens ?? 256,
        },
      }),
    });
    if (!res.ok || !res.body) throw new LlmError(`Ollama ${res.status}: ${await res.text()}`);

    let content = "";
    let thinking = "";
    let evalCount = 0;
    let promptEvalCount = 0;
    const decoder = new TextDecoder();
    let buffer = "";
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      buffer += decoder.decode(chunk, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        const part = JSON.parse(line) as {
          queued?: number;
          message?: { content?: string; thinking?: string };
          done?: boolean;
          eval_count?: number;
          prompt_eval_count?: number;
          error?: string;
        };
        if (part.error) throw new LlmError(part.error);
        // Waiting in the gate's line: say where, and don't let the wait eat the request's own time.
        if (part.queued != null) {
          ctx?.onQueue?.(part.queued);
          clearTimeout(timer);
          // In line: wait up to the queue limit. Our turn (0): the request's own timeout starts now.
          timer = setTimeout(() => controller.abort(), part.queued > 0 ? Math.max(1000, queueDeadline - Date.now()) : opts.timeoutMs ?? 60_000);
          continue;
        }
        const piece = part.message?.content ?? "";
        content += piece;
        if (piece) opts.onToken?.(piece);
        thinking += part.message?.thinking ?? "";
        if (part.done) {
          evalCount = part.eval_count ?? 0;
          promptEvalCount = part.prompt_eval_count ?? 0;
        }
      }
    }
    return {
      content,
      thinking: thinking || undefined,
      evalCount,
      promptEvalCount,
      durationMs: Date.now() - started,
    };
  } catch (error) {
    if (opts.signal?.aborted) throw new LlmAborted("Cancelled");
    if (error instanceof Error && error.name === "AbortError") {
      throw new LlmError(`Model timed out after ${opts.timeoutMs ?? 60_000}ms`);
    }
    // "fetch failed" hides the reason (refused, reset, TLS…): keep it.
    if (error instanceof TypeError && (error as { cause?: unknown }).cause) {
      const c = (error as { cause: { code?: string; message?: string } }).cause;
      throw new LlmError(`Model unreachable: ${c.code ?? ""} ${c.message ?? ""}`.trim());
    }
    throw error;
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", cancel);
  }
}

/** Parse model JSON output, tolerating stray text around the object. */
export function parseJson<T = unknown>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(text.slice(start, end + 1)) as T;
    } catch {
      return null;
    }
  }
}

export async function chatJson<T>(opts: ChatOptions & { schema: object }): Promise<T | null> {
  const result = await chat(opts);
  return parseJson<T>(result.content);
}

export async function isModelUp(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/api/ps`, { headers: AUTH, signal: AbortSignal.timeout(2000) });
    if (!res.ok) return false;
    const data = (await res.json()) as { models?: { name: string }[] };
    return (data.models ?? []).some((m) => m.name.startsWith(LLM_MODEL));
  } catch {
    return false;
  }
}

export async function warmUp(): Promise<void> {
  await fetch(`${BASE_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...AUTH },
    body: JSON.stringify({ model: LLM_MODEL, keep_alive: -1 }),
  }).catch(() => undefined);
}
