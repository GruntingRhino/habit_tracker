import { describe, expect, it } from "vitest";
import {
  buildUniqueUsername,
  isValidUsername,
  normalizeUsername,
  sanitizeUsernameCandidate,
} from "@/lib/username";

describe("username helpers", () => {
  it("normalizes usernames to lowercase", () => {
    expect(normalizeUsername(" AbhaySivaram ")).toBe("abhaysivaram");
  });

  it("validates allowed username format", () => {
    expect(isValidUsername("abhaysivaram")).toBe(true);
    expect(isValidUsername("ab")).toBe(false);
    expect(isValidUsername("abhay sivaram")).toBe(false);
  });

  it("sanitizes display names and emails into username candidates", () => {
    expect(sanitizeUsernameCandidate("Abhay Sivaram")).toBe("abhaysivaram");
    expect(sanitizeUsernameCandidate("abhay@example.com")).toBe("abhay");
  });

  it("allocates unique usernames with numeric suffixes", () => {
    const existing = new Set(["abhaysivaram"]);

    expect(buildUniqueUsername("AbhaySivaram", existing)).toBe("abhaysivaram2");
    expect(buildUniqueUsername("AbhaySivaram", existing)).toBe("abhaysivaram3");
  });
});
