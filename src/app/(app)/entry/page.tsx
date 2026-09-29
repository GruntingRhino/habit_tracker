"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { format, isToday } from "date-fns";
import { PageHeader, Section, Empty, Tabs } from "@/components/ui";
import NotesList from "@/components/NotesList";

interface Entry {
  date: string;
  notes: string | null;
  sleepHours: number | null;
  screenTimeHours: number | null;
  moneySpent: number | null;
  moneySaved: number | null;
  rightWithGod: boolean;
  journalScore: number | null;
  journalFeedback: string | null;
}

type Quick = "sleepHours" | "screenTimeHours" | "moneySpent" | "moneySaved";

const QUICK: [Quick, string, string][] = [
  ["sleepHours", "Sleep", "h"],
  ["screenTimeHours", "Screen", "h"],
  ["moneySpent", "Spent", "$"],
  ["moneySaved", "Saved", "$"],
];

async function save(data: Partial<Entry>) {
  await fetch("/api/journal", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
}

export default function Page() {
  return (
    <Suspense>
      <JournalPage />
    </Suspense>
  );
}

function JournalPage() {
  const params = useSearchParams();
  const [tab, setTab] = useState<"today" | "notes">(params.get("tab") === "notes" ? "notes" : "today");
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [text, setText] = useState("");
  const [quick, setQuick] = useState<Record<Quick, string>>({ sleepHours: "", screenTimeHours: "", moneySpent: "", moneySaved: "" });
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
      await save({ notes: value.trim() || null });
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
    await save({ rightWithGod: next });
  }

  const latestFeedback = entries?.find((e) => e.journalFeedback);
  const past = (entries ?? []).filter((e) => !isToday(new Date(e.date)) && e.notes);

  const header = (
    <PageHeader
      title="Journal"
      sub={tab === "today" ? `${format(new Date(), "EEE, MMM d")}${status === "saving" ? " · saving…" : status === "saved" ? " · saved" : ""}` : undefined}
      action={<Tabs value={tab} options={[["today", "Today"], ["notes", "Notes"]]} onChange={setTab} />}
    />
  );
  if (tab === "notes") {
    return (
      <div className="min-page">
        {header}
        <NotesList />
      </div>
    );
  }

  return (
    <div className="min-page">
      {header}

      <textarea
        value={text}
        onChange={(e) => onText(e.target.value)}
        placeholder="How did today go? Wins, misses, what you're grateful for."
        rows={Math.max(3, Math.min(14, text.split("\n").length + 1))}
        className="mb-4 w-full resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-[var(--ink-600)]"
        style={{ color: "var(--ink-100)" }}
      />

      <Section label="Quick log">
        <div className="grid grid-cols-4 gap-3">
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
                {unit === "h" && <span style={{ color: "var(--ink-600)" }}>h</span>}
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
