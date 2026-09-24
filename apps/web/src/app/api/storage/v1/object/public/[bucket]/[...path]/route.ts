/**
 * @swagger
 * /api/storage/v1/object/public/{bucket}/{path}:
 *   get:
 *     summary: Download a public object
 *     tags: [Storage]
 *     parameters:
 *       - in: path
 *         name: bucket
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Returns object binary data
 *       404:
 *         description: Object or public bucket not found
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { storageBuckets, storageObjects } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getStorageClient } from "@/lib/storage/client";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ bucket: string; path: string[] }> }) {
  const { bucket: bucketName, path: pathParts } = await params;
  const objectPath = pathParts.join("/");

  // Bucket names are only unique per-project, not globally — a name-only
  // lookup here could resolve to a different project's same-named public
  // bucket and 404 on an object that actually exists. Joining through
  // storageObjects instead means we only ever match a bucket that actually
  // holds the requested object, so the result is correct regardless of how
  // many projects reuse the same bucket name.
  const [row] = await db
    .select({ bucket: storageBuckets, obj: storageObjects })
    .from(storageObjects)
    .innerJoin(storageBuckets, eq(storageObjects.bucketId, storageBuckets.id))
    .where(
      and(
        eq(storageBuckets.name, bucketName),
        eq(storageBuckets.public, true),
        eq(storageObjects.name, objectPath)
      )
    )
    .limit(1);

  if (!row) return Response.json({ error: "Not found" }, { status: 404 });
  const { bucket, obj } = row;

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
