/**
 * Dashboard storage browse API — uses connection credentials directly.
 * No API key required; scoped to project + connection.
 *
 * GET  ?prefix=folder/&maxKeys=200   — list objects
 * POST action=upload                 — upload a file (multipart form: file, path)
 * POST action=delete                 — delete objects (body: { keys: string[] })
 * POST action=mkdir                  — create a "folder" placeholder
 * POST action=reconcile               — backfill storage_objects for files
 *                                       already in the bucket but missing
 *                                       their row (see getOrCreateBucketRow)
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { storageConnections, storageBuckets, storageObjects } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

type Params = { params: Promise<{ projectId: string; connectionId: string }> };

// ─── Build a minimal S3 client from connection row ───────────────────────────

function makeClient(conn: {
  endpoint: string | null;
  accessKeyId: string;
  secretAccessKey: string;
  region: string | null;
  bucket: string;
  provider: string;
}) {
  // R2 always uses "auto" as the signing region regardless of what's stored
  const region = conn.provider === "r2" ? "auto" : (conn.region ?? "us-east-1");
  let endpoint: string;
  if (conn.endpoint) {
    endpoint = conn.endpoint.replace(/\/$/, "");
  } else if (conn.provider === "s3") {
    endpoint = `https://s3.${region}.amazonaws.com`;
  } else {
    endpoint = "";
  }

  const enc = new TextEncoder();

  async function sha256Hex(data: ArrayBuffer): Promise<string> {
    const hash = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  function toAB(s: string): ArrayBuffer {
    const b = enc.encode(s);
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  }

  async function hmac(key: ArrayBuffer, data: string): Promise<ArrayBuffer> {
    const k = await crypto.subtle.importKey(
      "raw",
      key,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    return crypto.subtle.sign("HMAC", k, toAB(data));
  }

  async function signingKey(date: string): Promise<ArrayBuffer> {
    const kDate = await hmac(toAB(`AWS4${conn.secretAccessKey}`), date);
    const kRegion = await hmac(kDate, region);
    const kService = await hmac(kRegion, "s3");
    return hmac(kService, "aws4_request");
  }

  async function signedFetch(
    method: string,
    key: string,
    opts: {
      query?: Record<string, string>;
      body?: ArrayBuffer;
      contentType?: string;
      extraHeaders?: Record<string, string>;
    } = {}
  ): Promise<Response> {
    const url = new URL(`${endpoint}/${conn.bucket}/${key}`);
    if (opts.query) {
      for (const [k, v] of Object.entries(opts.query)) url.searchParams.set(k, v);
    }

    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = amzDate.slice(0, 8);

    const bodyHash = opts.body
      ? await sha256Hex(opts.body)
      : "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

    // Headers to sign (never include content-length — R2 rejects it when signed)
    const headersToSign: Record<string, string> = {
      host: url.host,
      "x-amz-date": amzDate,
      "x-amz-content-sha256": bodyHash,
      ...(opts.contentType ? { "content-type": opts.contentType } : {}),
      ...(opts.extraHeaders ?? {}),
    };

    // Extra headers sent but NOT signed
    const allHeaders: Record<string, string> = {
      ...headersToSign,
      ...(opts.body ? { "content-length": String(opts.body.byteLength) } : {}),
    };

    const sortedKeys = Object.keys(headersToSign).sort();
    const signedHeaders = sortedKeys.join(";");
    const canonicalHeaders = sortedKeys.map((k) => `${k}:${headersToSign[k]}\n`).join("");

    // Canonical query string must be sorted alphabetically by key
    const sortedQuery = [...url.searchParams.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");

    const canonicalReq = [
      method,
      url.pathname,
      sortedQuery,
      canonicalHeaders,
      signedHeaders,
      bodyHash,
    ].join("\n");

    const credScope = `${dateStamp}/${region}/s3/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      credScope,
      await sha256Hex(toAB(canonicalReq)),
    ].join("\n");

    const sk = await signingKey(dateStamp);
    const sigHex = Array.from(
      new Uint8Array(await (async () => {
        const k = await crypto.subtle.importKey("raw", sk, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
        return crypto.subtle.sign("HMAC", k, toAB(stringToSign));
      })())
    )
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    allHeaders[
      "Authorization"
    ] = `AWS4-HMAC-SHA256 Credential=${conn.accessKeyId}/${credScope}, SignedHeaders=${signedHeaders}, Signature=${sigHex}`;

    return fetch(url.toString(), {
      method,
      headers: allHeaders,
      body: opts.body ?? undefined,
    });
  }

  async function getPresignedUrl(key: string, expiresIn = 3600): Promise<string> {
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = amzDate.slice(0, 8);
    const credScope = `${dateStamp}/${region}/s3/aws4_request`;

    const url = new URL(`${endpoint}/${conn.bucket}/${key}`);
    url.searchParams.set("X-Amz-Algorithm", "AWS4-HMAC-SHA256");
    url.searchParams.set("X-Amz-Credential", `${conn.accessKeyId}/${credScope}`);
    url.searchParams.set("X-Amz-Date", amzDate);
    url.searchParams.set("X-Amz-Expires", String(expiresIn));
    url.searchParams.set("X-Amz-SignedHeaders", "host");

    const sortedQuery = [...url.searchParams.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");

    const canonicalReq = [
      "GET",
      url.pathname,
      sortedQuery,
      `host:${url.host}\n`,
      "host",
      "UNSIGNED-PAYLOAD",
    ].join("\n");

    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      credScope,
      await sha256Hex(toAB(canonicalReq)),
    ].join("\n");

    const sk = await signingKey(dateStamp);
    const sigHex = Array.from(
      new Uint8Array(await (async () => {
        const k = await crypto.subtle.importKey("raw", sk, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
        return crypto.subtle.sign("HMAC", k, toAB(stringToSign));
      })())
    )
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    url.searchParams.set("X-Amz-Signature", sigHex);
    return url.toString();
  }

  return { signedFetch, getPresignedUrl, bucket: conn.bucket };
}

// ─── Parse ListObjectsV2 XML response ────────────────────────────────────────

function parseListXml(xml: string) {
  const objects: Array<{
    key: string;
    size: number;
    lastModified: string;
    isFolder: boolean;
  }> = [];

  // Common prefixes = "folders"
  for (const m of xml.matchAll(/<CommonPrefixes>[\s\S]*?<Prefix>(.*?)<\/Prefix>[\s\S]*?<\/CommonPrefixes>/g)) {
    objects.push({ key: m[1], size: 0, lastModified: "", isFolder: true });
  }

  // Contents = files
  for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
    const c = m[1];
    const key = c.match(/<Key>([\s\S]*?)<\/Key>/)?.[1] ?? "";
    const size = parseInt(c.match(/<Size>([\s\S]*?)<\/Size>/)?.[1] ?? "0", 10);
    const lastModified = c.match(/<LastModified>([\s\S]*?)<\/LastModified>/)?.[1] ?? "";
    // Skip folder placeholder keys (trailing slash, size 0)
    if (!key.endsWith("/")) {
      objects.push({ key, size, lastModified, isFolder: false });
    }
  }

  const isTruncated = xml.includes("<IsTruncated>true</IsTruncated>");
  const nextToken = xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/)?.[1] ?? null;

  return { objects, isTruncated, nextToken };
}

// ─── Guess mime type from extension ──────────────────────────────────────────
//
// ListObjectsV2 doesn't return content-type, so a reconcile pass can't read
// the real mime type without a HEAD request per object. Extension-based
// guessing keeps the backfill a single paginated LIST scan; it mirrors the
// same guess table the file-detail panel already uses for display.
const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
  webp: "image/webp", svg: "image/svg+xml", avif: "image/avif", ico: "image/x-icon",
  mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", mkv: "video/x-matroska",
  mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", flac: "audio/flac", aac: "audio/aac",
  pdf: "application/pdf", json: "application/json", zip: "application/zip",
  txt: "text/plain", md: "text/markdown", csv: "text/csv",
  html: "text/html", css: "text/css", js: "text/javascript", ts: "text/typescript",
};

function guessMimeType(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

// ─── Resolve connection ───────────────────────────────────────────────────────

async function getConnection(projectId: string, connectionId: string) {
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
  return conn ?? null;
}

// ─── Keep storage_objects in sync with direct R2 writes ──────────────────────
//
// The file browser writes straight to the provider using the connection's
// credentials, bypassing the /api/storage/v1/object routes entirely. Those
// routes (including the public object route) resolve everything through the
// storage_buckets/storage_objects tables, so a file uploaded here would exist
// in the underlying bucket but stay invisible — and its public URL would
// always 404 — unless we mirror the write into those tables too.
//
// storage_buckets.name doubles as the literal provider bucket name elsewhere
// in the app (see the auto-registration on connection create), so we look up
// the bucket row the same way: by (projectId, name = conn.bucket).
async function getOrCreateBucketRow(projectId: string, bucketName: string) {
  const [existing] = await db
    .select({ id: storageBuckets.id })
    .from(storageBuckets)
    .where(and(eq(storageBuckets.projectId, projectId), eq(storageBuckets.name, bucketName)))
    .limit(1);

  if (existing) return existing.id;

  const [created] = await db
    .insert(storageBuckets)
    .values({ projectId, name: bucketName, public: false })
    .returning({ id: storageBuckets.id });

  return created.id;
}

async function upsertObjectRow(
  bucketId: string,
  objectPath: string,
  size: number,
  mimeType: string
) {
  const [existing] = await db
    .select({ id: storageObjects.id })
    .from(storageObjects)
    .where(and(eq(storageObjects.bucketId, bucketId), eq(storageObjects.name, objectPath)))
    .limit(1);

  if (existing) {
    await db
      .update(storageObjects)
      .set({ size, mimeType })
      .where(eq(storageObjects.id, existing.id));
  } else {
    await db.insert(storageObjects).values({ bucketId, name: objectPath, size, mimeType });
  }
}

async function deleteObjectRows(bucketId: string, objectPaths: string[]) {
  if (!objectPaths.length) return;
  await Promise.all(
    objectPaths.map((path) =>
      db
        .delete(storageObjects)
        .where(and(eq(storageObjects.bucketId, bucketId), eq(storageObjects.name, path)))
    )
  );
}

// ─── GET — list objects ───────────────────────────────────────────────────────

export async function GET(req: NextRequest, { params }: Params) {
  const { projectId, connectionId } = await params;

  const conn = await getConnection(projectId, connectionId);
  if (!conn) return Response.json({ error: "Connection not found" }, { status: 404 });

  const { searchParams } = new URL(req.url);

  // ── Presigned URL ─────────────────────────────────────────────────────────
  if (searchParams.get("action") === "url") {
    const key = searchParams.get("key") ?? "";
    if (!key) return Response.json({ error: "No key provided" }, { status: 400 });
    const expiresIn = parseInt(searchParams.get("expiresIn") ?? "3600", 10);
    const client = makeClient(conn);
    try {
      const url = await client.getPresignedUrl(key, expiresIn);
      return Response.json({ url });
    } catch (err) {
      return Response.json({ error: String(err) }, { status: 500 });
    }
  }

  const prefix = searchParams.get("prefix") ?? "";
  const maxKeys = Math.min(parseInt(searchParams.get("maxKeys") ?? "500"), 1000);
  const continuationToken = searchParams.get("token") ?? undefined;

  const client = makeClient(conn);

  const query: Record<string, string> = {
    "list-type": "2",
    delimiter: "/",
    prefix,
    "max-keys": String(maxKeys),
  };
  if (continuationToken) query["continuation-token"] = continuationToken;

  try {
    const res = await client.signedFetch("GET", "", { query });
    if (!res.ok) {
      const text = await res.text();
      const msg = text.match(/<Message>([\s\S]*?)<\/Message>/)?.[1] ?? `HTTP ${res.status}`;
      return Response.json({ error: msg }, { status: res.status });
    }

    const xml = await res.text();
    const { objects, isTruncated, nextToken } = parseListXml(xml);

    return Response.json(
      { objects, isTruncated, nextToken, bucket: conn.bucket, prefix },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

// ─── POST — upload / delete / mkdir ──────────────────────────────────────────

export async function POST(req: NextRequest, { params }: Params) {
  const { projectId, connectionId } = await params;

  const conn = await getConnection(projectId, connectionId);
  if (!conn) return Response.json({ error: "Connection not found" }, { status: 404 });

  const client = makeClient(conn);

  const contentType = req.headers.get("content-type") ?? "";

  // ── Upload ────────────────────────────────────────────────────────────────
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const path = (form.get("path") as string | null)?.replace(/^\//, "") ?? "";

    if (!file) return Response.json({ error: "No file provided" }, { status: 400 });
    if (!path) return Response.json({ error: "No path provided" }, { status: 400 });

    const body = new Uint8Array(await file.arrayBuffer());
    const ab = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer;

    const fileContentType = file.type || "application/octet-stream";
    const res = await client.signedFetch("PUT", path, {
      body: ab,
      contentType: fileContentType,
    });

    if (!res.ok) {
      const text = await res.text();
      const msg = text.match(/<Message>([\s\S]*?)<\/Message>/)?.[1] ?? `Upload failed: HTTP ${res.status}`;
      return Response.json({ error: msg }, { status: res.status });
    }

    const bucketId = await getOrCreateBucketRow(projectId, conn.bucket);
    await upsertObjectRow(bucketId, path, body.byteLength, fileContentType);

    return Response.json({ success: true, path });
  }

  // ── JSON actions ─────────────────────────────────────────────────────────
  let body: { action?: string; keys?: string[]; folderPath?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Delete
  if (body.action === "delete") {
    const keys = body.keys ?? [];
    if (!keys.length) return Response.json({ error: "No keys provided" }, { status: 400 });

    const results = await Promise.allSettled(
      keys.map(async (key) => {
        const r = await client.signedFetch("DELETE", key);
        // 204 No Content and 200 OK are both valid S3 delete responses
        if (r.status === 204 || r.status === 200) return;
        // Handle redirects (3xx) — means signing region/endpoint mismatch
        if (r.status >= 300 && r.status < 400) {
          throw new Error(`DELETE ${key}: redirected (${r.status}) — check endpoint/region config`);
        }
        const text = await r.text().catch(() => "");
        const msg = text.match(/<Message>([\s\S]*?)<\/Message>/)?.[1] ?? `HTTP ${r.status}`;
        throw new Error(`DELETE ${key}: ${msg}`);
      })
    );

    const failed = results
      .filter((r): r is PromiseRejectedResult => r.status === "rejected")
      .map((r) => r.reason);

    if (failed.length) {
      return Response.json({ error: `Some deletes failed: ${failed.join(", ")}` }, { status: 207 });
    }

    // Only the keys that actually deleted from the provider should drop out
    // of storage_objects too, but every key here succeeded (we'd have
    // returned above otherwise), so it's safe to clear all of them.
    const bucketId = await getOrCreateBucketRow(projectId, conn.bucket);
    await deleteObjectRows(bucketId, keys);

    return Response.json({ success: true, deleted: keys.length });
  }

  // Create folder (upload zero-byte placeholder with trailing slash)
  if (body.action === "mkdir") {
    const folderPath = (body.folderPath ?? "").replace(/\/$/, "") + "/";
    if (folderPath === "/") return Response.json({ error: "Invalid folder path" }, { status: 400 });

    const emptyAB = new ArrayBuffer(0);
    const res = await client.signedFetch("PUT", folderPath, {
      body: emptyAB,
      contentType: "application/x-directory",
    });

    if (!res.ok) {
      const text = await res.text();
      const msg = text.match(/<Message>([\s\S]*?)<\/Message>/)?.[1] ?? `HTTP ${res.status}`;
      return Response.json({ error: msg }, { status: res.status });
    }

    return Response.json({ success: true, path: folderPath });
  }

  // Backfill storage_objects for files already sitting in the bucket that
  // were never registered — e.g. anything uploaded here before this sync
  // existed, or written directly to the provider outside Postbase.
  if (body.action === "reconcile") {
    const bucketId = await getOrCreateBucketRow(projectId, conn.bucket);
    let continuationToken: string | undefined;
    let scanned = 0;
    let created = 0;

    do {
      const query: Record<string, string> = {
        "list-type": "2",
        "max-keys": "1000",
      };
      if (continuationToken) query["continuation-token"] = continuationToken;

      const res = await client.signedFetch("GET", "", { query });
      if (!res.ok) {
        const text = await res.text();
        const msg = text.match(/<Message>([\s\S]*?)<\/Message>/)?.[1] ?? `HTTP ${res.status}`;
        return Response.json({ error: msg, scanned, created }, { status: res.status });
      }

      const xml = await res.text();
      const { objects, isTruncated, nextToken } = parseListXml(xml);

      for (const obj of objects) {
        scanned++;
        const [existing] = await db
          .select({ id: storageObjects.id })
          .from(storageObjects)
          .where(and(eq(storageObjects.bucketId, bucketId), eq(storageObjects.name, obj.key)))
          .limit(1);

        if (!existing) {
          await db.insert(storageObjects).values({
            bucketId,
            name: obj.key,
            size: obj.size,
            mimeType: guessMimeType(obj.key),
          });
          created++;
        }
      }

      continuationToken = isTruncated ? (nextToken ?? undefined) : undefined;
    } while (continuationToken);

    return Response.json({ success: true, scanned, created });
  }

  return Response.json({ error: "Unknown action" }, { status: 400 });
}
