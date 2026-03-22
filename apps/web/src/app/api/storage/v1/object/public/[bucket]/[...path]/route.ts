/**
 * GET /api/storage/v1/object/public/[bucket]/[...path]
 * Serve a publicly accessible object (no auth required if bucket is public).
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { storageBuckets, storageObjects } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getStorageClient } from "@/lib/storage/client";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ bucket: string; path: string[] }> }) {
  const { bucket: bucketName, path: pathParts } = await params;
  const objectPath = pathParts.join("/");

  const [bucket] = await db
    .select()
    .from(storageBuckets)
    .where(and(eq(storageBuckets.name, bucketName), eq(storageBuckets.public, true)))
    .limit(1);

  if (!bucket) return Response.json({ error: "Not found" }, { status: 404 });

  const [obj] = await db
    .select()
    .from(storageObjects)
    .where(and(eq(storageObjects.bucketId, bucket.id), eq(storageObjects.name, objectPath)))
    .limit(1);

  if (!obj) return Response.json({ error: "Not found" }, { status: 404 });

  try {
    const storage = await getStorageClient(bucket.projectId);
    const { body, contentType } = await storage.getObject(bucket.name, objectPath);

    return new Response(body.buffer as ArrayBuffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(body.byteLength),
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
}
