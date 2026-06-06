import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit, resetRateLimit, buildRateLimitResponse, buildScopedRateLimitKeys } from "@/lib/rate-limit";

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

  it("buildScopedRateLimitKeys returns identity, IP, and combined buckets", () => {
    expect(buildScopedRateLimitKeys("provision-user", "USER@Example.COM", "203.0.113.10")).toEqual([
      "provision-user:id:user@example.com",
      "provision-user:ip:203.0.113.10",
      "provision-user:id-ip:user@example.com:203.0.113.10",
    ]);
  });

  it("buildRateLimitResponse includes retry-after metadata", async () => {
    const response = buildRateLimitResponse("Too many requests", 2500);
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("3");
    await expect(response.json()).resolves.toMatchObject({
      error: "Too many requests",
      code: "RATE_LIMITED",
      retryAfterSeconds: 3,
    });
  });
});
