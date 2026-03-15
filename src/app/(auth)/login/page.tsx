"use client";

import { useState, useEffect } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Brain, Mail, Lock, AlertCircle, Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (status === "authenticated" && session) {
      router.replace("/dashboard");
    }
  }, [session, status, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await signIn("credentials", {
        email,
        password,
        callbackUrl: "/dashboard",
        redirect: false,
      });
      if (result?.error) {
        setError("Invalid email or password. Please try again.");
      } else if (result?.ok) {
        router.replace("/dashboard");
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (status === "loading") {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "#060d1c" }}
      >
        <div
          className="w-8 h-8 rounded-full border-2 animate-spin"
          style={{ borderColor: "rgba(40,76,140,0.4)", borderTopColor: "#4f72ff" }}
        />
      </div>
    );
  }

  if (status === "authenticated") return null;

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden"
      style={{ background: "#060d1c" }}
    >
      {/* ── Atmospheric orbs ──────────────────────────────────────── */}
      <div
        className="absolute pointer-events-none"
        style={{
          width: "600px", height: "600px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(79,114,255,0.12) 0%, transparent 70%)",
          top: "-200px", left: "-150px",
          filter: "blur(40px)",
        }}
      />
      <div
        className="absolute pointer-events-none"
        style={{
          width: "500px", height: "500px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(34,211,238,0.08) 0%, transparent 70%)",
          bottom: "-150px", right: "-100px",
          filter: "blur(50px)",
        }}
      />
      <div
        className="absolute pointer-events-none"
        style={{
          width: "300px", height: "300px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(167,139,250,0.07) 0%, transparent 70%)",
          top: "40%", right: "20%",
          filter: "blur(60px)",
        }}
      />

      {/* ── Subtle grid ───────────────────────────────────────────── */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.025]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(79,114,255,1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(79,114,255,1) 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
        }}
      />

      {/* ── Form content ──────────────────────────────────────────── */}
      <div className="w-full max-w-md relative z-10 px-4 sm:px-0">
        {/* Brand */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
            style={{
              background: "linear-gradient(135deg, #4f72ff 0%, #22d3ee 100%)",
              boxShadow: "0 0 32px rgba(79,114,255,0.4), 0 0 64px rgba(79,114,255,0.15)",
            }}
          >
            <Brain className="w-8 h-8 text-white" />
          </div>
          <h1
            className="text-3xl font-bold mb-1"
            style={{
              fontFamily: "'Syne', sans-serif",
              background: "linear-gradient(135deg, #c8deff 0%, #93b8ff 60%, #7eb3ff 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Habit Intelligence
          </h1>
          <p className="text-sm" style={{ color: "#2d4a6a" }}>
            Track, analyze, and improve your daily performance
          </p>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-8"
          style={{
            background: "linear-gradient(135deg, rgba(12,24,48,0.95) 0%, rgba(9,18,34,0.98) 100%)",
            border: "1px solid rgba(40,76,140,0.3)",
            boxShadow: "0 0 40px rgba(6,13,28,0.8), inset 0 1px 0 rgba(79,114,255,0.1)",
          }}
        >
          {/* Card inner top highlight */}
          <div
            className="absolute inset-x-0 top-0 h-px rounded-t-2xl"
            style={{ background: "linear-gradient(90deg, transparent, rgba(79,114,255,0.3), transparent)" }}
          />

          <h2
            className="text-lg font-semibold mb-6"
            style={{ color: "#c8deff", fontFamily: "'Syne', sans-serif" }}
          >
            Sign in to your account
          </h2>

          {error && (
            <div
              className="flex items-center gap-2 rounded-lg px-4 py-3 mb-5"
              style={{
                background: "rgba(255,77,106,0.08)",
                border: "1px solid rgba(255,77,106,0.2)",
              }}
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: "#ff4d6a" }} />
              <p className="text-sm" style={{ color: "#ff4d6a" }}>{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium mb-1.5"
                style={{ color: "#6b8cb8" }}
              >
                Email address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "#2d4a6a" }} />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                  className="w-full rounded-lg pl-10 pr-4 py-2.5 text-sm outline-none transition-all duration-150"
                  style={{
                    background: "rgba(6,13,28,0.8)",
                    border: "1px solid rgba(30,60,110,0.5)",
                    color: "#c8deff",
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = "rgba(79,114,255,0.6)";
                    e.target.style.boxShadow = "0 0 0 3px rgba(79,114,255,0.08)";
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "rgba(30,60,110,0.5)";
                    e.target.style.boxShadow = "none";
                  }}
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium mb-1.5"
                style={{ color: "#6b8cb8" }}
              >
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "#2d4a6a" }} />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  className="w-full rounded-lg pl-10 pr-4 py-2.5 text-sm outline-none transition-all duration-150"
                  style={{
                    background: "rgba(6,13,28,0.8)",
                    border: "1px solid rgba(30,60,110,0.5)",
                    color: "#c8deff",
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = "rgba(79,114,255,0.6)";
                    e.target.style.boxShadow = "0 0 0 3px rgba(79,114,255,0.08)";
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "rgba(30,60,110,0.5)";
                    e.target.style.boxShadow = "none";
                  }}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 text-white font-semibold py-2.5 rounded-lg text-sm transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: "linear-gradient(135deg, #4f72ff 0%, #3d5ee6 100%)",
                boxShadow: "0 0 20px rgba(79,114,255,0.35), 0 2px 8px rgba(0,0,0,0.3)",
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  (e.currentTarget as HTMLElement).style.boxShadow = "0 0 30px rgba(79,114,255,0.5), 0 2px 8px rgba(0,0,0,0.3)";
                  (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)";
                }
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.boxShadow = "0 0 20px rgba(79,114,255,0.35), 0 2px 8px rgba(0,0,0,0.3)";
                (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
              }}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                "Sign in"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
