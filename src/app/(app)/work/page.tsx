"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader, Tabs } from "@/components/ui";
import TasksView from "@/components/TasksView";
import HabitsView from "@/components/HabitsView";

function Work() {
  const params = useSearchParams();
  const [tab, setTab] = useState<"tasks" | "habits">(params.get("tab") === "habits" ? "habits" : "tasks");
  return (
    <div className="min-page">
      <PageHeader title="Work" action={<Tabs value={tab} options={[["tasks", "Tasks"], ["habits", "Habits"]]} onChange={setTab} />} />
      {tab === "tasks" ? <TasksView /> : <HabitsView />}
    </div>
  );
}

/** Work: tasks & projects, and habits & workouts. */
export default function WorkPage() {
  return (
    <Suspense>
      <Work />
    </Suspense>
  );
}
