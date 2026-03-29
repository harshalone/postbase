/**
 * Dashboard storage browse API — uses connection credentials directly.
 * No API key required; scoped to project + connection.
 *
 * GET  ?prefix=folder/&maxKeys=200   — list objects
 * POST action=upload                 — upload a file (multipart form: file, path)
 * POST action=delete                 — delete objects (body: { keys: string[] })
 * POST action=mkdir                  — create a "folder" placeholder
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { storageConnections } from "@/lib/db/schema";
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

    return Response.json({
      objects,
      isTruncated,
      nextToken,
      bucket: conn.bucket,
      prefix,
    });
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

    const res = await client.signedFetch("PUT", path, {
      body: ab,
      contentType: file.type || "application/octet-stream",
    });

    if (!res.ok) {
      const text = await res.text();
      const msg = text.match(/<Message>([\s\S]*?)<\/Message>/)?.[1] ?? `Upload failed: HTTP ${res.status}`;
      return Response.json({ error: msg }, { status: res.status });
    }

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
      keys.map((key) =>
        client.signedFetch("DELETE", key).then((r) => {
          if (!r.ok && r.status !== 204) throw new Error(`DELETE ${key}: HTTP ${r.status}`);
        })
      )
    );

    const failed = results
      .filter((r): r is PromiseRejectedResult => r.status === "rejected")
      .map((r) => r.reason);

    if (failed.length) {
      return Response.json({ error: `Some deletes failed: ${failed.join(", ")}` }, { status: 207 });
    }

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

  return Response.json({ error: "Unknown action" }, { status: 400 });
}
