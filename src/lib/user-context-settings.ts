import { Prisma } from "@/generated/prisma";

export interface UserContextSettings {
  personalContext: string | null;
}

export const DEFAULT_USER_CONTEXT_SETTINGS: UserContextSettings = {
  personalContext: null,
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function extractUserContextSettings(
  preferences: Prisma.JsonValue | null | undefined
): UserContextSettings {
  const root = asRecord(preferences);
  const context = asRecord(root.userContext);
  const personalContext = typeof context.personalContext === "string"
    ? context.personalContext.trim()
    : "";

  return {
    personalContext:
      personalContext.length > 0
        ? personalContext
        : DEFAULT_USER_CONTEXT_SETTINGS.personalContext,
  };
}

export function mergeUserContextSettingsIntoPreferences(
  preferences: Prisma.JsonValue | null | undefined,
  userContext: UserContextSettings
): Prisma.JsonObject {
  const root = asRecord(preferences);

  return {
    ...root,
    userContext: {
      personalContext: userContext.personalContext,
    },
  };
}
