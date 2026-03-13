import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const projects = await prisma.project.findMany({
      where: { userId: session.user.id },
      include: {
        tasks: {
          select: {
            id: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const projectsWithStats = projects.map((project) => {
      const totalTasks = project.tasks.length;
      const completedTasks = project.tasks.filter(
        (t) => t.status === "completed"
      ).length;
      const completionPercentage =
        totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

      return {
        ...project,
        taskCount: totalTasks,
        completedTaskCount: completedTasks,
        completionPercentage,
        tasks: undefined,
      };
    });

    return NextResponse.json(projectsWithStats);
  } catch (error) {
    console.error("[projects GET] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();

    if (!body.title || typeof body.title !== "string") {
      return NextResponse.json(
        { error: "title is required" },
        { status: 400 }
      );
    }

    const project = await prisma.project.create({
      data: {
        userId: session.user.id,
        title: body.title.trim(),
        description: body.description ?? undefined,
        specs: body.specs ?? undefined,
        priority: body.priority ?? "medium",
        status: body.status ?? "active",
        deadline: body.deadline ? new Date(body.deadline) : undefined,
      },
    });

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    console.error("[projects POST] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
