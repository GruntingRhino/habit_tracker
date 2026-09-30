"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { addDays, format, isSameDay, startOfWeek } from "date-fns";
import { CalendarPlus, ChevronLeft, ChevronRight, RefreshCw, Users, X } from "lucide-react";
import { Checkbox, Section } from "@/components/ui";
import { useLoad, useOnDataChanged } from "@/hooks/useAssistantChat";
import { AREA_META, type Area } from "@/lib/areas";
import { needsPrep } from "@/lib/prep";

interface Block {
  start: string;
  end: string;
  title: string;
  kind: string;
  area?: string;
  ref?: { type: "todo" | "task" | "habit" | "workout" | "event"; id: string };
  done?: boolean;
  detail?: string;
}
interface Fixed {
  id: string;
  title: string;
  days: string[];
  start: string;
  end: string;
}
interface Data {
  schedule: { date: string; wake: string; bed: string; blocks: Block[]; unscheduled: string[]; allDay: { id: string; title: string; source: string }[] };
  week: Fixed[];
  prefs: { bedtime: string; wake?: string | null };
}
interface CalEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  attendees: string[];
  location: string | null;
  description: string | null;
  source: string;
  googleId: string | null;
}
interface Google {
  configured: boolean;
  connected: boolean;
  email: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
}

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const HOUR = 52; // px per hour
const send = (url: string, method: string, body?: unknown) =>
  fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
function fmt12(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
}
function daysLabel(days: string[]) {
  const d = DAYS.filter((x) => days.includes(x));
  if (d.length === 7) return "Every day";
  if (d.join() === "mon,tue,wed,thu,fri") return "Weekdays";
  if (d.join() === "sat,sun") return "Weekends";
  return d.map((x) => x[0].toUpperCase() + x.slice(1)).join(", ");
}
const KIND_COLOR: Record<string, string> = { fixed: "#64748b", event: "#f472b6", workout: "#34d399", study: "#a78bfa", focus: "#60a5fa", routine: "#475569", "wind-down": "#334155" };

/** Side-by-side lanes for overlapping blocks. */
function layout(blocks: Block[]) {
  const sorted = [...blocks].sort((a, b) => toMin(a.start) - toMin(b.start) || toMin(b.end) - toMin(a.end));
  const out: { b: Block; lane: number; lanes: number }[] = [];
  let cluster: { b: Block; lane: number; lanes: number }[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const lanes = Math.max(1, ...cluster.map((c) => c.lane + 1));
    for (const c of cluster) out.push({ ...c, lanes });
    cluster = [];
  };
  for (const b of sorted) {
    const s = toMin(b.start);
    if (s >= clusterEnd && cluster.length) flush();
    const laneEnds: number[] = [];
    for (const c of cluster) laneEnds[c.lane] = Math.max(laneEnds[c.lane] ?? 0, toMin(c.b.end));
    let lane = laneEnds.findIndex((e) => e <= s);
    if (lane === -1) lane = laneEnds.length;
    cluster.push({ b, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, toMin(b.end));
  }
  if (cluster.length) flush();
  return out;
}

export default function ScheduleView({ googleResult }: { googleResult?: string | null }) {
  const [day, setDay] = useState(() => new Date());
  const [data, setData] = useState<Data | null>(null);
  const [google, setGoogle] = useState<Google | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [openEvent, setOpenEvent] = useState<CalEvent | null>(null);
  const [adding, setAdding] = useState(false);
  const [editWeek, setEditWeek] = useState(false);
  const [form, setForm] = useState({ title: "", days: ["mon", "tue", "wed", "thu", "fri"], start: "08:00", end: "15:00" });
  const [nowMin, setNowMin] = useState<number | null>(null);

  const load = useCallback(async () => {
    const [s, g] = await Promise.all([fetch(`/api/schedule?date=${format(day, "yyyy-MM-dd")}`, { cache: "no-store" }), fetch("/api/google/sync", { cache: "no-store" })]);
    if (s.ok) setData(await s.json());
    if (g.ok) setGoogle(await g.json());
    const n = new Date();
    setNowMin(isSameDay(day, n) ? n.getHours() * 60 + n.getMinutes() : null);
  }, [day]);
  useLoad(load);
  useOnDataChanged(load);

  async function syncNow() {
    setSyncing(true);
    await send("/api/google/sync", "POST");
    setSyncing(false);
    await load();
  }
  async function openEventById(id: string) {
    const from = new Date(day);
    from.setHours(0, 0, 0, 0);
    const res = await fetch(`/api/calendar?from=${from.toISOString()}&to=${addDays(from, 1).toISOString()}`, { cache: "no-store" });
    const list = res.ok ? ((await res.json()) as CalEvent[]) : [];
    setOpenEvent(list.find((e) => e.id === id) ?? null);
  }
  async function tick(b: Block) {
    if (b.ref?.type !== "todo") return;
    await send(`/api/todos/${b.ref.id}`, "PATCH", { status: b.done ? "open" : "done" });
    window.dispatchEvent(new CustomEvent("liveimproved:changed"));
    await load();
  }
  async function addFixed() {
    if (!form.title.trim() || !form.days.length) return;
    const res = await send("/api/schedule", "POST", form);
    if (res.ok) {
      setForm((f) => ({ ...f, title: "" }));
      setEditWeek(false);
      await load();
    }
  }

  const week = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(day, { weekStartsOn: 1 }), i));
  const s = data?.schedule;
  const gridStart = s ? Math.max(0, Math.min(toMin(s.wake), ...s.blocks.map((b) => toMin(b.start))) - 60) : 6 * 60;
  const gridEnd = s ? Math.min(24 * 60, Math.max(toMin(s.bed) || 24 * 60, ...s.blocks.map((b) => toMin(b.end))) + 30) : 23 * 60;
  const hours = Array.from({ length: Math.ceil((gridEnd - gridStart) / 60) }, (_, i) => Math.floor(gridStart / 60) + i);

  return (
    <div>
      {/* Google Calendar link */}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--ink-500)" }}>
        {googleResult === "connected" && <span style={{ color: "var(--good)" }}>✓ Google Calendar connected.</span>}
        {googleResult === "error" && <span style={{ color: "var(--bad)" }}>Couldn&apos;t connect Google — try again.</span>}
        {google?.connected ? (
          <>
            <span>
              Google Calendar{google.email ? ` · ${google.email}` : ""} · {google.lastError ? <span style={{ color: "var(--bad)" }}>sync error</span> : google.lastSyncAt ? `synced ${format(new Date(google.lastSyncAt), "h:mm a")}` : "not synced yet"}
            </span>
            <button onClick={syncNow} className="min-chip flex items-center gap-1 py-0" aria-label="Sync Google Calendar now">
              <RefreshCw className={`h-3 w-3 ${syncing ? "animate-spin" : ""}`} /> Sync
            </button>
          </>
        ) : google?.configured ? (
          <a href="/api/google/connect" className="min-chip">
            Connect Google Calendar
          </a>
        ) : null}
        <button onClick={() => setAdding(true)} className="min-chip ml-auto flex items-center gap-1">
          <CalendarPlus className="h-3.5 w-3.5" /> Event
        </button>
      </div>

      {/* Week strip */}
      <div className="mb-3 flex items-center gap-1">
        <button onClick={() => setDay((d) => addDays(d, -7))} aria-label="Previous week" className="p-1" style={{ color: "var(--ink-500)" }}>
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="grid flex-1 grid-cols-7 gap-1">
          {week.map((d) => {
            const sel = isSameDay(d, day);
            const today = isSameDay(d, new Date());
            return (
              <button key={d.toISOString()} onClick={() => setDay(d)} aria-pressed={sel} className="flex flex-col items-center rounded-lg py-1 text-xs" style={{ background: sel ? "var(--ink-100)" : undefined, color: sel ? "var(--bg-base)" : today ? "var(--accent)" : "var(--ink-400)" }}>
                <span className="text-[10px] uppercase">{format(d, "EEE")}</span>
                <span className="text-sm font-medium tabular-nums">{format(d, "d")}</span>
              </button>
            );
          })}
        </div>
        <button onClick={() => setDay((d) => addDays(d, 7))} aria-label="Next week" className="p-1" style={{ color: "var(--ink-500)" }}>
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      {!isSameDay(day, new Date()) && (
        <button onClick={() => setDay(new Date())} className="min-link mb-2 text-xs">
          Back to today
        </button>
      )}

      {adding && <EventForm day={day} onClose={() => setAdding(false)} onSaved={() => (setAdding(false), void load())} />}

      {!s ? (
        <p className="min-sub">Loading…</p>
      ) : (
        <>
          {s.allDay.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {s.allDay.map((e) => (
                <button key={e.id} onClick={() => openEventById(e.id)} className="min-chip" style={{ borderColor: "#f472b6", color: "var(--ink-100)" }}>
                  {e.title}
                </button>
              ))}
            </div>
          )}
          {/* Timeline grid */}
          <div className="relative mb-2" style={{ height: (hours.length) * HOUR }} aria-label="Day timeline">
            {hours.map((h, i) => (
              <div key={h} className="absolute inset-x-0 flex items-start" style={{ top: i * HOUR }}>
                <span className="w-12 -translate-y-1.5 pr-2 text-right text-[10px] tabular-nums" style={{ color: "var(--ink-600)" }}>
                  {fmt12(`${String(h % 24).padStart(2, "0")}:00`)}
                </span>
                <div className="flex-1 border-t" style={{ borderColor: "var(--stroke-1)" }} />
              </div>
            ))}
            {nowMin != null && nowMin >= gridStart && nowMin <= gridEnd && (
              <div className="absolute left-12 right-0 z-10 flex items-center" style={{ top: ((nowMin - gridStart) / 60) * HOUR }}>
                <span className="-ml-1 h-2 w-2 rounded-full" style={{ background: "var(--bad)" }} />
                <div className="h-px flex-1" style={{ background: "var(--bad)" }} />
              </div>
            )}
            <div className="absolute bottom-0 left-12 right-0 top-0">
              {layout(s.blocks).map(({ b, lane, lanes }) => {
                const top = ((toMin(b.start) - gridStart) / 60) * HOUR;
                const height = Math.max(20, ((toMin(b.end) - toMin(b.start)) / 60) * HOUR - 2);
                const color = b.area && b.area in AREA_META ? AREA_META[b.area as Area].color : KIND_COLOR[b.kind] ?? "#64748b";
                const clickable = b.ref?.type === "event" || b.ref?.type === "todo";
                return (
                  <div
                    key={`${b.start}-${b.title}`}
                    className="absolute overflow-hidden rounded-md px-2 py-0.5 text-[12px] leading-tight"
                    style={{ top, height, left: `${(lane / lanes) * 100}%`, width: `calc(${100 / lanes}% - 3px)`, background: `${color}26`, borderLeft: `3px solid ${color}`, color: b.done ? "var(--ink-600)" : "var(--ink-100)", cursor: clickable ? "pointer" : undefined }}
                    onClick={() => (b.ref?.type === "event" ? openEventById(b.ref.id) : undefined)}
                  >
                    <div className="flex items-start gap-1.5">
                      {b.ref?.type === "todo" && (
                        <span onClick={(e) => (e.stopPropagation(), void tick(b))} className="mt-0.5">
                          <Checkbox checked={!!b.done} onClick={() => undefined} label={`${b.done ? "Undo" : "Done"}: ${b.title}`} />
                        </span>
                      )}
                      <div className="min-w-0">
                        <p className={`truncate font-medium ${b.done ? "line-through" : ""}`}>{b.kind === "workout" ? <Link href="/work?tab=habits">{b.title}</Link> : b.title}</p>
                        {height > 34 && (
                          <p className="truncate text-[11px]" style={{ color: "var(--ink-400)" }}>
                            {fmt12(b.start)}–{fmt12(b.end)}
                            {b.detail ? ` · ${b.detail}` : ""}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {s.unscheduled.length > 0 && <p className="min-sub mb-4">Didn&apos;t fit: {s.unscheduled.join(", ")}</p>}
        </>
      )}

      {openEvent && <EventSheet event={openEvent} onClose={() => setOpenEvent(null)} onChanged={(e) => (setOpenEvent(e), void load())} />}

      <Section label="Your week">
        {data && data.week.length === 0 && !editWeek && <p className="min-sub mb-2">Add school, practice, work — the day plans around them.</p>}
        <ul>
          {data?.week.map((f) => (
            <li key={f.id} className="group min-row">
              <span className="flex-1" style={{ color: "var(--ink-200)" }}>
                {f.title}
              </span>
              <span className="text-xs" style={{ color: "var(--ink-500)" }}>
                {daysLabel(f.days)} · {fmt12(f.start)}–{fmt12(f.end)}
              </span>
              <button onClick={async () => (await send(`/api/schedule?id=${f.id}`, "DELETE"), load())} aria-label={`Remove ${f.title}`} className="p-0.5 opacity-60 hover:opacity-100">
                <X className="h-3.5 w-3.5" style={{ color: "var(--ink-500)" }} />
              </button>
            </li>
          ))}
        </ul>
        {editWeek ? (
          <div className="mt-2 space-y-2 rounded-lg border p-2" style={{ borderColor: "var(--stroke-1)" }}>
            <div className="flex items-center gap-2">
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="School, practice, work…" aria-label="Block name" className="min-input flex-1" />
              <button onClick={() => setEditWeek(false)} aria-label="Close" className="rounded p-1 hover:bg-white/[.06]" style={{ color: "var(--ink-400)" }}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-wrap gap-1">
              {DAYS.map((d) => (
                <button key={d} onClick={() => setForm({ ...form, days: form.days.includes(d) ? form.days.filter((x) => x !== d) : [...form.days, d] })} className="min-chip" aria-pressed={form.days.includes(d)} style={form.days.includes(d) ? { background: "var(--ink-100)", color: "var(--bg-base)" } : undefined}>
                  {d[0].toUpperCase() + d.slice(1)}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 text-sm">
              <input type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} aria-label="Start time" className="min-field w-28" />
              <span style={{ color: "var(--ink-500)" }}>to</span>
              <input type="time" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} aria-label="End time" className="min-field w-28" />
              <button onClick={addFixed} className="min-btn ml-auto">
                Add
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setEditWeek(true)} className="min-link mt-1">
            + Add to your week
          </button>
        )}
        {data && (
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm" style={{ color: "var(--ink-400)" }}>
            <label className="flex items-center gap-2">
              Bed
              <input type="time" defaultValue={data.prefs.bedtime} onBlur={async (e) => (await send("/api/schedule", "PATCH", { bedtime: e.target.value }), load())} aria-label="Bedtime" className="min-field w-28" />
            </label>
            <label className="flex items-center gap-2">
              Wake
              <input type="time" defaultValue={data.prefs.wake ?? ""} onBlur={async (e) => (await send("/api/schedule", "PATCH", { wake: e.target.value || null }), load())} aria-label="Wake time" className="min-field w-28" />
            </label>
          </div>
        )}
      </Section>
    </div>
  );
}

/** "+ Event": title, day, time (or all day), who to share with, and a prep to-do. */
function EventForm({ day, onClose, onSaved }: { day: Date; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ title: "", date: format(day, "yyyy-MM-dd"), start: "18:00", end: "19:00", allDay: false, share: "" });
  // Prep to-do: on for things you prepare for (a debate), off for a dentist appointment — unless he changes it.
  const [prepChoice, setPrepChoice] = useState<boolean | null>(null);
  const prep = prepChoice ?? needsPrep(f.title) === "yes";
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!f.title.trim()) return setError("Give it a title.");
    const start = f.allDay ? new Date(`${f.date}T00:00`) : new Date(`${f.date}T${f.start}`);
    const end = f.allDay ? addDays(start, 1) : new Date(`${f.date}T${f.end}`);
    const attendees = f.share.split(/[\s,;]+/).filter((x) => x.includes("@"));
    setBusy(true);
    const res = await send("/api/calendar", "POST", { title: f.title.trim(), start: start.toISOString(), end: end.toISOString(), allDay: f.allDay, attendees, prep });
    setBusy(false);
    if (!res.ok) return setError((await res.json().catch(() => null))?.error ?? "Couldn't save it.");
    window.dispatchEvent(new CustomEvent("liveimproved:changed"));
    onSaved();
  }
  return (
    <div className="mb-3 space-y-2 rounded-xl border p-3 text-sm" style={{ borderColor: "var(--stroke-2)", background: "rgba(255,255,255,.03)" }}>
      <div className="flex items-center gap-2">
        <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Event title" aria-label="Event title" className="min-input flex-1" autoFocus />
        <button onClick={onClose} aria-label="Close" className="rounded p-1 hover:bg-white/[.06]" style={{ color: "var(--ink-400)" }}>
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} aria-label="Event date" className="min-field w-auto" />
        {!f.allDay && (
          <>
            <input type="time" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} aria-label="Event start" className="min-field w-28" />
            <span style={{ color: "var(--ink-500)" }}>to</span>
            <input type="time" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} aria-label="Event end" className="min-field w-28" />
          </>
        )}
        <label className="flex items-center gap-1 text-xs" style={{ color: "var(--ink-400)" }}>
          <input type="checkbox" checked={f.allDay} onChange={(e) => setF({ ...f, allDay: e.target.checked })} /> All day
        </label>
      </div>
      <input value={f.share} onChange={(e) => setF({ ...f, share: e.target.value })} placeholder="Share with (emails) — they get a Google Calendar invite" aria-label="Share with" className="min-field" />
      <label className="flex items-center gap-2 text-xs" style={{ color: "var(--ink-400)" }}>
        <input type="checkbox" checked={prep} onChange={(e) => setPrepChoice(e.target.checked)} aria-label="Needs preparing" /> Needs preparing (“Prepare for…” to-do + reminder the evening before)
      </label>
      {error && <p className="text-xs" style={{ color: "var(--bad)" }}>{error}</p>}
      <button onClick={save} disabled={busy} className="min-btn">
        {busy ? "Saving…" : "Add event"}
      </button>
    </div>
  );
}

/** Tap an event: details, share it, delete it. */
function EventSheet({ event, onClose, onChanged }: { event: CalEvent; onClose: () => void; onChanged: (e: CalEvent | null) => void }) {
  const [share, setShare] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const start = new Date(event.start);
  const end = new Date(event.end);
  async function doShare() {
    const emails = share.split(/[\s,;]+/).filter((x) => x.includes("@"));
    if (!emails.length) return;
    const res = await send(`/api/calendar/${event.id}`, "PATCH", { attendees: [...new Set([...event.attendees, ...emails])] });
    const body = await res.json().catch(() => null);
    if (res.ok) {
      setShare("");
      setMsg(body.onGoogle ? "Shared — they'll get a Google Calendar invite." : "Saved. Connect Google Calendar so they get an invite.");
      onChanged(body);
    }
  }
  async function remove() {
    if (!window.confirm(`Delete "${event.title}"${event.googleId ? " (also from Google Calendar)" : ""}?`)) return;
    await send(`/api/calendar/${event.id}`, "DELETE");
    onChanged(null);
    onClose();
  }
  return (
    <div className="mb-4 rounded-xl border p-3 text-sm" style={{ borderColor: "#f472b6", background: "rgba(244,114,182,.06)" }}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium" style={{ color: "var(--ink-100)" }}>
            {event.title}
          </p>
          <p className="text-xs" style={{ color: "var(--ink-400)" }}>
            {event.allDay ? `${format(start, "EEE, MMM d")} · all day` : `${format(start, "EEE, MMM d · h:mm a")}–${format(end, "h:mm a")}`}
            {event.source === "google" ? " · from Google Calendar" : event.googleId ? " · on Google Calendar" : ""}
          </p>
        </div>
        <button onClick={onClose} aria-label="Close event" className="rounded p-1 hover:bg-white/[.06]" style={{ color: "var(--ink-400)" }}>
          <X className="h-4 w-4" />
        </button>
      </div>
      {event.location && <p className="mt-1 text-xs" style={{ color: "var(--ink-400)" }}>📍 {event.location}</p>}
      {event.description && <p className="mt-1 whitespace-pre-wrap text-xs" style={{ color: "var(--ink-300)" }}>{event.description}</p>}
      {event.attendees.length > 0 && (
        <p className="mt-1 flex items-center gap-1 text-xs" style={{ color: "var(--ink-400)" }}>
          <Users className="h-3 w-3" /> {event.attendees.join(", ")}
        </p>
      )}
      <div className="mt-2 flex items-center gap-2">
        <input value={share} onChange={(e) => setShare(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doShare()} placeholder="Share with email…" aria-label="Share event with" className="min-field flex-1" />
        <button onClick={doShare} className="min-chip">
          Share
        </button>
      </div>
      {msg && <p className="mt-1 text-xs" style={{ color: "var(--ink-400)" }}>{msg}</p>}
      <button onClick={remove} className="min-link mt-2 text-xs" style={{ color: "var(--bad)" }}>
        Delete event
      </button>
    </div>
  );
}
