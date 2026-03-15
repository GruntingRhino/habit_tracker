"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import {
  User,
  Lock,
  Cpu,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Loader2,
  TestTube,
} from "lucide-react";

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}

function Section({ title, icon, children }: SectionProps) {
  return (
    <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-6">
      <div className="flex items-center gap-2 mb-5">
        {icon}
        <h2 className="font-semibold text-slate-100">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function inputClass() {
  return "w-full bg-[#1e293b] border border-[#334155] text-slate-100 placeholder-slate-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50";
}

function labelClass() {
  return "block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5";
}

interface StatusMsgProps {
  type: "success" | "error";
  message: string;
}

function StatusMsg({ type, message }: StatusMsgProps) {
  return (
    <div
      className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm ${
        type === "success"
          ? "bg-green-500/10 border border-green-500/20 text-green-400"
          : "bg-red-500/10 border border-red-500/20 text-red-400"
      }`}
    >
      {type === "success" ? (
        <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
      ) : (
        <AlertCircle className="w-4 h-4 flex-shrink-0" />
      )}
      {message}
    </div>
  );
}

function SubmitButton({
  loading,
  label,
  loadingLabel,
}: {
  loading: boolean;
  label: string;
  loadingLabel: string;
}) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors"
    >
      {loading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          {loadingLabel}
        </>
      ) : (
        label
      )}
    </button>
  );
}

function ProfileSection() {
  const { data: session, update } = useSession();
  const [name, setName] = useState(session?.user?.name ?? "");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch("/api/auth/update-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("Failed to update profile");
      await update({ name });
      setStatus({ type: "success", message: "Profile updated successfully" });
    } catch {
      setStatus({ type: "error", message: "Failed to update profile" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Section title="Profile" icon={<User className="w-4 h-4 text-blue-400" />}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={labelClass()}>Email</label>
          <input
            type="email"
            value={session?.user?.email ?? ""}
            disabled
            className="w-full bg-[#0a0f1e] border border-[#1e293b] text-slate-500 rounded-lg px-3 py-2 text-sm cursor-not-allowed"
          />
          <p className="text-slate-600 text-xs mt-1">Email cannot be changed</p>
        </div>
        <div>
          <label className={labelClass()}>Display Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className={inputClass()}
          />
        </div>
        {status && (
          <StatusMsg type={status.type} message={status.message} />
        )}
        <SubmitButton
          loading={loading}
          label="Save Changes"
          loadingLabel="Saving..."
        />
      </form>
    </Section>
  );
}

function PasswordSection() {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setStatus({ type: "error", message: "New passwords do not match" });
      return;
    }
    if (newPassword.length < 8) {
      setStatus({
        type: "error",
        message: "Password must be at least 8 characters",
      });
      return;
    }
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ oldPassword, newPassword }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Failed to change password");
      }
      setStatus({ type: "success", message: "Password changed successfully" });
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setStatus({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to change password",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Section
      title="Change Password"
      icon={<Lock className="w-4 h-4 text-blue-400" />}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={labelClass()}>Current Password</label>
          <input
            type="password"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            className={inputClass()}
          />
        </div>
        <div>
          <label className={labelClass()}>New Password</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
            className={inputClass()}
          />
        </div>
        <div>
          <label className={labelClass()}>Confirm New Password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
            className={inputClass()}
          />
        </div>
        {status && (
          <StatusMsg type={status.type} message={status.message} />
        )}
        <SubmitButton
          loading={loading}
          label="Change Password"
          loadingLabel="Updating..."
        />
      </form>
    </Section>
  );
}

function OllamaSection() {
  const [baseUrl, setBaseUrl] = useState(
    process.env.NEXT_PUBLIC_OLLAMA_BASE_URL ?? "http://localhost:11434"
  );
  const [model, setModel] = useState("llama3.2");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = await res.json();
        const models: string[] = (data.models ?? []).map(
          (m: { name: string }) => m.name
        );
        setTestResult({
          type: "success",
          message: `Connected! Available models: ${
            models.length > 0 ? models.join(", ") : "none"
          }`,
        });
      } else {
        throw new Error(`Status ${res.status}`);
      }
    } catch {
      setTestResult({
        type: "error",
        message: "Cannot connect to Ollama. Make sure it is running.",
      });
    } finally {
      setTesting(false);
    }
  }

  return (
    <Section
      title="AI Settings (Ollama)"
      icon={<Cpu className="w-4 h-4 text-blue-400" />}
    >
      <div className="space-y-4">
        <p className="text-slate-400 text-sm">
          Configure your local Ollama instance for AI-powered task generation.
        </p>
        <div>
          <label className={labelClass()}>Ollama Base URL</label>
          <input
            type="url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="http://localhost:11434"
            className={inputClass()}
          />
        </div>
        <div>
          <label className={labelClass()}>Model</label>
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="llama3.2"
            className={inputClass()}
          />
          <p className="text-slate-600 text-xs mt-1">
            Make sure this model is pulled in Ollama
          </p>
        </div>
        {testResult && (
          <StatusMsg type={testResult.type} message={testResult.message} />
        )}
        <button
          type="button"
          onClick={handleTest}
          disabled={testing}
          className="flex items-center gap-2 bg-[#1e293b] hover:bg-[#334155] text-slate-300 font-medium px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-60"
        >
          {testing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Testing...
            </>
          ) : (
            <>
              <TestTube className="w-4 h-4" />
              Test Connection
            </>
          )}
        </button>
        <p className="text-slate-500 text-xs">
          Note: Ollama URL and model settings are configured via environment
          variables (OLLAMA_BASE_URL, OLLAMA_MODEL). The test above checks
          connectivity only.
        </p>
      </div>
    </Section>
  );
}

function DangerZone() {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  async function handleReset() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch("/api/reset", {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to reset data");
      setStatus({ type: "success", message: "Tracking data cleared. Your habits, projects, meals, and routines are untouched." });
      setConfirming(false);
    } catch {
      setStatus({ type: "error", message: "Failed to reset data. Please try again." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="rounded-xl p-6"
      style={{ background: "linear-gradient(135deg, #0c1830 0%, #091222 100%)", border: "1px solid rgba(255,77,106,0.2)" }}
    >
      <div className="flex items-center gap-2 mb-5">
        <AlertTriangle className="w-4 h-4" style={{ color: "#ff4d6a" }} />
        <h2 className="font-semibold" style={{ color: "#ff4d6a", fontFamily: "'Syne', sans-serif" }}>Danger Zone</h2>
      </div>

      <div className="space-y-4">
        <div>
          <p className="text-sm font-medium mb-1" style={{ color: "#c8deff" }}>
            Reset Tracking Data
          </p>
          <p className="text-sm mb-4" style={{ color: "#4a6a90" }}>
            Clears all your logged history. Cannot be undone.
          </p>

          {/* What gets deleted */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-1">
            <div className="rounded-lg p-3" style={{ background: "rgba(255,77,106,0.06)", border: "1px solid rgba(255,77,106,0.15)" }}>
              <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "#ff4d6a" }}>Deleted</p>
              <ul className="space-y-1">
                {["Daily entries", "Category scores", "Habit logs", "Workout sessions", "Exercise logs"].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-xs" style={{ color: "#7a5a5a" }}>
                    <span style={{ color: "#ff4d6a" }}>✕</span> {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg p-3" style={{ background: "rgba(16,217,160,0.06)", border: "1px solid rgba(16,217,160,0.15)" }}>
              <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "#10d9a0" }}>Kept</p>
              <ul className="space-y-1">
                {["Your account", "Habits", "Projects & tasks", "Meals", "Routines & exercises"].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-xs" style={{ color: "#4a7a6a" }}>
                    <span style={{ color: "#10d9a0" }}>✓</span> {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {status && (
          <StatusMsg type={status.type} message={status.message} />
        )}

        {confirming && (
          <div className="rounded-lg p-3" style={{ background: "rgba(255,77,106,0.08)", border: "1px solid rgba(255,77,106,0.2)" }}>
            <p className="text-sm font-medium" style={{ color: "#ff4d6a" }}>
              Are you sure? All tracked history will be permanently deleted.
            </p>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleReset}
            disabled={loading}
            className="flex items-center gap-2 font-medium px-4 py-2 rounded-lg text-sm transition-all disabled:opacity-60"
            style={{ background: "rgba(255,77,106,0.15)", border: "1px solid rgba(255,77,106,0.25)", color: "#ff4d6a" }}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Resetting...
              </>
            ) : confirming ? (
              "Yes, Reset My Data"
            ) : (
              "Reset Tracking Data"
            )}
          </button>
          {confirming && (
            <button
              onClick={() => setConfirming(false)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{ background: "rgba(20,40,70,0.8)", color: "#6b8cb8" }}
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <div className="px-4 py-5 md:px-6 md:py-6 max-w-2xl mx-auto pb-20 lg:pb-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-100">Settings</h1>
        <p className="text-slate-400 text-sm mt-0.5">
          Manage your account and preferences
        </p>
      </div>

      <div className="space-y-5">
        <ProfileSection />
        <PasswordSection />
        <OllamaSection />
        <DangerZone />
      </div>
    </div>
  );
}
