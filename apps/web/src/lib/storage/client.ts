/**
 * Storage client factory — connects to the configured S3-compatible storage
 * for a given project (MinIO by default, or per-project S3/R2/GCS connection).
 */
import { db } from "@/lib/db";
import { storageConnections } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export interface StorageAdapter {
  putObject(bucket: string, key: string, body: Buffer | Uint8Array, options?: { contentType?: string }): Promise<void>;
  getObject(bucket: string, key: string): Promise<{ body: Uint8Array; contentType: string }>;
  deleteObject(bucket: string, key: string): Promise<void>;
  deleteObjects(bucket: string, keys: string[]): Promise<void>;
  listObjects(bucket: string, prefix?: string, options?: { maxKeys?: number; startAfter?: string }): Promise<Array<{ key: string; size: number; lastModified: Date; contentType: string }>>;
  copyObject(bucket: string, sourceKey: string, destKey: string): Promise<void>;
  headObject(bucket: string, key: string): Promise<{ size: number; contentType: string; lastModified: Date } | null>;
  getSignedUrl(bucket: string, key: string, expiresIn: number): Promise<string>;
}

/**
 * Minimal S3/MinIO client using the AWS Signature V4 algorithm via fetch.
 * Works with MinIO, AWS S3, Cloudflare R2, Backblaze B2, and other S3-compatible APIs.
 */
class S3Client implements StorageAdapter {
  constructor(
    private endpoint: string,
    private accessKeyId: string,
    private secretAccessKey: string,
    private region: string = "us-east-1"
  ) {}

  private async signedFetch(
    method: string,
    bucket: string,
    key: string,
    options: {
      body?: Buffer | Uint8Array;
      headers?: Record<string, string>;
      query?: Record<string, string>;
    } = {}
  ): Promise<Response> {
    const url = new URL(`${this.endpoint}/${bucket}/${key}`);
    if (options.query) {
      Object.entries(options.query).forEach(([k, v]) => url.searchParams.set(k, v));
    }

    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = amzDate.slice(0, 8);

    const bodyAsArrayBuffer = options.body
      ? (options.body instanceof Buffer ? options.body.buffer.slice(options.body.byteOffset, options.body.byteOffset + options.body.byteLength) as ArrayBuffer : options.body.buffer.slice(options.body.byteOffset, options.body.byteOffset + options.body.byteLength) as ArrayBuffer)
      : null;
    const contentHash = bodyAsArrayBuffer
      ? await sha256Hex(bodyAsArrayBuffer)
      : "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

    const headers: Record<string, string> = {
      host: url.host,
      "x-amz-date": amzDate,
      "x-amz-content-sha256": contentHash,
      ...options.headers,
    };

    if (options.body) {
      headers["content-length"] = String(options.body.length);
    }

    const signedHeaders = Object.keys(headers).sort().join(";");
    const canonicalHeaders = Object.entries(headers)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v.trim()}`)
      .join("\n");

    const canonicalRequest = [
      method,
      url.pathname,
      url.searchParams.toString(),
      canonicalHeaders + "\n",
      signedHeaders,
      contentHash,
    ].join("\n");

    const credScope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      credScope,
      await sha256Hex(toArrayBuffer(canonicalRequest)),
    ].join("\n");

    const signingKey = await deriveSigningKey(this.secretAccessKey, dateStamp, this.region);
    const signature = await hmacHex(signingKey, stringToSign);

    headers["Authorization"] = `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${credScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return fetch(url.toString(), {
      method,
      headers,
      body: bodyAsArrayBuffer ?? undefined,
    });
  }

  async putObject(bucket: string, key: string, body: Buffer | Uint8Array, options?: { contentType?: string }): Promise<void> {
    const res = await this.signedFetch("PUT", bucket, key, {
      body,
      headers: options?.contentType ? { "content-type": options.contentType } : {},
    });
    if (!res.ok) throw new Error(`PUT failed: ${res.status} ${await res.text()}`);
  }

  async getObject(bucket: string, key: string): Promise<{ body: Uint8Array; contentType: string }> {
    const res = await this.signedFetch("GET", bucket, key);
    if (!res.ok) throw new Error(`GET failed: ${res.status}`);
    const body = new Uint8Array(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") ?? "application/octet-stream";
    return { body, contentType };
  }

  async deleteObject(bucket: string, key: string): Promise<void> {
    const res = await this.signedFetch("DELETE", bucket, key);
    if (!res.ok && res.status !== 404) throw new Error(`DELETE failed: ${res.status}`);
  }

  async deleteObjects(bucket: string, keys: string[]): Promise<void> {
    await Promise.all(keys.map((k) => this.deleteObject(bucket, k)));
  }

  async listObjects(bucket: string, prefix = "", options?: { maxKeys?: number; startAfter?: string }): Promise<Array<{ key: string; size: number; lastModified: Date; contentType: string }>> {
    const query: Record<string, string> = {
      "list-type": "2",
      prefix,
      "max-keys": String(options?.maxKeys ?? 100),
    };
    if (options?.startAfter) query["start-after"] = options.startAfter;

    const res = await this.signedFetch("GET", bucket, "", { query });
    if (!res.ok) throw new Error(`LIST failed: ${res.status}`);

    const text = await res.text();
    const matches = [...text.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)];

    return matches.map((m) => {
      const content = m[1];
      const key = content.match(/<Key>(.*?)<\/Key>/)?.[1] ?? "";
      const size = parseInt(content.match(/<Size>(.*?)<\/Size>/)?.[1] ?? "0", 10);
      const lastModified = new Date(content.match(/<LastModified>(.*?)<\/LastModified>/)?.[1] ?? Date.now());
      return { key, size, lastModified, contentType: "application/octet-stream" };
    });
  }

  async copyObject(bucket: string, sourceKey: string, destKey: string): Promise<void> {
    const res = await this.signedFetch("PUT", bucket, destKey, {
      headers: { "x-amz-copy-source": `/${bucket}/${sourceKey}` },
    });
    if (!res.ok) throw new Error(`COPY failed: ${res.status}`);
  }

  async headObject(bucket: string, key: string): Promise<{ size: number; contentType: string; lastModified: Date } | null> {
    const res = await this.signedFetch("HEAD", bucket, key);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HEAD failed: ${res.status}`);
    return {
      size: parseInt(res.headers.get("content-length") ?? "0", 10),
      contentType: res.headers.get("content-type") ?? "application/octet-stream",
      lastModified: new Date(res.headers.get("last-modified") ?? Date.now()),
    };
  }

  async getSignedUrl(bucket: string, key: string, expiresIn: number): Promise<string> {
    // Pre-signed URL for public access
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = amzDate.slice(0, 8);
    const credScope = `${dateStamp}/${this.region}/s3/aws4_request`;

    const url = new URL(`${this.endpoint}/${bucket}/${key}`);
    url.searchParams.set("X-Amz-Algorithm", "AWS4-HMAC-SHA256");
    url.searchParams.set("X-Amz-Credential", `${this.accessKeyId}/${credScope}`);
    url.searchParams.set("X-Amz-Date", amzDate);
    url.searchParams.set("X-Amz-Expires", String(expiresIn));
    url.searchParams.set("X-Amz-SignedHeaders", "host");

    const canonicalRequest = [
      "GET",
      url.pathname,
      url.searchParams.toString(),
      `host:${url.host}\n`,
      "host",
      "UNSIGNED-PAYLOAD",
    ].join("\n");

    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      credScope,
      await sha256Hex(toArrayBuffer(canonicalRequest)),
    ].join("\n");

    const signingKey = await deriveSigningKey(this.secretAccessKey, dateStamp, this.region);
    const signature = await hmacHex(signingKey, stringToSign);
    url.searchParams.set("X-Amz-Signature", signature);

    return url.toString();
  }
}

// ─── Crypto helpers (Web Crypto API) ─────────────────────────────────────────

async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function toArrayBuffer(data: string | Uint8Array): ArrayBuffer {
  if (typeof data === "string") {
    const bytes = new TextEncoder().encode(data);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  }
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

async function hmac(key: CryptoKey, data: string): Promise<ArrayBuffer> {
  return crypto.subtle.sign("HMAC", key, toArrayBuffer(data));
}

async function hmacHex(key: CryptoKey, data: string): Promise<string> {
  const sig = await hmac(key, data);
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function importHmacKey(raw: ArrayBuffer | string): Promise<CryptoKey> {
  const keyData = typeof raw === "string" ? toArrayBuffer(raw) : raw;
  return crypto.subtle.importKey("raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

async function deriveSigningKey(secret: string, date: string, region: string): Promise<CryptoKey> {
  const kDate = await hmac(await importHmacKey(`AWS4${secret}`), date);
  const kRegion = await hmac(await importHmacKey(kDate), region);
  const kService = await hmac(await importHmacKey(kRegion), "s3");
  const kSigning = await hmac(await importHmacKey(kService), "aws4_request");
  return importHmacKey(kSigning);
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export async function getStorageClient(projectId: string): Promise<StorageAdapter> {
  // Look for a default storage connection for this project
  const [conn] = await db
    .select()
    .from(storageConnections)
    .where(and(eq(storageConnections.projectId, projectId), eq(storageConnections.isDefault, true)))
    .limit(1);

  if (conn) {
    // R2 always signs with "auto" region regardless of what's stored
    const region = conn.provider === "r2" ? "auto" : (conn.region ?? "us-east-1");
    return new S3Client(
      conn.endpoint ?? `https://s3.${region}.amazonaws.com`,
      conn.accessKeyId,
      conn.secretAccessKey,
      region
    );
  }

  // Fall back to environment-level S3-compatible storage (e.g. Cloudflare R2)
  const endpoint = process.env.STORAGE_ENDPOINT;
  const accessKeyId = process.env.STORAGE_ACCESS_KEY;
  const secretAccessKey = process.env.STORAGE_SECRET_KEY;
  const region = process.env.STORAGE_REGION ?? "auto";

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "No storage connection configured for this project. " +
      "Add a storage connection in the dashboard or set STORAGE_ENDPOINT, STORAGE_ACCESS_KEY, and STORAGE_SECRET_KEY."
    );
  }

  return new S3Client(endpoint, accessKeyId, secretAccessKey, region);
}
