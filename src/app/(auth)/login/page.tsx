"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { LiveImprovedTileIcon } from "@/components/brand/LiveImprovedLogo";
import {
  AlertCircle,
  ArrowLeft,
  Loader2,
  Lock,
  Mail,
  User,
} from "lucide-react";

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
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [form, setForm] = useState<AuthFormState>(INITIAL_FORM);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    if (status === "authenticated" && session) {
      router.replace("/dashboard");
    }
  }, [session, status, router]);

  useEffect(() => {
    const requestedMode = searchParams.get("mode");
    if (requestedMode === "signup" || requestedMode === "signin") {
      setMode(requestedMode);
      setError("");
      setLoading(false);
      setGoogleLoading(false);
    }
  }, [searchParams]);

  function updateField<K extends keyof AuthFormState>(
    key: K,
    value: AuthFormState[K]
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError("");
    setLoading(false);
    setGoogleLoading(false);
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

  async function handleGoogleAuth() {
    setError("");
    setGoogleLoading(true);
    await signIn("google", { callbackUrl: "/dashboard" });
  }

  if (status === "loading") {
    return (
      <div
        className="flex min-h-dvh items-center justify-center"
        style={{ background: "#060d1c" }}
      >
        <div
          className="w-8 h-8 rounded-full border-2 animate-spin"
          style={{
            borderColor: "rgba(40,76,140,0.4)",
            borderTopColor: "#4f72ff",
          }}
        />
      </div>
    );
  }

  if (status === "authenticated") return null;

  return (
    <div
      className="relative flex min-h-dvh w-full flex-col overflow-x-hidden px-4 py-4 sm:px-6"
      style={{
        background: "#060d1c",
        paddingTop: "calc(1rem + env(safe-area-inset-top))",
        paddingBottom: "calc(1rem + env(safe-area-inset-bottom))",
      }}
    >
      <div className="relative z-20 flex w-full flex-shrink-0 items-center">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-[rgba(11,16,24,0.82)] px-4 py-2 text-sm font-medium text-[#c8deff] transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
      </div>
      <div
        className="absolute pointer-events-none"
        style={{
          width: "600px",
          height: "600px",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(79,114,255,0.12) 0%, transparent 70%)",
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
          background:
            "radial-gradient(circle, rgba(34,211,238,0.08) 0%, transparent 70%)",
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

      <main className="relative z-10 flex w-full flex-1 items-center justify-center py-6">
        <div className="w-full max-w-md">
          <div className="mb-6 text-center sm:mb-8">
            <LiveImprovedTileIcon
              className="mx-auto mb-4 h-14 w-14 sm:h-16 sm:w-16"
              style={{
                filter: "drop-shadow(0 0 24px rgba(6,13,28,0.55))",
              }}
            />
            <h1
              className="text-3xl font-bold mb-1"
              style={{
                fontFamily: "var(--font-instrument-serif), Georgia, serif",
                background:
                  "linear-gradient(135deg, #c8deff 0%, #93b8ff 60%, #7eb3ff 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              LiveImproved
            </h1>
            <p className="text-sm" style={{ color: "#2d4a6a" }}>
              Access your account and continue where you left off
            </p>
          </div>

        <div
          className="relative overflow-hidden rounded-2xl p-5 sm:p-8"
          style={{
            background:
              "linear-gradient(135deg, rgba(12,24,48,0.95) 0%, rgba(9,18,34,0.98) 100%)",
            border: "1px solid rgba(40,76,140,0.3)",
            boxShadow:
              "0 0 40px rgba(6,13,28,0.8), inset 0 1px 0 rgba(79,114,255,0.1)",
          }}
        >
          <div
            className="-mx-5 mb-5 h-px flex-shrink-0 rounded-t-2xl sm:-mx-8 sm:mb-6"
            style={{
              background:
                "linear-gradient(90deg, transparent, rgba(79,114,255,0.3), transparent)",
            }}
          />

          <div
            className="mb-6 grid grid-cols-2 rounded-xl p-1"
            style={{
              background: "rgba(6,13,28,0.7)",
              border: "1px solid rgba(30,60,110,0.45)",
            }}
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
                          background:
                            "linear-gradient(135deg, #4f72ff 0%, #3d5ee6 100%)",
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
            style={{
              color: "#c8deff",
              fontFamily: "var(--font-instrument-serif), Georgia, serif",
            }}
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
              <AlertCircle
                className="w-4 h-4 flex-shrink-0"
                style={{ color: "#ff4d6a" }}
              />
              <p className="text-sm" style={{ color: "#ff4d6a" }}>
                {error}
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={handleGoogleAuth}
            disabled={googleLoading || loading}
            className="mb-5 flex w-full items-center justify-center gap-3 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: "rgba(6,13,28,0.85)",
              border: "1px solid rgba(30,60,110,0.5)",
              color: "#dce9ff",
            }}
          >
            {googleLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <GoogleGlyph />
            )}
            Continue with Google
          </button>

          <div className="mb-5 flex items-center gap-3">
            <div
              className="h-px flex-1"
              style={{ background: "rgba(30,60,110,0.45)" }}
            />
            <span
              className="flex-shrink-0 text-xs uppercase tracking-[0.18em]"
              style={{ color: "#2d4a6a" }}
            >
              Or
            </span>
            <div
              className="h-px flex-1"
              style={{ background: "rgba(30,60,110,0.45)" }}
            />
          </div>

          <form onSubmit={handleCredentialsSubmit} className="space-y-5">
            {mode === "signup" && (
              <Field
                id="name"
                label="Display Name"
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
              placeholder={mode === "signin" ? "Enter your password" : "Minimum 12 characters"}
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
              disabled={loading || googleLoading}
              className="w-full flex items-center justify-center gap-2 text-white font-semibold py-2.5 rounded-lg text-sm transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: "linear-gradient(135deg, #4f72ff 0%, #3d5ee6 100%)",
                boxShadow:
                  "0 0 20px rgba(79,114,255,0.35), 0 2px 8px rgba(0,0,0,0.3)",
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
      </main>
    </div>
  );
}

function AuthPageLoading() {
  return (
    <div
      className="flex min-h-dvh items-center justify-center"
      style={{ background: "#060d1c" }}
    >
      <div
        className="w-8 h-8 rounded-full border-2 animate-spin"
        style={{
          borderColor: "rgba(40,76,140,0.4)",
          borderTopColor: "#4f72ff",
        }}
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
      <label
        htmlFor={id}
        className="block text-sm font-medium mb-1.5"
        style={{ color: "#6b8cb8" }}
      >
        {label}
      </label>
      <div
        className="flex items-center rounded-lg"
        style={{
          background: "rgba(6,13,28,0.8)",
          border: "1px solid rgba(30,60,110,0.5)",
        }}
      >
        <Icon
          className="ml-3 h-4 w-4 flex-shrink-0"
          style={{ color: "#2d4a6a" }}
        />
        <input
          id={id}
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          required
          autoComplete={autoComplete}
          className="min-w-0 flex-1 rounded-lg bg-transparent px-3 py-2.5 text-sm outline-none transition-all duration-150"
          style={{
            color: "#c8deff",
          }}
          onFocus={(event) => {
            const wrapper = event.currentTarget.parentElement;
            if (!wrapper) return;
            wrapper.style.borderColor = "rgba(79,114,255,0.6)";
            wrapper.style.boxShadow = "0 0 0 3px rgba(79,114,255,0.08)";
          }}
          onBlur={(event) => {
            const wrapper = event.currentTarget.parentElement;
            if (!wrapper) return;
            wrapper.style.borderColor = "rgba(30,60,110,0.5)";
            wrapper.style.boxShadow = "none";
          }}
        />
      </div>
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.2 1.2-.9 2.3-1.9 3.1l3.1 2.4c1.8-1.7 2.9-4.1 2.9-6.9 0-.7-.1-1.4-.2-2H12Z"
      />
      <path
        fill="#34A853"
        d="M12 21c2.6 0 4.8-.9 6.4-2.4l-3.1-2.4c-.9.6-2 .9-3.3.9-2.5 0-4.6-1.7-5.4-4H3.4v2.5A9.7 9.7 0 0 0 12 21Z"
      />
      <path
        fill="#FBBC05"
        d="M6.6 13.1a5.8 5.8 0 0 1 0-3.7V6.9H3.4a9.7 9.7 0 0 0 0 8.7l3.2-2.5Z"
      />
      <path
        fill="#4285F4"
        d="M12 6.8c1.4 0 2.7.5 3.7 1.4l2.8-2.8A9.2 9.2 0 0 0 12 3a9.7 9.7 0 0 0-8.6 3.9l3.2 2.5c.8-2.3 2.9-3.9 5.4-3.9Z"
      />
    </svg>
  );
}
