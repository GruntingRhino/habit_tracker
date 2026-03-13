"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
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

interface TaskCardProps {
  task: ProjectTask;
  projectId: string;
  onUpdated: () => void;
}

function TaskCard({ task, projectId, onUpdated }: TaskCardProps) {
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
  const [error, setError] = useState("");

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

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

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
      fetchProject();
    } catch (err) {
      setGenerateError(
        err instanceof Error ? err.message : "Failed to generate tasks"
      );
    } finally {
      setGenerating(false);
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
      fetchProject();
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
    <div className="p-6 max-w-6xl mx-auto">
      {/* Back */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-slate-400 hover:text-slate-100 text-sm mb-5 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Projects
      </button>

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

      {/* AI Generate + Add task */}
      <div className="flex items-center gap-3 mb-5">
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
          onClick={() => setShowAddTask(!showAddTask)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Task
        </button>
      </div>

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
              fetchProject();
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
                {colTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    projectId={projectId}
                    onUpdated={fetchProject}
                  />
                ))}
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
