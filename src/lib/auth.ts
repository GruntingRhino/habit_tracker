/**
 * Username + password login for the (two) people who use the app.
 *
 *   passwords: scrypt (N=16384, r=8, p=1), random 16-byte salt — "scrypt$16384$<salt>$<hash>"
 *   session:   HttpOnly cookie "<payload>.<hmac>" signed with AUTH_SECRET; payload {u, v, exp}.
 *              v = User.sessionVersion, so changing the password logs out every other device.
 * Cookie signing uses Web Crypto so the same code runs in the proxy and in route handlers.
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;
export const SESSION_COOKIE = "li_session";
export const SESSION_DAYS = 60;

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$16384$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined) {
  if (!stored) return false;
  const [kind, n, salt, hash] = stored.split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const want = Buffer.from(hash, "base64url");
  const got = await scrypt(password, Buffer.from(salt, "base64url"), want.length, { N: Number(n), r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return got.length === want.length && timingSafeEqual(got, want);
}

/** At least 10 characters; not a single repeated character. */
export function passwordProblem(pw: string) {
  if (pw.length < 10) return "Use at least 10 characters.";
  if (pw.length > 200) return "That's too long.";
  if (/^(.)\1+$/.test(pw)) return "Pick something less guessable.";
  return null;
}

export function newPassword() {
  // 4 groups of 4 from an unambiguous alphabet: easy to type from a text message.
  const abc = "abcdefghjkmnpqrstuvwxyz23456789";
  const b = randomBytes(16);
  return Array.from({ length: 4 }, (_, g) => Array.from({ length: 4 }, (_, i) => abc[b[g * 4 + i] % abc.length]).join("")).join("-");
}

// ---- session cookie ----------------------------------------------------------------------------

export interface SessionPayload {
  u: string; // user id
  v: number; // session version
  exp: number; // ms epoch
}

const enc = new TextEncoder();
const b64url = (buf: ArrayBuffer | Uint8Array) => Buffer.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf)).toString("base64url");

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET must be set (32+ characters)");
  return s;
}

async function hmac(data: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

export async function signSession(userId: string, version: number, now = Date.now()) {
  const payload = b64url(enc.encode(JSON.stringify({ u: userId, v: version, exp: now + SESSION_DAYS * 86_400_000 } satisfies SessionPayload)));
  return `${payload}.${await hmac(payload)}`;
}

/** Signature and expiry only (no database): what the proxy can check on every request. */
export async function readSession(cookie: string | undefined | null, now = Date.now()): Promise<SessionPayload | null> {
  if (!cookie) return null;
  const [payload, sig] = cookie.split(".");
  if (!payload || !sig) return null;
  let expected: string;
  try {
    expected = await hmac(payload);
  } catch {
    return null;
  }
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionPayload;
    return typeof p.u === "string" && typeof p.exp === "number" && p.exp > now ? p : null;
  } catch {
    return null;
  }
}

export const cookieOptions = (maxAgeDays = SESSION_DAYS) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: maxAgeDays * 86_400,
});
