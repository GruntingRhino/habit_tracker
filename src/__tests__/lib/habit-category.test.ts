import { describe, expect, it } from "vitest";
import {
  characterizeHabitCategory,
  normalizeHabitCategory,
} from "@/lib/habit-category";

describe("normalizeHabitCategory", () => {
  it("maps legacy aliases into canonical score categories", () => {
    expect(normalizeHabitCategory("finance")).toBe("financial");
    expect(normalizeHabitCategory("productivity")).toBe("focus");
    expect(normalizeHabitCategory("health")).toBe("physical");
    expect(normalizeHabitCategory("appearance")).toBe("physical");
    expect(normalizeHabitCategory("social")).toBe("mental");
    expect(normalizeHabitCategory("spiritual")).toBe("mental");
  });
});

describe("characterizeHabitCategory", () => {
  it("classifies focus-oriented habits into the focus category", () => {
    expect(
      characterizeHabitCategory(
        "Deep Work Block",
        "Do 2 hours of study with phone off"
      )
    ).toBe("focus");
  });

  it("classifies money-oriented habits into the financial category", () => {
    expect(
      characterizeHabitCategory(
        "Business Outreach",
        "Spend 60 minutes on sales and revenue work"
      )
    ).toBe("financial");
  });
});
