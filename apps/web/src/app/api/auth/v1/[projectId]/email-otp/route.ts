/**
 * POST /api/auth/v1/[projectId]/email-otp
 *
 * Send a 6-digit OTP code to the user's email.
 * Requires: Authorization: Bearer <anon-key>
 * Body: { email }
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { emailSettings, emailTemplates } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { validateApiKey } from "@/lib/auth/keys";
import { getProjectPool, getProjectSchema, ensureProjectAuthTables } from "@/lib/project-db";
import { createTransport } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

const bodySchema = z.object({
  email: z.string().email(),
});

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return Response.json({ error: "Missing API key" }, { status: 401 });
  }
  const keyInfo = await validateApiKey(authHeader.slice(7), projectId);
  if (!keyInfo) return Response.json({ error: "Invalid API key" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const { email } = parsed.data;

  const schema = getProjectSchema(keyInfo.projectId);
  const pool = getProjectPool();
  const client = await pool.connect();
  try {
    await ensureProjectAuthTables(client, schema);
    await client.query(`SET search_path TO "${schema}", public`);

    // Upsert user
    const { rows: [existing] } = await client.query(
      `SELECT id FROM "${schema}"."users" WHERE "email" = $1 LIMIT 1`,
      [email]
    );
    if (!existing) {
      await client.query(
        `INSERT INTO "${schema}"."users" ("email") VALUES ($1) ON CONFLICT DO NOTHING`,
        [email]
      );
    }

    const code = generateOtp();
    const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Delete existing OTP tokens for this email, insert new one
    await client.query(
      `DELETE FROM "${schema}"."verification_tokens" WHERE "identifier" = $1`,
      [email]
    );
    await client.query(
      `INSERT INTO "${schema}"."verification_tokens" ("identifier", "token", "expires")
       VALUES ($1, $2, $3)`,
      [email, code, expires]
    );

    const [settings] = await db
      .select()
      .from(emailSettings)
      .where(eq(emailSettings.projectId, keyInfo.projectId))
      .limit(1);

    const isSmtpConfigured = settings?.provider === "smtp" && settings.smtpHost;
    const isSesIamConfigured = settings?.provider === "ses" && settings.sesAccessKeyId && settings.sesSecretAccessKey;
    const isSesSmtpConfigured = settings?.provider === "ses" && settings.sesSmtpUsername && settings.sesSmtpPassword;
    const emailConfigured = isSmtpConfigured || isSesIamConfigured || isSesSmtpConfigured;

    if (!emailConfigured) {
      if (process.env.NODE_ENV === "development") {
        return Response.json({ message: "OTP sent", _dev_otp: code });
      }
      return Response.json({ error: "Email not configured for this project" }, { status: 500 });
    }

    const [template] = await db
      .select()
      .from(emailTemplates)
      .where(and(eq(emailTemplates.projectId, keyInfo.projectId), eq(emailTemplates.type, "otp")))
      .limit(1);

    const subject = template?.subject ?? "Your verification code";
    const htmlBody = template?.body
      ? template.body
          .replace(/\{\{code\}\}/g, code)
          .replace(/\{\{email\}\}/g, email)
          .replace(/\{\{expires_in\}\}/g, "10 minutes")
      : `<p>Your verification code is: <strong>${code}</strong></p><p>This code expires in 10 minutes.</p>`;

    let transportConfig: SMTPTransport.Options;

    if (isSesSmtpConfigured) {
      const sesSmtpHost = `email-smtp.${settings.sesRegion ?? "us-east-1"}.amazonaws.com`;
      transportConfig = {
        host: sesSmtpHost, port: 587, secure: false,
        auth: { user: settings.sesSmtpUsername!, pass: settings.sesSmtpPassword! },
      };
    } else if (isSesIamConfigured) {
      const sesSmtpHost = `email-smtp.${settings.sesRegion ?? "us-east-1"}.amazonaws.com`;
      transportConfig = {
        host: sesSmtpHost, port: 587, secure: false,
        auth: { user: settings.sesAccessKeyId!, pass: settings.sesSecretAccessKey! },
      };
    } else {
      transportConfig = {
        host: settings.smtpHost!,
        port: settings.smtpPort ?? 587,
        secure: settings.smtpSecure ?? true,
        auth: settings.smtpUser
          ? { user: settings.smtpUser, pass: settings.smtpPassword ?? "" }
          : undefined,
      };
    }

    const transporter = createTransport(transportConfig);
    const fromEmail = settings.sesFrom ?? settings.smtpFrom ?? settings.smtpUser ?? undefined;
    const fromName = settings.sesFromName ?? settings.smtpFromName ?? undefined;
    const from = fromEmail && fromName ? `"${fromName}" <${fromEmail}>` : fromEmail;

    await transporter.sendMail({ from, to: email, subject, html: htmlBody });

    return Response.json({ message: "OTP sent" });
  } finally {
    client.release();
  }
}
