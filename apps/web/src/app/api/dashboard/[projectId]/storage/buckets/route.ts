import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { projects, storageBuckets } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  public: z.boolean().optional(),
  fileSizeLimit: z.number().int().positive().nullable().optional(),
  allowedMimeTypes: z.array(z.string()).nullable().optional(),
});

const updateSchema = z.object({
  id: z.string().uuid(),
  public: z.boolean().optional(),
  fileSizeLimit: z.number().int().positive().nullable().optional(),
  allowedMimeTypes: z.array(z.string()).nullable().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  const project = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project.length) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  const body = createSchema.safeParse(await req.json());
  if (!body.success) {
    return Response.json({ error: body.error.flatten() }, { status: 400 });
  }

  const { name, public: isPublic, fileSizeLimit, allowedMimeTypes } = body.data;

  // Check for duplicate bucket name within this project
  const [existing] = await db
    .select({ id: storageBuckets.id })
    .from(storageBuckets)
    .where(and(eq(storageBuckets.projectId, projectId), eq(storageBuckets.name, name)))
    .limit(1);

  if (existing) {
    return Response.json({ error: `Bucket "${name}" already exists` }, { status: 409 });
  }

  const [bucket] = await db
    .insert(storageBuckets)
    .values({
      projectId,
      name,
      public: isPublic ?? false,
      fileSizeLimit: fileSizeLimit ?? null,
      allowedMimeTypes: allowedMimeTypes ?? null,
    })
    .returning();

  return Response.json({ bucket }, { status: 201 });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  const body = updateSchema.safeParse(await req.json());
  if (!body.success) {
    return Response.json({ error: body.error.flatten() }, { status: 400 });
  }

  const { id, ...updates } = body.data;

  const [bucket] = await db
    .update(storageBuckets)
    .set(updates)
    .where(and(eq(storageBuckets.id, id), eq(storageBuckets.projectId, projectId)))
    .returning();

  if (!bucket) {
    return Response.json({ error: "Bucket not found" }, { status: 404 });
  }

  return Response.json({ bucket });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const { searchParams } = new URL(req.url);
  const bucketId = searchParams.get("id");

  if (!bucketId) {
    return Response.json({ error: "Missing bucket id" }, { status: 400 });
  }

  const [deleted] = await db
    .delete(storageBuckets)
    .where(and(eq(storageBuckets.id, bucketId), eq(storageBuckets.projectId, projectId)))
    .returning({ id: storageBuckets.id });

  if (!deleted) {
    return Response.json({ error: "Bucket not found" }, { status: 404 });
  }

  return Response.json({ success: true });
}
