import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit, resetRateLimit } from "@/lib/rate-limit";

describe("checkRateLimit", () => {
  beforeEach(async () => {
    await resetRateLimit("test-key");
  });

  it("allows first attempt", async () => {
    const result = await checkRateLimit("test-key");
    expect(result.allowed).toBe(true);
    expect(result.remainingAttempts).toBe(4);
  });

  it("allows up to MAX_ATTEMPTS", async () => {
    for (let i = 0; i < 5; i++) {
      const result = await checkRateLimit("test-key");
      expect(result.allowed).toBe(true);
    }
  });

  it("blocks after MAX_ATTEMPTS exceeded", async () => {
    for (let i = 0; i < 5; i++) await checkRateLimit("test-key");
    const result = await checkRateLimit("test-key");
    expect(result.allowed).toBe(false);
    expect(result.remainingAttempts).toBe(0);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("different keys are independent", async () => {
    for (let i = 0; i < 5; i++) await checkRateLimit("key-a");
    await checkRateLimit("key-a");

    const result = await checkRateLimit("key-b");
    expect(result.allowed).toBe(true);
  });

  it("resetRateLimit clears the counter", async () => {
    for (let i = 0; i < 5; i++) await checkRateLimit("test-key");
    await resetRateLimit("test-key");
    const result = await checkRateLimit("test-key");
    expect(result.allowed).toBe(true);
  });
});
