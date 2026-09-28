import { NextRequest, NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/owner";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/monitoring";
import { breakDownProject } from "@/lib/ai/breakdown";

export const maxDuration = 300;

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** Spark breaks the project into concrete tasks and appends them. */
export async function POST(_req: NextRequest, { params }: RouteParams) {
  const session = await getOwnerSession();
  try {
    const { id: projectId } = await params;
    const project = await prisma.project.findFirst({ where: { id: projectId, userId: session.user.id } });
    if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const drafts = await breakDownProject(project.title, project.specs ?? project.description ?? project.notes);
    if (!drafts.length) return NextResponse.json({ error: "The model couldn't break this down. Try adding a description." }, { status: 502 });

    const last = await prisma.projectTask.findFirst({ where: { projectId }, orderBy: { order: "desc" } });
    const offset = (last?.order ?? -1) + 1;
    const created = await prisma.$transaction(
      drafts.map((t, i) =>
        prisma.projectTask.create({
          data: { projectId, title: t.title, priority: t.priority, estimatedMinutes: t.estimatedMinutes, order: offset + i, status: "todo", area: project.area },
        })
      )
    );
    return NextResponse.json({ tasks: created, aiGenerated: true }, { status: 201 });
  } catch (error) {
    reportError({ context: "projects generate POST", error, userId: session.user.id });
    return NextResponse.json({ error: "Failed to generate tasks" }, { status: 500 });
  }
}
