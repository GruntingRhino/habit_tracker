"use client";

import { Suspense, useEffect, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { AlertCircle, Brain, Loader2, Lock, Mail, User } from "lucide-react";

type AuthMode = "signin" | "signup";

interface AuthFormState {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}

const INITIAL_FORM: AuthFormState = {
  name: "",
  email: "",
  password: "",
  confirmPassword: "",
};

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthPageLoading />}>
      <LoginPageContent />
    </Suspense>
  );
}

function LoginPageContent() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [form, setForm] = useState<AuthFormState>(INITIAL_FORM);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (status === "authenticated" && session) {
      router.replace("/dashboard");
    }
  }, [session, status, router]);

  function updateField<K extends keyof AuthFormState>(key: K, value: AuthFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError("");
    setLoading(false);
  }

  async function handleCredentialsSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (mode === "signup") {
        const registerResponse = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            name: form.name,
            email: form.email,
            password: form.password,
            confirmPassword: form.confirmPassword,
          }),
        });

        const registerData = (await registerResponse.json().catch(() => null)) as
          | { error?: string }
          | null;

        if (!registerResponse.ok) {
          setError(registerData?.error ?? "Unable to create account.");
          return;
        }
      }

      const result = await signIn("credentials", {
        email: form.email,
        password: form.password,
        callbackUrl: "/dashboard",
        redirect: false,
      });

      if (result?.error) {
        setError(
          mode === "signup"
            ? "Account created, but automatic sign in failed. Try signing in directly."
            : "Invalid email or password. Please try again."
        );
        return;
      }

      if (result?.ok) {
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
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#060d1c" }}>
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
      <div
        className="absolute pointer-events-none"
        style={{
          width: "600px",
          height: "600px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(79,114,255,0.12) 0%, transparent 70%)",
          top: "-200px",
          left: "-150px",
          filter: "blur(40px)",
        }}
      />
      <div
        className="absolute pointer-events-none"
        style={{
          width: "500px",
          height: "500px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(34,211,238,0.08) 0%, transparent 70%)",
          bottom: "-150px",
          right: "-100px",
          filter: "blur(50px)",
        }}
      />
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

      <div className="w-full max-w-md relative z-10 px-4 sm:px-0">
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
            Track, score, and improve with one account system
          </p>
        </div>

        <div
          className="rounded-2xl p-8 relative"
          style={{
            background: "linear-gradient(135deg, rgba(12,24,48,0.95) 0%, rgba(9,18,34,0.98) 100%)",
            border: "1px solid rgba(40,76,140,0.3)",
            boxShadow: "0 0 40px rgba(6,13,28,0.8), inset 0 1px 0 rgba(79,114,255,0.1)",
          }}
        >
          <div
            className="absolute inset-x-0 top-0 h-px rounded-t-2xl"
            style={{ background: "linear-gradient(90deg, transparent, rgba(79,114,255,0.3), transparent)" }}
          />

          <div
            className="mb-6 grid grid-cols-2 rounded-xl p-1"
            style={{ background: "rgba(6,13,28,0.7)", border: "1px solid rgba(30,60,110,0.45)" }}
          >
            {([
              ["signin", "Sign In"],
              ["signup", "Create Account"],
            ] as const).map(([key, label]) => {
              const active = mode === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => switchMode(key)}
                  className="rounded-lg px-3 py-2 text-sm font-medium transition-all"
                  style={
                    active
                      ? {
                          color: "#ffffff",
                          background: "linear-gradient(135deg, #4f72ff 0%, #3d5ee6 100%)",
                          boxShadow: "0 0 18px rgba(79,114,255,0.28)",
                        }
                      : {
                          color: "#6b8cb8",
                          background: "transparent",
                        }
                  }
                >
                  {label}
                </button>
              );
            })}
          </div>

          <h2
            className="text-lg font-semibold mb-6"
            style={{ color: "#c8deff", fontFamily: "'Syne', sans-serif" }}
          >
            {mode === "signin" ? "Sign in with email" : "Create your account"}
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

          <form onSubmit={handleCredentialsSubmit} className="space-y-5">
            {mode === "signup" && (
              <Field
                id="name"
                label="Name"
                icon={User}
                type="text"
                autoComplete="name"
                value={form.name}
                onChange={(value) => updateField("name", value)}
                placeholder="Your name"
              />
            )}

            <Field
              id="email"
              label="Email"
              icon={Mail}
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(value) => updateField("email", value)}
              placeholder="you@example.com"
            />

            <Field
              id="password"
              label="Password"
              icon={Lock}
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={form.password}
              onChange={(value) => updateField("password", value)}
              placeholder="Minimum 12 characters"
            />

            {mode === "signup" && (
              <Field
                id="confirmPassword"
                label="Confirm password"
                icon={Lock}
                type="password"
                autoComplete="new-password"
                value={form.confirmPassword}
                onChange={(value) => updateField("confirmPassword", value)}
                placeholder="Re-enter password"
              />
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 text-white font-semibold py-2.5 rounded-lg text-sm transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: "linear-gradient(135deg, #4f72ff 0%, #3d5ee6 100%)",
                boxShadow: "0 0 20px rgba(79,114,255,0.35), 0 2px 8px rgba(0,0,0,0.3)",
              }}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {mode === "signin" ? "Signing in..." : "Creating account..."}
                </>
              ) : mode === "signin" ? (
                "Sign in"
              ) : (
                "Create account"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function AuthPageLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#060d1c" }}>
      <div
        className="w-8 h-8 rounded-full border-2 animate-spin"
        style={{ borderColor: "rgba(40,76,140,0.4)", borderTopColor: "#4f72ff" }}
      />
    </div>
  );
}

function Field({
  id,
  label,
  icon: Icon,
  type,
  autoComplete,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  icon: typeof Mail;
  type: string;
  autoComplete: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium mb-1.5" style={{ color: "#6b8cb8" }}>
        {label}
      </label>
      <div className="relative">
        <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "#2d4a6a" }} />
        <input
          id={id}
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          required
          autoComplete={autoComplete}
          className="w-full rounded-lg pl-10 pr-4 py-2.5 text-sm outline-none transition-all duration-150"
          style={{
            background: "rgba(6,13,28,0.8)",
            border: "1px solid rgba(30,60,110,0.5)",
            color: "#c8deff",
          }}
          onFocus={(event) => {
            event.target.style.borderColor = "rgba(79,114,255,0.6)";
            event.target.style.boxShadow = "0 0 0 3px rgba(79,114,255,0.08)";
          }}
          onBlur={(event) => {
            event.target.style.borderColor = "rgba(30,60,110,0.5)";
            event.target.style.boxShadow = "none";
          }}
        />
      </div>
    </div>
  );
}
