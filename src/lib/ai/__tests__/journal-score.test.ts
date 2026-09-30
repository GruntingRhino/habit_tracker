import { describe, expect, it } from "vitest";
import { scoreJournal } from "../judge";

describe("journal score by rubric", () => {
  it("his real reflection scores well", () => {
    expect(scoreJournal("today was solid honestly. school was kinda boring but i locked in on chem for an hour and legs felt strong. i was a little stressed about the english essay though since its due friday and i barely started. tomorrow i want to finish the outline before practice")).toBeGreaterThanOrEqual(8);
  });
  it("a one-liner scores low", () => expect(scoreJournal("good day")).toBeLessThanOrEqual(2));
});
