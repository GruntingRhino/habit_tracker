import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/llm", async (orig) => ({ ...(await orig<typeof import("@/lib/ai/llm")>()), chat: vi.fn() }));
import * as llm from "@/lib/ai/llm";
import { candidates, grounded, secondLook } from "../leftovers";

const now = new Date(2026, 8, 30, 14);

describe("grounding", () => {
  it("keeps titles made of his words", () => {
    expect(grounded("Get a ride to the game", "gonna need a ride to the game saturday")).toBe(true);
    expect(grounded("Buy cleats", "my cleats are ripped so i should get new cleats before the game")).toBe(false);
    expect(grounded("Ask dad for ride", "prob need to ask dad for a ride")).toBe(true);
  });
  it("feelings aren't candidates", () => {
    expect(candidates(["kinda tired and stressed today", "gonna need a ride to the game saturday"])).toEqual(["gonna need a ride to the game saturday"]);
  });
});

describe("secondLook", () => {
  it("drops invented items and events with no day", async () => {
    vi.mocked(llm.chat).mockResolvedValueOnce({
      content: JSON.stringify({ items: [
        { n: 1, kind: "event", title: "Soccer game" },
        { n: 2, kind: "todo", title: "Email the coach about nutrition plan" },
        { n: 3, kind: "event", title: "Movie night with sam" },
      ] }),
      evalCount: 1, promptEvalCount: 1, durationMs: 1,
    });
    const out = await secondLook(["soccer game saturday at 4 should be fun", "gonna need to ask coach something", "movie night with sam at some point"], now);
    expect(out.map((p) => `${p.kind} ${p.title} ${p.date?.getDate() ?? ""}/${p.date?.getHours() ?? ""}`)).toEqual(["event Soccer game 3/16"]);
  });
  it("a model failure changes nothing", async () => {
    vi.mocked(llm.chat).mockRejectedValueOnce(new Error("timeout"));
    expect(await secondLook(["gonna need a ride saturday"], now)).toEqual([]);
  });
});

describe("filler isn't a to-do", () => {
  it("'I will' is rejected even though its words are in the clause", () => {
    expect(grounded("I will", "I will also have to prepare for the meeting")).toBe(false);
    expect(candidates(["I will"])).toEqual([]);
    expect(grounded("Prepare for the meeting", "I will also have to prepare for the meeting")).toBe(true);
  });
});
