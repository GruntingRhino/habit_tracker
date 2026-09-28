/**
 * Minimal Ollama client for the local Spark-X2.5 model.
 *
 * Performance notes (2-core ARM box):
 * - Prompt eval is ~20-35 tok/s cold but Ollama reuses the KV cache for an identical
 *   prefix, so every caller keeps its system prompt byte-for-byte stable and puts
 *   anything dynamic (dates, lists) at the END of the last user message.
 * - Generation is ~10 tok/s, so outputs are schema-constrained and kept short.
 */

export const LLM_MODEL = process.env.LLM_MODEL ?? "sparkx2.5:1.7b";
const BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";

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
}

export interface ChatResult {
  content: string;
  thinking?: string;
  evalCount: number;
  promptEvalCount: number;
  durationMs: number;
}

export class LlmError extends Error {}

export async function chat(opts: ChatOptions): Promise<ChatResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 60_000);
  const started = Date.now();
  try {
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: LLM_MODEL,
        messages: opts.messages,
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
          message?: { content?: string; thinking?: string };
          done?: boolean;
          eval_count?: number;
          prompt_eval_count?: number;
          error?: string;
        };
        if (part.error) throw new LlmError(part.error);
        content += part.message?.content ?? "";
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
    if (error instanceof Error && error.name === "AbortError") {
      throw new LlmError(`Model timed out after ${opts.timeoutMs ?? 60_000}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
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
    const res = await fetch(`${BASE_URL}/api/ps`, { signal: AbortSignal.timeout(2000) });
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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: LLM_MODEL, keep_alive: -1 }),
  }).catch(() => undefined);
}
