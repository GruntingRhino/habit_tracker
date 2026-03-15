"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Plus,
  FolderKanban,
  Calendar,
  ChevronRight,
  X,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Trash2,
  ArrowLeft,
} from "lucide-react";
import LoadingSpinner from "@/components/LoadingSpinner";
import EmptyState from "@/components/EmptyState";

interface Project {
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

type StatusFilter = "all" | "active" | "completed" | "archived";

const PRIORITY_STYLES: Record<string, string> = {
  high: "text-red-400 bg-red-500/10 border-red-500/20",
  medium: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  low: "text-green-400 bg-green-500/10 border-green-500/20",
};

const STATUS_STYLES: Record<string, string> = {
  active: "text-blue-400 bg-blue-500/10",
  completed: "text-green-400 bg-green-500/10",
  archived: "text-slate-400 bg-slate-500/10",
};

function formatDeadline(deadline: string | null): string | null {
  if (!deadline) return null;
  const d = new Date(deadline);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function isOverdue(deadline: string | null, status: string): boolean {
  if (!deadline || status === "completed") return false;
  return new Date(deadline) < new Date();
}

interface NewProjectModalProps {
  onClose: () => void;
  onSaved: () => void;
}

function NewProjectModal({ onClose, onSaved }: NewProjectModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [specs, setSpecs] = useState("");
  const [priority, setPriority] = useState("medium");
  const [deadline, setDeadline] = useState("");
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
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: title.trim(),
          description: description || undefined,
          specs: specs || undefined,
          priority,
          deadline: deadline || undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Failed to create project");
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-[#0f172a] border border-[#1e293b] rounded-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-slate-100">New Project</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-4">
            <AlertCircle className="w-4 h-4 text-red-400" />
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">
              Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Project name"
              className="w-full bg-[#1e293b] border border-[#334155] text-slate-100 placeholder-slate-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Brief project overview"
              className="w-full bg-[#1e293b] border border-[#334155] text-slate-100 placeholder-slate-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">
              Specs / Requirements
            </label>
            <textarea
              value={specs}
              onChange={(e) => setSpecs(e.target.value)}
              rows={4}
              placeholder="Detailed specifications, requirements, or notes for AI task generation..."
              className="w-full bg-[#1e293b] border border-[#334155] text-slate-100 placeholder-slate-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full bg-[#1e293b] border border-[#334155] text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="high" className="bg-[#0f172a]">High</option>
                <option value="medium" className="bg-[#0f172a]">Medium</option>
                <option value="low" className="bg-[#0f172a]">Low</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">
                Deadline
              </label>
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="w-full bg-[#1e293b] border border-[#334155] text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-[#1e293b] hover:bg-[#334155] text-slate-300 rounded-lg text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Create Project"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [showModal, setShowModal] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function deleteProject(id: string) {
    if (!confirm("Delete this project and all its tasks?")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        setProjects((prev) => prev.filter((p) => p.id !== id));
      }
    } catch {
      // ignore
    } finally {
      setDeletingId(null);
    }
  }

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const filtered =
    statusFilter === "all"
      ? projects
      : projects.filter((p) => p.status === statusFilter);

  // Stats
  const openCount = projects.filter((p) => p.status === "active").length;
  const completedCount = projects.filter((p) => p.status === "completed").length;
  const overdueCount = projects.filter((p) => isOverdue(p.deadline, p.status)).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="px-4 py-5 md:px-6 md:py-6 max-w-5xl mx-auto pb-20 lg:pb-6">
      <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm mb-5 transition-colors" style={{ color: "#3d5a7a" }}
        onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "#7a9eff")}
        onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "#3d5a7a")}>
        <ArrowLeft className="w-4 h-4" /> Dashboard
      </Link>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Projects</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {projects.length} total project{projects.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Project
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
            <Clock className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-100">{openCount}</p>
            <p className="text-slate-500 text-xs">Active</p>
          </div>
        </div>
        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-green-500/10 flex items-center justify-center">
            <CheckCircle2 className="w-4 h-4 text-green-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-100">{completedCount}</p>
            <p className="text-slate-500 text-xs">Completed</p>
          </div>
        </div>
        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-red-500/10 flex items-center justify-center">
            <AlertTriangle className="w-4 h-4 text-red-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-100">{overdueCount}</p>
            <p className="text-slate-500 text-xs">Overdue</p>
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-5 bg-[#0f172a] border border-[#1e293b] rounded-lg p-1 w-fit">
        {(["all", "active", "completed", "archived"] as StatusFilter[]).map(
          (f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${
                statusFilter === f
                  ? "bg-blue-600 text-white"
                  : "text-slate-400 hover:text-slate-100"
              }`}
            >
              {f}
            </button>
          )
        )}
      </div>

      {/* Project list */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title={statusFilter === "all" ? "No projects yet" : `No ${statusFilter} projects`}
          description="Create your first project to start tracking tasks and progress."
          ctaLabel={statusFilter === "all" ? "Create a project" : undefined}
          onCtaClick={statusFilter === "all" ? () => setShowModal(true) : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((project) => {
            const overdue = isOverdue(project.deadline, project.status);
            const deadline = formatDeadline(project.deadline);
            const priorityStyle =
              PRIORITY_STYLES[project.priority] ?? PRIORITY_STYLES.medium;
            const statusStyle =
              STATUS_STYLES[project.status] ?? STATUS_STYLES.active;

            return (
              <div key={project.id} className="relative group">
                <Link
                  href={`/projects/${project.id}`}
                  className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-5 hover:border-[#334155] transition-colors block"
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <h3 className="font-semibold text-slate-100 text-sm line-clamp-2 flex-1">
                      {project.title}
                    </h3>
                    <ChevronRight className="w-4 h-4 text-slate-600 flex-shrink-0 mt-0.5" />
                  </div>

                  {project.description && (
                    <p className="text-slate-500 text-xs mb-3 line-clamp-2">
                      {project.description}
                    </p>
                  )}

                  <div className="flex items-center gap-2 mb-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium border capitalize ${priorityStyle}`}
                    >
                      {project.priority}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${statusStyle}`}
                    >
                      {project.status}
                    </span>
                    {overdue && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium text-red-400 bg-red-500/10">
                        Overdue
                      </span>
                    )}
                  </div>

                  {/* Progress bar */}
                  {project.taskCount > 0 && (
                    <div className="mb-3">
                      <div className="flex justify-between text-xs text-slate-500 mb-1">
                        <span>Progress</span>
                        <span>
                          {project.completedTaskCount}/{project.taskCount} tasks
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-[#1e293b] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all"
                          style={{ width: `${project.completionPercentage}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {deadline && (
                    <div
                      className={`flex items-center gap-1.5 text-xs ${
                        overdue ? "text-red-400" : "text-slate-500"
                      }`}
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{deadline}</span>
                    </div>
                  )}
                </Link>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteProject(project.id);
                  }}
                  disabled={deletingId === project.id}
                  className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 disabled:opacity-40"
                  title="Delete project"
                >
                  {deletingId === project.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <NewProjectModal
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false);
            fetchProjects();
          }}
        />
      )}
    </div>
  );
}
