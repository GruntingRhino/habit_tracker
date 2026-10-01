"use client";

import { DoneCheck, report } from "@/components/feedback";
import { useEffect, useRef, useState } from "react";
import { format, isToday } from "date-fns";
import { Section, Empty } from "@/components/ui";

interface Entry {
  date: string;
  notes: string | null;
  sleepHours: number | null;
  weightLb: number | null;
  screenTimeHours: number | null;
  moneySpent: number | null;
  moneySaved: number | null;
  rightWithGod: boolean;
  journalScore: number | null;
  journalFeedback: string | null;
}

type Quick = "weightLb" | "sleepHours" | "screenTimeHours" | "moneySpent" | "moneySaved";

const QUICK: [Quick, string, string][] = [
  ["weightLb", "Weight", "lb"],
  ["sleepHours", "Sleep", "h"],
  ["screenTimeHours", "Screen", "h"],
  ["moneySpent", "Spent", "$"],
  ["moneySaved", "Saved", "$"],
];

/** okText null: autosave — quiet unless it fails. */
async function save(data: Partial<Entry>, okText: string | null = "Saved") {
  const res = await fetch("/api/journal", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).catch(() => null);
  if (okText || !res?.ok) report(res, okText ?? "", "Your journal didn't save — check your connection");
}

const JOURNAL_PROMPT = `How did today go? A few honest lines help the AI read your day. Try:
• Wins — what went well, and why
• Misses — what got in the way (phone, energy, time, people)
• Body — training, food, sleep: how you felt
• Mind — focus, mood, stress (1–10 and why)
• Faith — prayer, Bible, what you're grateful for
• One thing you learned or want to remember
• Tomorrow — the 1–3 things that matter most`;

/** Today's journal: free text (with prompts), quick log, tomorrow's plan, the AI's feedback, past entries. */
export default function JournalView() {  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [text, setText] = useState("");
  const [quick, setQuick] = useState<Record<Quick, string>>({ weightLb: "", sleepHours: "", screenTimeHours: "", moneySpent: "", moneySaved: "" });
  const [god, setGod] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/journal")
      .then((r) => (r.ok ? r.json() : []))
      .then((list: Entry[]) => {
        setEntries(list);
        const today = list.find((e) => isToday(new Date(e.date)));
        if (today) {
          setText(today.notes ?? "");
          setGod(today.rightWithGod);
          setQuick({
            weightLb: today.weightLb?.toString() ?? "",
            sleepHours: today.sleepHours?.toString() ?? "",
            screenTimeHours: today.screenTimeHours?.toString() ?? "",
            moneySpent: today.moneySpent?.toString() ?? "",
            moneySaved: today.moneySaved?.toString() ?? "",
          });
        }
      })
      .catch(() => setEntries([]));
  }, []);

  // Autosave the journal text a moment after typing stops.
  function onText(value: string) {
    setText(value);
    setStatus("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      await save({ notes: value.trim() || null }, null);
      setStatus("saved");
    }, 800);
  }

  async function commitQuick(key: Quick) {
    const raw = quick[key].trim();
    const n = raw === "" ? null : Number(raw);
    if (n !== null && (!Number.isFinite(n) || n < 0)) return;
    await save({ [key]: n });
  }

  async function toggleGod() {
    const next = !god;
    setGod(next);
    await save({ rightWithGod: next }, next ? "🙏 Marked right with God" : "Unmarked");
  }

  const latestFeedback = entries?.find((e) => e.journalFeedback);
  const past = (entries ?? []).filter((e) => !isToday(new Date(e.date)) && e.notes);

  return (
    <div>
      <p className="min-sub mb-2">
        {format(new Date(), "EEEE, MMM d")}
        {status === "saving" ? " · saving…" : status === "saved" ? (
          <span key={text.length} className="inline-flex items-center gap-1" style={{ color: "var(--good)" }}>
            {" · "}
            <DoneCheck size={11} /> saved
          </span>
        ) : ""}
      </p>
      <textarea
        value={text}
        onChange={(e) => onText(e.target.value)}
        placeholder={JOURNAL_PROMPT}
        aria-label="Journal"
        rows={text ? Math.max(3, Math.min(14, text.split("\n").length + 1)) : 9}
        className="mb-4 w-full resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-[var(--ink-600)]"
        style={{ color: "var(--ink-100)" }}
      />

      <TomorrowPlan />

      <Section label="Quick log">
        <div className="grid grid-cols-5 gap-3">
          {QUICK.map(([key, label, unit]) => (
            <label key={key} className="block">
              <span className="min-sub block">{label}</span>
              <span className="flex items-baseline gap-1">
                {unit === "$" && <span style={{ color: "var(--ink-600)" }}>$</span>}
                <input
                  inputMode="decimal"
                  value={quick[key]}
                  onChange={(e) => setQuick((q) => ({ ...q, [key]: e.target.value }))}
                  onBlur={() => commitQuick(key)}
                  placeholder="–"
                  className="min-input py-0.5 tabular-nums"
                />
                {(unit === "h" || unit === "lb") && <span style={{ color: "var(--ink-600)" }}>{unit}</span>}
              </span>
            </label>
          ))}
        </div>
        <button onClick={toggleGod} className="mt-3 flex items-center gap-2 text-sm" style={{ color: god ? "var(--ink-100)" : "var(--ink-400)" }}>
          <span className="flex h-5 w-9 items-center rounded-full p-0.5 transition-colors" style={{ background: god ? "var(--ink-300)" : "var(--stroke-2)" }}>
            <span className="h-4 w-4 rounded-full transition-transform" style={{ background: "var(--bg-base)", transform: god ? "translateX(16px)" : "none" }} />
          </span>
          Right with God today
        </button>
      </Section>

      {latestFeedback && (
        <Section label={`Spark · ${format(new Date(latestFeedback.date), "EEE MMM d")}${latestFeedback.journalScore != null ? ` · ${latestFeedback.journalScore}/10` : ""}`}>
          <p className="text-sm leading-relaxed" style={{ color: "var(--ink-300)" }}>
            {latestFeedback.journalFeedback}
          </p>
        </Section>
      )}

      <Section label="Past entries">
        {entries === null ? (
          <p className="min-sub">Loading…</p>
        ) : past.length === 0 ? (
          <Empty>Nothing yet. Spark reviews each night&apos;s entry at 11:30.</Empty>
        ) : (
          <ul>
            {past.map((e) => (
              <li key={e.date} className="min-row items-start">
                <span className="w-16 flex-shrink-0 pt-0.5 text-xs" style={{ color: "var(--ink-500)" }}>
                  {format(new Date(e.date), "MMM d")}
                </span>
                <p className="line-clamp-2 flex-1 whitespace-pre-wrap text-sm" style={{ color: "var(--ink-300)" }}>
                  {e.notes}
                </p>
                {e.journalScore != null && (
                  <span className="text-xs tabular-nums" style={{ color: "var(--ink-500)" }}>
                    {e.journalScore}/10
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

/** "Plan tomorrow": one thing per line → to-dos due tomorrow (times like "7pm gym" are understood). */
function TomorrowPlan() {
  const [text, setText] = useState("");
  const [added, setAdded] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  async function add() {
    const lines = text.split("\n").map((l) => l.replace(/^\s*(?:[-•*]|\d+[.)])\s+/, "").trim()).filter(Boolean);
    if (!lines.length) return;
    setBusy(true);
    const res = await fetch("/api/todos/tomorrow", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lines }) });
    setBusy(false);
    report(res, "Added to tomorrow");
    if (res.ok) {
      setAdded(((await res.json()) as { title: string }[]).map((t) => t.title));
      setText("");
      window.dispatchEvent(new CustomEvent("liveimproved:changed"));
    }
  }
  return (
    <Section label="Plan tomorrow">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"One thing per line — these become tomorrow's to-dos:\nFinish GoodHours QA\n7pm upper workout\nStudy chem 30 min"}
        aria-label="Plan tomorrow"
        rows={Math.max(3, Math.min(10, text.split("\n").length + 1))}
        className="min-field mb-2 resize-none leading-relaxed"
      />
      <div className="flex items-center gap-3">
        <button onClick={add} disabled={busy || !text.trim()} className="min-btn">
          {busy ? "Adding…" : "Add to tomorrow"}
        </button>
        {added && <span className="text-xs" style={{ color: "var(--ink-500)" }}>Added {added.length}: {added.join(" · ")}</span>}
      </div>
    </Section>
  );
}
