/**
 * GET  /api/dashboard/projects/[projectId]/user-columns  — get custom column defs
 * PUT  /api/dashboard/projects/[projectId]/user-columns  — replace custom column defs
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const columnDefSchema = z.object({
  key: z.string().min(1).max(64).regex(/^[a-z_][a-z0-9_]*$/, "Key must be snake_case"),
  label: z.string().min(1).max(64),
  type: z.enum(["text", "number", "boolean", "date"]),
});

const putSchema = z.object({
  columns: z.array(columnDefSchema).max(20),
});

export type UserColumnDef = z.infer<typeof columnDefSchema>;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  const [project] = await db
    .select({ userColumnDefs: projects.userColumnDefs })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

  return Response.json({ columns: project.userColumnDefs ?? [] });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  let body: unknown;
  try { body = await req.json(); } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = putSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const [project] = await db
    .update(projects)
    .set({ userColumnDefs: parsed.data.columns, updatedAt: new Date() })
    .where(eq(projects.id, projectId))
    .returning({ userColumnDefs: projects.userColumnDefs });

  if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

  return Response.json({ columns: project.userColumnDefs ?? [] });
}
