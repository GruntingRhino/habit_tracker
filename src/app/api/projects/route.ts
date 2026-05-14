import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/monitoring";

const VALID_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
const VALID_STATUSES = ["active", "completed", "on_hold", "archived"] as const;

const projectPostSchema = z.object({
  title: z.string().trim().min(1, "title is required").max(200),
  description: z.string().trim().max(2000).optional(),
  specs: z.string().trim().max(10000).optional(),
  priority: z.enum(VALID_PRIORITIES).default("medium"),
  status: z.enum(VALID_STATUSES).default("active"),
  deadline: z.string().datetime({ offset: true }).optional(),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const projects = await prisma.project.findMany({
      where: { userId: session.user.id },
      include: { tasks: { select: { id: true, status: true } } },
      orderBy: { createdAt: "desc" },
    });

    const projectsWithStats = projects.map((project) => {
      const totalTasks = project.tasks.length;
      const completedTasks = project.tasks.filter((t) => t.status === "completed").length;
      return {
        ...project,
        taskCount: totalTasks,
        completedTaskCount: completedTasks,
        completionPercentage: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
        tasks: undefined,
      };
    });

    return NextResponse.json(projectsWithStats);
  } catch (error) {
    reportError({ context: "projects GET", error, userId: session.user.id });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rawBody = await req.json();
    const parsed = projectPostSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
        { status: 400 }
      );
    }

    const project = await prisma.project.create({
      data: {
        userId: session.user.id,
        title: parsed.data.title,
        description: parsed.data.description,
        specs: parsed.data.specs,
        priority: parsed.data.priority,
        status: parsed.data.status,
        deadline: parsed.data.deadline ? new Date(parsed.data.deadline) : undefined,
      },
    });

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    reportError({ context: "projects POST", error, userId: session.user.id });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
