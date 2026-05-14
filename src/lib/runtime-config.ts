import { timingSafeEqual } from "node:crypto";

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export function secureCompare(
  expected: string | undefined,
  actual: string | null
): boolean {
  if (!expected || !actual) return false;

  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
}
