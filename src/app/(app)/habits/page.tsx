"use client";

import { useCallback, useEffect, useState } from "react";
import { differenceInCalendarDays, format, subDays } from "date-fns";
import { ChevronRight, Flame, MoreHorizontal, X } from "lucide-react";
import { Checkbox, Empty, InlineAdd, PageHeader, Section } from "@/components/ui";
import { useLoad, useOnDataChanged } from "@/hooks/useAssistantChat";

interface Habit {
  id: string;
  name: string;
  area: string;
  targetDays: string[];
  createdAt: string;
  streak: number;
  logs: { date: string; completed: boolean; notes?: string | null }[];
}
interface Exercise {
  id: string;
  name: string;
  descriptor: string | null;
}
interface Routine {
  id: string;
  name: string;
  exercises: Exercise[];
  sessions: { date: string }[];
}
interface Session {
  id: string;
  date: string;
  routine: { name: string };
  exerciseLogs: { exerciseName: string; weight: number | null; sets: number | null; reps: string | null }[];
}

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const dayKey = (d: Date) => DAYS[(d.getDay() + 6) % 7];
const ymd = (d: Date) => format(d, "yyyy-MM-dd");

async function json<T>(url: string, fallback: T): Promise<T> {
  const res = await fetch(url);
  return res.ok ? res.json() : fallback;
}
const send = (url: string, method: string, body?: unknown) =>
  fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

/** Share of scheduled days in the last 30 (or since the habit was created) that were done. */
function thirtyDayRate(h: Habit) {
  const done = new Set(h.logs.filter((l) => l.completed).map((l) => ymd(new Date(l.date))));
  const span = Math.min(30, differenceInCalendarDays(new Date(), new Date(h.createdAt)) + 1);
  let scheduled = 0;
  let hit = 0;
  for (let i = 0; i < span; i++) {
    const d = subDays(new Date(), i);
    if (!h.targetDays.includes(dayKey(d))) continue;
    scheduled++;
    if (done.has(ymd(d))) hit++;
  }
  return scheduled ? Math.round((hit / scheduled) * 100) : null;
}

function HabitRow({ habit, onChanged }: { habit: Habit; onChanged: () => void }) {
  const [menu, setMenu] = useState(false);
  const [name, setName] = useState(habit.name);
  const done = new Set(habit.logs.filter((l) => l.completed).map((l) => ymd(new Date(l.date))));
  const today = new Date();
  const doneToday = done.has(ymd(today));
  const todayNote = habit.logs.find((l) => ymd(new Date(l.date)) === ymd(today))?.notes ?? "";
  const [note, setNote] = useState(todayNote);
  const [noting, setNoting] = useState(false);
  const week = Array.from({ length: 7 }, (_, i) => subDays(today, 6 - i));
  const rate = thirtyDayRate(habit);

  async function toggleToday() {
    await send(`/api/habits/${habit.id}/log`, "POST", { completed: !doneToday });
    onChanged();
  }
  async function saveNote() {
    setNoting(false);
    if (note.trim() === todayNote) return;
    // Keep today's done/not-done as it is; the note tells the AI how much he actually did.
    await send(`/api/habits/${habit.id}/log`, "POST", { completed: doneToday, notes: note.trim() });
    window.dispatchEvent(new CustomEvent("liveimproved:changed"));
    onChanged();
  }
  async function patch(data: Record<string, unknown>) {
    await send(`/api/habits/${habit.id}`, "PATCH", data);
    onChanged();
  }
  async function remove() {
    if (!window.confirm(`Delete "${habit.name}"?`)) return;
    await send(`/api/habits/${habit.id}`, "DELETE");
    onChanged();
  }

  return (
    <li className="border-b" style={{ borderColor: "var(--stroke-1)" }}>
      <div className="flex items-center gap-2.5 py-2 text-sm">
        <Checkbox checked={doneToday} onClick={toggleToday} label={doneToday ? `Undo ${habit.name}` : `Done: ${habit.name}`} />
        <button onClick={() => setNoting(true)} className="min-w-0 flex-1 text-left" title="Add a note for today" aria-label={`Note for ${habit.name}`}>
          <span className="block truncate" style={{ color: "var(--ink-100)" }}>
            {habit.name}
          </span>
          {todayNote && !noting && <span className="block truncate text-xs" style={{ color: "var(--ink-500)" }}>📝 {todayNote}</span>}
        </button>
        <span className="hidden items-center gap-1 sm:flex" aria-label="Last 7 days">
          {week.map((d) => {
            const scheduled = habit.targetDays.includes(dayKey(d));
            const hit = done.has(ymd(d));
            return (
              <span
                key={ymd(d)}
                title={`${format(d, "EEE")}${hit ? " · done" : scheduled ? "" : " · off"}`}
                className="h-2 w-2 rounded-full"
                style={{ background: hit ? "var(--good)" : scheduled ? "var(--stroke-3)" : "transparent", border: scheduled || hit ? "none" : "1px solid var(--stroke-2)" }}
              />
            );
          })}
        </span>
        <span className="flex w-10 items-center justify-end gap-0.5 text-xs tabular-nums" style={{ color: "var(--warn)" }} title="Streak">
          {habit.streak ? (
            <>
              <Flame className="h-3 w-3" />
              {habit.streak}
            </>
          ) : null}
        </span>
        <span className="w-9 text-right text-xs tabular-nums" style={{ color: "var(--ink-500)" }} title="Last 30 days">
          {rate === null ? "–" : `${rate}%`}
        </span>
        <button onClick={() => setMenu((v) => !v)} aria-label={`Edit ${habit.name}`} className="p-0.5" style={{ color: "var(--ink-500)" }}>
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>
      {noting && (
        <div className="mb-2 ml-7">
          <input
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={saveNote}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            placeholder='Note for today, e.g. "did 60 oz" — the AI counts it'
            aria-label={`Today's note for ${habit.name}`}
            className="min-field"
          />
        </div>
      )}
      {menu && (
        <div className="mb-2 ml-7 flex flex-wrap items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() && name.trim() !== habit.name && patch({ name: name.trim() })}
            aria-label="Habit name"
            className="min-field w-48"
          />
          <span className="flex gap-1" aria-label="Days">
            {DAYS.map((d) => {
              const on = habit.targetDays.includes(d);
              return (
                <button
                  key={d}
                  onClick={() => {
                    const next = on ? habit.targetDays.filter((x) => x !== d) : [...habit.targetDays, d];
                    if (next.length) void patch({ targetDays: DAYS.filter((x) => next.includes(x)) });
                  }}
                  aria-pressed={on}
                  className="h-6 w-6 rounded-full text-[10px] capitalize"
                  style={{ background: on ? "var(--ink-100)" : "transparent", color: on ? "var(--bg-base)" : "var(--ink-500)", border: "1px solid var(--stroke-2)" }}
                >
                  {d[0]}
                </button>
              );
            })}
          </span>
          <button onClick={remove} className="text-xs" style={{ color: "var(--bad)" }}>
            Delete
          </button>
        </div>
      )}
    </li>
  );
}

interface Coach {
  today: { routineId: string; name: string; deload: boolean }[];
  deload: Record<string, boolean>;
  byExercise: Record<string, { last: string | null; next: string; nextWeight: number | null; nextReps: string; status: string; why: string }>;
  block: { block: string; weeks: number; name: string; next: string };
}

const STATUS_COLOR: Record<string, string> = { increase: "#34d399", progress: "var(--ink-300)", stalled: "#fbbf24", harder: "#34d399", new: "var(--ink-500)" };

function RoutineRow({ routine, onChanged, coach }: { routine: Routine; onChanged: () => void; coach: Coach | null }) {
  const [open, setOpen] = useState(false);
  const [log, setLog] = useState<Record<string, { weight: string; sets: string; reps: string }>>({});
  const [saved, setSaved] = useState(false);
  const last = routine.sessions[0]?.date;
  const isToday = coach?.today.some((t) => t.routineId === routine.id) ?? false;
  const deload = coach?.deload[routine.id] ?? false;

  async function addExercise(name: string) {
    await send(`/api/weights/routines/${routine.id}/exercises`, "POST", { name });
    onChanged();
  }
  async function removeExercise(id: string) {
    await send(`/api/weights/routines/${routine.id}/exercises?exerciseId=${id}`, "DELETE");
    onChanged();
  }
  async function saveLog() {
    const exerciseLogs = routine.exercises
      .map((e) => ({ e, v: log[e.id] }))
      .filter(({ v }) => v && (v.weight || v.sets || v.reps))
      .map(({ e, v }) => ({ exerciseId: e.id, exerciseName: e.name, weight: v.weight ? Number(v.weight) : undefined, sets: v.sets ? Number(v.sets) : undefined, reps: v.reps || undefined }));
    const res = await send("/api/weights/sessions", "POST", { routineId: routine.id, exerciseLogs });
    if (res.ok) {
      setLog({});
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      onChanged();
    }
  }
  async function remove() {
    if (!window.confirm(`Delete "${routine.name}"?`)) return;
    await send(`/api/weights/routines/${routine.id}`, "DELETE");
    onChanged();
  }

  return (
    <li className="border-b" style={{ borderColor: "var(--stroke-1)" }}>
      <div className="group flex items-center gap-2 py-2 text-sm">
        <button onClick={() => setOpen((v) => !v)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left" aria-expanded={open}>
          <ChevronRight className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-90" : ""}`} style={{ color: "var(--ink-500)" }} />
          <span className="truncate" style={{ color: "var(--ink-100)" }}>
            {routine.name}
          </span>
          {isToday && <span className="min-chip ml-1 flex-shrink-0 py-0 text-[10px]">Today</span>}
        </button>
        <span className="text-xs" style={{ color: "var(--ink-500)" }}>
          {routine.exercises.length} exercises{last ? ` · last ${format(new Date(last), "MMM d")}` : ""}
        </span>
        <button onClick={remove} aria-label={`Delete ${routine.name}`} className="hidden group-hover:block">
          <X className="h-3.5 w-3.5" style={{ color: "var(--ink-500)" }} />
        </button>
      </div>
      {open && (
        <div className="mb-2 ml-5">
          {deload && <p className="mb-1 text-xs" style={{ color: "#fbbf24" }}>Performance dropped two sessions in a row: take a deload week (about half the sets, same weights).</p>}
          {routine.exercises.map((e) => {
            const c = coach?.byExercise[e.id];
            return (
            <div key={e.id}>
            <div className="group flex items-center gap-2 py-1 text-[13px]">
              <span className="min-w-0 flex-1 truncate" style={{ color: "var(--ink-200)" }}>
                {e.name}
                {e.descriptor && <span style={{ color: "var(--ink-500)" }}> · {e.descriptor}</span>}
              </span>
              {(["weight", "sets", "reps"] as const).map((k) => (
                <input
                  key={k}
                  inputMode={k === "reps" ? "text" : "decimal"}
                  placeholder={k === "weight" ? (c?.nextWeight ? String(c.nextWeight) : "lb") : k === "reps" ? c?.nextReps || "reps" : k}
                  aria-label={`${e.name} ${k}`}
                  value={log[e.id]?.[k] ?? ""}
                  onChange={(ev) => setLog((l) => ({ ...l, [e.id]: { ...(l[e.id] ?? { weight: "", sets: "", reps: "" }), [k]: ev.target.value } }))}
                  className="min-field w-14 text-center"
                />
              ))}
              <button onClick={() => removeExercise(e.id)} aria-label={`Remove ${e.name}`} className="hidden group-hover:block">
                <X className="h-3 w-3" style={{ color: "var(--ink-500)" }} />
              </button>
            </div>
            {c && (
              <p className="-mt-0.5 pb-1 text-[11px]" title={c.why} style={{ color: "var(--ink-500)" }}>
                {c.last ? `Last ${c.last} → ` : ""}
                <span style={{ color: STATUS_COLOR[c.status] ?? "var(--ink-300)" }}>
                  {c.status === "increase" ? "↑ " : c.status === "stalled" ? "⚠ " : ""}
                  {c.next}
                </span>
                {c.status === "stalled" && <span> · stalled 3 sessions</span>}
              </p>
            )}
            </div>
            );
          })}
          <div className="flex items-center gap-3">
            <InlineAdd placeholder="Add an exercise" onAdd={addExercise} className="py-1 text-[13px]" />
            {routine.exercises.length > 0 && (
              <button onClick={saveLog} className="min-btn flex-shrink-0">
                {saved ? "Logged ✓" : "Log workout"}
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

export default function HabitsPage() {
  const [habits, setHabits] = useState<Habit[] | null>(null);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [coach, setCoach] = useState<Coach | null>(null);

  const load = useCallback(async () => {
    const [h, r, s, c] = await Promise.all([json<Habit[]>("/api/habits", []), json<Routine[]>("/api/weights/routines", []), json<Session[]>("/api/weights/sessions", []), json<Coach | null>("/api/training", null)]);
    setCoach(c);
    setHabits(h);
    setRoutines(r);
    setSessions(s);
  }, []);
  useLoad(load);
  useOnDataChanged(load);

  const todayKey = dayKey(new Date());
  const todays = (habits ?? []).filter((h) => h.targetDays.includes(todayKey));
  const doneToday = todays.filter((h) => h.logs.some((l) => l.completed && ymd(new Date(l.date)) === ymd(new Date()))).length;

  return (
    <div className="min-page">
      <PageHeader title="Habits" sub={todays.length ? `${doneToday}/${todays.length} today` : undefined} />
      <InlineAdd
        placeholder="Add a habit"
        onAdd={async (name) => {
          await send("/api/habits", "POST", { name });
          await load();
        }}
        className="mb-4"
      />
      {habits === null ? (
        <p className="min-sub">Loading…</p>
      ) : habits.length === 0 ? (
        <Empty>No habits yet. Add one above, or tell the chat &quot;stretch every night&quot;.</Empty>
      ) : (
        <ul className="mb-6">
          {habits.map((h) => (
            <HabitRow key={h.id} habit={h} onChanged={load} />
          ))}
        </ul>
      )}

      <div id="workouts">
        <Section label="Workouts">
          {coach && (
            <p className="min-sub mb-1">
              {coach.block.name.split(" – ")[0]} block · week {coach.block.weeks + 1} of ~6
              {coach.today.length ? ` · today: ${coach.today.map((t) => t.name.split(" – ")[0]).join(" + ")}` : " · rest day"}
            </p>
          )}
          <ul>
            {routines.map((r) => (
              <RoutineRow key={r.id} routine={r} onChanged={load} coach={coach} />
            ))}
          </ul>
          <InlineAdd
            placeholder="New workout (e.g. Push day)"
            onAdd={async (name) => {
              await send("/api/weights/routines", "POST", { name });
              await load();
            }}
          />
          {sessions.length > 0 && (
            <ul className="mt-3">
              {sessions.slice(0, 5).map((s) => (
                <li key={s.id} className="flex gap-2 py-0.5 text-xs" style={{ color: "var(--ink-500)" }}>
                  <span className="w-14 flex-shrink-0">{format(new Date(s.date), "EEE d")}</span>
                  <span className="truncate" style={{ color: "var(--ink-300)" }}>
                    {s.routine.name}
                  </span>
                  <span className="truncate">
                    {s.exerciseLogs
                      .slice(0, 3)
                      .map((l) => `${l.exerciseName}${l.weight ? ` ${l.weight}` : ""}${l.sets && l.reps ? ` ${l.sets}×${l.reps}` : ""}`)
                      .join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}
