/**
 * POST /api/storage/v1/object/sign/[bucket]/[...path]
 * Create a signed URL for temporary access to a private object.
 * Body: { expiresIn: number } (seconds)
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { storageBuckets, storageObjects } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { validateApiKey } from "@/lib/auth/keys";
import { getStorageClient } from "@/lib/storage/client";

const bodySchema = z.object({ expiresIn: z.number().int().min(1).max(604800) }); // max 7 days

export async function POST(req: NextRequest, { params }: { params: Promise<{ bucket: string; path: string[] }> }) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const keyInfo = await validateApiKey(authHeader.slice(7));
  if (!keyInfo) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { bucket: bucketName, path: pathParts } = await params;
  const objectPath = pathParts.join("/");

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

  const [obj] = await db
    .select()
    .from(storageObjects)
    .where(and(eq(storageObjects.bucketId, bucket.id), eq(storageObjects.name, objectPath)))
    .limit(1);

  if (!obj) return Response.json({ error: "Object not found" }, { status: 404 });

  const storage = await getStorageClient(keyInfo.projectId);
  const signedUrl = await storage.getSignedUrl(bucket.name, objectPath, parsed.data.expiresIn);

  return Response.json({ signedUrl });
}
