/**
 * GET  /api/storage/v1/bucket          — list buckets
 * POST /api/storage/v1/bucket          — create bucket
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { storageBuckets } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
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

export async function GET(req: NextRequest) {
  const keyInfo = await auth(req);
  if (!keyInfo) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db
    .select()
    .from(storageBuckets)
    .where(eq(storageBuckets.projectId, keyInfo.projectId))
    .orderBy(storageBuckets.createdAt);

  return Response.json({ data: rows.map(formatBucket) });
}

const createSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  public: z.boolean().optional(),
  file_size_limit: z.number().int().positive().optional(),
  allowed_mime_types: z.array(z.string()).optional(),
});

export async function POST(req: NextRequest) {
  const keyInfo = await auth(req);
  if (!keyInfo) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const [bucket] = await db
    .insert(storageBuckets)
    .values({
      projectId: keyInfo.projectId,
      name: parsed.data.name,
      public: parsed.data.public ?? false,
      fileSizeLimit: parsed.data.file_size_limit,
      allowedMimeTypes: parsed.data.allowed_mime_types,
    })
    .returning();

  return Response.json({ data: formatBucket(bucket) }, { status: 201 });
}
