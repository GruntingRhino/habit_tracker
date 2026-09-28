import type { Intent, ItemKind } from "@/lib/ai/router";
import type { Area } from "@/lib/areas";

export interface GoldenCase {
  text: string;
  intent: Intent;
  items?: { kind: ItemKind; area: Area }[];
}

// Real-style utterances. Not used as prompt examples (those live in router.ts).
export const GOLDEN: GoldenCase[] = [
  { text: "I need to finish the capstone, apply to 3 internships, and redo my budget spreadsheet", intent: "capture", items: [{ kind: "project", area: "work" }, { kind: "project", area: "work" }, { kind: "project", area: "financial" }] },
  { text: "remind me to take my vitamins at 9pm", intent: "capture", items: [{ kind: "reminder", area: "physical" }] },
  { text: "remind me sunday morning to go to mass", intent: "capture", items: [{ kind: "reminder", area: "spiritual" }] },
  { text: "call the dentist to book a cleaning", intent: "capture", items: [{ kind: "todo", area: "physical" }] },
  { text: "cancel my spotify subscription", intent: "capture", items: [{ kind: "todo", area: "financial" }] },
  { text: "pray for 10 minutes every night", intent: "capture", items: [{ kind: "routine", area: "spiritual" }] },
  { text: "meditate every morning before work", intent: "capture", items: [{ kind: "routine", area: "mental" }] },
  { text: "ate a chicken burrito for lunch", intent: "capture", items: [{ kind: "meal", area: "physical" }] },
  { text: "I want to make overnight oats for breakfast tomorrow", intent: "capture", items: [{ kind: "meal", area: "physical" }] },
  { text: "did legs today, squats felt heavy", intent: "capture", items: [{ kind: "workout", area: "physical" }] },
  { text: "5k run on saturday", intent: "capture", items: [{ kind: "workout", area: "physical" }] },
  { text: "felt really anxious this afternoon but the walk helped", intent: "capture", items: [{ kind: "journal", area: "mental" }] },
  { text: "idea: build a CLI that summarizes my git commits", intent: "capture", items: [{ kind: "note", area: "work" }] },
  { text: "add 'write literature review' to the thesis project", intent: "capture", items: [{ kind: "task", area: "work" }] },
  { text: "transfer $200 to savings on the 1st", intent: "capture", items: [{ kind: "todo", area: "financial" }] },
  { text: "read 20 pages a day", intent: "capture", items: [{ kind: "routine", area: "mental" }] },
  { text: "buy groceries and do laundry", intent: "capture", items: [{ kind: "todo", area: "general" }, { kind: "todo", area: "general" }] },
  { text: "study for the organic chem exam thursday, it's urgent", intent: "capture", items: [{ kind: "todo", area: "work" }] },
  { text: "I finished the budget spreadsheet", intent: "complete" },
  { text: "done with laundry", intent: "complete" },
  { text: "what do I have due this week?", intent: "question" },
  { text: "how did I score yesterday?", intent: "question" },
  { text: "which of my projects should I focus on first?", intent: "prioritize" },
  { text: "rebuild today's plan, my afternoon got freed up", intent: "replan" },
  { text: "good morning", intent: "chat" },
];
