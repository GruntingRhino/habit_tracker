import { Prisma } from "@/generated/prisma";
import prisma from "@/lib/prisma";

const PRIVATE_COACH_CONTEXT_KEY = "privateCoachContext";

export interface PrivateCoachContextCache {
  version: 1;
  status: "ready" | "dirty";
  generatedAt: string | null;
  summary: string;
  compactContext: Record<string, unknown>;
}

function asPreferenceRecord(
  preferences: Prisma.JsonValue | null | undefined
): Record<string, unknown> {
  return preferences && typeof preferences === "object" && !Array.isArray(preferences)
    ? (preferences as Record<string, unknown>)
    : {};
}

export function readPrivateCoachContextCache(
  preferences: Prisma.JsonValue | null | undefined
): PrivateCoachContextCache | null {
  const record = asPreferenceRecord(preferences);
  const raw = record[PRIVATE_COACH_CONTEXT_KEY];

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const value = raw as Record<string, unknown>;
  if (
    value.version !== 1 ||
    (value.status !== "ready" && value.status !== "dirty") ||
    typeof value.summary !== "string" ||
    !value.compactContext ||
    typeof value.compactContext !== "object" ||
    Array.isArray(value.compactContext)
  ) {
    return null;
  }

  return {
    version: 1,
    status: value.status,
    generatedAt: typeof value.generatedAt === "string" ? value.generatedAt : null,
    summary: value.summary,
    compactContext: value.compactContext as Record<string, unknown>,
  };
}

export function mergePrivateCoachContextCache(
  preferences: Prisma.JsonValue | null | undefined,
  cache: PrivateCoachContextCache
): Prisma.InputJsonObject {
  const serializedCache: Prisma.InputJsonObject = {
    version: cache.version,
    status: cache.status,
    generatedAt: cache.generatedAt,
    summary: cache.summary,
    compactContext: cache.compactContext as unknown as Prisma.InputJsonObject,
  };

  return {
    ...asPreferenceRecord(preferences),
    [PRIVATE_COACH_CONTEXT_KEY]: serializedCache,
  } as unknown as Prisma.InputJsonObject;
}

export async function markCoachContextDirty(
  userId: string,
  db: Prisma.TransactionClient | typeof prisma = prisma
): Promise<void> {
  const existing = await db.coachProfile.findUnique({
    where: { userId },
    select: { preferences: true },
  });

  const currentCache = readPrivateCoachContextCache(existing?.preferences);
  const nextCache: PrivateCoachContextCache = currentCache
    ? {
        ...currentCache,
        status: "dirty",
      }
    : {
        version: 1,
        status: "dirty",
        generatedAt: null,
        summary: "",
        compactContext: {},
      };

  await db.coachProfile.upsert({
    where: { userId },
    create: {
      userId,
      preferences: mergePrivateCoachContextCache(existing?.preferences, nextCache),
    },
    update: {
      preferences: mergePrivateCoachContextCache(existing?.preferences, nextCache),
    },
  });
}
