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
  Play,
  X,
  Calendar,
  ChevronDown,
  Trash2,
  ClipboardList,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart2,
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

const STATUS_COLUMNS: { key: string; label: string; color: string }[] = [
  { key: "todo", label: "To Do", color: "text-slate-400" },
  { key: "in_progress", label: "In Progress", color: "text-blue-400" },
  { key: "completed", label: "Done", color: "text-green-400" },
];

function formatMinutes(mins: number | null): string {
  if (!mins) return "—";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
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
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  const priorityStyle =
    PRIORITY_STYLES[task.priority] ?? PRIORITY_STYLES.medium;

  async function updateTask(data: Partial<{ status: string; actualMinutes: number }>) {
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
      setShowStatusMenu(false);
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

  return (
    <div className="bg-[#0a0f1e] border border-[#1e293b] rounded-lg p-3 group">
      <div className="flex items-start gap-2 mb-2">
        <span className="flex-1 text-slate-100 text-sm leading-snug">
          {task.title}
        </span>
        {updating ? (
          <Loader2 className="w-3.5 h-3.5 text-slate-400 animate-spin flex-shrink-0" />
        ) : (
          <button
            onClick={deleteTask}
            className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-all flex-shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {task.description && (
        <p className="text-slate-500 text-xs mb-2 leading-relaxed">
          {task.description}
        </p>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={`text-xs px-1.5 py-0.5 rounded border capitalize ${priorityStyle}`}
        >
          {task.priority}
        </span>

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

        {/* Status dropdown */}
        <div className="relative ml-auto">
          <button
            onClick={() => setShowStatusMenu(!showStatusMenu)}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-100 bg-[#1e293b] px-2 py-1 rounded transition-colors"
          >
            <span className="capitalize">{task.status.replace("_", " ")}</span>
            <ChevronDown className="w-3 h-3" />
          </button>
          {showStatusMenu && (
            <div className="absolute right-0 top-full mt-1 bg-[#0f172a] border border-[#1e293b] rounded-lg overflow-hidden z-10 min-w-[120px]">
              {STATUS_COLUMNS.map((col) => (
                <button
                  key={col.key}
                  onClick={() => updateTask({ status: col.key })}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-[#1e293b] transition-colors ${
                    task.status === col.key
                      ? "text-blue-400"
                      : "text-slate-400"
                  }`}
                >
                  {col.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      {task.status === "todo" && (
        <button
          onClick={() => updateTask({ status: "in_progress" })}
          disabled={updating}
          className="mt-2 flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors"
        >
          <Play className="w-3 h-3" />
          Start
        </button>
      )}
      {task.status === "in_progress" && (
        <button
          onClick={() => updateTask({ status: "completed" })}
          disabled={updating}
          className="mt-2 flex items-center gap-1.5 text-xs text-green-400 hover:text-green-300 transition-colors"
        >
          <CheckCircle2 className="w-3 h-3" />
          Complete
        </button>
      )}

      {/* Timestamps */}
      {task.startedAt && (
        <p className="text-xs text-slate-600 mt-1">
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
        setProject(data);
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
    if (!confirm("Delete this project and all its tasks?")) return;
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
        <p className="text-red-400">{error || "Project not found"}</p>
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

  const tasksByStatus: Record<string, ProjectTask[]> = {
    todo: [],
    in_progress: [],
    completed: [],
  };
  for (const task of project.tasks) {
    const col = task.status in tasksByStatus ? task.status : "todo";
    tasksByStatus[col].push(task);
  }

  return (
    <div className="px-4 py-5 md:px-6 md:py-6 max-w-6xl mx-auto pb-20 lg:pb-6">
      {/* Back */}
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm mb-5 transition-colors"
        style={{ color: "#3d5a7a" }}
        onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "#7a9eff")}
        onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "#3d5a7a")}
      >
        <ArrowLeft className="w-4 h-4" />
        Dashboard
      </Link>

      {/* Project header */}
      <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-6 mb-6">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex-1">
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
              <option value="archived" className="bg-[#0f172a]">Archived</option>
            </select>
            <button
              onClick={deleteProject}
              className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors"
              title="Delete project"
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
              Analyzing project specs...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Generate AI Checklist
            </>
          )}
        </button>
        <button
          onClick={() => { setShowPastePanel(!showPastePanel); setShowAddTask(false); }}
          className="flex items-center gap-2 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/20 text-emerald-400 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <ClipboardList className="w-4 h-4" />
          Paste List
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

      {/* Task columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {STATUS_COLUMNS.map((col) => {
          const colTasks = tasksByStatus[col.key] ?? [];
          return (
            <div key={col.key}>
              <div className="flex items-center gap-2 mb-3">
                <h2 className={`font-semibold text-sm ${col.color}`}>
                  {col.label}
                </h2>
                <span className="text-slate-600 text-xs bg-[#1e293b] px-1.5 py-0.5 rounded-full">
                  {colTasks.length}
                </span>
              </div>

              <div className="space-y-2">
                {colTasks.map((task) => {
                  const ta = analysis?.tasks.find((t) => t.taskId === task.id);
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
                {colTasks.length === 0 && (
                  <div className="border border-dashed border-[#1e293b] rounded-lg p-4 text-center">
                    <p className="text-slate-600 text-xs">No tasks</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Specs */}
      {project.specs && (
        <div className="mt-6 bg-[#0f172a] border border-[#1e293b] rounded-xl p-5">
          <h2 className="font-semibold text-slate-100 mb-3 text-sm">
            Project Specs
          </h2>
          <p className="text-slate-400 text-sm leading-relaxed whitespace-pre-wrap">
            {project.specs}
          </p>
        </div>
      )}
    </div>
  );
}
