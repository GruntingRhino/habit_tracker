import { describe, expect, it } from "vitest";
import { parseHabitReports } from "../habitcheck";

const H = ["Workout", "Posture routine", "Drink 100 oz water", "Read my Bible", "Sleep by 10:30", "No phone after 10"].map((name, i) => ({ id: String(i), name }));
const s = (t: string) => parseHabitReports(t, H).map((r) => `${r.habit.name}: ${r.done ? "done" : "not"}${r.note ? ` (${r.note})` : ""}`);

describe("habit check-offs, however he says it", () => {
  it.each([
    ["just did my posture routine", ["Posture routine: done"]],
    ["read my bible this morning", ["Read my Bible: done"]],
    ["drank like 60 oz of water so far", ["Drink 100 oz water: not (60 oz of 100)"]],
    ["finished my water, 100 oz", ["Drink 100 oz water: done (100 oz of 100)"]],
    ["drank 6 bottles of water", ["Drink 100 oz water: done (101 oz of 100)"]],
    ["didn't read my bible today", ["Read my Bible: not (not done)"]],
    ["skipped posture today", ["Posture routine: not (not done)"]],
    ["did posture but didn't read my bible", ["Posture routine: done", "Read my Bible: not (not done)"]],
    ["worked out today", ["Workout: done"]],
    ["was in bed by 10:15", ["Sleep by 10:30: done (bed at 10:15)"]],
    ["went to bed at 11:30", ["Sleep by 10:30: not (bed at 11:30)"]],
    ["put my phone away at 9:45", ["No phone after 10: done (phone off at 9:45)"]],
  ])("%s", (t, want) => expect(s(t)).toEqual(want));
  it.each(["gonna read my bible later", "should i do posture now?", "need to drink more water", "had chipotle for lunch", "call the dentist"])("nothing: %s", (t) => expect(s(t)).toEqual([]));
});
