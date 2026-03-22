/**
 * POST /api/storage/v1/object/list/[bucket]
 * List objects in a bucket.
 * Body: { prefix?, limit?, offset?, sortBy? }
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { storageBuckets, storageObjects } from "@/lib/db/schema";
import { eq, and, like, asc, desc } from "drizzle-orm";
import { validateApiKey } from "@/lib/auth/keys";

const bodySchema = z.object({
  prefix: z.string().optional(),
  limit: z.number().int().min(1).max(1000).optional(),
  offset: z.number().int().min(0).optional(),
  sortBy: z.object({
    column: z.enum(["name", "createdAt", "size"]),
    order: z.enum(["asc", "desc"]).optional(),
  }).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ bucket: string }> }) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const keyInfo = await validateApiKey(authHeader.slice(7));
  if (!keyInfo) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { bucket: bucketName } = await params;

  let body: unknown;
  try { body = await req.json(); } catch {
    body = {};
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const { prefix = "", limit = 100, offset = 0, sortBy } = parsed.data;

  const [bucket] = await db
    .select()
    .from(storageBuckets)
    .where(and(eq(storageBuckets.name, bucketName), eq(storageBuckets.projectId, keyInfo.projectId)))
    .limit(1);

  if (!bucket) return Response.json({ error: "Bucket not found" }, { status: 404 });

  const conditions = [eq(storageObjects.bucketId, bucket.id)];
  if (prefix) conditions.push(like(storageObjects.name, `${prefix}%`));

  const sortColumn = sortBy?.column === "size" ? storageObjects.size : sortBy?.column === "name" ? storageObjects.name : storageObjects.createdAt;
  const sortFn = sortBy?.order === "desc" ? desc : asc;

  const objects = await db
    .select()
    .from(storageObjects)
    .where(and(...conditions))
    .limit(limit)
    .offset(offset)
    .orderBy(sortFn(sortColumn));

  const data = objects.map((o) => ({
    name: o.name,
    size: o.size,
    contentType: o.mimeType ?? "application/octet-stream",
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.createdAt.toISOString(),
  }));

  return Response.json({ data });
}
