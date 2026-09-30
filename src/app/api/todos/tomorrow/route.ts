import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { addDays } from "date-fns";
import * as chrono from "chrono-node";
import { getOwnerSession } from "@/lib/owner";
import prisma from "@/lib/prisma";
import { keywordArea } from "@/lib/ai/router";
import { getStartOfDay } from "@/lib/utils";

const schema = z.object({ lines: z.array(z.string().trim().min(1).max(200)).min(1).max(20) });

/** Journal → "Plan tomorrow": each line becomes a to-do due tomorrow ("7pm upper workout" keeps its time). */
export async function POST(req: NextRequest) {
  const { user } = await getOwnerSession();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Add at least one line" }, { status: 400 });
  const tomorrow = addDays(getStartOfDay(new Date()), 1);
  const created = [];
  for (const line of parsed.data.lines) {
    const found = chrono.parse(line, tomorrow)[0];
    let due = new Date(tomorrow);
    due.setHours(21, 0, 0, 0); // by the end of the day
    let title = line;
    if (found?.start.isCertain("hour")) {
      const t = found.start.date();
      let h = t.getHours();
      if (!found.start.isCertain("meridiem") && h >= 1 && h <= 6) h += 12;
      due = new Date(tomorrow);
      due.setHours(h, t.getMinutes(), 0, 0);
      title = line.replace(found.text, " ").replace(/\s+/g, " ").trim() || line;
    }
    created.push(await prisma.todo.create({ data: { userId: user.id, title: title.charAt(0).toUpperCase() + title.slice(1), dueAt: due, area: keywordArea(title) ?? "general", source: "web" } }));
  }
  return NextResponse.json(created, { status: 201 });
}
