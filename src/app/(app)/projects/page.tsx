"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Loader2,
  Plus,
  Trash2,
  Zap,
  type LucideIcon,
} from "lucide-react";
import LoadingSpinner from "@/components/LoadingSpinner";
import EmptyState from "@/components/EmptyState";

interface QueueItem {
  id: string;
  title: string;
  description: string | null;
  specs: string | null;
  priority: string;
  status: string;
  deadline: string | null;
  completedAt: string | null;
  createdAt: string;
  taskCount: number;
  completedTaskCount: number;
  completionPercentage: number;
}

type QueueFilter = "active" | "completed";

const PRIORITY_LABELS: Record<string, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
};

const PRIORITY_STYLES: Record<string, string> = {
  urgent: "border-[#ff6b7a]/40 bg-[#ff6b7a]/12 text-[#ff9dab]",
  high: "border-red-500/30 bg-red-500/10 text-red-300",
  medium: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  low: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
};

const FILTER_META: Record<
  QueueFilter,
  { label: string; icon: LucideIcon; emptyTitle: string; emptyDescription: string }
> = {
  active: {
    label: "Active",
    icon: Zap,
    emptyTitle: "Nothing active",
    emptyDescription: "Add a new plan to start tracking what needs attention now.",
  },
  completed: {
    label: "Completed",
    icon: CheckCircle2,
    emptyTitle: "Nothing completed yet",
    emptyDescription: "Completed items will land here automatically once their work is finished.",
  },
};

function priorityRank(priority: string): number {
  switch (priority) {
    case "urgent":
      return 0;
    case "high":
      return 1;
    case "medium":
      return 2;
    case "low":
      return 3;
    default:
      return 4;
  }
}

function getEffectiveStatus(status: string): QueueFilter {
  return status === "completed" ? "completed" : "active";
}

function getDeadlineTime(deadline: string | null): number {
  if (!deadline) return Number.POSITIVE_INFINITY;
  return new Date(deadline).getTime();
}

function sortQueueItems(items: QueueItem[]): QueueItem[] {
  return [...items].sort((left, right) => {
    const leftStatus = getEffectiveStatus(left.status);
    const rightStatus = getEffectiveStatus(right.status);

    if (leftStatus !== rightStatus) {
      return leftStatus === "active" ? -1 : 1;
    }

    if (leftStatus === "completed") {
      return (
        new Date(right.completedAt ?? right.createdAt).getTime() -
        new Date(left.completedAt ?? left.createdAt).getTime()
      );
    }

    const priorityDelta = priorityRank(left.priority) - priorityRank(right.priority);
    if (priorityDelta !== 0) return priorityDelta;

    const deadlineDelta = getDeadlineTime(left.deadline) - getDeadlineTime(right.deadline);
    if (deadlineDelta !== 0) return deadlineDelta;

    return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
  });
}

function formatDeadline(deadline: string | null): string | null {
  if (!deadline) return null;
  return new Date(deadline).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isOverdue(deadline: string | null, status: string): boolean {
  return !!deadline && getEffectiveStatus(status) !== "completed" && new Date(deadline) < new Date();
}

interface NewQueueItemModalProps {
  onClose: () => void;
  onSaved: () => void;
}

function NewQueueItemModal({ onClose, onSaved }: NewQueueItemModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [specs, setSpecs] = useState("");
  const [priority, setPriority] = useState("medium");
  const [deadline, setDeadline] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function applyDeadlinePreset(mode: "today" | "tomorrow" | "week") {
    const next = new Date();
    next.setHours(0, 0, 0, 0);

    if (mode === "tomorrow") {
      next.setDate(next.getDate() + 1);
    } else if (mode === "week") {
      next.setDate(next.getDate() + 7);
    }

    setDeadline(next.toISOString().slice(0, 10));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Title is required");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          specs: specs.trim() || undefined,
          priority,
          deadline: deadline ? new Date(deadline).toISOString() : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to create item");
      }

      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create item");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <div className="w-full max-w-4xl rounded-[28px] border border-[rgba(120,145,220,0.18)] bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0)),#0f1525] p-6 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.85)]">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">
              Plans
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">
              New plan
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
              Capture what needs to happen, what good looks like, and the details that matter before work starts.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
          >
            Close
          </button>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-2xl border border-red-500/20 bg-red-500/10 px-3 py-2">
            <AlertCircle className="h-4 w-4 text-red-300" />
            <p className="text-sm text-red-200">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-5">
            <section className="rounded-[24px] border border-white/8 bg-white/[0.03] p-5">
              <div className="mb-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                  Core Info
                </p>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  Define the item clearly enough that future-you can act without re-deciding what it means.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                    What needs to happen?
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Ship onboarding redesign"
                    className="w-full rounded-2xl border border-white/10 bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                    Desired outcome
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                    placeholder="What should be true when this item is done?"
                    className="w-full resize-none rounded-2xl border border-white/10 bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
                  />
                </div>
              </div>
            </section>

            <section className="rounded-[24px] border border-white/8 bg-white/[0.03] p-5">
              <div className="mb-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                  Important Details
                </p>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  Put requirements, constraints, links, notes, or AI context here.
                </p>
              </div>
              <textarea
                value={specs}
                onChange={(e) => setSpecs(e.target.value)}
                rows={8}
                placeholder={"- Must work on mobile\n- Keep existing auth flow\n- Use current design system\n- Deadline is for review-ready version"}
                className="w-full resize-none rounded-2xl border border-white/10 bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
              />
            </section>
          </div>

          <div className="space-y-5">
            <section className="rounded-[24px] border border-white/8 bg-white/[0.03] p-5">
              <div className="mb-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                  Priority
                </p>
              </div>
              <div className="space-y-3">
                {[
                  ["urgent", "Urgent", "Time-sensitive and cannot slip."],
                  ["high", "High", "Important and should move soon."],
                  ["medium", "Medium", "Useful, but not the first fire."],
                  ["low", "Low", "Nice to have or can wait."],
                ].map(([value, label, body]) => {
                  const active = priority === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setPriority(value)}
                      className={`w-full rounded-2xl border px-4 py-4 text-left transition-all ${
                        active
                          ? `${PRIORITY_STYLES[value]}`
                          : "border-white/8 bg-white/[0.02] text-[var(--text-secondary)] hover:border-white/14 hover:text-white"
                      }`}
                    >
                      <div className="text-sm font-semibold">{label}</div>
                      <div className="mt-1 text-xs leading-5 text-inherit/80">{body}</div>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="rounded-[24px] border border-white/8 bg-white/[0.03] p-5">
              <div className="mb-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                  Due Date
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button type="button" onClick={() => applyDeadlinePreset("today")} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:text-white">
                  Today
                </button>
                <button type="button" onClick={() => applyDeadlinePreset("tomorrow")} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:text-white">
                  Tomorrow
                </button>
                <button type="button" onClick={() => applyDeadlinePreset("week")} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:text-white">
                  +7 days
                </button>
              </div>
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="mt-3 w-full rounded-2xl border border-white/10 bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]"
              />
            </section>

            <section className="rounded-[24px] border border-white/8 bg-[#101826] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                Preview
              </p>
              <div className="mt-4 rounded-[22px] border border-white/8 bg-black/20 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white">
                      {title.trim() || "Your plan title"}
                    </div>
                    <div className="mt-1 text-xs text-[var(--text-secondary)]">
                      {PRIORITY_LABELS[priority]}{deadline ? ` · Due ${deadline}` : " · No due date yet"}
                    </div>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${PRIORITY_STYLES[priority]}`}>
                    {PRIORITY_LABELS[priority]}
                  </span>
                </div>
                <div className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
                  {description.trim() || "The outcome summary will show here."}
                </div>
                <div className="mt-3 text-xs leading-5 text-[var(--text-muted)] whitespace-pre-wrap">
                  {specs.trim() || "Important details will show here."}
                </div>
              </div>
            </section>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex flex-1 items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#4f72ff_0%,#22d3ee_100%)] px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_40px_-18px_rgba(79,114,255,0.95)] transition-transform hover:-translate-y-0.5 disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Create item
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ProjectsPage() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<QueueFilter>("active");
  const [showModal, setShowModal] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch("/api/projects", { credentials: "include" });
      if (!res.ok) return;
      const data = (await res.json()) as QueueItem[];
      setItems(sortQueueItems(data));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchItems();
  }, [fetchItems]);

  async function deleteItem(id: string) {
    if (!confirm("Delete this plan and all of its tasks?")) return;

    setDeletingId(id);
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        setItems((current) => current.filter((item) => item.id !== id));
      }
    } finally {
      setDeletingId(null);
    }
  }

  async function completeItem(id: string) {
    if (completingId || deletingId) return;

    setCompletingId(id);

    window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/projects/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            status: "completed",
            completedAt: new Date().toISOString(),
          }),
        });

        if (res.ok) {
          await fetchItems();
        }
      } finally {
        setCompletingId(null);
      }
    }, 420);
  }

  const filteredItems = useMemo(
    () => items.filter((item) => getEffectiveStatus(item.status) === filter),
    [filter, items]
  );

  const activeCount = items.filter((item) => getEffectiveStatus(item.status) === "active").length;
  const completedCount = items.filter((item) => getEffectiveStatus(item.status) === "completed").length;
  const overdueCount = items.filter((item) => isOverdue(item.deadline, item.status)).length;

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const activeMeta = FILTER_META[filter];

  return (
    <div className="mx-auto max-w-5xl px-4 py-5 pb-20 md:px-6 md:py-8 lg:pb-8">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm transition-colors"
        style={{ color: "var(--text-secondary)" }}
      >
        <ArrowLeft className="h-4 w-4" />
        Dashboard
      </Link>

      <div className="mt-5 rounded-[32px] border border-[rgba(120,145,220,0.16)] bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0)),#0f1525] p-5 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.95)] md:p-7">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--text-muted)]">
              Plans
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-[var(--text-primary)] md:text-4xl">
              Prioritized work, not clutter.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
              Every item is auto-sorted by urgency first, then by the closest due date.
              The only views are what is active right now and what is already finished.
            </p>
          </div>

          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#4f72ff_0%,#22d3ee_100%)] px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_40px_-20px_rgba(79,114,255,0.95)] transition-transform hover:-translate-y-0.5"
          >
            <Plus className="h-4 w-4" />
            New item
          </button>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {[
            { label: "Active", value: activeCount, icon: Clock3, tone: "text-[#9bb7ff] bg-[#4f72ff]/10" },
            { label: "Completed", value: completedCount, icon: CheckCircle2, tone: "text-emerald-300 bg-emerald-500/10" },
            { label: "Overdue", value: overdueCount, icon: AlertTriangle, tone: "text-rose-300 bg-rose-500/10" },
          ].map(({ label, value, icon: Icon, tone }) => (
            <div
              key={label}
              className="rounded-[24px] border border-white/8 bg-[rgba(255,255,255,0.03)] p-4"
            >
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${tone}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-2xl font-semibold text-[var(--text-primary)]">{value}</p>
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">
                    {label}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {(Object.keys(FILTER_META) as QueueFilter[]).map((value) => {
          const meta = FILTER_META[value];
          const Icon = meta.icon;
          const isActive = value === filter;
          const count = value === "active" ? activeCount : completedCount;

          return (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all ${
                isActive
                  ? "border-[rgba(79,114,255,0.45)] bg-[rgba(79,114,255,0.12)] text-[var(--text-primary)]"
                  : "border-white/8 bg-white/5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <Icon className="h-4 w-4" />
              {meta.label}
              <span className="rounded-full bg-black/20 px-2 py-0.5 text-xs text-[var(--text-muted)]">
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-5 space-y-4">
        {filteredItems.length === 0 ? (
          <div className="rounded-[28px] border border-white/8 bg-[rgba(255,255,255,0.03)] px-4 py-8">
            <EmptyState
              icon={activeMeta.icon}
              title={activeMeta.emptyTitle}
              description={activeMeta.emptyDescription}
              ctaLabel={filter === "active" ? "Create an item" : undefined}
              onCtaClick={filter === "active" ? () => setShowModal(true) : undefined}
            />
          </div>
        ) : (
          filteredItems.map((item) => {
            const overdue = isOverdue(item.deadline, item.status);
            const deadline = formatDeadline(item.deadline);
            const priorityStyle = PRIORITY_STYLES[item.priority] ?? PRIORITY_STYLES.medium;
            const priorityLabel = PRIORITY_LABELS[item.priority] ?? "Medium";
            const isCompleting = completingId === item.id;
            const isDeleting = deletingId === item.id;
            const isCompleted = getEffectiveStatus(item.status) === "completed";

            return (
              <div key={item.id} className="group relative">
                <Link
                  href={`/projects/${item.id}`}
                  className={`block rounded-[28px] border border-[rgba(120,145,220,0.14)] bg-[linear-gradient(180deg,rgba(255,255,255,0.025),rgba(255,255,255,0)),#0f1525] p-5 transition-all hover:border-[rgba(79,114,255,0.28)] hover:shadow-[0_24px_60px_-36px_rgba(79,114,255,0.65)] md:p-6 ${
                    isCompleting ? "queue-complete-burst border-emerald-400/30 bg-emerald-500/8" : ""
                  }`}
                >
                  <div className="sm:pr-12">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${priorityStyle}`}>
                        {priorityLabel}
                      </span>
                      {overdue && (
                        <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-xs font-semibold text-rose-200">
                          Overdue
                        </span>
                      )}
                    </div>

                    <div className="mt-4 flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <h2 className="text-lg font-semibold tracking-[-0.02em] text-[var(--text-primary)] sm:text-xl">
                          {item.title}
                        </h2>
                        {item.description && (
                          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--text-secondary)]">
                            {item.description}
                          </p>
                        )}
                      </div>

                      <div className="hidden items-center gap-1 text-[var(--text-muted)] md:flex">
                        <span className="text-xs uppercase tracking-[0.18em]">Open</span>
                        <ChevronRight className="h-4 w-4" />
                      </div>
                    </div>

                    <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_220px] md:items-end">
                      <div>
                        <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">
                          <span>Progress</span>
                          <span>
                            {item.completedTaskCount}/{item.taskCount} tasks
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-[rgba(255,255,255,0.06)]">
                          <div
                            className="h-full rounded-full bg-[linear-gradient(90deg,#4f72ff_0%,#22d3ee_100%)] transition-all"
                            style={{ width: `${item.completionPercentage}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap justify-start gap-4 text-sm text-[var(--text-secondary)] md:justify-end">
                        <span className="inline-flex items-center gap-1.5">
                          <Clock3 className="h-4 w-4 text-[var(--text-muted)]" />
                          {item.taskCount} total
                        </span>
                        {deadline && (
                          <span className={`inline-flex items-center gap-1.5 ${overdue ? "text-rose-200" : ""}`}>
                            <Calendar className="h-4 w-4 text-[var(--text-muted)]" />
                            {deadline}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>

                <div className="mt-3 flex items-center justify-end gap-2 sm:absolute sm:right-4 sm:top-4 sm:mt-0 sm:justify-start sm:opacity-0 sm:transition-all sm:group-hover:opacity-100">
                  {!isCompleted && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void completeItem(item.id);
                      }}
                      disabled={isCompleting || isDeleting}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-300 transition-all hover:bg-emerald-500/20 disabled:opacity-50"
                      title="Complete plan"
                    >
                      {isCompleting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void deleteItem(item.id);
                    }}
                    disabled={isDeleting || isCompleting}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-rose-500/20 bg-rose-500/10 text-rose-300 transition-all hover:bg-rose-500/20 disabled:opacity-50"
                    title="Delete item"
                  >
                    {isDeleting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {showModal && (
        <NewQueueItemModal
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false);
            void fetchItems();
          }}
        />
      )}
    </div>
  );
}
