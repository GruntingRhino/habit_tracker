/**
 * Tell the background brain his data changed, so it re-grades the live scores once he pauses.
 * On Vercel this goes through the Ollama gate (POST /brain/touch, same bearer token); on the server
 * itself it writes the signal file directly. Never throws, never blocks for long.
 */
import { touchChanged } from "./signals";

export async function touchBrain(userId?: string) {
  const base = process.env.OLLAMA_BASE_URL ?? "";
  const token = process.env.OLLAMA_AUTH_TOKEN;
  if (token && base.startsWith("https://")) {
    await fetch(`${base}/brain/touch${userId ? `?user=${encodeURIComponent(userId)}` : ""}`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(3000) }).catch(() => undefined);
  } else {
    touchChanged(undefined, userId);
  }
}
