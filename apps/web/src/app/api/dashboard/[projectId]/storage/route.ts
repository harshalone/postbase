import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { projects, storageConnections, storageBuckets } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  provider: z.enum(["s3", "r2", "backblaze", "gcs", "other"]),
  bucket: z.string().min(1),
  region: z.string().optional(),
  endpoint: z.string().url().optional().or(z.literal("")),
  accessKeyId: z.string().min(1),
  secretAccessKey: z.string().min(1),
  isDefault: z.boolean().optional(),
});

export async function GET(
  _req: NextRequest,
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

  const [connections, buckets] = await Promise.all([
    db
      .select({
        id: storageConnections.id,
        name: storageConnections.name,
        provider: storageConnections.provider,
        bucket: storageConnections.bucket,
        region: storageConnections.region,
        endpoint: storageConnections.endpoint,
        accessKeyId: storageConnections.accessKeyId,
        isDefault: storageConnections.isDefault,
        createdAt: storageConnections.createdAt,
        updatedAt: storageConnections.updatedAt,
      })
      .from(storageConnections)
      .where(eq(storageConnections.projectId, projectId))
      .orderBy(storageConnections.createdAt),
    db
      .select({
        id: storageBuckets.id,
        name: storageBuckets.name,
        public: storageBuckets.public,
        fileSizeLimit: storageBuckets.fileSizeLimit,
        allowedMimeTypes: storageBuckets.allowedMimeTypes,
        createdAt: storageBuckets.createdAt,
      })
      .from(storageBuckets)
      .where(eq(storageBuckets.projectId, projectId))
      .orderBy(storageBuckets.createdAt),
  ]);

  return Response.json({ connections, buckets });
}

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

  const { isDefault, endpoint, ...rest } = body.data;

  // If setting as default, clear existing defaults first
  if (isDefault) {
    await db
      .update(storageConnections)
      .set({ isDefault: false })
      .where(
        and(
          eq(storageConnections.projectId, projectId),
          eq(storageConnections.isDefault, true)
        )
      );
  }

  const [connection] = await db
    .insert(storageConnections)
    .values({
      projectId,
      ...rest,
      endpoint: endpoint || null,
      isDefault: isDefault ?? false,
    })
    .returning({
      id: storageConnections.id,
      name: storageConnections.name,
      provider: storageConnections.provider,
      bucket: storageConnections.bucket,
      region: storageConnections.region,
      endpoint: storageConnections.endpoint,
      accessKeyId: storageConnections.accessKeyId,
      isDefault: storageConnections.isDefault,
      createdAt: storageConnections.createdAt,
      updatedAt: storageConnections.updatedAt,
    });

  // Auto-register the bucket in storageBuckets if not already present
  const [existingBucket] = await db
    .select({ id: storageBuckets.id })
    .from(storageBuckets)
    .where(
      and(
        eq(storageBuckets.projectId, projectId),
        eq(storageBuckets.name, rest.bucket)
      )
    )
    .limit(1);

  if (!existingBucket) {
    await db.insert(storageBuckets).values({
      projectId,
      name: rest.bucket,
      public: false,
    });
  }

  return Response.json({ connection }, { status: 201 });
}
