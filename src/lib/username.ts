export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 32;
export const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{1,30}[a-z0-9])$/;

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidUsername(value: string): boolean {
  return USERNAME_PATTERN.test(normalizeUsername(value));
}

export function sanitizeUsernameCandidate(value: string): string {
  const normalized = normalizeUsername(value)
    .replace(/@.*$/, "")
    .replace(/[^a-z0-9._-]+/g, "")
    .replace(/^[^a-z0-9]+/, "")
    .replace(/[^a-z0-9]+$/, "");

  if (normalized.length >= USERNAME_MIN_LENGTH) {
    return normalized.slice(0, USERNAME_MAX_LENGTH);
  }

  return "user";
}

export function buildUniqueUsername(
  preferred: string,
  existing: Set<string>
): string {
  const base = sanitizeUsernameCandidate(preferred);

  if (!existing.has(base)) {
    existing.add(base);
    return base;
  }

  for (let suffix = 2; suffix < 10000; suffix += 1) {
    const candidate = `${base.slice(0, USERNAME_MAX_LENGTH - String(suffix).length)}${suffix}`;
    if (!existing.has(candidate)) {
      existing.add(candidate);
      return candidate;
    }
  }

  throw new Error("Unable to allocate unique username");
}
