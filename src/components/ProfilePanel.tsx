"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNowStrict } from "date-fns";
import { ChevronRight, Lightbulb, X } from "lucide-react";
import { Empty, Section } from "@/components/ui";
import { useLoad } from "@/hooks/useAssistantChat";
import type { Belief, ProfileContent } from "@/lib/brain/categories";
import type { QuizQuestion } from "@/lib/brain/quiz";

interface Category {
  id: string;
  label: string;
  content: ProfileContent | null;
  updatedAt: string | null;
}

interface ProfileData {
  categories: Category[];
  brain: { at: string; bytes: number; cap: number; queue: number } | null;
  quiz: { answers: Record<string, string | string[]>; updatedAt: string } | null;
}

interface Nudge {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  action: { type: string; label: string; href?: string } | null;
}

const LEVEL_COLOR = { high: "#34d399", medium: "#fbbf24", low: "var(--ink-600)" } as const;

const post = (url: string, method: string, body: unknown) => fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

function size(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Journal → Profile: what the background AI has learned about him, what it noticed, and the quiz. */
export default function ProfilePanel() {
  const [data, setData] = useState<ProfileData | null>(null);
  const [nudges, setNudges] = useState<Nudge[]>([]);
  const [openCat, setOpenCat] = useState<string | null>(null);
  const [openBelief, setOpenBelief] = useState<string | null>(null);
  const [quiz, setQuiz] = useState(false);
  const [brainFresh, setBrainFresh] = useState(false);
  const router = useRouter();

  const load = useCallback(async () => {
    const [p, n] = await Promise.all([fetch("/api/profile"), fetch("/api/nudges")]);
    if (p.ok) {
      const d = (await p.json()) as ProfileData;
      setData(d);
      setBrainFresh(!!d.brain && Date.now() - new Date(d.brain.at).getTime() < 15 * 60_000);
    }
    if (n.ok) setNudges(await n.json());
  }, []);
  useLoad(load);

  async function forget(cat: string, b: Belief) {
    await post("/api/profile", "DELETE", { category: cat, beliefId: b.id });
    await load();
  }

  async function nudgeAct(n: Nudge, act: "dismiss" | "do") {
    if (act === "do" && n.action?.href) {
      router.push(n.action.href);
      return;
    }
    setNudges((list) => list.filter((x) => x.id !== n.id));
    await post("/api/nudges", "POST", { id: n.id, act });
    if (act === "do") window.dispatchEvent(new CustomEvent("liveimproved:changed"));
  }

  if (!data) return <p className="min-sub">Loading…</p>;
  if (quiz) return <Quiz answers={data.quiz?.answers ?? {}} onDone={() => (setQuiz(false), void load())} />;

  const filled = data.categories.filter((c) => c.content && (c.content.beliefs.length || c.content.stats.length));
  const empty = data.categories.filter((c) => !filled.includes(c));

  return (
    <div>
      <p className="min-sub mb-4">
        {data.brain
          ? `${brainFresh ? "Learning in the background" : `Background AI last seen ${formatDistanceToNowStrict(new Date(data.brain.at))} ago`} · ${size(data.brain.bytes)} of ${size(data.brain.cap)}`
          : "The background AI hasn't started yet."}
        {" · "}
        <button className="min-link underline-offset-2 hover:underline" onClick={() => setQuiz(true)}>
          {data.quiz ? "Retake quiz" : "Take the personality quiz"}
        </button>
      </p>

      {nudges.length > 0 && (
        <Section label="Noticed">
          <ul>
            {nudges.map((n) => (
              <li key={n.id} className="min-row items-start">
                <Lightbulb className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" style={{ color: "#fbbf24" }} />
                <div className="min-w-0 flex-1">
                  <p style={{ color: "var(--ink-200)" }}>{n.title}</p>
                  {n.body && <p className="min-sub">{n.body}</p>}
                </div>
                {n.action && (
                  <button className="min-chip flex-shrink-0" onClick={() => nudgeAct(n, "do")}>
                    {n.action.label}
                  </button>
                )}
                <button aria-label={`Dismiss: ${n.title}`} onClick={() => nudgeAct(n, "dismiss")} className="flex-shrink-0 p-0.5">
                  <X className="h-3.5 w-3.5" style={{ color: "var(--ink-500)" }} />
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section label="What it knows about you">
        {!filled.length ? (
          <Empty>Nothing yet. Take the quiz to start, and it learns from your chats, journal and what you log.</Empty>
        ) : (
          <ul>
            {filled.map((c) => {
              const open = openCat === c.id;
              const content = c.content!;
              return (
                <li key={c.id} className="border-b py-1.5 last:border-0" style={{ borderColor: "var(--stroke-1)" }}>
                  <button className="flex w-full items-center gap-2 text-left text-sm" onClick={() => setOpenCat(open ? null : c.id)} aria-expanded={open}>
                    <ChevronRight className={`h-3.5 w-3.5 flex-shrink-0 transition-transform ${open ? "rotate-90" : ""}`} style={{ color: "var(--ink-500)" }} />
                    <span className="flex-1" style={{ color: "var(--ink-200)" }}>
                      {c.label}
                    </span>
                    <span className="text-xs tabular-nums" style={{ color: "var(--ink-500)" }}>
                      {content.beliefs.length + content.stats.length}
                    </span>
                  </button>
                  {open && (
                    <div className="space-y-1 pb-1 pl-6 pt-1.5 text-[13px]">
                      {content.summary && <p style={{ color: "var(--ink-300)" }}>{content.summary}</p>}
                      {content.stats.map((s) => (
                        <p key={s} style={{ color: "var(--ink-400)" }}>
                          📊 {s}
                        </p>
                      ))}
                      {content.beliefs.map((b) => (
                        <div key={b.id}>
                          <div className="group flex items-start gap-2">
                            <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full" title={`${b.level} confidence`} style={{ background: LEVEL_COLOR[b.level] }} />
                            <button className="flex-1 text-left" style={{ color: "var(--ink-300)" }} onClick={() => setOpenBelief(openBelief === b.id ? null : b.id)}>
                              {b.text}
                            </button>
                            <button aria-label={`That's wrong: ${b.text}`} title="That's wrong — forget it" onClick={() => forget(c.id, b)} className="p-0.5 opacity-60 hover:opacity-100">
                              <X className="h-3 w-3" style={{ color: "var(--ink-500)" }} />
                            </button>
                          </div>
                          {openBelief === b.id && (
                            <div className="ml-3.5 mt-0.5 space-y-0.5 border-l pl-2 text-xs" style={{ borderColor: "var(--stroke-2)", color: "var(--ink-500)" }}>
                              <p>
                                {b.level} confidence · {b.source === "quiz" ? "from the quiz" : b.source === "said" ? "from what you said" : "inferred"}
                                {b.count > 1 ? ` · seen ${b.count}×` : ""}
                              </p>
                              {b.evidence.map((e) => (
                                <p key={e.t + e.text}>“{e.text}”</p>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {filled.length > 0 && empty.length > 0 && (
          <p className="min-sub mt-2" title={empty.map((c) => c.label).join(", ")}>
            {empty.length} more area{empty.length === 1 ? "" : "s"} it&apos;s still learning about.
          </p>
        )}
      </Section>
    </div>
  );
}

function Quiz({ answers: initial, onDone }: { answers: Record<string, string | string[]>; onDone: () => void }) {
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null);
  const [answers, setAnswers] = useState(initial);
  const [other, setOther] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/profile/quiz");
    if (res.ok) setQuestions(await res.json());
  }, []);
  useLoad(load);

  function choose(q: QuizQuestion, option: string) {
    setAnswers((a) => {
      if (!q.multi) return { ...a, [q.id]: option };
      const cur = Array.isArray(a[q.id]) ? (a[q.id] as string[]) : a[q.id] ? [a[q.id] as string] : [];
      return { ...a, [q.id]: cur.includes(option) ? cur.filter((x) => x !== option) : [...cur, option] };
    });
  }

  async function save() {
    setSaving(true);
    const merged: Record<string, string | string[]> = {};
    for (const q of questions ?? []) {
      const extra = other[q.id]?.trim();
      const cur = answers[q.id];
      const list = [...(Array.isArray(cur) ? cur : cur ? [cur] : []), ...(extra ? [extra] : [])];
      if (list.length) merged[q.id] = q.multi ? list : extra || (cur as string);
    }
    await post("/api/profile/quiz", "POST", { answers: merged });
    setSaving(false);
    onDone();
  }

  if (!questions) return <p className="min-sub">Loading…</p>;
  const isOn = (q: QuizQuestion, o: string) => (Array.isArray(answers[q.id]) ? (answers[q.id] as string[]).includes(o) : answers[q.id] === o);

  return (
    <div className="space-y-5">
      <p className="min-sub">Answer what fits; skip anything. Pick several where it says so. It starts your profile; the rest it learns over time.</p>
      {questions.map((q, i) => (
        <div key={q.id}>
          <p className="mb-1.5 text-sm" style={{ color: "var(--ink-200)" }}>
            {i + 1}. {q.question} {q.multi && <span className="min-sub">(pick any)</span>}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {q.options.map((o) => (
              <button key={o} onClick={() => choose(q, o)} className="min-chip" aria-pressed={isOn(q, o)} style={isOn(q, o) ? { background: "var(--ink-100)", color: "var(--bg-base)", borderColor: "var(--ink-100)" } : undefined}>
                {o}
              </button>
            ))}
            <input
              value={other[q.id] ?? ""}
              onChange={(e) => setOther((x) => ({ ...x, [q.id]: e.target.value }))}
              placeholder="Other…"
              aria-label={`Other answer: ${q.question}`}
              className="min-field w-32 py-0.5 text-xs"
            />
          </div>
        </div>
      ))}
      <div className="flex gap-2">
        <button className="min-btn" disabled={saving} onClick={save}>
          {saving ? "Saving…" : "Save answers"}
        </button>
        <button className="min-link" onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  );
}
