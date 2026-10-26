import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  ensureRlsRoles,
  grantProjectSchema,
  invalidateRlsCache,
} from "@/lib/db-role";
import {
  ensureProjectAuthTables,
  ensureProjectSchema,
  getProjectPool,
} from "@/lib/project-db";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  const [deleted] = await db
    .delete(projects)
    .where(eq(projects.id, projectId))
    .returning({ id: projects.id });

  if (!deleted) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  return Response.json({ success: true });
}

const schema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    enforceRls: z.boolean().optional(),
  })
  .refine((v) => v.name !== undefined || v.enforceRls !== undefined, {
    message: "Nothing to update",
  });

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  const body = schema.safeParse(await req.json());
  if (!body.success) {
    return Response.json({ error: body.error.flatten() }, { status: 400 });
  }

  const [project] = await db
    .update(projects)
    .set({
      ...(body.data.name !== undefined && { name: body.data.name }),
      ...(body.data.enforceRls !== undefined && { enforceRls: body.data.enforceRls }),
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId))
    .returning();

  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  if (body.data.enforceRls !== undefined) {
    invalidateRlsCache(projectId);
    if (body.data.enforceRls) {
      // Give the restricted roles access to the schema before requests switch to them.
      const client = await getProjectPool(project.databaseUrl).connect();
      try {
        const projectSchema = await ensureProjectSchema(client, projectId);
        await ensureProjectAuthTables(client, projectSchema);
        await ensureRlsRoles(client);
        await grantProjectSchema(client, projectSchema);
      } catch (err) {
        console.error("[enforce-rls] failed to grant roles, reverting flag:", err);
        await db.update(projects).set({ enforceRls: false }).where(eq(projects.id, projectId));
        invalidateRlsCache(projectId);
        return Response.json(
          { error: { formErrors: ["Failed to set up restricted roles for this project."] } },
          { status: 500 }
        );
      } finally {
        client.release();
      }
    }
  }

  return Response.json({ project });
}
