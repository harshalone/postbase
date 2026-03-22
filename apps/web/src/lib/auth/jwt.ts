/**
 * Lightweight JWT utilities for Postbase auth tokens.
 * Uses the Web Crypto API (available in Edge and Node 18+).
 */

export interface JwtPayload {
  sub: string;       // user id
  pid: string;       // project id
  email: string;
  role?: string;
  iat: number;
  exp: number;
  jti?: string;      // token id (for refresh tokens)
}

function base64urlEncode(data: Uint8Array): string {
  return Buffer.from(data)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64urlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64");
}

async function getKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyData = enc.encode(secret);
  return crypto.subtle.importKey(
    "raw",
    keyData.buffer.slice(keyData.byteOffset, keyData.byteOffset + keyData.byteLength) as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function signJwt(payload: Omit<JwtPayload, "iat">, secret: string): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const enc = new TextEncoder();

  const fullPayload: JwtPayload = { ...payload, iat: Math.floor(Date.now() / 1000) };

  const headerB64 = base64urlEncode(enc.encode(JSON.stringify(header)));
  const payloadB64 = base64urlEncode(enc.encode(JSON.stringify(fullPayload)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await getKey(secret);
  const signingInputBytes = enc.encode(signingInput);
  const signature = await crypto.subtle.sign("HMAC", key, signingInputBytes.buffer.slice(signingInputBytes.byteOffset, signingInputBytes.byteOffset + signingInputBytes.byteLength) as ArrayBuffer);

  return `${signingInput}.${base64urlEncode(new Uint8Array(signature))}`;
}

export async function verifyJwt(token: string, secret: string): Promise<JwtPayload | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, sigB64] = parts;
    const signingInput = `${headerB64}.${payloadB64}`;

    const enc = new TextEncoder();
    const key = await getKey(secret);
    const sigBytes = base64urlDecode(sigB64);
    const inputBytes = enc.encode(signingInput);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes.buffer.slice(sigBytes.byteOffset, sigBytes.byteOffset + sigBytes.byteLength) as ArrayBuffer,
      inputBytes.buffer.slice(inputBytes.byteOffset, inputBytes.byteOffset + inputBytes.byteLength) as ArrayBuffer
    );
    if (!valid) return null;

    const payload = JSON.parse(Buffer.from(base64urlDecode(payloadB64)).toString()) as JwtPayload;

    // Check expiry
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch {
    return null;
  }
}

export function decodeJwtUnsafe(token: string): JwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    return JSON.parse(Buffer.from(base64urlDecode(parts[1])).toString()) as JwtPayload;
  } catch {
    return null;
  }
}

/** Default token TTLs */
export const ACCESS_TOKEN_TTL = 60 * 60;          // 1 hour
export const REFRESH_TOKEN_TTL = 60 * 60 * 24 * 7; // 7 days

export function getJwtSecret(): string {
  const secret = process.env.POSTBASE_JWT_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("POSTBASE_JWT_SECRET or NEXTAUTH_SECRET env var is required");
  return secret;
}
