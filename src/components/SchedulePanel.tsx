"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { addDays, format } from "date-fns";
import { X } from "lucide-react";
import { Checkbox, Empty, Section } from "@/components/ui";
import { useLoad, useOnDataChanged } from "@/hooks/useAssistantChat";
import { AREA_META, type Area } from "@/lib/areas";

interface Block {
  start: string;
  end: string;
  title: string;
  kind: string;
  area?: string;
  ref?: { type: "todo" | "task" | "habit" | "workout"; id: string };
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
  schedule: { date: string; wake: string; bed: string; blocks: Block[]; unscheduled: string[] };
  week: Fixed[];
  prefs: { bedtime: string; wake?: string | null; weekendBedtime?: string | null };
}

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const send = (url: string, method: string, body?: unknown) =>
  fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

function fmt12(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
}
const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));

function daysLabel(days: string[]) {
  const d = DAYS.filter((x) => days.includes(x));
  if (d.length === 7) return "Every day";
  if (d.join() === "mon,tue,wed,thu,fri") return "Weekdays";
  if (d.join() === "sat,sun") return "Weekends";
  return d.map((x) => x[0].toUpperCase() + x.slice(1)).join(", ");
}

const KIND_COLOR: Record<string, string> = { fixed: "var(--ink-500)", event: "#f472b6", workout: "#34d399", study: "#a78bfa", focus: "var(--accent)", routine: "var(--ink-500)", "wind-down": "var(--ink-600)" };

/** Tasks → Today: the day's timeline, and his fixed week. */
export default function SchedulePanel() {
  const [data, setData] = useState<Data | null>(null);
  const [offset, setOffset] = useState(0);
  const [nowMin, setNowMin] = useState<number | null>(null);
  const [form, setForm] = useState({ title: "", days: ["mon", "tue", "wed", "thu", "fri"], start: "08:00", end: "15:00" });
  const [editWeek, setEditWeek] = useState(false);

  const load = useCallback(async () => {
    const date = format(addDays(new Date(), offset), "yyyy-MM-dd");
    const res = await fetch(`/api/schedule?date=${date}`, { cache: "no-store" });
    if (res.ok) setData(await res.json());
    const n = new Date();
    setNowMin(offset === 0 ? n.getHours() * 60 + n.getMinutes() : null);
  }, [offset]);
  useLoad(load);
  useOnDataChanged(load);

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
      await load();
    }
  }
  async function removeFixed(id: string) {
    await send(`/api/schedule?id=${id}`, "DELETE");
    await load();
  }
  async function setPref(key: "bedtime" | "wake", value: string) {
    await send("/api/schedule", "PATCH", { [key]: value || null });
    await load();
  }

  if (!data) return <p className="min-sub">Loading…</p>;
  const s = data.schedule;

  return (
    <div>
      <div className="mb-3 flex items-center gap-3 text-xs">
        {["Today", "Tomorrow"].map((l, i) => (
          <button key={l} onClick={() => setOffset(i)} className="min-tab" data-active={offset === i}>
            {l}
          </button>
        ))}
        <span className="ml-auto" style={{ color: "var(--ink-500)" }}>
          up {fmt12(s.wake)} · bed {fmt12(s.bed)}
        </span>
      </div>

      {s.blocks.length === 0 ? (
        <Empty>Nothing planned. Tell the chat your week (“school 7:40 to 2:20 on weekdays”).</Empty>
      ) : (
        <ol className="mb-6">
          {s.blocks.map((b) => {
            const current = nowMin != null && toMin(b.start) <= nowMin && nowMin < toMin(b.end);
            const past = nowMin != null && toMin(b.end) <= nowMin && toMin(b.end) > toMin(s.wake);
            const color = b.area && b.area in AREA_META ? AREA_META[b.area as Area].color : KIND_COLOR[b.kind] ?? "var(--ink-500)";
            return (
              <li key={`${b.start}-${b.title}`} className="flex items-start gap-3 border-b py-2 text-sm" style={{ borderColor: "var(--stroke-1)", opacity: past && !current ? 0.5 : 1 }}>
                <span className="w-24 flex-shrink-0 pt-0.5 text-xs tabular-nums" style={{ color: current ? "var(--ink-100)" : "var(--ink-500)" }}>
                  {fmt12(b.start)}–{fmt12(b.end)}
                </span>
                <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full" style={{ background: color, boxShadow: current ? `0 0 0 3px ${color}33` : undefined }} />
                <div className="min-w-0 flex-1">
                  <p className={b.done ? "line-through" : ""} style={{ color: b.done ? "var(--ink-600)" : b.kind === "fixed" || b.kind === "wind-down" ? "var(--ink-400)" : "var(--ink-100)" }}>
                    {b.kind === "workout" ? <Link href="/habits#workouts">{b.title}</Link> : b.title}
                  </p>
                  {b.detail && <p className="truncate text-xs" style={{ color: "var(--ink-500)" }}>{b.detail}</p>}
                </div>
                {b.ref?.type === "todo" && <Checkbox checked={!!b.done} onClick={() => tick(b)} label={`${b.done ? "Undo" : "Done"}: ${b.title}`} />}
              </li>
            );
          })}
        </ol>
      )}
      {s.unscheduled.length > 0 && <p className="min-sub -mt-4 mb-6">Didn&apos;t fit: {s.unscheduled.join(", ")}</p>}

      <Section label="Your week">
        {data.week.length === 0 && !editWeek && <p className="min-sub mb-2">Add school, practice, work — the day plans around them.</p>}
        <ul>
          {data.week.map((f) => (
            <li key={f.id} className="group min-row">
              <span className="flex-1" style={{ color: "var(--ink-200)" }}>
                {f.title}
              </span>
              <span className="text-xs" style={{ color: "var(--ink-500)" }}>
                {daysLabel(f.days)} · {fmt12(f.start)}–{fmt12(f.end)}
              </span>
              <button onClick={() => removeFixed(f.id)} aria-label={`Remove ${f.title}`} className="p-0.5 opacity-60 hover:opacity-100">
                <X className="h-3.5 w-3.5" style={{ color: "var(--ink-500)" }} />
              </button>
            </li>
          ))}
        </ul>
        {editWeek ? (
          <div className="mt-2 space-y-2">
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="School, practice, work…" aria-label="Block name" className="min-input" />
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
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm" style={{ color: "var(--ink-400)" }}>
          <label className="flex items-center gap-2">
            Bed
            <input type="time" defaultValue={data.prefs.bedtime} onBlur={(e) => setPref("bedtime", e.target.value)} aria-label="Bedtime" className="min-field w-28" />
          </label>
          <label className="flex items-center gap-2">
            Wake
            <input type="time" defaultValue={data.prefs.wake ?? ""} onBlur={(e) => setPref("wake", e.target.value)} aria-label="Wake time" className="min-field w-28" />
          </label>
          <span className="min-sub">Wake defaults to bed + your sleep target.</span>
        </div>
      </Section>
    </div>
  );
}
