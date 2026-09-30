"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Tabs } from "@/components/ui";
import ChatThread from "@/components/ChatThread";
import ScoreBoard from "@/components/ScoreBoard";
import JournalView from "@/components/JournalView";
import NotesList from "@/components/NotesList";
import ProfilePanel from "@/components/ProfilePanel";

type Tab = "chat" | "journal" | "notes" | "profile";

function ChatAndJournal() {
  const params = useSearchParams();
  const initial = params.get("tab") as Tab | null;
  const [tab, setTab] = useState<Tab>(initial && ["journal", "notes", "profile"].includes(initial) ? initial : "chat");
  const tabs = <Tabs value={tab} options={[["chat", "Chat"], ["journal", "Journal"], ["notes", "Notes"], ["profile", "Profile"]]} onChange={setTab} />;
  if (tab === "chat") {
    return (
      <div className="min-page flex h-[calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-76px)] flex-col lg:h-[calc(100vh-6rem)]">
        <div className="mb-1 flex justify-center">{tabs}</div>
        <ChatThread background={<ScoreBoard />} />
      </div>
    );
  }
  return (
    <div className="min-page">
      <div className="mb-4 flex justify-center">{tabs}</div>
      {tab === "journal" ? <JournalView /> : tab === "notes" ? <NotesList /> : <ProfilePanel />}
    </div>
  );
}

/** Chat & Journal: talk to it, write the day down, notes, and what it knows about you. */
export default function ChatPage() {
  return (
    <Suspense>
      <ChatAndJournal />
    </Suspense>
  );
}
