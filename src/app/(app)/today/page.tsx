"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { AREA_META, SCORED_AREAS } from "@/lib/areas";
import { AreaDot, Checkbox, Empty, PageHeader, Section } from "@/components/ui";
import { useOnDataChanged } from "@/hooks/useAssistantChat";

interface PlanItem {
  type: "todo" | "task" | "project";
  id: string;
  title: string;
  area: string;
  reason?: string;
  projectId?: string;
  done: boolean;
}

interface Score {
  date: string;
  overall: number;
  physical: number;
  mental: number;
  financial: number;
  spiritual: number;
  work: number;
  rationale: Record<string, string> | null;
  journalScore: number | null;
  journalFeedback: string | null;
  judgedBy: string | null;
}

interface TodayData {
  plan: { items: PlanItem[]; summary: string | null; pending: boolean };
  routines: { id: string; name: string; area: string; done: boolean }[];
  meals: { id: string; name: string; category: string; status: string }[];
  reminders: { id: string; text: string; fireAt: string }[];
  scores: Score[];
}

async function fetchToday(): Promise<TodayData | null> {
  const res = await fetch("/api/today");
  return res.ok ? res.json() : null;
}

export default function TodayPage() {
  const [data, setData] = useState<TodayData | null>(null);
  const [replanning, setReplanning] = useState(false);
  const [showReasons, setShowReasons] = useState(false);
  const [allRoutines, setAllRoutines] = useState(false);

  const load = useCallback(async () => {
    const d = await fetchToday();
    if (d) setData(d);
  }, []);

  useEffect(() => {
    let alive = true;
    fetchToday().then((d) => alive && d && setData(d));
    return () => {
      alive = false;
    };
  }, []);
  useOnDataChanged(load);

  useEffect(() => {
    if (!data?.plan.pending) return;
    const t = setTimeout(load, 6000);
    return () => clearTimeout(t);
  }, [data, load]);

  async function togglePlanItem(item: PlanItem) {
    setData((d) => d && { ...d, plan: { ...d.plan, items: d.plan.items.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)) } });
    const json = { "Content-Type": "application/json" };
    if (item.type === "todo") {
      await fetch(`/api/todos/${item.id}`, { method: "PATCH", headers: json, body: JSON.stringify({ status: item.done ? "open" : "done" }) });
    } else if (item.type === "task" && item.projectId) {
      await fetch(`/api/projects/${item.projectId}/tasks/${item.id}`, {
        method: "PATCH",
        headers: json,
        body: JSON.stringify({ status: item.done ? "todo" : "completed", completedAt: item.done ? null : new Date().toISOString() }),
      });
    } else if (item.type === "project") {
      await fetch(`/api/projects/${item.id}`, { method: "PATCH", headers: json, body: JSON.stringify({ status: item.done ? "active" : "completed" }) });
    }
  }

  async function toggleRoutine(id: string, done: boolean) {
    setData((d) => d && { ...d, routines: d.routines.map((r) => (r.id === id ? { ...r, done: !done } : r)) });
    await fetch(`/api/habits/${id}/log`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ completed: !done }) });
  }

  async function replan() {
    setReplanning(true);
    await fetch("/api/today", { method: "POST" });
    await load();
    setReplanning(false);
  }

  if (!data) return <div className="min-page min-sub">Loading…</div>;

  const todayKey = format(new Date(), "yyyy-MM-dd");
  const past = data.scores.filter((s) => format(new Date(s.date), "yyyy-MM-dd") !== todayKey);
  const latest = [...past].reverse().find((s) => s.judgedBy) ?? past[past.length - 1];
  const done = data.plan.items.filter((i) => i.done).length;

  return (
    <div className="min-page">
      <PageHeader title="Today" sub={format(new Date(), "EEEE, MMMM d")} />
      {data.plan.summary && (
        <p className="-mt-5 mb-8 text-sm" style={{ color: "var(--ink-400)" }}>
          {data.plan.summary}
        </p>
      )}

      <Section
        label={data.plan.items.length ? `Focus  ${done}/${data.plan.items.length}` : "Focus"}
        action={
          <button onClick={replan} disabled={replanning} className="min-link disabled:opacity-50">
            {replanning ? "Planning…" : "Replan"}
          </button>
        }
      >
        {data.plan.pending && <p className="min-sub mb-1">Draft — Spark is refining this…</p>}
        {data.plan.items.length === 0 ? (
          <Empty>
            Nothing planned. Tell <Link href="/chat" className="underline">Chat</Link> what you need to do.
          </Empty>
        ) : (
          <ul>
            {data.plan.items.map((item) => (
              <li key={item.id} className="min-row">
                <Checkbox checked={item.done} onClick={() => togglePlanItem(item)} label={item.done ? "Mark not done" : "Mark done"} />
                <div className="min-w-0 flex-1">
                  <p className={`text-[15px] ${item.done ? "line-through" : ""}`} style={{ color: item.done ? "var(--ink-600)" : "var(--ink-100)" }}>
                    {item.title}
                  </p>
                  {item.reason && !item.done && <p className="min-sub">{item.reason}</p>}
                </div>
                <AreaDot area={item.area} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      {data.routines.length > 0 && (
        <Section label={`Routines  ${data.routines.filter((r) => r.done).length}/${data.routines.length}`} action={<Link href="/habits" className="min-link">Edit</Link>}>
          <ul>
            {[...data.routines]
              .sort((a, b) => Number(a.done) - Number(b.done))
              .slice(0, allRoutines ? undefined : 6)
              .map((r) => (
              <li key={r.id} className="min-row">
                <Checkbox checked={r.done} onClick={() => toggleRoutine(r.id, r.done)} label={r.name} />
                <span className="flex-1 text-[15px]" style={{ color: r.done ? "var(--ink-600)" : "var(--ink-200)" }}>
                  {r.name}
                </span>
                <AreaDot area={r.area} />
              </li>
              ))}
          </ul>
          {data.routines.length > 6 && (
            <button onClick={() => setAllRoutines((v) => !v)} className="min-link mt-2">
              {allRoutines ? "Show less" : `Show all ${data.routines.length}`}
            </button>
          )}
        </Section>
      )}

      {(data.reminders.length > 0 || data.meals.length > 0) && (
        <Section label="Later today">
          <ul>
            {data.reminders.map((r) => (
              <li key={r.id} className="min-row text-[15px]">
                <span className="w-16 text-sm tabular-nums" style={{ color: "var(--ink-500)" }}>
                  {format(new Date(r.fireAt), "h:mm a")}
                </span>
                <span style={{ color: "var(--ink-200)" }}>{r.text}</span>
              </li>
            ))}
            {data.meals.map((m) => (
              <li key={m.id} className="min-row text-[15px]">
                <span className="w-16 text-sm capitalize" style={{ color: "var(--ink-500)" }}>
                  {m.category}
                </span>
                <span style={{ color: m.status === "eaten" ? "var(--ink-600)" : "var(--ink-200)" }}>{m.name}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section label={latest ? `Score · ${format(new Date(latest.date), "EEE MMM d")}` : "Score"} action={<Link href="/entry" className="min-link">Journal</Link>}>
        {!latest ? (
          <Empty>Your first score arrives tonight at 11:30.</Empty>
        ) : (
          <>
            <button onClick={() => setShowReasons((v) => !v)} className="w-full text-left">
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-semibold tabular-nums" style={{ color: "var(--ink-100)" }}>
                  {latest.overall.toFixed(1)}
                </span>
                <span className="min-sub">/ 10</span>
              </div>
              <div className="mt-3 grid grid-cols-5 gap-2">
                {SCORED_AREAS.map((a) => (
                  <div key={a}>
                    <p className="text-lg font-medium tabular-nums" style={{ color: "var(--ink-200)" }}>
                      {Math.round(latest[a])}
                    </p>
                    <p className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--ink-500)" }}>
                      <AreaDot area={a} />
                      {AREA_META[a].label}
                    </p>
                  </div>
                ))}
              </div>
            </button>
            {showReasons && latest.rationale && (
              <ul className="mt-4 space-y-1.5">
                {SCORED_AREAS.filter((a) => latest.rationale?.[a]).map((a) => (
                  <li key={a} className="text-sm" style={{ color: "var(--ink-400)" }}>
                    <span style={{ color: "var(--ink-200)" }}>{AREA_META[a].label}.</span> {latest.rationale?.[a]}
                  </li>
                ))}
              </ul>
            )}
            {latest.journalFeedback && (
              <p className="mt-5 text-sm leading-relaxed" style={{ color: "var(--ink-400)" }}>
                {latest.journalFeedback}
              </p>
            )}
            {past.length > 1 && (
              <div className="mt-6 flex h-10 items-end gap-[3px]" role="img" aria-label="Overall score, last 14 days">
                {past.map((s) => (
                  <div
                    key={s.date}
                    title={`${format(new Date(s.date), "MMM d")}: ${s.overall.toFixed(1)}`}
                    className="flex-1 rounded-[2px]"
                    style={{ height: `${Math.max(6, s.overall * 10)}%`, background: "var(--ink-600)" }}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </Section>
    </div>
  );
}
