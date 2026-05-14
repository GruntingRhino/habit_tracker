import { createHash } from "node:crypto";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/monitoring";

const memoryStore = new Map<
  string,
  { count: number; firstAttempt: number; lockedUntil?: number }
>();

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

let lastCleanup = Date.now();

type HeaderSource =
  | Headers
  | Record<string, string | string[] | undefined>
  | undefined;

function shouldUseMemoryStore(): boolean {
  return process.env.NODE_ENV === "test" || process.env.RATE_LIMIT_STORE === "memory";
}

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

function readHeader(headers: HeaderSource, name: string): string | undefined {
  if (!headers) return undefined;

  if (typeof (headers as Headers).get === "function") {
    return (headers as Headers).get(name) ?? undefined;
  }

  const value = (headers as Record<string, string | string[] | undefined>)[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

function cleanupMemoryStore() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;

  for (const [key, entry] of memoryStore.entries()) {
    const expired =
      (entry.lockedUntil ? entry.lockedUntil < now : false) ||
      now - entry.firstAttempt > WINDOW_MS * 2;
    if (expired) memoryStore.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remainingAttempts: number;
  retryAfterMs?: number;
}

function checkMemoryRateLimit(key: string): RateLimitResult {
  cleanupMemoryStore();
  const now = Date.now();
  const entry = memoryStore.get(key);

  if (entry?.lockedUntil) {
    if (now < entry.lockedUntil) {
      return {
        allowed: false,
        remainingAttempts: 0,
        retryAfterMs: entry.lockedUntil - now,
      };
    }
    memoryStore.delete(key);
  }

  if (!entry || now - entry.firstAttempt > WINDOW_MS) {
    memoryStore.set(key, { count: 1, firstAttempt: now });
    return { allowed: true, remainingAttempts: MAX_ATTEMPTS - 1 };
  }

  entry.count += 1;

  if (entry.count > MAX_ATTEMPTS) {
    entry.lockedUntil = now + LOCKOUT_MS;
    return { allowed: false, remainingAttempts: 0, retryAfterMs: LOCKOUT_MS };
  }

  return { allowed: true, remainingAttempts: MAX_ATTEMPTS - entry.count };
}

async function checkDatabaseRateLimit(key: string): Promise<RateLimitResult> {
  const now = new Date();
  const bucketId = hashKey(key);

  return prisma.$transaction(async (tx) => {
    const entry = await tx.rateLimitBucket.findUnique({
      where: { id: bucketId },
    });

    if (entry?.lockedUntil && now < entry.lockedUntil) {
      return {
        allowed: false,
        remainingAttempts: 0,
        retryAfterMs: entry.lockedUntil.getTime() - now.getTime(),
      };
    }

    if (!entry || now.getTime() - entry.windowStart.getTime() > WINDOW_MS) {
      await tx.rateLimitBucket.upsert({
        where: { id: bucketId },
        create: {
          id: bucketId,
          count: 1,
          windowStart: now,
          lockedUntil: null,
        },
        update: {
          count: 1,
          windowStart: now,
          lockedUntil: null,
        },
      });

      return { allowed: true, remainingAttempts: MAX_ATTEMPTS - 1 };
    }

    const nextCount = entry.count + 1;
    const lockedUntil =
      nextCount > MAX_ATTEMPTS ? new Date(now.getTime() + LOCKOUT_MS) : null;

    await tx.rateLimitBucket.update({
      where: { id: bucketId },
      data: {
        count: nextCount,
        lockedUntil,
      },
    });

    if (lockedUntil) {
      return {
        allowed: false,
        remainingAttempts: 0,
        retryAfterMs: LOCKOUT_MS,
      };
    }

    return {
      allowed: true,
      remainingAttempts: MAX_ATTEMPTS - nextCount,
    };
  });
}

export async function checkRateLimit(key: string): Promise<RateLimitResult> {
  if (shouldUseMemoryStore()) {
    return checkMemoryRateLimit(key);
  }

  try {
    return await checkDatabaseRateLimit(key);
  } catch (error) {
    reportError({ context: "rate-limit check", error });
    return checkMemoryRateLimit(key);
  }
}

export async function resetRateLimit(key: string): Promise<void> {
  if (shouldUseMemoryStore()) {
    memoryStore.delete(key);
    return;
  }

  try {
    await prisma.rateLimitBucket.delete({
      where: { id: hashKey(key) },
    });
  } catch (error) {
    reportError({ context: "rate-limit reset", error });
    memoryStore.delete(key);
  }
}

export function extractClientIp(headers: HeaderSource): string | null {
  const forwardedFor = readHeader(headers, "x-forwarded-for");
  if (forwardedFor) {
    const [firstIp] = forwardedFor.split(",");
    const candidate = firstIp?.trim();
    if (candidate) return candidate;
  }

  const realIp = readHeader(headers, "x-real-ip")?.trim();
  if (realIp) return realIp;

  return null;
}

export function buildScopedRateLimitKeys(
  scope: string,
  identity: string,
  ip: string | null
): string[] {
  const normalizedIdentity = identity.trim().toLowerCase();
  const keys = new Set<string>([`${scope}:id:${normalizedIdentity}`]);

  if (ip) {
    keys.add(`${scope}:ip:${ip}`);
    keys.add(`${scope}:id-ip:${normalizedIdentity}:${ip}`);
  }

  return [...keys];
}

export async function isRateLimited(keys: string[]): Promise<RateLimitResult | null> {
  for (const key of keys) {
    const result = await checkRateLimit(key);
    if (!result.allowed) {
      return result;
    }
  }

  return null;
}
