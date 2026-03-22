/**
 * POST /api/storage/v1/object/move
 * Move an object within a bucket.
 * Body: { bucketId, sourceKey, destinationKey }
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { storageBuckets, storageObjects } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { validateApiKey } from "@/lib/auth/keys";
import { getStorageClient } from "@/lib/storage/client";

const bodySchema = z.object({
  bucketId: z.string(),
  sourceKey: z.string(),
  destinationKey: z.string(),
});

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const keyInfo = await validateApiKey(authHeader.slice(7));
  if (!keyInfo) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const { bucketId, sourceKey, destinationKey } = parsed.data;

  const [bucket] = await db
    .select()
    .from(storageBuckets)
    .where(and(eq(storageBuckets.name, bucketId), eq(storageBuckets.projectId, keyInfo.projectId)))
    .limit(1);

  if (!bucket) return Response.json({ error: "Bucket not found" }, { status: 404 });

  const storage = await getStorageClient(keyInfo.projectId);
  await storage.copyObject(bucket.name, sourceKey, destinationKey);
  await storage.deleteObject(bucket.name, sourceKey);

  // Update DB record
  await db
    .update(storageObjects)
    .set({ name: destinationKey })
    .where(and(eq(storageObjects.bucketId, bucket.id), eq(storageObjects.name, sourceKey)));

  return Response.json({ message: "Moved successfully" });
}
