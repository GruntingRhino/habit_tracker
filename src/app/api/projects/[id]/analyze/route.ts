import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export interface TaskAnalysis {
  taskId: string;
  estimatedHours: number;
  effortLabel: "light" | "moderate" | "heavy" | "very-heavy";
}

export interface ProjectAnalysis {
  trackStatus: "on_track" | "at_risk" | "behind" | "no_deadline";
  message: string;
  totalEstimatedHours: number;
  remainingHours: number;
  daysLeft: number | null;
  requiredHoursPerDay: number | null;
  currentPacePerDay: number | null;
  tasks: TaskAnalysis[];
}

function estimateTaskHours(task: {
  priority: string;
  estimatedMinutes: number | null;
  description: string | null;
  title: string;
}): number {
  // If user gave an estimate, use it directly
  if (task.estimatedMinutes && task.estimatedMinutes > 0) {
    return task.estimatedMinutes / 60;
  }

  // Heuristic: base hours by priority
  const base: Record<string, number> = {
    high: 3,
    medium: 1.5,
    low: 0.75,
  };
  let hours = base[task.priority] ?? 1.5;

  // Adjust by description length (more detail = more complexity)
  const descLen = (task.description ?? "").length + task.title.length;
  if (descLen > 200) hours *= 1.5;
  else if (descLen > 100) hours *= 1.2;

  return Math.round(hours * 10) / 10;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId } = await params;

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: session.user.id },
    include: {
      tasks: true,
    },
  });

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const remainingTasks = project.tasks.filter(
    (t) => t.status !== "completed"
  );
  const completedTasks = project.tasks.filter(
    (t) => t.status === "completed"
  );

  // Per-task effort estimates
  const taskAnalyses: TaskAnalysis[] = project.tasks.map((t) => {
    const hours = estimateTaskHours(t);
    let effortLabel: TaskAnalysis["effortLabel"] = "light";
    if (hours >= 6) effortLabel = "very-heavy";
    else if (hours >= 3) effortLabel = "heavy";
    else if (hours >= 1.5) effortLabel = "moderate";
    return { taskId: t.id, estimatedHours: hours, effortLabel };
  });

  const totalEstimatedHours = taskAnalyses.reduce(
    (s, t) => s + t.estimatedHours,
    0
  );
  const remainingHours = taskAnalyses
    .filter((ta) => remainingTasks.find((t) => t.id === ta.taskId))
    .reduce((s, t) => s + t.estimatedHours, 0);

  if (!project.deadline) {
    return NextResponse.json({
      trackStatus: "no_deadline",
      message: "No deadline set — add a deadline to track progress.",
      totalEstimatedHours: Math.round(totalEstimatedHours * 10) / 10,
      remainingHours: Math.round(remainingHours * 10) / 10,
      daysLeft: null,
      requiredHoursPerDay: null,
      currentPacePerDay: null,
      tasks: taskAnalyses,
    } satisfies ProjectAnalysis);
  }

  const now = new Date();
  const deadline = new Date(project.deadline);
  const daysLeft = Math.max(
    0,
    Math.ceil((deadline.getTime() - now.getTime()) / 86400000)
  );

  // Estimate current pace from completed tasks
  const createdAt = new Date(project.createdAt);
  const daysElapsed = Math.max(
    1,
    Math.ceil((now.getTime() - createdAt.getTime()) / 86400000)
  );
  const completedHours = taskAnalyses
    .filter((ta) => completedTasks.find((t) => t.id === ta.taskId))
    .reduce((s, t) => s + t.estimatedHours, 0);
  const currentPacePerDay = completedHours / daysElapsed;

  let requiredHoursPerDay: number | null = null;
  let trackStatus: ProjectAnalysis["trackStatus"] = "on_track";
  let message = "";

  if (daysLeft === 0) {
    trackStatus = remainingTasks.length === 0 ? "on_track" : "behind";
    requiredHoursPerDay = null;
    message =
      remainingTasks.length === 0
        ? "Project complete — deadline met!"
        : `Deadline is today and ${remainingTasks.length} task${remainingTasks.length > 1 ? "s" : ""} remain.`;
  } else {
    requiredHoursPerDay = remainingHours / daysLeft;

    if (remainingTasks.length === 0) {
      trackStatus = "on_track";
      message = "All tasks done — ahead of schedule!";
    } else if (requiredHoursPerDay <= 1) {
      trackStatus = "on_track";
      message = `On track. ${daysLeft} days left, ${remainingHours.toFixed(1)}h of work remaining (~${requiredHoursPerDay.toFixed(1)}h/day).`;
    } else if (requiredHoursPerDay <= 3) {
      trackStatus = "at_risk";
      message = `At risk. Requires ${requiredHoursPerDay.toFixed(1)}h/day over the next ${daysLeft} days to finish on time.`;
    } else {
      trackStatus = "behind";
      message = `Behind schedule. Needs ${requiredHoursPerDay.toFixed(1)}h/day — likely unrealistic. Either cut scope or push the deadline.`;
    }
  }

  return NextResponse.json({
    trackStatus,
    message,
    totalEstimatedHours: Math.round(totalEstimatedHours * 10) / 10,
    remainingHours: Math.round(remainingHours * 10) / 10,
    daysLeft,
    requiredHoursPerDay:
      requiredHoursPerDay !== null
        ? Math.round(requiredHoursPerDay * 10) / 10
        : null,
    currentPacePerDay: Math.round(currentPacePerDay * 10) / 10,
    tasks: taskAnalyses,
  } satisfies ProjectAnalysis);
}
