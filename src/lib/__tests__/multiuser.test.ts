import { describe, expect, it, vi } from "vitest";
import { contextFor, personalize, runAs, stateKey } from "../request-context";
import snapshot from "../ai/__tests__/prompts.snapshot.json";

describe("prompts for a second person", () => {
  it("the owner's prompts are byte-for-byte unchanged", () => {
    for (const text of Object.values(snapshot as Record<string, string>)) expect(personalize(text, { name: "Abhay", pronouns: "he" })).toBe(text);
  });
  it("someone else gets their own name and pronouns", () => {
    const t = "You plan Abhay's day. From his numbered open items, pick what he should do. Tell him. He wants to win.";
    expect(personalize(t, { name: "Sam", pronouns: "she" })).toBe("You plan Sam's day. From her numbered open items, pick what she should do. Tell her. She wants to win.");
    expect(personalize(t, { name: "Sam", pronouns: "they" })).toBe("You plan Sam's day. From their numbered open items, pick what they should do. Tell them. They want to win.");
    for (const text of Object.values(snapshot as Record<string, string>)) {
      const out = personalize(text, { name: "Sam", pronouns: "they" });
      expect(out).not.toMatch(/\bAbhay\b/);
      expect(out).not.toMatch(/\b(he|his|him)\b/);
    }
  });
});

describe("per-person state", () => {
  it("keys are per person, and missing a person fails loudly", async () => {
    expect(await stateKey("body", "u1")).toBe("body:u1");
    await expect(stateKey("body")).rejects.toThrow(/per person/);
    await runAs(contextFor({ id: "u2", name: "Sam", pronouns: "they" }), async () => expect(await stateKey("body")).toBe("body:u2"));
  });
  it("a web handler with no context gets the logged-in person from the session resolver", async () => {
    const { setContextResolver } = await import("../request-context");
    setContextResolver(async () => ({ userId: "from-cookie", name: "Sam", pronouns: "she" }));
    // e.g. readNews() called straight from a route handler
    expect(await stateKey("news")).toBe("news:from-cookie");
    setContextResolver(async () => null);
    await expect(stateKey("news")).rejects.toThrow(/per person/);
  });
});

describe("the model client", () => {
  it("rewrites only system prompts for another person, and tells the gate who and how urgent", async () => {
    const calls: { body: { messages: { role: string; content: string }[] }; headers: Record<string, string> }[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      calls.push({ body: JSON.parse(String(init.body)), headers: init.headers as Record<string, string> });
      const lines = [JSON.stringify({ queued: 2 }), JSON.stringify({ queued: 0 }), JSON.stringify({ message: { content: "ok" }, done: true, eval_count: 1, prompt_eval_count: 1 })].join("\n") + "\n";
      return new Response(lines, { status: 200 });
    });
    const { chat } = await import("../ai/llm");
    const positions: number[] = [];
    await runAs({ userId: "u2", name: "Sam", pronouns: "she", priority: "interactive", onQueue: (n) => positions.push(n) }, () =>
      chat({ messages: [{ role: "system", content: "Abhay's assistant. Help him." }, { role: "user", content: "my brother said he is tired" }] })
    );
    expect(calls[0].body.messages[0].content).toBe("Sam's assistant. Help her.");
    expect(calls[0].body.messages[1].content).toBe("my brother said he is tired"); // his own words untouched
    expect(calls[0].headers["X-LI-User"]).toBe("u2");
    expect(calls[0].headers["X-LI-Priority"]).toBe("interactive");
    expect(positions).toEqual([2, 0]);
    vi.unstubAllGlobals();
  });
});

describe("flaky public link", () => {
  it("retries a connection dropped during the TLS handshake, then succeeds", async () => {
    let n = 0;
    vi.stubGlobal("fetch", async () => {
      n++;
      if (n < 3) throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET", message: "Client network socket disconnected before secure TLS connection was established" } });
      return new Response(JSON.stringify({ message: { content: "ok" }, done: true }) + "\n", { status: 200 });
    });
    const { chat } = await import("../ai/llm");
    expect((await chat({ messages: [{ role: "user", content: "hi" }] })).content).toBe("ok");
    expect(n).toBe(3);
    vi.unstubAllGlobals();
  });
});
