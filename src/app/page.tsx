import Link from "next/link";
import { getServerSession } from "next-auth";
import {
  ArrowRight,
  Brain,
  ChevronRight,
  Clock3,
  Dumbbell,
  ShieldCheck,
  Target,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { authOptions } from "@/lib/auth";
import HomepageEffects from "@/components/HomepageEffects";

const laneCards = [
  { name: "Physical", score: 82, color: "#4f72ff" },
  { name: "Mental", score: 74, color: "#a06bff" },
  { name: "Discipline", score: 91, color: "#2ed889" },
  { name: "Focus", score: 77, color: "#2cb6ff" },
  { name: "Financial", score: 65, color: "#ff7ab8" },
];

const features = [
  {
    icon: Clock3,
    title: "One daily entry, one honest score",
    body: "Sleep, deep work, training, money, meals, and execution roll into one system instead of five disconnected trackers.",
  },
  {
    icon: Target,
    title: "Queue pressure is visible",
    body: "Active work is prioritized automatically, overdue items stay obvious, and completion actually changes the score.",
  },
  {
    icon: Dumbbell,
    title: "Training progression is first-class",
    body: "Routines, sessions, and strength progression live in the same app as habits and daily scoring.",
  },
  {
    icon: Wallet,
    title: "Financial tracking is contextual",
    body: "Money activity contributes to the same operating picture instead of becoming a separate guilt dashboard.",
  },
  {
    icon: ShieldCheck,
    title: "Clean, focused feedback",
    body: "The product stays centered on execution, consistency, and measurable progress instead of noisy vanity mechanics.",
  },
  {
    icon: TrendingUp,
    title: "Progress is measurable over time",
    body: "Analytics and progression views turn daily logs into real trends you can inspect and act on.",
  },
];

function DemoPhone() {
  return (
    <div
      data-reveal="scale"
      className="hp-reveal hp-reveal-scale relative mx-auto w-[320px] rounded-[36px] border border-white/10 bg-[#0f1525] p-3 shadow-[0_30px_90px_-35px_rgba(12,18,30,0.9)]"
    >
      <div className="rounded-[28px] border border-white/8 bg-[#0b1018] p-5">
        <div className="mb-5 flex items-start justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--text-muted)]">
              Tuesday, May 19
            </p>
            <h3 className="mt-1 text-xl font-semibold text-white">Today</h3>
          </div>
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-[#4f72ff]/30 bg-[#4f72ff]/10 text-2xl font-semibold text-white">
            78
          </div>
        </div>

        <div className="space-y-3">
          {laneCards.map((lane) => (
            <div key={lane.name}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-[var(--text-secondary)]">{lane.name}</span>
                <span className="font-medium text-white">{lane.score}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/6">
                <div
                  className="hp-bar-fill h-full rounded-full"
                  style={{ width: `${lane.score}%`, background: lane.color }}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-2xl border border-white/6 bg-white/[0.03] p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium text-white">Action Queue</p>
            <span className="rounded-full bg-rose-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-rose-200">
              1 overdue
            </span>
          </div>
          <div className="space-y-2">
            {[
              ["Ship math study plan", "High", "May 21"],
              ["Finish upper-body session", "Medium", "Tonight"],
              ["Review spending", "Low", "Friday"],
            ].map(([title, priority, due]) => (
              <div key={title} className="rounded-xl border border-white/6 bg-black/20 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-[#dce9ff]">{title}</span>
                  <span className="text-[10px] uppercase tracking-[0.16em] text-[#6b8cb8]">
                    {priority}
                  </span>
                </div>
                <div className="mt-1 text-xs text-[var(--text-muted)]">Due {due}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default async function RootPage() {
  const session = await getServerSession(authOptions);
  const isAuthenticated = !!session?.user?.id;

  return (
    <div className="homepage-shell min-h-screen overflow-x-hidden bg-[#0b1018] text-[var(--text-primary)]">
      <HomepageEffects />
      <div className="homepage-grid pointer-events-none fixed inset-0" />
      <div className="homepage-column pointer-events-none fixed inset-y-0 left-[9%] hidden w-px bg-white/6 lg:block" />
      <div className="homepage-column pointer-events-none fixed inset-y-0 right-[9%] hidden w-px bg-white/6 lg:block" />

      <header className="sticky top-0 z-40 border-b border-white/6 bg-[rgba(11,16,24,0.88)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 md:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/8 bg-[#121925] shadow-[0_18px_40px_-24px_rgba(0,0,0,0.85)]">
              <Brain className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="text-sm font-semibold tracking-[-0.01em] text-white">LiveImproved</div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
                Daily operating system
              </div>
            </div>
          </div>

          <nav className="hidden items-center gap-2 md:flex">
            <a href="#how" className="rounded-full px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:text-white">
              How it works
            </a>
            <a href="#features" className="rounded-full px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:text-white">
              Features
            </a>
            <a href="#score" className="rounded-full px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:text-white">
              The score
            </a>
          </nav>

          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-full border border-[#4f72ff]/20 bg-[#152033] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_40px_-18px_rgba(0,0,0,0.8)] transition-all hover:border-[#4f72ff]/40 hover:bg-[#18253b]"
              >
                Open dashboard
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <>
                <Link
                  href="/login?mode=signin"
                  className="hidden rounded-full border border-white/10 px-4 py-2.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:text-white md:inline-flex"
                >
                  Sign in
                </Link>
                <Link
                  href="/login?mode=signup"
                  className="inline-flex items-center gap-2 rounded-full border border-[#4f72ff]/20 bg-[#152033] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_40px_-18px_rgba(0,0,0,0.8)] transition-all hover:border-[#4f72ff]/40 hover:bg-[#18253b]"
                >
                  Create account
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        <section className="relative px-4 pb-20 pt-16 md:px-8 md:pb-28 md:pt-24">
          <div className="mx-auto grid max-w-7xl items-center gap-16 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="hp-reveal hp-reveal-up" data-reveal="up">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.02] px-4 py-2 text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--text-secondary)]">
                <span className="h-2 w-2 rounded-full bg-[#4f72ff]" />
                Measurable daily improvement
              </div>
              <h1 className="mt-6 max-w-4xl text-5xl font-semibold leading-[1.02] tracking-[-0.045em] text-white md:text-7xl">
                Track what makes
                <br />
                you better.
              </h1>
              <p className="mt-6 max-w-2xl text-[17px] leading-8 tracking-[-0.01em] text-[var(--text-secondary)]">
                Sleep, training, focus, money, meals, habits, and execution in one score-driven system.
                A clear daily read on how you operated, what improved, and what still needs work.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                {isAuthenticated ? (
                  <Link
                    href="/dashboard"
                    className="inline-flex items-center gap-2 rounded-full border border-[#4f72ff]/20 bg-[#152033] px-6 py-3.5 text-sm font-semibold text-white shadow-[0_18px_50px_-20px_rgba(0,0,0,0.85)] transition-all hover:translate-y-[-1px] hover:border-[#4f72ff]/40 hover:bg-[#18253b]"
                  >
                    Open the app
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                ) : (
                  <>
                    <Link
                      href="/login?mode=signup"
                      className="inline-flex items-center gap-2 rounded-full border border-[#4f72ff]/20 bg-[#152033] px-6 py-3.5 text-sm font-semibold text-white shadow-[0_18px_50px_-20px_rgba(0,0,0,0.85)] transition-all hover:translate-y-[-1px] hover:border-[#4f72ff]/40 hover:bg-[#18253b]"
                    >
                      Create account
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                    <Link
                      href="/login?mode=signin"
                      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-6 py-3.5 text-sm font-medium text-[var(--text-primary)]"
                    >
                      Sign in
                    </Link>
                  </>
                )}
              </div>

              <div className="mt-12 grid gap-4 sm:grid-cols-3">
                {[
                  ["Real categories", "Physical, Mental, Discipline, Focus, Financial"],
                  ["Task execution", "Active queue items auto-sort by urgency and due date"],
                  ["Scoring model", "Daily inputs roll into one honest operating score"],
                ].map(([title, body], index) => (
                  <div
                    key={title}
                    data-reveal="up"
                    className="hp-reveal hp-reveal-up rounded-3xl border border-white/8 bg-[#111823] p-4"
                    style={{ transitionDelay: `${index * 90}ms` }}
                  >
                    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
                      {title}
                    </div>
                    <div className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{body}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative hp-reveal hp-reveal-right" data-reveal="right">
              <div className="pointer-events-none absolute inset-x-10 bottom-[-1rem] h-px bg-white/10" />
              <DemoPhone />
            </div>
          </div>
        </section>

        <section className="border-y border-white/6 px-4 py-16 md:px-8">
          <div className="mx-auto grid max-w-7xl gap-6 md:grid-cols-4">
            {[
              ["Daily score", "Weighted from the data you log, not vanity counters."],
              ["Backfill support", "Missed days can be corrected instead of silently poisoning trends."],
              ["Progression tracking", "Workouts and performance trends stay connected to the rest of the system."],
              ["Execution clarity", "Active work, habits, and daily inputs stay connected instead of scattering across multiple tools."],
            ].map(([title, body], index) => (
              <div
                key={title}
                data-reveal="up"
                className="hp-reveal hp-reveal-up"
                style={{ transitionDelay: `${index * 80}ms` }}
              >
                <div className="text-3xl text-white md:text-4xl" style={{ fontFamily: "var(--font-instrument-serif), Georgia, serif" }}>
                  {title}
                </div>
                <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="how" className="px-4 py-20 md:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="hp-reveal hp-reveal-up text-center" data-reveal="up">
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--text-muted)]">
                How it works
              </div>
              <h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-white md:text-6xl">
                Your whole day,
                <span className="text-[#7eb3ff]"> scored honestly.</span>
              </h2>
              <p className="mx-auto mt-4 max-w-3xl text-lg leading-8 text-[var(--text-secondary)]">
                LiveImproved turns daily behavior into a measurable operating picture without splitting the signal across disconnected apps.
              </p>
            </div>

            <div className="mt-14 grid gap-6 lg:grid-cols-4">
              {[
                {
                  step: "Step 01",
                  title: "Log the day",
                  body: "Daily entry captures sleep, training, steps, deep work, screen time, food, money, and notes in one flow.",
                },
                {
                  step: "Step 02",
                  title: "Update habits",
                  body: "Habits feed the actual lane categories used by the product: Physical, Mental, Discipline, Focus, and Financial.",
                },
                {
                  step: "Step 03",
                  title: "Work the queue",
                  body: "Action Queue items carry real deadlines and task progress. Overdue active work stays visible and affects execution pressure.",
                },
                {
                  step: "Step 04",
                  title: "Review progression",
                  body: "Analytics and workout progression show what is improving, what is stalling, and where the score is lying to you less than memory would.",
                },
              ].map((step, index) => (
                <div
                  key={step.step}
                  data-reveal="up"
                  className="hp-reveal hp-reveal-up rounded-[28px] border border-white/8 bg-[#111823] p-6"
                  style={{ transitionDelay: `${index * 90}ms` }}
                >
                  <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">
                    {step.step}
                  </div>
                  <h3 className="mt-4 text-[26px] font-semibold leading-[1.12] tracking-[-0.03em] text-white">
                    {step.title}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{step.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="px-4 py-20 md:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="hp-reveal hp-reveal-up mb-10" data-reveal="up">
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--text-muted)]">
                In the app
              </div>
              <h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-white md:text-6xl">
                Every input,
                <span className="text-[#7eb3ff]"> weighted correctly.</span>
              </h2>
            </div>

            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {features.map(({ icon: Icon, title, body }, index) => (
                <div
                  key={title}
                  data-reveal="up"
                  className="hp-reveal hp-reveal-up rounded-[28px] border border-white/8 bg-[#111823] p-6 transition-colors hover:bg-[#131c29]"
                  style={{ transitionDelay: `${index * 70}ms` }}
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#4f72ff]/10 text-[#93b4ff]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-5 text-[22px] font-semibold tracking-[-0.02em] text-white">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="score" className="px-4 py-20 md:px-8">
          <div
            data-reveal="up"
            className="hp-reveal hp-reveal-up mx-auto max-w-6xl rounded-[36px] border border-white/8 bg-[#111823] px-6 py-12 md:px-12"
          >
            <div className="text-center">
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--text-muted)]">
                The score
              </div>
              <h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-white md:text-6xl">
                One number.
                <span className="text-[#7eb3ff]"> Brutally fair.</span>
              </h2>
              <p className="mx-auto mt-4 max-w-3xl text-lg leading-8 text-[var(--text-secondary)]">
                The score exists to compress your day into a useful verdict, not to flatter you. Better sleep, real work, training, and financial motion move it up. Neglect and overdue execution drag it down.
              </p>
            </div>

            <div className="mt-12 grid items-center gap-10 lg:grid-cols-[320px_1fr]">
              <div
                data-reveal="left"
                className="hp-reveal hp-reveal-left mx-auto flex h-72 w-72 items-center justify-center rounded-full border border-[#4f72ff]/20 bg-[#0b1018]"
              >
                <div className="flex h-56 w-56 flex-col items-center justify-center rounded-full border border-white/8 bg-[#0f1621]">
                  <div className="text-7xl text-white" style={{ fontFamily: "var(--font-instrument-serif), Georgia, serif" }}>
                    78
                  </div>
                  <div className="mt-2 text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">
                    Today&apos;s score
                  </div>
                </div>
              </div>

              <div className="grid gap-4">
                {laneCards.map((lane, index) => (
                  <div
                    key={lane.name}
                    data-reveal="right"
                    className="hp-reveal hp-reveal-right rounded-2xl border border-white/8 bg-white/[0.03] p-4"
                    style={{ transitionDelay: `${index * 70}ms` }}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-medium text-white">{lane.name}</span>
                      <span className="text-sm text-[var(--text-secondary)]">{lane.score}/100</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white/6">
                      <div className="hp-bar-fill h-full rounded-full" style={{ width: `${lane.score}%`, background: lane.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 pb-24 pt-8 md:px-8">
          <div className="hp-reveal hp-reveal-up mx-auto max-w-5xl text-center" data-reveal="up">
            <h2 className="text-4xl font-semibold tracking-[-0.04em] text-white md:text-6xl">
              Stop estimating.
              <span className="text-[#7eb3ff]"> Start scoring.</span>
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-[var(--text-secondary)]">
              Create an account, sign in, and start logging. The system becomes useful as soon as the first real day is entered.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              {isAuthenticated ? (
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-2 rounded-full bg-[linear-gradient(135deg,#4f72ff_0%,#2cb6ff_100%)] px-6 py-3.5 text-sm font-semibold text-white"
                >
                  Open dashboard
                  <ChevronRight className="h-4 w-4" />
                </Link>
              ) : (
                <>
                  <Link
                    href="/login?mode=signup"
                    className="inline-flex items-center gap-2 rounded-full bg-[linear-gradient(135deg,#4f72ff_0%,#2cb6ff_100%)] px-6 py-3.5 text-sm font-semibold text-white"
                  >
                    Create account
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                  <Link
                    href="/login?mode=signin"
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-6 py-3.5 text-sm font-medium text-white"
                  >
                    Sign in
                  </Link>
                </>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
