"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/ui";
import ScheduleView from "@/components/ScheduleView";

function Schedule() {
  const params = useSearchParams();
  return (
    <div className="min-page">
      <PageHeader title="Schedule" />
      <ScheduleView googleResult={params.get("google")} />
    </div>
  );
}

/** Schedule: the day's timeline (calendar + plan), events, Google Calendar, his fixed week. */
export default function SchedulePage() {
  return (
    <Suspense>
      <Schedule />
    </Suspense>
  );
}
