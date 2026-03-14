"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Dumbbell,
  Plus,
  Trash2,
  X,
  Loader2,
  AlertCircle,
  ClipboardList,
  CheckCircle2,
  Calendar,
  ChevronRight,
  Play,
} from "lucide-react";
import LoadingSpinner from "@/components/LoadingSpinner";
import EmptyState from "@/components/EmptyState";

// ─── Types ───────────────────────────────────────────────────────────────────

interface WeightExercise {
  id: string;
  name: string;
  descriptor: string | null;
  order: number;
}

interface WorkoutExerciseLog {
  id: string;
  exerciseName: string;
  weight: number | null;
  sets: number | null;
  reps: string | null;
  notes: string | null;
}

interface WorkoutSession {
  id: string;
  date: string;
  notes: string | null;
  routine: { name: string };
  exerciseLogs: WorkoutExerciseLog[];
}

interface WeightRoutine {
  id: string;
  name: string;
  description: string | null;
  exercises: WeightExercise[];
  sessions: WorkoutSession[];
  _count: { sessions: number };
}

// ─── Paste parser ─────────────────────────────────────────────────────────────
// Format: "Name" or "Name:descriptor" where descriptor is any free text
// Examples:
//   Bench Press
//   Bench Press:4x8
//   Squat:3 sets to failure
//   Plank:60 seconds
//   Romanian Deadlift:4x10 — pause at bottom

interface ParsedExercise {
  name: string;
  descriptor?: string;
}

function parsePasteText(raw: string): ParsedExercise[] {
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) return { name: line };
      const name = line.slice(0, colonIdx).trim();
      const descriptor = line.slice(colonIdx + 1).trim();
      if (!name) return null;
      return { name, descriptor: descriptor || undefined };
    })
    .filter(Boolean) as ParsedExercise[];
}

// ─── New Routine Modal ────────────────────────────────────────────────────────

function NewRoutineModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (r: WeightRoutine) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Name is required"); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/weights/routines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: name.trim(), description: description || undefined }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      onSaved(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-[#0f172a] border border-[#1e293b] rounded-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-slate-100">New Routine</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100 transition-colors">
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
              Routine Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Push Day, Pull Day, Legs, Cardio"
              className="w-full bg-[#1e293b] border border-[#334155] text-slate-100 placeholder-slate-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional notes about this routine"
              className="w-full bg-[#1e293b] border border-[#334155] text-slate-100 placeholder-slate-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex gap-3 pt-1">
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
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Log Workout Modal ────────────────────────────────────────────────────────

interface ExerciseLogEntry {
  exerciseId: string;
  exerciseName: string;
  weight: string;
  sets: string;
  reps: string;
  notes: string;
}

function LogWorkoutModal({
  routine,
  onClose,
  onLogged,
}: {
  routine: WeightRoutine;
  onClose: () => void;
  onLogged: () => void;
}) {
  const [sessionNotes, setSessionNotes] = useState("");
  const [logs, setLogs] = useState<ExerciseLogEntry[]>(
    routine.exercises.map((ex) => ({
      exerciseId: ex.id,
      exerciseName: ex.name,
      weight: "",
      sets: "",
      reps: "",
      notes: "",
    }))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function updateLog(idx: number, field: keyof ExerciseLogEntry, value: string) {
    setLogs((prev) => prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
  }

  async function handleLog() {
    setSaving(true);
    setError("");
    try {
      const exerciseLogs = logs
        .filter((l) => l.weight || l.sets || l.reps || l.notes)
        .map((l) => ({
          exerciseId: l.exerciseId,
          exerciseName: l.exerciseName,
          weight: l.weight ? parseFloat(l.weight) : undefined,
          sets: l.sets ? parseInt(l.sets) : undefined,
          reps: l.reps || undefined,
          notes: l.notes || undefined,
        }));

      const res = await fetch("/api/weights/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          routineId: routine.id,
          notes: sessionNotes || undefined,
          exerciseLogs,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      onLogged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to log");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-[#0f172a] border border-[#1e293b] rounded-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Log Workout</h2>
            <p className="text-slate-500 text-xs mt-0.5">{routine.name}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-4">
            <AlertCircle className="w-4 h-4 text-red-400" />
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Exercise logs */}
        {logs.length > 0 && (
          <div className="space-y-4 mb-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Exercises</p>
            {logs.map((log, idx) => {
              const ex = routine.exercises[idx];
              return (
                <div key={log.exerciseId} className="bg-[#1e293b] rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-slate-100 text-sm font-medium">{log.exerciseName}</p>
                    {ex?.descriptor && (
                      <span className="text-xs text-slate-500 bg-[#0f172a] px-2 py-0.5 rounded">
                        {ex.descriptor}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Weight (lbs)</label>
                      <input
                        type="number"
                        value={log.weight}
                        onChange={(e) => updateLog(idx, "weight", e.target.value)}
                        placeholder="135"
                        className="w-full bg-[#0f172a] border border-[#334155] text-slate-100 placeholder-slate-600 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Sets</label>
                      <input
                        type="number"
                        value={log.sets}
                        onChange={(e) => updateLog(idx, "sets", e.target.value)}
                        placeholder="4"
                        className="w-full bg-[#0f172a] border border-[#334155] text-slate-100 placeholder-slate-600 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Reps</label>
                      <input
                        type="text"
                        value={log.reps}
                        onChange={(e) => updateLog(idx, "reps", e.target.value)}
                        placeholder="8"
                        className="w-full bg-[#0f172a] border border-[#334155] text-slate-100 placeholder-slate-600 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                  <input
                    type="text"
                    value={log.notes}
                    onChange={(e) => updateLog(idx, "notes", e.target.value)}
                    placeholder="Notes (optional)"
                    className="w-full mt-2 bg-[#0f172a] border border-[#334155] text-slate-100 placeholder-slate-600 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>
              );
            })}
          </div>
        )}

        {/* Session notes */}
        <div className="mb-5">
          <label className="block text-xs text-slate-500 uppercase tracking-wide font-medium mb-1.5">
            Session Notes
          </label>
          <textarea
            value={sessionNotes}
            onChange={(e) => setSessionNotes(e.target.value)}
            rows={2}
            placeholder="How did it go? PRs, energy levels, etc."
            className="w-full bg-[#1e293b] border border-[#334155] text-slate-100 placeholder-slate-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 resize-none"
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-[#1e293b] hover:bg-[#334155] text-slate-300 rounded-lg text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleLog}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (
              <><CheckCircle2 className="w-4 h-4" /> Log Workout</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Routine Detail Panel ─────────────────────────────────────────────────────

function RoutineDetail({
  routine,
  onUpdated,
  onDeleted,
}: {
  routine: WeightRoutine;
  onUpdated: (r: WeightRoutine) => void;
  onDeleted: () => void;
}) {
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteImporting, setPasteImporting] = useState(false);
  const [pasteError, setPasteError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showLogModal, setShowLogModal] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);

  const parsedPreview = pasteText.trim() ? parsePasteText(pasteText) : [];

  async function handlePasteImport() {
    if (!parsedPreview.length) return;
    setPasteImporting(true);
    setPasteError("");
    try {
      const res = await fetch(`/api/weights/routines/${routine.id}/exercises`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ exercises: parsedPreview }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      const data = await res.json();
      onUpdated({ ...routine, exercises: data.exercises });
      setShowPaste(false);
      setPasteText("");
    } catch (err) {
      setPasteError(err instanceof Error ? err.message : "Failed to import");
    } finally {
      setPasteImporting(false);
    }
  }

  async function deleteExercise(exerciseId: string) {
    setDeletingId(exerciseId);
    try {
      await fetch(`/api/weights/routines/${routine.id}/exercises?exerciseId=${exerciseId}`, {
        method: "DELETE",
        credentials: "include",
      });
      onUpdated({ ...routine, exercises: routine.exercises.filter((e) => e.id !== exerciseId) });
    } finally {
      setDeletingId(null);
    }
  }

  async function deleteRoutine() {
    if (!confirm(`Delete routine "${routine.name}" and all its exercises?`)) return;
    await fetch(`/api/weights/routines/${routine.id}`, { method: "DELETE", credentials: "include" });
    onDeleted();
  }

  async function loadSessions() {
    if (sessionsLoading) return;
    setSessionsLoading(true);
    try {
      const res = await fetch("/api/weights/sessions", { credentials: "include" });
      if (res.ok) {
        const all = (await res.json()) as WorkoutSession[];
        setSessions(all.filter((s) => s.routine?.name === routine.name));
      }
    } finally {
      setSessionsLoading(false);
    }
  }

  async function deleteSession(sessionId: string) {
    setDeletingSessionId(sessionId);
    try {
      await fetch(`/api/weights/sessions?id=${sessionId}`, { method: "DELETE", credentials: "include" });
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } finally {
      setDeletingSessionId(null);
    }
  }

  function toggleHistory() {
    if (!showHistory) loadSessions();
    setShowHistory((v) => !v);
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-5">
        <div className="flex-1">
          <h2 className="text-lg font-bold text-slate-100">{routine.name}</h2>
          {routine.description && (
            <p className="text-slate-500 text-sm mt-0.5">{routine.description}</p>
          )}
          <p className="text-slate-600 text-xs mt-1">
            {routine._count.sessions} session{routine._count.sessions !== 1 ? "s" : ""} logged
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setShowPaste((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              showPaste
                ? "bg-orange-500/20 text-orange-300 border border-orange-500/30"
                : "bg-[#1e293b] hover:bg-[#334155] text-slate-300"
            }`}
          >
            <ClipboardList className="w-3.5 h-3.5" />
            Paste List
          </button>
          <button
            onClick={() => setShowLogModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-600 hover:bg-green-700 text-white transition-colors"
          >
            <Play className="w-3.5 h-3.5" />
            Log Workout
          </button>
          <button
            onClick={deleteRoutine}
            className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors"
            title="Delete routine"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Paste panel */}
      {showPaste && (
        <div className="bg-[#0f172a] border border-orange-500/20 rounded-xl p-4 mb-4">
          <p className="text-xs text-slate-400 mb-2">
            One exercise per line.{" "}
            <code className="text-orange-300 bg-orange-500/10 px-1 rounded">Exercise Name</code>
            {" "}or{" "}
            <code className="text-orange-300 bg-orange-500/10 px-1 rounded">Exercise Name:anything</code>
            {" "}— the part after <code className="text-orange-300 bg-orange-500/10 px-1 rounded">:</code> is your target.
          </p>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={7}
            placeholder={"Bench Press:4x8\nIncline Dumbbell Press:3x10\nTricep Pushdown:3x12 — rope\nPlank:60 seconds\nPull Ups:3 sets to failure"}
            className="w-full bg-[#1e293b] border border-[#334155] text-slate-100 placeholder-slate-600 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-orange-500 resize-none mb-3"
          />

          {parsedPreview.length > 0 && (
            <div className="mb-3">
              <p className="text-xs text-slate-500 mb-2">
                Preview — {parsedPreview.length} exercise{parsedPreview.length !== 1 ? "s" : ""}{" "}
                <span className="text-slate-600">(replaces current list)</span>
              </p>
              <div className="space-y-1">
                {parsedPreview.map((ex, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-400 flex-shrink-0" />
                    <span className="text-slate-200 font-medium">{ex.name}</span>
                    {ex.descriptor && (
                      <span className="text-slate-500">{ex.descriptor}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {pasteError && <p className="text-red-400 text-xs mb-2">{pasteError}</p>}

          <div className="flex gap-2">
            <button
              onClick={() => { setShowPaste(false); setPasteText(""); setPasteError(""); }}
              className="px-3 py-1.5 bg-[#1e293b] hover:bg-[#334155] text-slate-300 rounded-lg text-xs font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handlePasteImport}
              disabled={pasteImporting || parsedPreview.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors"
            >
              {pasteImporting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                `Import ${parsedPreview.length} Exercise${parsedPreview.length !== 1 ? "s" : ""}`
              )}
            </button>
          </div>
        </div>
      )}

      {/* Exercise list */}
      {routine.exercises.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
          <Dumbbell className="w-10 h-10 text-slate-700 mb-3" />
          <p className="text-slate-400 text-sm font-medium">No exercises yet</p>
          <p className="text-slate-600 text-xs mt-1">Use &ldquo;Paste List&rdquo; to add exercises in bulk</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="space-y-1.5">
            {routine.exercises.map((ex, idx) => (
              <div
                key={ex.id}
                className="group flex items-center gap-3 bg-[#0f172a] border border-[#1e293b] rounded-lg px-4 py-3 hover:border-[#334155] transition-colors"
              >
                <span className="text-slate-700 text-xs w-4 flex-shrink-0 font-mono">
                  {idx + 1}
                </span>
                <div className="flex-1 min-w-0 flex items-center gap-3">
                  <p className="text-slate-100 text-sm font-medium">{ex.name}</p>
                  {ex.descriptor && (
                    <span className="text-xs text-slate-500 bg-[#1e293b] border border-[#334155] px-2 py-0.5 rounded flex-shrink-0">
                      {ex.descriptor}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => deleteExercise(ex.id)}
                  disabled={deletingId === ex.id}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-slate-600 hover:text-red-400"
                >
                  {deletingId === ex.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <X className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            ))}
          </div>

          {/* Workout history toggle */}
          <button
            onClick={toggleHistory}
            className="w-full flex items-center justify-between mt-6 mb-2 px-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            <span className="font-medium uppercase tracking-wide">Workout History</span>
            <ChevronRight className={`w-3.5 h-3.5 transition-transform ${showHistory ? "rotate-90" : ""}`} />
          </button>

          {showHistory && (
            sessionsLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
              </div>
            ) : sessions.length === 0 ? (
              <p className="text-slate-600 text-xs text-center py-4">No sessions logged yet</p>
            ) : (
              <div className="space-y-2">
                {sessions.map((s) => (
                  <div
                    key={s.id}
                    className="group bg-[#0f172a] border border-[#1e293b] rounded-lg px-3 py-2.5"
                  >
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />
                      <span className="text-xs text-slate-300 font-medium flex-1">
                        {new Date(s.date).toLocaleDateString("en-US", {
                          weekday: "short", month: "short", day: "numeric", year: "numeric",
                        })}
                      </span>
                      {s.notes && (
                        <span className="text-xs text-slate-600 italic truncate max-w-[120px]">{s.notes}</span>
                      )}
                      <button
                        onClick={() => deleteSession(s.id)}
                        disabled={deletingSessionId === s.id}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-slate-600 hover:text-red-400"
                      >
                        {deletingSessionId === s.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <X className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                    {s.exerciseLogs?.length > 0 && (
                      <div className="mt-2 space-y-0.5 pl-5">
                        {s.exerciseLogs.map((log) => (
                          <div key={log.id} className="flex items-center gap-2 text-xs text-slate-500">
                            <span className="text-slate-400">{log.exerciseName}</span>
                            {log.weight && <span className="text-blue-400">{log.weight}lbs</span>}
                            {log.sets && log.reps && (
                              <span>{log.sets}×{log.reps}</span>
                            )}
                            {log.notes && <span className="italic text-slate-600">{log.notes}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      )}

      {showLogModal && (
        <LogWorkoutModal
          routine={routine}
          onClose={() => setShowLogModal(false)}
          onLogged={() => {
            setShowLogModal(false);
            onUpdated({ ...routine, _count: { sessions: routine._count.sessions + 1 } });
            if (showHistory) loadSessions();
          }}
        />
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RoutinesPage() {
  const [routines, setRoutines] = useState<WeightRoutine[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  const fetchRoutines = useCallback(async () => {
    try {
      const res = await fetch("/api/weights/routines", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setRoutines(data);
        setSelectedId((prev) => prev ?? (data[0]?.id ?? null));
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRoutines(); }, [fetchRoutines]);

  const selectedRoutine = routines.find((r) => r.id === selectedId) ?? null;

  function handleRoutineUpdated(updated: WeightRoutine) {
    setRoutines((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  }

  function handleRoutineDeleted(id: string) {
    const remaining = routines.filter((r) => r.id !== id);
    setRoutines(remaining);
    setSelectedId(remaining[0]?.id ?? null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* ── Left sidebar: routine list ── */}
      <div className="w-60 flex-shrink-0 border-r border-[#1e293b] flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-4 border-b border-[#1e293b]">
          <div className="flex items-center gap-2">
            <Dumbbell className="w-4 h-4 text-blue-400" />
            <h1 className="text-sm font-semibold text-slate-100">Routines</h1>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
            title="New routine"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {routines.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <p className="text-slate-500 text-xs">No routines yet</p>
              <button
                onClick={() => setShowModal(true)}
                className="text-blue-400 text-xs mt-1 hover:underline"
              >
                Create one
              </button>
            </div>
          ) : (
            routines.map((r) => (
              <button
                key={r.id}
                onClick={() => setSelectedId(r.id)}
                className={`w-full text-left px-4 py-3 transition-colors ${
                  selectedId === r.id
                    ? "bg-blue-600/10 border-r-2 border-blue-500 text-slate-100"
                    : "text-slate-400 hover:text-slate-100 hover:bg-[#1e293b]"
                }`}
              >
                <p className="text-sm font-medium truncate">{r.name}</p>
                <p className="text-xs text-slate-600 mt-0.5">
                  {r.exercises.length} exercise{r.exercises.length !== 1 ? "s" : ""} ·{" "}
                  {r._count.sessions} logged
                </p>
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── Right: detail panel ── */}
      <div className="flex-1 overflow-y-auto p-6 flex flex-col">
        {selectedRoutine ? (
          <RoutineDetail
            key={selectedRoutine.id}
            routine={selectedRoutine}
            onUpdated={handleRoutineUpdated}
            onDeleted={() => handleRoutineDeleted(selectedRoutine.id)}
          />
        ) : (
          <EmptyState
            icon={Dumbbell}
            title="Select a routine"
            description="Choose a routine from the left or create a new one to get started."
            ctaLabel="New Routine"
            onCtaClick={() => setShowModal(true)}
          />
        )}
      </div>

      {showModal && (
        <NewRoutineModal
          onClose={() => setShowModal(false)}
          onSaved={(r) => {
            setRoutines((prev) => [...prev, r]);
            setSelectedId(r.id);
            setShowModal(false);
          }}
        />
      )}
    </div>
  );
}
