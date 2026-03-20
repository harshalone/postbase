import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { storageConnections } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  bucket: z.string().min(1).optional(),
  region: z.string().optional(),
  endpoint: z.string().url().optional().or(z.literal("")),
  accessKeyId: z.string().min(1).optional(),
  secretAccessKey: z.string().min(1).optional(),
  isDefault: z.boolean().optional(),
});

type Params = { params: Promise<{ projectId: string; connectionId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { projectId, connectionId } = await params;

  const body = updateSchema.safeParse(await req.json());
  if (!body.success) {
    return Response.json({ error: body.error.flatten() }, { status: 400 });
  }

  const { isDefault, endpoint, ...rest } = body.data;

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

  const updateData: Record<string, unknown> = {
    ...rest,
    updatedAt: new Date(),
  };
  if (endpoint !== undefined) updateData.endpoint = endpoint || null;
  if (isDefault !== undefined) updateData.isDefault = isDefault;

  const [updated] = await db
    .update(storageConnections)
    .set(updateData)
    .where(
      and(
        eq(storageConnections.id, connectionId),
        eq(storageConnections.projectId, projectId)
      )
    )
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

  if (!updated) {
    return Response.json({ error: "Connection not found" }, { status: 404 });
  }

  return Response.json({ connection: updated });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { projectId, connectionId } = await params;

  const [deleted] = await db
    .delete(storageConnections)
    .where(
      and(
        eq(storageConnections.id, connectionId),
        eq(storageConnections.projectId, projectId)
      )
    )
    .returning({ id: storageConnections.id });

  if (!deleted) {
    return Response.json({ error: "Connection not found" }, { status: 404 });
  }

  return Response.json({ success: true });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { projectId, connectionId } = await params;
  const body = await req.json();

  if (body.action !== "test") {
    return Response.json({ error: "Unknown action" }, { status: 400 });
  }

  // Fetch the connection (include secret for testing)
  const [conn] = await db
    .select()
    .from(storageConnections)
    .where(
      and(
        eq(storageConnections.id, connectionId),
        eq(storageConnections.projectId, projectId)
      )
    )
    .limit(1);

  if (!conn) {
    return Response.json({ error: "Connection not found" }, { status: 404 });
  }

  try {
    const result = await testS3Connection({
      provider: conn.provider,
      bucket: conn.bucket,
      region: conn.region ?? undefined,
      endpoint: conn.endpoint ?? undefined,
      accessKeyId: conn.accessKeyId,
      secretAccessKey: conn.secretAccessKey,
    });

    return Response.json(result);
  } catch (err) {
    return Response.json(
      { success: false, message: String(err) },
      { status: 200 }
    );
  }
}

// ─── S3 connection tester (AWS Signature v4, no SDK dependency) ───────────────

async function testS3Connection(opts: {
  provider: string;
  bucket: string;
  region?: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
}): Promise<{ success: boolean; message: string }> {
  const { bucket, accessKeyId, secretAccessKey } = opts;
  const region = opts.region || "us-east-1";

  let host: string;
  if (opts.endpoint) {
    const u = new URL(opts.endpoint);
    host = u.host;
  } else if (opts.provider === "r2") {
    return { success: false, message: "Cloudflare R2 requires a custom endpoint URL." };
  } else {
    host = `${bucket}.s3.${region}.amazonaws.com`;
  }

  // Build a simple ListObjectsV2 request with AWS SigV4
  const now = new Date();
  const datestamp = now.toISOString().slice(0, 10).replace(/-/g, "");
  const amzdate = now.toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";

  const method = "GET";
  const canonicalUri = opts.endpoint ? `/${bucket}/` : "/";
  const canonicalQuerystring = "list-type=2&max-keys=1";
  const canonicalHeaders = `host:${host}\nx-amz-date:${amzdate}\n`;
  const signedHeaders = "host;x-amz-date";
  const payloadHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"; // SHA256 of empty string

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuerystring,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${datestamp}/${region}/s3/aws4_request`;
  const encoder = new TextEncoder();

  async function sha256(data: string): Promise<string> {
    const buf = await crypto.subtle.digest("SHA-256", encoder.encode(data));
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  async function hmacSha256(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
    const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return crypto.subtle.sign("HMAC", k, encoder.encode(data));
  }

  const hashedCanonical = await sha256(canonicalRequest);
  const stringToSign = `AWS4-HMAC-SHA256\n${amzdate}\n${credentialScope}\n${hashedCanonical}`;

  const signingKey = await (async () => {
    const kDate = await hmacSha256(encoder.encode(`AWS4${secretAccessKey}`), datestamp);
    const kRegion = await hmacSha256(kDate, region);
    const kService = await hmacSha256(kRegion, "s3");
    return hmacSha256(kService, "aws4_request");
  })();

  const signatureBytes = await hmacSha256(signingKey, stringToSign);
  const signature = Array.from(new Uint8Array(signatureBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const authHeader = [
    `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(", ");

  const scheme = opts.endpoint?.startsWith("http://") ? "http" : "https";
  const url = `${scheme}://${host}${canonicalUri}?${canonicalQuerystring}`;

  const response = await fetch(url, {
    method,
    headers: {
      Host: host,
      "x-amz-date": amzdate,
      Authorization: authHeader,
    },
  });

  if (response.ok) {
    return { success: true, message: "Connection successful — bucket is accessible." };
  }

  const text = await response.text();
  const codeMatch = text.match(/<Code>([^<]+)<\/Code>/);
  const msgMatch = text.match(/<Message>([^<]+)<\/Message>/);

  if (response.status === 403) {
    return {
      success: false,
      message: codeMatch?.[1] === "AccessDenied"
        ? "Access denied — check your access key and permissions."
        : msgMatch?.[1] ?? "Access denied.",
    };
  }

  if (response.status === 404) {
    return { success: false, message: "Bucket not found — check the bucket name and region." };
  }

  return {
    success: false,
    message: msgMatch?.[1] ?? `Unexpected response: HTTP ${response.status}`,
  };
}
