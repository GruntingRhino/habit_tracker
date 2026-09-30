import { describe, expect, it } from "vitest";
import { parseFoods } from "../nutrition-parse";

describe("meal labels aren't foods", () => {
  it.each([
    ["dinner was salmon, rice and broccoli", ["salmon", "rice", "broccoli"]],
    ["lunch: turkey sandwich and chips", ["turkey sandwich", "chips"]],
  ])("%s", (t, want) => expect(parseFoods(t).map((f) => f.text)).toEqual(want));
});
