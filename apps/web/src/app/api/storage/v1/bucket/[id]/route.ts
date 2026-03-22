/**
 * GET    /api/storage/v1/bucket/[id]   — get bucket
 * PUT    /api/storage/v1/bucket/[id]   — update bucket
 * DELETE /api/storage/v1/bucket/[id]   — delete bucket
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { storageBuckets, storageObjects } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { validateApiKey } from "@/lib/auth/keys";

async function auth(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  return validateApiKey(authHeader.slice(7));
}

function formatBucket(b: typeof storageBuckets.$inferSelect) {
  return {
    id: b.id,
    name: b.name,
    public: b.public,
    fileSizeLimit: b.fileSizeLimit,
    allowedMimeTypes: b.allowedMimeTypes,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.createdAt.toISOString(),
  };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const keyInfo = await auth(req);
  if (!keyInfo) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const [bucket] = await db
    .select()
    .from(storageBuckets)
    .where(and(eq(storageBuckets.name, id), eq(storageBuckets.projectId, keyInfo.projectId)))
    .limit(1);

  if (!bucket) return Response.json({ error: "Bucket not found" }, { status: 404 });
  return Response.json({ data: formatBucket(bucket) });
}

const updateSchema = z.object({
  public: z.boolean().optional(),
  file_size_limit: z.number().int().positive().nullable().optional(),
  allowed_mime_types: z.array(z.string()).nullable().optional(),
});

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const keyInfo = await auth(req);
  if (!keyInfo) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  let body: unknown;
  try { body = await req.json(); } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (parsed.data.public !== undefined) updates.public = parsed.data.public;
  if (parsed.data.file_size_limit !== undefined) updates.fileSizeLimit = parsed.data.file_size_limit;
  if (parsed.data.allowed_mime_types !== undefined) updates.allowedMimeTypes = parsed.data.allowed_mime_types;

  const [bucket] = await db
    .update(storageBuckets)
    .set(updates)
    .where(and(eq(storageBuckets.name, id), eq(storageBuckets.projectId, keyInfo.projectId)))
    .returning();

  if (!bucket) return Response.json({ error: "Bucket not found" }, { status: 404 });
  return Response.json({ data: formatBucket(bucket) });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const keyInfo = await auth(req);
  if (!keyInfo) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const [bucket] = await db
    .select({ id: storageBuckets.id })
    .from(storageBuckets)
    .where(and(eq(storageBuckets.name, id), eq(storageBuckets.projectId, keyInfo.projectId)))
    .limit(1);

  if (!bucket) return Response.json({ error: "Bucket not found" }, { status: 404 });

  // Check bucket is empty
  const [obj] = await db
    .select({ id: storageObjects.id })
    .from(storageObjects)
    .where(eq(storageObjects.bucketId, bucket.id))
    .limit(1);

  if (obj) {
    return Response.json({ error: "Bucket is not empty. Use emptyBucket first." }, { status: 409 });
  }

  await db.delete(storageBuckets).where(eq(storageBuckets.id, bucket.id));
  return Response.json({ message: "Bucket deleted" });
}
