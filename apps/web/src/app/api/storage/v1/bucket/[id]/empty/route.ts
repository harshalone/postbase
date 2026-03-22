/**
 * POST /api/storage/v1/bucket/[id]/empty — delete all objects in a bucket
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { storageBuckets, storageObjects } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { validateApiKey } from "@/lib/auth/keys";
import { getStorageClient } from "@/lib/storage/client";

async function auth(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  return validateApiKey(authHeader.slice(7));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const keyInfo = await auth(req);
  if (!keyInfo) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const [bucket] = await db
    .select()
    .from(storageBuckets)
    .where(and(eq(storageBuckets.name, id), eq(storageBuckets.projectId, keyInfo.projectId)))
    .limit(1);

  if (!bucket) return Response.json({ error: "Bucket not found" }, { status: 404 });

  const objects = await db
    .select({ name: storageObjects.name })
    .from(storageObjects)
    .where(eq(storageObjects.bucketId, bucket.id));

  if (objects.length > 0) {
    try {
      const storage = await getStorageClient(keyInfo.projectId);
      await Promise.all(objects.map((o) => storage.deleteObject(bucket.name, o.name)));
    } catch {
      // Best effort — still delete DB records
    }
    await db.delete(storageObjects).where(eq(storageObjects.bucketId, bucket.id));
  }

  return Response.json({ message: "Bucket emptied" });
}
