/**
 * @swagger
 * /api/storage/v1/object/{bucket}/{path}:
 *   post:
 *     summary: Upload a new object
 *     tags: [Storage]
 *     security:
 *       - BearerAuth: []
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
 *       - in: header
 *         name: X-Postbase-Token
 *         required: false
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *         application/octet-stream:
 *           schema:
 *             type: string
 *             format: binary
 *     responses:
 *       200:
 *         description: Object uploaded
 *   put:
 *     summary: Upsert an object
 *     tags: [Storage]
 *     security:
 *       - BearerAuth: []
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
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *         application/octet-stream:
 *           schema:
 *             type: string
 *             format: binary
 *     responses:
 *       200:
 *         description: Object upserted
 *   get:
 *     summary: Download an object
 *     tags: [Storage]
 *     security:
 *       - BearerAuth: []
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
 *         content:
 *           application/octet-stream:
 *             schema:
 *               type: string
 *               format: binary
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { storageBuckets, storageObjects } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { validateApiKey } from "@/lib/auth/keys";
import { verifyJwt, getJwtSecret } from "@/lib/auth/jwt";
import { getStorageClient } from "@/lib/storage/client";

type Params = { params: Promise<{ bucket: string; path: string[] }> };

async function auth(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  return validateApiKey(authHeader.slice(7));
}

async function getBucket(projectId: string, bucketName: string) {
  const [bucket] = await db
    .select()
    .from(storageBuckets)
    .where(and(eq(storageBuckets.name, bucketName), eq(storageBuckets.projectId, projectId)))
    .limit(1);
  return bucket ?? null;
}

async function resolveUserId(req: NextRequest, projectId: string): Promise<string | null> {
  const token = req.headers.get("x-postbase-token");
  if (!token) return null;
  try {
    const payload = await verifyJwt(token, getJwtSecret());
    if (payload?.pid === projectId) return payload.sub;
  } catch {}
  return null;
}

async function upload(req: NextRequest, params: Params, upsert: boolean) {
  const keyInfo = await auth(req);
  if (!keyInfo) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { bucket: bucketName, path: pathParts } = await params.params;
  const objectPath = pathParts.join("/");

  const bucket = await getBucket(keyInfo.projectId, bucketName);
  if (!bucket) return Response.json({ error: "Bucket not found" }, { status: 404 });

  // Check mime type allowlist
  const contentType = req.headers.get("content-type") ?? "application/octet-stream";
  if (bucket.allowedMimeTypes?.length) {
    const allowed = bucket.allowedMimeTypes.some((mime) => {
      if (mime.endsWith("/*")) return contentType.startsWith(mime.slice(0, -1));
      return mime === contentType;
    });
    if (!allowed) return Response.json({ error: "File type not allowed" }, { status: 415 });
  }

  const contentLength = Number(req.headers.get("content-length") || "0");
  if (bucket.fileSizeLimit && contentLength > bucket.fileSizeLimit) {
    return Response.json({ error: `File too large. Max size: ${bucket.fileSizeLimit} bytes` }, { status: 413 });
  }

  let body: Uint8Array;
  const formData = req.headers.get("content-type")?.includes("multipart/form-data");

  if (bucket.fileSizeLimit && req.body) {
    let bytesRead = 0;
    const reader = req.body.getReader();
    const chunks: Uint8Array[] = [];
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytesRead += value.byteLength;
        if (bytesRead > bucket.fileSizeLimit) {
          return Response.json({ error: `File too large. Max size: ${bucket.fileSizeLimit} bytes` }, { status: 413 });
        }
        chunks.push(value);
      }
    } catch (err) {
      return Response.json({ error: "Upload failed during streaming" }, { status: 500 });
    }
    
    const combined = new Uint8Array(bytesRead);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    
    if (formData) {
      const newReq = new Request(req.url, {
        method: req.method,
        headers: req.headers,
        body: combined
      });
      const form = await newReq.formData();
      const file = form.get("file") as File | null;
      if (!file) return Response.json({ error: "No file provided" }, { status: 400 });
      body = new Uint8Array(await file.arrayBuffer());
    } else {
      body = combined;
    }
  } else {
    if (formData) {
      const form = await req.formData();
      const file = form.get("file") as File | null;
      if (!file) return Response.json({ error: "No file provided" }, { status: 400 });
      body = new Uint8Array(await file.arrayBuffer());
    } else {
      body = new Uint8Array(await req.arrayBuffer());
    }
  }

  // Final sanity check
  if (bucket.fileSizeLimit && body.byteLength > bucket.fileSizeLimit) {
    return Response.json({ error: `File too large. Max size: ${bucket.fileSizeLimit} bytes` }, { status: 413 });
  }

  // Check if object exists (for upsert check)
  const [existing] = await db
    .select({ id: storageObjects.id })
    .from(storageObjects)
    .where(and(eq(storageObjects.bucketId, bucket.id), eq(storageObjects.name, objectPath)))
    .limit(1);

  if (existing && !upsert) {
    return Response.json({ error: "Object already exists. Use upsert to overwrite." }, { status: 409 });
  }

  const storage = await getStorageClient(keyInfo.projectId);
  await storage.putObject(bucket.name, objectPath, body, { contentType });

  const userId = await resolveUserId(req, keyInfo.projectId);

  if (existing) {
    await db
      .update(storageObjects)
      .set({ size: body.byteLength, mimeType: contentType })
      .where(eq(storageObjects.id, existing.id));
  } else {
    await db.insert(storageObjects).values({
      bucketId: bucket.id,
      name: objectPath,
      size: body.byteLength,
      mimeType: contentType,
      ownerId: userId,
    });
  }

  return Response.json({ data: { path: objectPath, fullPath: `${bucketName}/${objectPath}` } });
}

export async function POST(req: NextRequest, ctx: Params) {
  return upload(req, ctx, false);
}

export async function PUT(req: NextRequest, ctx: Params) {
  return upload(req, ctx, true);
}

export async function GET(req: NextRequest, { params }: Params) {
  const { bucket: bucketName, path: pathParts } = await params;
  const objectPath = pathParts.join("/");

  // Check if bucket is public (no auth needed)
  // Auth check
  const authHeader = req.headers.get("authorization");
  let projectId: string | null = null;

  if (authHeader?.startsWith("Bearer ")) {
    const keyInfo = await validateApiKey(authHeader.slice(7));
    if (keyInfo) projectId = keyInfo.projectId;
  }

  if (!projectId) {
    // Try to find bucket by name across projects (for public buckets)
    const [bucket] = await db
      .select()
      .from(storageBuckets)
      .where(and(eq(storageBuckets.name, bucketName), eq(storageBuckets.public, true)))
      .limit(1);

    if (!bucket) return Response.json({ error: "Unauthorized" }, { status: 401 });
    projectId = bucket.projectId;
  }

  const bucket = await getBucket(projectId, bucketName);
  if (!bucket) return Response.json({ error: "Bucket not found" }, { status: 404 });

  const [obj] = await db
    .select()
    .from(storageObjects)
    .where(and(eq(storageObjects.bucketId, bucket.id), eq(storageObjects.name, objectPath)))
    .limit(1);

  if (!obj) return Response.json({ error: "Object not found" }, { status: 404 });

  try {
    const storage = await getStorageClient(projectId);
    const { body, contentType } = await storage.getObject(bucket.name, objectPath);

    return new Response(body.buffer as ArrayBuffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(body.byteLength),
        "Cache-Control": bucket.public ? "public, max-age=3600" : "private, no-cache",
      },
    });
  } catch {
    return Response.json({ error: "Object not found in storage" }, { status: 404 });
  }
}
