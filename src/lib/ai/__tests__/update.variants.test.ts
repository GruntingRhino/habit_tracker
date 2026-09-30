/**
 * How he actually talks: slang, typos, abbreviations. Each line must come out right, by code.
 * (now = Wed Sep 30 2026, 2pm)
 */
import { describe, expect, it } from "vitest";
import { extractUpdate } from "../update";

const now = new Date(2026, 8, 30, 14);
const day = (d: Date) => `${["sun", "mon", "tue", "wed", "thu", "fri", "sat"][d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`;

function summary(t: string) {
  const x = extractUpdate(t, now);
  return [
    ...(x.sleep ? [`sleep ${Math.floor(x.sleep.minutes / 60)}h${x.sleep.minutes % 60 ? `${x.sleep.minutes % 60}m` : ""}`] : []),
    ...x.assessments.map((a) => `event ${a.title} ${day(a.start)} + ${a.prepTitle}`),
    ...x.events.map((e) => `event ${e.title} ${day(e.start)}${e.hasTime ? ` ${e.start.getHours()}:${String(e.start.getMinutes()).padStart(2, "0")}` : ""}`),
    ...x.todos.map((d) => `todo ${d.title}${d.due ? ` (${day(d.due)})` : ""}`),
    ...x.meetings.map((m) => `setup ${m.title}`),
    ...x.workouts.map((w) => `workout ${w}`),
    ...x.meals.map((m) => `meal ${m.name}`),
  ];
}

describe("sleep, however he says it", () => {
  it.each([
    ["i slept from 11:00 to 6:40 am", "sleep 7h40m"],
    ["crashed at like midnight and woke up at 7", "sleep 7h"],
    ["went to bed around 1am, got up at 8:30", "sleep 7h30m"],
    ["got maybe 6 hrs of sleep", "sleep 6h"],
    ["only got like 5 hours last night", "sleep 5h"],
    ["slept 8 hours", "sleep 8h"],
    ["slept like 9hrs lol", "sleep 9h"],
    ["fell asleep at 10:30 and woke up at 6", "sleep 7h30m"],
    ["i got 7.5 hours of sleep", "sleep 7h30m"],
  ])("%s", (t, want) => expect(summary(t)).toEqual([want]));
});

describe("tests and quizzes coming up", () => {
  it.each([
    ["i have to study for my bio and math quiz for tomorrow", ["event Bio quiz thu 10/1 + Study for bio quiz", "event Math quiz thu 10/1 + Study for math quiz"]],
    ["gotta hit the books for chem tmrw, big test", ["event Chem test thu 10/1 + Study for chem test"]],
    ["chem test thursday so i need to lock in", ["event Chem test thu 10/1 + Study for chem test"]],
    ["apush exam on friday", ["event APUSH exam fri 10/2 + Study for APUSH exam"]],
    ["spanish quiz tmr", ["event Spanish quiz thu 10/1 + Study for spanish quiz"]],
    ["got a physics test next monday", ["event Physics test mon 10/5 + Study for physics test"]],
    ["math test on thurs", ["event Math test thu 10/1 + Study for math test"]],
  ])("%s", (t, want) => expect(summary(t)).toEqual(want));
  it.each(["had my APUSH test today", "the chem test went fine", "just took my math quiz", "got my bio test back"])("past: %s", (t) => expect(summary(t)).toEqual([]));
});

describe("to-dos", () => {
  it.each([
    ["i have to call the counselor friday", ["todo Call the counselor (fri 10/2)"]],
    ["remember to email ms smith about the extension", ["todo Email ms smith about the extension"]],
    ["dont forget to return the library books", ["todo Return the library books"]],
    ["don't forget to pay the phone bill by friday", ["todo Pay the phone bill (fri 10/2)"]],
    ["gotta finish the GoodHours QA tonight", ["todo Finish the GoodHours QA (wed 9/30)"]],
    ["need to pick up my brother at 5", ["todo Pick up my brother (wed 9/30)"]],
    ["i owe my mom 20 bucks", ["todo Pay back my mom $20"]],
    ["i owe mike $15", ["todo Pay back mike $15"]],
    ["add bio and math studying yo todo list", ["todo Study bio", "todo Study math"]],
    ["put groceries and laundry on my list", ["todo Groceries", "todo Laundry"]],
    ["i should really clean my room", ["todo Clean my room"]],
    ["submit the scholarship form asap, it's urgent. need to", []],
  ])("%s", (t, want) => expect(summary(t)).toEqual(want));
});

describe("meetings and plans with people", () => {
  it.each([
    ["great news i heard back from tech district leader that we can setup a meeting", ["setup Set up meeting with tech district leader"]],
    ["coach wants to meet thursday about the tournament", ["event Meeting with coach thu 10/1"]],
    ["meeting with the principal friday at 10", ["event Meeting with the principal fri 10/2 10:00"]],
    ["mr lee wants to talk after school tomorrow", ["event Talk with mr lee thu 10/1"]],
    ["need to schedule a call with the district", ["setup Set up call with the district"]],
    ["hanging with jake saturday", ["event Hanging with jake sat 10/3"]],
  ])("%s", (t, want) => expect(summary(t)).toEqual(want));
});

describe("workouts and food in an update", () => {
  it.each([
    ["hit legs today", ["workout Legs"]],
    ["did push day at the gym", ["workout Push day"]],
    ["went to the gym after school", ["workout Gym"]],
    ["ran 3 miles this morning", ["workout Ran 3 miles"]],
    ["had chipotle for lunch", ["meal Chipotle"]],
    ["ate 3 eggs and toast for breakfast", ["meal 3 eggs and toast"]],
    ["skipped breakfast", []],
  ])("%s", (t, want) => expect(summary(t)).toEqual(want));
});

describe("a whole messy update", () => {
  it("everything at once", () => {
    const t =
      "ok so crashed at like 12:30 and woke up at 7. hit legs after school, had chipotle for lunch. gotta study for chem tmrw big test, and dont forget to email ms smith about the extension. coach wants to meet thursday about the tournament. honestly kinda tired and stressed today";
    expect(summary(t)).toEqual([
      "sleep 6h30m",
      "event Chem test thu 10/1 + Study for chem test",
      "event Meeting with coach thu 10/1",
      "todo Email ms smith about the extension",
      "workout Legs",
      "meal Chipotle",
    ]);
    expect(extractUpdate(t, now).reflection.join(" ")).toMatch(/tired and stressed/);
  });
});

describe("plans mixed into one sentence", () => {
  it.each([
    ["gonna need a ride to the soccer game saturday at 4 and i should really clean my room", ["event Soccer game sat 10/3 16:00", "todo Get a ride to the soccer game (sat 10/3)", "todo Clean my room"]],
    ["debate tournament next saturday", ["event Debate tournament sat 10/10"]],
    ["the game was fun", []],
  ])("%s", (t, want) => expect(summary(t)).toEqual(want));
});

describe("plans with a day", () => {
  it.each([
    ["tomorrow i want to finish the outline before practice", ["todo Finish the outline before practice (thu 10/1)"]],
    ["im gonna go home", []],
    ["i'll lyk when i get it back", []],
  ])("%s", (t, want) => expect(summary(t)).toEqual(want));
});
