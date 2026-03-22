/**
 * DELETE /api/storage/v1/object/[bucket]
 * Body: { prefixes: string[] }
 * Delete multiple objects from a bucket.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { storageBuckets, storageObjects } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { validateApiKey } from "@/lib/auth/keys";
import { getStorageClient } from "@/lib/storage/client";

const bodySchema = z.object({
  prefixes: z.array(z.string()).min(1),
});

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ bucket: string }> }) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const keyInfo = await validateApiKey(authHeader.slice(7));
  if (!keyInfo) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { bucket: bucketName } = await params;

  let body: unknown;
  try { body = await req.json(); } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const [bucket] = await db
    .select()
    .from(storageBuckets)
    .where(and(eq(storageBuckets.name, bucketName), eq(storageBuckets.projectId, keyInfo.projectId)))
    .limit(1);

  if (!bucket) return Response.json({ error: "Bucket not found" }, { status: 404 });

  const { prefixes } = parsed.data;

  // Delete from storage backend
  const storage = await getStorageClient(keyInfo.projectId);
  await storage.deleteObjects(bucket.name, prefixes);

  // Delete from DB
  const deleted = await db
    .delete(storageObjects)
    .where(and(eq(storageObjects.bucketId, bucket.id), inArray(storageObjects.name, prefixes)))
    .returning({ name: storageObjects.name });

  return Response.json({ data: deleted });
}
