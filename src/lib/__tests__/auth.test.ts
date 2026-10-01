import { describe, expect, it } from "vitest";
import { hashPassword, newPassword, passwordProblem, readSession, signSession, verifyPassword } from "../auth";

process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-1234";

describe("passwords", () => {
  it("hash and verify; wrong passwords and empty hashes fail", async () => {
    const h = await hashPassword("correct horse battery");
    expect(h).toMatch(/^scrypt\$16384\$/);
    expect(await verifyPassword("correct horse battery", h)).toBe(true);
    expect(await verifyPassword("correct horse batterY", h)).toBe(false);
    expect(await verifyPassword("anything", null)).toBe(false);
    expect(await hashPassword("same")).not.toBe(await hashPassword("same")); // salted
  });
  it("generated passwords are readable and strong enough", () => {
    const p = newPassword();
    expect(p).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
    expect(passwordProblem(p)).toBeNull();
    expect(passwordProblem("short")).toMatch(/10/);
    expect(passwordProblem("aaaaaaaaaaaa")).toMatch(/guessable/);
  });
});

describe("session cookie", () => {
  it("round-trips, and rejects tampering, other secrets and expiry", async () => {
    const c = await signSession("user1", 3);
    expect(await readSession(c)).toMatchObject({ u: "user1", v: 3 });
    const [payload, sig] = c.split(".");
    const forged = Buffer.from(JSON.stringify({ u: "user2", v: 3, exp: Date.now() + 1e9 })).toString("base64url");
    expect(await readSession(`${forged}.${sig}`)).toBeNull();
    expect(await readSession(`${payload}.${sig.slice(0, -2)}xx`)).toBeNull();
    expect(await readSession(c, Date.now() + 61 * 86_400_000)).toBeNull();
    process.env.AUTH_SECRET = "another-secret-another-secret-another-12";
    expect(await readSession(c)).toBeNull();
    process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-1234";
    expect(await readSession(undefined)).toBeNull();
    expect(await readSession("garbage")).toBeNull();
  });
});
