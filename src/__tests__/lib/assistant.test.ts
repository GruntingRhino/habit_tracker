import { describe, it, expect } from "vitest";
import { __test } from "@/lib/ai/router";
import { bestMatch, similarity } from "@/lib/ai/capture";
import { parseWhen } from "@/lib/ai/when";
import { compareItems } from "@/lib/ai/context";
import { normalizeArea, normalizePriority } from "@/lib/areas";

const { sanitize } = __test;

describe("router sanitize", () => {
  it("drops priorities without an urgency cue", () => {
    const r = sanitize({ intent: "capture", items: [{ kind: "meal", title: "Burrito", area: "physical", priority: "urgent" }] }, "ate a burrito");
    expect(r.items[0].priority).toBeUndefined();
  });

  it("keeps priorities when the text signals urgency", () => {
    const r = sanitize({ intent: "capture", items: [{ kind: "todo", title: "Pay rent", area: "financial", priority: "urgent" }] }, "pay rent asap");
    expect(r.items[0].priority).toBe("urgent");
  });

  it("forces reminder kind for 'remind me'", () => {
    const r = sanitize({ intent: "capture", items: [{ kind: "todo", title: "Call mom", area: "general" }] }, "remind me to call mom at 6");
    expect(r.items[0].kind).toBe("reminder");
  });

  it("routes prioritization phrasing to prioritize", () => {
    expect(sanitize({ intent: "question", items: [] }, "which should I focus on first?").intent).toBe("prioritize");
  });

  it("overrides area on unambiguous keywords", () => {
    const r = sanitize({ intent: "capture", items: [{ kind: "routine", title: "Meditate before work", area: "physical" }] }, "meditate");
    expect(r.items[0].area).toBe("mental");
    const s = sanitize({ intent: "capture", items: [{ kind: "todo", title: "Go to mass", area: "general" }] }, "mass");
    expect(s.items[0].area).toBe("spiritual");
  });

  it("turns an empty capture into chat", () => {
    expect(sanitize({ intent: "capture", items: [] }, "hi").intent).toBe("chat");
  });

  it("strips empty optional strings", () => {
    const r = sanitize({ intent: "capture", items: [{ kind: "todo", title: "X", area: "general", when: "" }] }, "x");
    expect(r.items[0].when).toBeUndefined();
  });
});

describe("fuzzy matching", () => {
  it("matches short names to longer titles", () => {
    expect(similarity("thesis", "Finish thesis")).toBe(1);
    expect(bestMatch("taxes", [{ title: "File taxes" }, { title: "Plan retreat" }])?.title).toBe("File taxes");
  });

  it("returns null when nothing is close", () => {
    expect(bestMatch("groceries", [{ title: "File taxes" }])).toBeNull();
  });
});

describe("parseWhen", () => {
  const ref = new Date(2026, 8, 28, 10, 0); // Mon Sep 28 2026, 10:00

  it("parses a clock time", () => {
    const r = parseWhen("tomorrow at 6pm", ref)!;
    expect(r.hasTime).toBe(true);
    expect(r.date.getDate()).toBe(29);
    expect(r.date.getHours()).toBe(18);
  });

  it("defaults date-only phrases to 9am", () => {
    const r = parseWhen("friday", ref)!;
    expect(r.hasTime).toBe(false);
    expect(r.date.getDay()).toBe(5);
    expect(r.date.getHours()).toBe(9);
  });

  it("returns null for no phrase", () => {
    expect(parseWhen("", ref)).toBeNull();
    expect(parseWhen("banana", ref)).toBeNull();
  });
});

describe("item ordering", () => {
  it("puts overdue first, then priority, then due date", () => {
    const past = new Date(Date.now() - 86_400_000);
    const soon = new Date(Date.now() + 86_400_000);
    const later = new Date(Date.now() + 5 * 86_400_000);
    const items = [
      { id: "a", priority: "medium", due: later },
      { id: "b", priority: "urgent", due: null },
      { id: "c", priority: "low", due: past },
      { id: "d", priority: "medium", due: soon },
    ];
    expect(items.sort(compareItems).map((i) => i.id)).toEqual(["c", "b", "d", "a"]);
  });
});

describe("area/priority normalization", () => {
  it("falls back safely", () => {
    expect(normalizeArea("Spiritual")).toBe("spiritual");
    expect(normalizeArea("gym")).toBe("general");
    expect(normalizePriority("URGENT")).toBe("urgent");
    expect(normalizePriority("whenever")).toBe("medium");
  });
});

describe("parseWhenFrom", () => {
  it("rejects vague or invented phrases", async () => {
    const { parseWhenFrom } = await import("@/lib/ai/when");
    expect(parseWhenFrom("next", "thesis next, retreat can wait")).toBeNull();
    expect(parseWhenFrom("friday", "taxes by april 15")).toBeNull();
    expect(parseWhenFrom("april 15", "taxes are due april 15")?.date.getMonth()).toBe(3);
  });
});

describe("remind me override", () => {
  it("forces a reminder capture even if the model chose another intent", () => {
    const r = sanitize({ intent: "replan", items: [] }, "remind me in 2 minutes to drink water");
    expect(r.intent).toBe("capture");
    expect(r.items[0]).toMatchObject({ kind: "reminder" });
    expect(r.items[0].title).toBe("drink water");
  });
});

describe("reminder + note overrides", () => {
  it("turns a routine guess into a one-off reminder", () => {
    const r = sanitize({ intent: "capture", items: [{ kind: "routine", title: "Stretch", area: "physical" }] }, "remind me in 6 minutes to stretch");
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({ kind: "reminder", title: "Stretch", when: "remind me in 6 minutes to stretch" });
    expect(r.items[0].repeat).toBeUndefined();
  });

  it("detects recurring reminders", () => {
    const r = sanitize({ intent: "capture", items: [{ kind: "routine", title: "Take vitamins", area: "physical" }] }, "remind me every day at 8am to take vitamins");
    expect(r.items[0]).toMatchObject({ kind: "reminder", repeat: "daily" });
  });

  it("routes note phrasing to notes", () => {
    for (const t of ["note: garage code is 4412", "jot this down: book recs from Sam", "write down that my passport expires in march", "save this: wifi is bluebird22"]) {
      const r = sanitize({ intent: "capture", items: [{ kind: "todo", title: "x", area: "general" }] }, t);
      expect(r.items[0].kind).toBe("note");
    }
  });
});
