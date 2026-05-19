"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Sparkles,
  Plus,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  X,
  Calendar,
  Trash2,
  ClipboardList,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart2,
  CircleDot,
} from "lucide-react";
import LoadingSpinner from "@/components/LoadingSpinner";

interface ProjectTask {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: string;
  order: number;
  priority: string;
  estimatedMinutes: number | null;
  actualMinutes: number | null;
  dueDate: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

interface Project {
  id: string;
  title: string;
  description: string | null;
  specs: string | null;
  notes: string | null;
  priority: string;
  status: string;
  deadline: string | null;
  completedAt: string | null;
  tasks: ProjectTask[];
}

interface TaskAnalysis {
  taskId: string;
  estimatedHours: number;
  effortLabel: "light" | "moderate" | "heavy" | "very-heavy";
}

interface ProjectAnalysis {
  trackStatus: "on_track" | "at_risk" | "behind" | "no_deadline";
  message: string;
  totalEstimatedHours: number;
  remainingHours: number;
  daysLeft: number | null;
  requiredHoursPerDay: number | null;
  currentPacePerDay: number | null;
  tasks: TaskAnalysis[];
}

const PRIORITY_STYLES: Record<string, string> = {
  high: "text-red-400 bg-red-500/10 border-red-500/20",
  medium: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  low: "text-green-400 bg-green-500/10 border-green-500/20",
};

const ACTIVE_TASK_STATUSES = new Set(["todo", "in_progress", "cancelled"]);

const SECTION_META = {
  active: {
    label: "Active",
    color: "text-[#c8deff]",
    description: "Auto-sorted by priority and closest due date.",
  },
  completed: {
    label: "Completed",
    color: "text-emerald-300",
    description: "Finished work drops here after the completion animation.",
  },
} as const;

function formatMinutes(mins: number | null): string {
  if (!mins) return "—";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

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

function sortTasks(tasks: ProjectTask[]): ProjectTask[] {
  return [...tasks].sort((left, right) => {
    const leftIsCompleted = left.status === "completed";
    const rightIsCompleted = right.status === "completed";

    if (leftIsCompleted !== rightIsCompleted) {
      return leftIsCompleted ? 1 : -1;
    }

    if (leftIsCompleted && rightIsCompleted) {
      return (
        new Date(right.completedAt ?? right.createdAt).getTime() -
        new Date(left.completedAt ?? left.createdAt).getTime()
      );
    }

    const priorityDelta = priorityRank(left.priority) - priorityRank(right.priority);
    if (priorityDelta !== 0) return priorityDelta;

    const leftDue = left.dueDate ? new Date(left.dueDate).getTime() : Number.POSITIVE_INFINITY;
    const rightDue = right.dueDate ? new Date(right.dueDate).getTime() : Number.POSITIVE_INFINITY;
    if (leftDue !== rightDue) return leftDue - rightDue;

    if (left.order !== right.order) return left.order - right.order;

    return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
  });
}

interface AddTaskFormProps {
  projectId: string;
  onSaved: () => void;
  onCancel: () => void;
}

function AddTaskForm({ projectId, onSaved, onCancel }: AddTaskFormProps) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("medium");
  const [estimatedMinutes, setEstimatedMinutes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: title.trim(),
          priority,
          estimatedMinutes: estimatedMinutes
            ? parseInt(estimatedMinutes)
            : undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Failed to add task");
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-[#0a0f1e] border border-[#334155] rounded-lg p-3 mt-2"
    >
      {error && (
        <p className="text-red-400 text-xs mb-2">{error}</p>
      )}
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Task title..."
        autoFocus
        className="w-full bg-transparent text-slate-100 placeholder-slate-600 text-sm outline-none mb-2"
      />
      <div className="flex items-center gap-2">
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className="bg-[#1e293b] border border-[#334155] text-slate-400 rounded px-2 py-1 text-xs focus:outline-none"
        >
          <option value="high" className="bg-[#0f172a]">High</option>
          <option value="medium" className="bg-[#0f172a]">Medium</option>
          <option value="low" className="bg-[#0f172a]">Low</option>
        </select>
        <input
          type="number"
          value={estimatedMinutes}
          onChange={(e) => setEstimatedMinutes(e.target.value)}
          placeholder="Est. mins"
          min={1}
          className="bg-[#1e293b] border border-[#334155] text-slate-400 rounded px-2 py-1 text-xs focus:outline-none w-24 placeholder-slate-600"
        />
        <div className="flex gap-1.5 ml-auto">
          <button
            type="button"
            onClick={onCancel}
            className="p-1 text-slate-500 hover:text-slate-300 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-1 px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition-colors"
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : "Add"}
          </button>
        </div>
      </div>
    </form>
  );
}

const EFFORT_STYLES: Record<string, string> = {
  light: "text-green-400 bg-green-500/10",
  moderate: "text-yellow-400 bg-yellow-500/10",
  heavy: "text-orange-400 bg-orange-500/10",
  "very-heavy": "text-red-400 bg-red-500/10",
};

interface TaskCardProps {
  task: ProjectTask;
  projectId: string;
  onUpdated: () => void;
  effortHours?: number;
  effortLabel?: string;
}

function TaskCard({ task, projectId, onUpdated, effortHours, effortLabel }: TaskCardProps) {
  const [updating, setUpdating] = useState(false);
  const [completing, setCompleting] = useState(false);

  const priorityStyle =
    PRIORITY_STYLES[task.priority] ?? PRIORITY_STYLES.medium;

  async function updateTask(
    data: Partial<{ status: string; actualMinutes: number; completedAt: string }>
  ) {
    setUpdating(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/tasks/${task.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(data),
        }
      );
      if (res.ok) {
        onUpdated();
      }
    } catch {
      // ignore
    } finally {
      setUpdating(false);
    }
  }

  async function deleteTask() {
    if (!confirm("Delete this task?")) return;
    setUpdating(true);
    try {
      await fetch(`/api/projects/${projectId}/tasks/${task.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      onUpdated();
    } catch {
      // ignore
    } finally {
      setUpdating(false);
    }
  }

  async function completeTask() {
    if (updating || task.status === "completed") return;

    setCompleting(true);
    window.setTimeout(() => {
      void updateTask({
        status: "completed",
        completedAt: new Date().toISOString(),
      });
    }, 420);
  }

  const isCompleted = task.status === "completed";
  const isOverdue = !!task.dueDate && !isCompleted && new Date(task.dueDate) < new Date();

  return (
    <div
      className={`group rounded-[22px] border p-4 transition-all ${
        completing ? "queue-complete-burst border-emerald-400/30 bg-emerald-500/8" : "bg-[#0a0f1e] border-[#1e293b]"
      }`}
    >
      <div className="mb-2 flex items-start gap-2">
        <span className={`flex-1 text-sm leading-snug ${isCompleted ? "text-slate-500 line-through" : "text-slate-100"}`}>
          {task.title}
        </span>
        {updating ? (
          <Loader2 className="w-3.5 h-3.5 text-slate-400 animate-spin flex-shrink-0" />
        ) : (
          <div className="flex items-center gap-1.5 opacity-0 transition-all group-hover:opacity-100">
            {!isCompleted && (
              <button
                onClick={completeTask}
                className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-300 transition-colors hover:bg-emerald-500/18"
                title="Complete task"
              >
                <CheckCircle2 className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={deleteTask}
              className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10 text-red-300 transition-colors hover:bg-red-500/18"
              title="Delete task"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {task.description && (
        <p className="mb-3 text-xs leading-relaxed text-slate-500">
          {task.description}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`text-xs px-1.5 py-0.5 rounded border capitalize ${priorityStyle}`}
        >
          {task.priority}
        </span>

        {!isCompleted && task.status === "in_progress" && (
          <span className="inline-flex items-center gap-1 rounded border border-blue-500/20 bg-blue-500/10 px-1.5 py-0.5 text-xs text-blue-300">
            <CircleDot className="h-3 w-3" />
            In progress
          </span>
        )}

        {task.estimatedMinutes && (
          <span className="flex items-center gap-1 text-xs text-slate-500">
            <Clock className="w-3 h-3" />
            {formatMinutes(task.estimatedMinutes)}
          </span>
        )}

        {/* AI effort estimate */}
        {effortHours !== undefined && effortLabel && (
          <span className={`text-xs px-1.5 py-0.5 rounded ${EFFORT_STYLES[effortLabel] ?? ""}`}>
            {effortHours !== undefined && effortHours < 1 ? `~${Math.round(effortHours * 60)}m` : `~${effortHours}h`}
          </span>
        )}

        {task.actualMinutes && (
          <span className="text-xs text-slate-500">
            actual: {formatMinutes(task.actualMinutes)}
          </span>
        )}

        {task.dueDate && (
          <span className={`ml-auto inline-flex items-center gap-1 text-xs ${isOverdue ? "text-rose-300" : "text-slate-500"}`}>
            <Calendar className="h-3 w-3" />
            {new Date(task.dueDate).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </span>
        )}
      </div>

      {/* Timestamps */}
      {task.startedAt && (
        <p className="mt-2 text-xs text-slate-600">
          Started: {new Date(task.startedAt).toLocaleDateString()}
        </p>
      )}
      {task.completedAt && (
        <p className="text-xs text-slate-600 mt-0.5">
          Done: {new Date(task.completedAt).toLocaleDateString()}
        </p>
      )}
    </div>
  );
}

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState("");
  const [generateSuccess, setGenerateSuccess] = useState("");
  const [showAddTask, setShowAddTask] = useState(false);
  const [showPastePanel, setShowPastePanel] = useState(false);
  const [showListPanel, setShowListPanel] = useState(false);
  const [listText, setListText] = useState("");
  const [listSaving, setListSaving] = useState(false);
  const [listSaved, setListSaved] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteImporting, setPasteImporting] = useState(false);
  const [pasteError, setPasteError] = useState("");
  const [pasteSuccess, setPasteSuccess] = useState("");
  const [error, setError] = useState("");
  const [analysis, setAnalysis] = useState<ProjectAnalysis | null>(null);

  const fetchProject = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        credentials: "include",
      });
      if (res.status === 404) {
        router.replace("/projects");
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setProject({
          ...data,
          tasks: sortTasks(data.tasks ?? []),
        });
      } else {
        setError("Failed to load project");
      }
    } catch {
      setError("Failed to load project");
    } finally {
      setLoading(false);
    }
  }, [projectId, router]);

  const fetchAnalysis = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/analyze`, {
        credentials: "include",
      });
      if (!res.ok) {
        setAnalysis(null);
        return;
      }
      const data = await res.json();
      setAnalysis(data);
    } catch {
      setAnalysis(null);
    }
  }, [projectId]);

  const refreshProjectState = useCallback(async () => {
    await Promise.all([fetchProject(), fetchAnalysis()]);
  }, [fetchAnalysis, fetchProject]);

  useEffect(() => {
    void fetchProject();
  }, [fetchProject]);

  useEffect(() => {
    void fetchAnalysis();
  }, [fetchAnalysis]);

  useEffect(() => {
    setListText(project?.notes ?? "");
  }, [project?.notes]);

  async function handleGenerate() {
    setGenerating(true);
    setGenerateError("");
    setGenerateSuccess("");
    try {
      const res = await fetch(`/api/projects/${projectId}/generate`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Generation failed");
      }
      const data = await res.json();
      setGenerateSuccess(
        data.aiGenerated
          ? `Generated ${data.tasks.length} tasks using AI`
          : `Added ${data.tasks.length} default tasks (AI unavailable)`
      );
      await refreshProjectState();
    } catch (err) {
      setGenerateError(
        err instanceof Error ? err.message : "Failed to generate tasks"
      );
    } finally {
      setGenerating(false);
    }
  }

  function parsePasteText(raw: string) {
    const PRIORITIES = new Set(["high", "medium", "low"]);

    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        const colonIdx = line.indexOf(":");
        if (colonIdx === -1) {
          // No colon — treat whole line as task title
          return { title: line, priority: "medium" as const };
        }

        const title = line.slice(0, colonIdx).trim();
        const value = line.slice(colonIdx + 1).trim();

        if (!title) return null;

        // Right side: priority keyword?
        if (PRIORITIES.has(value.toLowerCase())) {
          return { title, priority: value.toLowerCase() as "high" | "medium" | "low" };
        }

        // Right side: pure number → estimated minutes
        const mins = parseInt(value, 10);
        if (!isNaN(mins) && String(mins) === value) {
          return { title, priority: "medium" as const, estimatedMinutes: mins };
        }

        // Right side: "Nh" or "Nm" format (e.g. "2h", "30m")
        const timeMatch = value.match(/^(\d+)(h|m)$/i);
        if (timeMatch) {
          const estimatedMinutes =
            timeMatch[2].toLowerCase() === "h"
              ? parseInt(timeMatch[1]) * 60
              : parseInt(timeMatch[1]);
          return { title, priority: "medium" as const, estimatedMinutes };
        }

        // Otherwise use right side as description
        return { title, description: value, priority: "medium" as const };
      })
      .filter(Boolean) as { title: string; description?: string; priority: "high" | "medium" | "low"; estimatedMinutes?: number }[];
  }

  async function handlePasteImport() {
    const tasks = parsePasteText(pasteText);
    if (tasks.length === 0) {
      setPasteError("No valid tasks found. Use format: Task Name:priority");
      return;
    }
    setPasteImporting(true);
    setPasteError("");
    setPasteSuccess("");
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tasks }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Import failed");
      }
      const data = await res.json();
      setPasteSuccess(`Created ${data.count} task${data.count !== 1 ? "s" : ""}`);
      setPasteText("");
      await refreshProjectState();
      setTimeout(() => {
        setShowPastePanel(false);
        setPasteSuccess("");
      }, 1500);
    } catch (err) {
      setPasteError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setPasteImporting(false);
    }
  }

  // Live preview of parsed tasks
  const parsedPreview = pasteText.trim() ? parsePasteText(pasteText) : [];

  function parseListItems(raw: string) {
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        const parts = line.split(":").map((p) => p.trim());
        return {
          label: parts[0],
          tag: parts[1] ?? null,
          note: parts[2] ?? null,
        };
      });
  }

  const listPreview = listText.trim() ? parseListItems(listText) : [];

  async function handleSaveList() {
    setListSaving(true);
    try {
      await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ notes: listText }),
      });
      setListSaved(true);
      setTimeout(() => setListSaved(false), 1500);
      await refreshProjectState();
    } catch {
      // ignore
    } finally {
      setListSaving(false);
    }
  }

  async function updateProjectStatus(status: string) {
    try {
      await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      await refreshProjectState();
    } catch {
      // ignore
    }
  }

  async function deleteProject() {
    if (!confirm("Delete this queue item and all its tasks?")) return;
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        router.push("/projects");
      }
    } catch {
      // ignore
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="p-6">
        <p className="text-red-400">{error || "Queue item not found"}</p>
      </div>
    );
  }

  const totalTasks = project.tasks.length;
  const completedTasks = project.tasks.filter(
    (t) => t.status === "completed"
  ).length;
  const progress =
    totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const priorityStyle =
    PRIORITY_STYLES[project.priority] ?? PRIORITY_STYLES.medium;

  const activeTasks = sortTasks(
    project.tasks.filter((task) => ACTIVE_TASK_STATUSES.has(task.status))
  );
  const completedTasksList = sortTasks(
    project.tasks.filter((task) => task.status === "completed")
  );

  return (
    <div className="px-4 py-5 md:px-6 md:py-6 max-w-6xl mx-auto pb-20 lg:pb-6">
      {/* Back */}
      <Link
        href="/projects"
        className="inline-flex items-center gap-1.5 text-sm mb-5 transition-colors"
        style={{ color: "#3d5a7a" }}
        onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "#7a9eff")}
        onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "#3d5a7a")}
      >
        <ArrowLeft className="w-4 h-4" />
        Action Queue
      </Link>

      {/* Queue item header */}
      <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-6 mb-6">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex-1">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
              Queue Item
            </p>
            <h1 className="text-xl font-bold text-slate-100 mb-1">
              {project.title}
            </h1>
            {project.description && (
              <p className="text-slate-400 text-sm">{project.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span
              className={`text-xs px-2 py-1 rounded-full border capitalize font-medium ${priorityStyle}`}
            >
              {project.priority}
            </span>
            <select
              value={project.status}
              onChange={(e) => updateProjectStatus(e.target.value)}
              className="bg-[#1e293b] border border-[#334155] text-slate-300 rounded-lg px-2 py-1 text-xs focus:outline-none capitalize"
            >
              <option value="active" className="bg-[#0f172a]">Active</option>
              <option value="completed" className="bg-[#0f172a]">Completed</option>
            </select>
            <button
              onClick={deleteProject}
              className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors"
              title="Delete item"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {project.deadline && (
          <div className="flex items-center gap-1.5 text-slate-500 text-xs mb-3">
            <Calendar className="w-3.5 h-3.5" />
            <span>
              Due:{" "}
              {new Date(project.deadline).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          </div>
        )}

        {/* Progress */}
        {totalTasks > 0 && (
          <div>
            <div className="flex justify-between text-xs text-slate-500 mb-1.5">
              <span>Progress</span>
              <span>
                {completedTasks}/{totalTasks} tasks ({progress}%)
              </span>
            </div>
            <div className="w-full h-2 bg-[#1e293b] rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Analysis banner */}
      {analysis && analysis.trackStatus !== "no_deadline" && (
        <div
          className={`mb-5 flex items-start gap-3 px-4 py-3.5 rounded-xl border text-sm ${
            analysis.trackStatus === "on_track"
              ? "bg-green-500/10 border-green-500/20 text-green-300"
              : analysis.trackStatus === "at_risk"
              ? "bg-yellow-500/10 border-yellow-500/20 text-yellow-300"
              : "bg-red-500/10 border-red-500/20 text-red-300"
          }`}
        >
          {analysis.trackStatus === "on_track" && <TrendingUp className="w-4 h-4 mt-0.5 flex-shrink-0" />}
          {analysis.trackStatus === "at_risk" && <Minus className="w-4 h-4 mt-0.5 flex-shrink-0" />}
          {analysis.trackStatus === "behind" && <TrendingDown className="w-4 h-4 mt-0.5 flex-shrink-0" />}
          <div className="flex-1">
            <p className="font-medium">{analysis.message}</p>
            <p className="text-xs opacity-70 mt-0.5">
              {analysis.remainingHours}h estimated remaining
              {analysis.daysLeft !== null && ` · ${analysis.daysLeft} days left`}
              {analysis.requiredHoursPerDay !== null && ` · ${analysis.requiredHoursPerDay}h/day needed`}
            </p>
          </div>
          <BarChart2 className="w-4 h-4 mt-0.5 flex-shrink-0 opacity-50" />
        </div>
      )}
      {analysis && analysis.trackStatus === "no_deadline" && (
        <div className="mb-5 flex items-center gap-2 px-4 py-3 rounded-xl border border-[#1e293b] bg-[#0a0f1e]/50 text-slate-500 text-sm">
          <Calendar className="w-4 h-4 flex-shrink-0" />
          <span>No deadline set — {analysis.totalEstimatedHours}h of total work estimated. Add a deadline to track progress.</span>
        </div>
      )}

      {/* AI Generate + Add task + Paste list */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="flex items-center gap-2 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/20 text-purple-400 text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-60"
        >
          {generating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Analyzing brief...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Generate AI Breakdown
            </>
          )}
        </button>
        <button
          onClick={() => { setShowPastePanel(!showPastePanel); setShowAddTask(false); setShowListPanel(false); }}
          className="flex items-center gap-2 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/20 text-emerald-400 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <ClipboardList className="w-4 h-4" />
          Paste List
        </button>
        <button
          onClick={() => { setShowListPanel(!showListPanel); setShowPastePanel(false); setShowAddTask(false); }}
          className="flex items-center gap-2 bg-slate-600/20 hover:bg-slate-600/30 border border-slate-500/20 text-slate-300 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <ClipboardList className="w-4 h-4" />
          List
        </button>
        <button
          onClick={() => { setShowAddTask(!showAddTask); setShowPastePanel(false); }}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Task
        </button>
      </div>

      {/* Paste List panel */}
      {showPastePanel && (
        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-5 mb-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-slate-100 font-semibold text-sm">Paste Task List</h3>
              <p className="text-slate-500 text-xs mt-0.5">
                One task per line. Format:{" "}
                <code className="text-emerald-400 bg-emerald-500/10 px-1 rounded">Task Name:priority</code>
                {" "}or{" "}
                <code className="text-emerald-400 bg-emerald-500/10 px-1 rounded">Task Name:30m</code>
                {" "}or just{" "}
                <code className="text-emerald-400 bg-emerald-500/10 px-1 rounded">Task Name</code>
              </p>
            </div>
            <button
              onClick={() => { setShowPastePanel(false); setPasteText(""); setPasteError(""); setPasteSuccess(""); }}
              className="text-slate-500 hover:text-slate-300 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Input */}
            <div>
              <textarea
                value={pasteText}
                onChange={(e) => { setPasteText(e.target.value); setPasteError(""); }}
                placeholder={"Write business plan:high\nMarket research:2h\nBuild MVP:medium\nLaunch campaign"}
                rows={8}
                className="w-full bg-[#0a0f1e] border border-[#334155] text-slate-100 placeholder-slate-600 text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-emerald-500/50 resize-none font-mono"
              />
            </div>

            {/* Live preview */}
            <div>
              <p className="text-slate-500 text-xs mb-2">
                Preview — {parsedPreview.length} task{parsedPreview.length !== 1 ? "s" : ""} detected
              </p>
              <div className="space-y-1.5 max-h-[196px] overflow-y-auto">
                {parsedPreview.length === 0 ? (
                  <p className="text-slate-600 text-xs italic">Start typing to see preview…</p>
                ) : (
                  parsedPreview.map((t, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 bg-[#0a0f1e] border border-[#1e293b] rounded-lg px-3 py-2"
                    >
                      <span className="flex-1 text-slate-200 text-xs truncate">{t.title}</span>
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded border flex-shrink-0 ${
                          t.priority === "high"
                            ? "text-red-400 bg-red-500/10 border-red-500/20"
                            : t.priority === "low"
                            ? "text-green-400 bg-green-500/10 border-green-500/20"
                            : "text-yellow-400 bg-yellow-500/10 border-yellow-500/20"
                        }`}
                      >
                        {t.priority}
                      </span>
                      {t.estimatedMinutes && (
                        <span className="text-slate-500 text-xs flex-shrink-0">
                          {t.estimatedMinutes >= 60
                            ? `${Math.floor(t.estimatedMinutes / 60)}h${t.estimatedMinutes % 60 ? ` ${t.estimatedMinutes % 60}m` : ""}`
                            : `${t.estimatedMinutes}m`}
                        </span>
                      )}
                      {t.description && !t.estimatedMinutes && (
                        <span className="text-slate-600 text-xs truncate max-w-[80px]">{t.description}</span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {pasteError && (
            <div className="flex items-center gap-2 mt-3 text-red-400 text-xs">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              {pasteError}
            </div>
          )}
          {pasteSuccess && (
            <div className="flex items-center gap-2 mt-3 text-emerald-400 text-xs">
              <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
              {pasteSuccess}
            </div>
          )}

          <div className="flex justify-end mt-4">
            <button
              onClick={handlePasteImport}
              disabled={pasteImporting || parsedPreview.length === 0}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              {pasteImporting ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Importing…</>
              ) : (
                <><ClipboardList className="w-4 h-4" /> Import {parsedPreview.length > 0 ? `${parsedPreview.length} task${parsedPreview.length !== 1 ? "s" : ""}` : "Tasks"}</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* List panel */}
      {showListPanel && (
        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-5 mb-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-slate-100 font-semibold text-sm">Reference List</h3>
              <p className="text-slate-500 text-xs mt-0.5">
                One item per line. Format:{" "}
                <code className="text-slate-300 bg-slate-500/10 px-1 rounded">Item:tag:note</code>
                {" "}or{" "}
                <code className="text-slate-300 bg-slate-500/10 px-1 rounded">Item:tag</code>
                {" "}or just{" "}
                <code className="text-slate-300 bg-slate-500/10 px-1 rounded">Item</code>
              </p>
            </div>
            <button
              onClick={() => setShowListPanel(false)}
              className="text-slate-500 hover:text-slate-300 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <textarea
                value={listText}
                onChange={(e) => setListText(e.target.value)}
                placeholder={"No external deps:rule:critical\nWrite tests first:rule\nValidate all input:security:high priority\nKeep it simple"}
                rows={8}
                className="w-full bg-[#0a0f1e] border border-[#334155] text-slate-100 placeholder-slate-600 text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-slate-500/50 resize-none font-mono"
              />
            </div>
            <div>
              <p className="text-slate-500 text-xs mb-2">
                Preview — {listPreview.length} item{listPreview.length !== 1 ? "s" : ""} detected
              </p>
              <div className="space-y-1.5 max-h-[196px] overflow-y-auto">
                {listPreview.length === 0 ? (
                  <p className="text-slate-600 text-xs italic">Start typing to see preview…</p>
                ) : (
                  listPreview.map((item, i) => (
                    <div key={i} className="flex items-center gap-2 bg-[#0a0f1e] border border-[#1e293b] rounded-lg px-3 py-2">
                      <span className="flex-1 text-slate-200 text-xs truncate">{item.label}</span>
                      {item.tag && (
                        <span className="text-xs px-1.5 py-0.5 rounded border flex-shrink-0 text-slate-300 bg-slate-500/10 border-slate-500/20">
                          {item.tag}
                        </span>
                      )}
                      {item.note && (
                        <span className="text-slate-500 text-xs truncate max-w-[80px] flex-shrink-0">{item.note}</span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-end mt-4">
            <button
              onClick={handleSaveList}
              disabled={listSaving}
              className="flex items-center gap-2 bg-slate-600 hover:bg-slate-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              {listSaving ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
              ) : listSaved ? (
                <><CheckCircle2 className="w-4 h-4" /> Saved</>
              ) : (
                `Save ${listPreview.length > 0 ? `${listPreview.length} item${listPreview.length !== 1 ? "s" : ""}` : "List"}`
              )}
            </button>
          </div>
        </div>
      )}

      {generateError && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5 mb-4">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <p className="text-red-400 text-sm">{generateError}</p>
          <button
            onClick={() => setShowAddTask(true)}
            className="ml-auto text-xs text-blue-400 hover:text-blue-300 underline"
          >
            Add manually
          </button>
        </div>
      )}

      {generateSuccess && (
        <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-2.5 mb-4">
          <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
          <p className="text-green-400 text-sm">{generateSuccess}</p>
        </div>
      )}

      {showAddTask && (
        <div className="mb-5">
          <AddTaskForm
            projectId={projectId}
            onSaved={() => {
              setShowAddTask(false);
              void refreshProjectState();
            }}
            onCancel={() => setShowAddTask(false)}
          />
        </div>
      )}

      {/* Task sections */}
      <div className="space-y-6">
        {(["active", "completed"] as const).map((sectionKey) => {
          const tasks = sectionKey === "active" ? activeTasks : completedTasksList;
          const meta = SECTION_META[sectionKey];

          return (
            <section key={sectionKey} className="rounded-2xl border border-[#1e293b] bg-[#0f172a] p-5">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className={`text-sm font-semibold ${meta.color}`}>{meta.label}</h2>
                    <span className="rounded-full bg-[#1e293b] px-2 py-0.5 text-xs text-slate-500">
                      {tasks.length}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{meta.description}</p>
                </div>
              </div>

              <div className="space-y-3">
                {tasks.map((task) => {
                  const ta = analysis?.tasks.find((item) => item.taskId === task.id);
                  return (
                    <TaskCard
                      key={task.id}
                      task={task}
                      projectId={projectId}
                      onUpdated={() => {
                        void refreshProjectState();
                      }}
                      effortHours={ta?.estimatedHours}
                      effortLabel={ta?.effortLabel}
                    />
                  );
                })}

                {tasks.length === 0 && (
                  <div className="rounded-xl border border-dashed border-[#1e293b] p-5 text-center">
                    <p className="text-xs text-slate-600">
                      {sectionKey === "active" ? "No active tasks." : "No completed tasks yet."}
                    </p>
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {/* List */}
      {project.notes && (
        <div className="mt-6 bg-[#0f172a] border border-[#1e293b] rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-slate-100 text-sm">Reference List</h2>
            <button
              onClick={() => { setShowListPanel(true); setShowPastePanel(false); setShowAddTask(false); }}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              Edit
            </button>
          </div>
          <div className="space-y-1.5">
            {parseListItems(project.notes).map((item, i) => (
              <div key={i} className="flex items-center gap-2 bg-[#0a0f1e] border border-[#1e293b] rounded-lg px-3 py-2">
                <span className="flex-1 text-slate-200 text-sm">{item.label}</span>
                {item.tag && (
                  <span className="text-xs px-1.5 py-0.5 rounded border flex-shrink-0 text-slate-300 bg-slate-500/10 border-slate-500/20">
                    {item.tag}
                  </span>
                )}
                {item.note && (
                  <span className="text-slate-500 text-xs flex-shrink-0">{item.note}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Specs */}
      {project.specs && (
        <div className="mt-6 bg-[#0f172a] border border-[#1e293b] rounded-xl p-5">
          <h2 className="font-semibold text-slate-100 mb-3 text-sm">
            Item Brief
          </h2>
          <p className="text-slate-400 text-sm leading-relaxed whitespace-pre-wrap">
            {project.specs}
          </p>
        </div>
      )}
    </div>
  );
}
