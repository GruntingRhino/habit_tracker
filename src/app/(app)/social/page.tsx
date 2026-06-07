"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Users,
  UserPlus,
  Flame,
  Trophy,
  Share2,
  Gift,
  Send,
  Check,
  X,
  Loader2,
  Sparkles,
  ChevronRight,
  Medal,
  Target,
  Zap,
  Star,
} from "lucide-react";

export default function SocialPage() {
  const [tab, setTab] = useState<"friends" | "challenges">("friends");

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm mb-6 text-[#3d5a7a] hover:text-[#7a9eff] transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Dashboard
      </Link>

      <div className="mb-8">
        <h1 className="text-xl font-semibold text-slate-100">Social</h1>
        <p className="mt-1 text-sm text-[#6b8cb8]">
          Stay connected. Compare streaks, compete in challenges, and grow together.
        </p>
      </div>

      <div className="mb-6 inline-flex rounded-xl border border-[#1f2937] bg-[#0f172a] p-1">
        {[
          ["friends", "Friends"],
          ["challenges", "Challenges"],
        ].map(([value, label]) => {
          const active = tab === value;
          return (
            <button
              key={value}
              onClick={() => setTab(value as "friends" | "challenges")}
              className={`rounded-lg px-5 py-2 text-sm font-semibold transition-all ${
                active
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-100"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {tab === "friends" && <FriendsTab />}
      {tab === "challenges" && <ChallengesTab />}
    </div>
  );
}

function FriendsTab() {
  const [inviteEmail, setInviteEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setSending(true);
    try {
      const res = await fetch("/api/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: inviteEmail }),
      });
      if (res.ok) {
        setSent(true);
        setInviteEmail("");
        setTimeout(() => setSent(false), 3000);
      }
    } catch {} finally {
      setSending(false);
    }
  };

  const handleShare = async () => {
    const shareData = {
      title: "LiveImproved",
      text: "Join me on LiveImproved — track habits, earn streaks, and level up daily.",
      url: "https://liveimproved.app",
    };
    if (typeof navigator !== "undefined" && navigator.share) {
      try { await navigator.share(shareData); } catch {}
    } else {
      await navigator.clipboard.writeText(shareData.url);
      alert("Link copied to clipboard!");
    }
  };

  return (
    <div className="space-y-5">
      {/* Invite by email */}
      <div className="rounded-3xl border border-[#1f2937] bg-[#020617] p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-300">
            <UserPlus className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-100">Invite a friend</h2>
            <p className="text-xs text-[#6b8cb8]">Send an email invite or share the app</p>
          </div>
        </div>
        <div className="flex gap-2">
          <input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleInvite()}
            placeholder="friend@email.com"
            className="flex-1 rounded-xl border border-[#334155] bg-[#111827] px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/40"
          />
          <button
            onClick={handleInvite}
            disabled={sending || !inviteEmail.trim()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : sent ? (
              <Check className="h-4 w-4" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {sent ? "Sent" : "Send"}
          </button>
        </div>
      </div>

      {/* Share via native share sheet */}
      <button
        onClick={handleShare}
        className="w-full rounded-2xl border border-blue-500/20 bg-blue-500/10 p-4 text-left transition-colors hover:bg-blue-500/15"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-300">
            <Share2 className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-slate-100">Share LiveImproved</h2>
            <p className="text-xs text-[#6b8cb8]">Messages, Instagram, WhatsApp, and more</p>
          </div>
          <ChevronRight className="h-4 w-4 text-slate-500" />
        </div>
      </button>

      {/* Your friends list */}
      <div className="rounded-3xl border border-[#1f2937] bg-[#020617] p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-300">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-100">Your friends</h2>
            <p className="text-xs text-[#6b8cb8]">Compare streaks and scores</p>
          </div>
        </div>
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[#1f2937] bg-[#0f172a] px-5 py-10">
          <Users className="h-8 w-8 text-slate-600" />
          <p className="text-sm text-[#6b8cb8]">No friends yet</p>
          <p className="text-xs text-slate-500 text-center max-w-xs">
            Invite someone using the link above. Once they join, you will see their streak and recent scores here.
          </p>
        </div>
      </div>
    </div>
  );
}

function ChallengesTab() {
  const [joined, setJoined] = useState<Record<string, boolean>>({});

  const toggleJoin = (name: string) => {
    setJoined((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const challenges = [
    {
      name: "7-Day Streak",
      participants: 12,
      daysLeft: 5,
      icon: Flame,
      color: "text-orange-400",
      bg: "bg-orange-500/10",
      desc: "Log every day for 7 consecutive days",
    },
    {
      name: "Perfect Week",
      participants: 8,
      daysLeft: 7,
      icon: Star,
      color: "text-yellow-400",
      bg: "bg-yellow-500/10",
      desc: "Score 8+ on all categories for a full week",
    },
    {
      name: "Early Bird",
      participants: 5,
      daysLeft: 3,
      icon: Zap,
      color: "text-blue-400",
      bg: "bg-blue-500/10",
      desc: "Log your entry before 8 AM for 5 consecutive days",
    },
    {
      name: "Deep Focus",
      participants: 3,
      daysLeft: 10,
      icon: Target,
      color: "text-purple-400",
      bg: "bg-purple-500/10",
      desc: "Complete 20+ hours of deep work this week",
    },
  ];

  return (
    <div className="space-y-4">
      {challenges.map(({ name, participants, daysLeft, icon: Icon, color, bg, desc }) => {
        const isJoined = joined[name];
        return (
          <div
            key={name}
            className="rounded-3xl border border-[#1f2937] bg-[#020617] p-5 transition-colors hover:border-[#2a3657]"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl ${bg}`}>
                  <Icon className={`h-6 w-6 ${color}`} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold text-slate-100">{name}</h3>
                    <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                      {daysLeft}d left
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-[#6b8cb8]">{desc}</p>
                  <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                    <Users className="h-3.5 w-3.5" />
                    <span>{participants} participating</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => toggleJoin(name)}
                className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
                  isJoined
                    ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                    : "border border-blue-500/30 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20"
                }`}
              >
                {isJoined ? (
                  <>
                    <Check className="h-3.5 w-3.5" /> Joined
                  </>
                ) : (
                  <>
                    <Trophy className="h-3.5 w-3.5" /> Join
                  </>
                )}
              </button>
            </div>
            {isJoined && (
              <div className="mt-4 rounded-2xl border border-[#1f2937] bg-[#0f172a] p-4">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-slate-400">Your progress</span>
                  <span className="text-xs text-[#6b8cb8]">Day 2 of {daysLeft}</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#111827]">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all duration-500"
                    style={{ width: `${Math.round((2 / daysLeft) * 100)}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}

      <div className="rounded-2xl border border-dashed border-[#1f2937] bg-[#0f172a] p-6 text-center">
        <Sparkles className="mx-auto h-6 w-6 text-slate-500" />
        <p className="mt-2 text-sm text-[#6b8cb8]">More challenges coming soon</p>
        <p className="mt-1 text-xs text-slate-500">
          Group challenges and head-to-head competitions are on the way.
        </p>
      </div>
    </div>
  );
}
