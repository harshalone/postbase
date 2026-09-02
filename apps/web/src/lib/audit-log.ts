import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { auditLogs } from "@/lib/db/schema";

export type AuditAction =
  | "auth.sign_up"
  | "auth.sign_in"
  | "auth.sign_out"
  | "auth.token_refresh"
  | "auth.otp_request"
  | "auth.otp_verify";

export function requestIp(req: NextRequest): string | null {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]!.trim();
  return req.headers.get("x-real-ip");
}

export function requestUserAgent(req: NextRequest): string | null {
  return req.headers.get("user-agent");
}

/**
 * Fire-and-forget audit log insert. Never throws — a logging failure must
 * never break the auth flow that triggered it.
 */
export function logAuditEvent(params: {
  projectId: string;
  userId?: string | null;
  action: AuditAction;
  req?: NextRequest;
  metadata?: Record<string, unknown>;
}): void {
  const { projectId, userId, action, req, metadata } = params;
  db.insert(auditLogs)
    .values({
      projectId,
      userId: userId ?? null,
      action,
      ipAddress: req ? requestIp(req) : null,
      userAgent: req ? requestUserAgent(req) : null,
      metadata: metadata ?? {},
    })
    .catch((err: unknown) => {
      console.error("[audit-log] insert failed:", err);
    });
}
