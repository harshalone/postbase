/**
 * POST /api/auth/v1/[projectId]/otp
 *
 * Send a magic link / OTP to the user's email.
 * Requires: Authorization: Bearer <anon-key>
 * Body: { email, redirectTo? }
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { emailSettings, emailTemplates } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { validateApiKey } from "@/lib/auth/keys";
import { getProjectPool, getProjectSchema, ensureProjectAuthTables } from "@/lib/project-db";
import { nanoid } from "nanoid";
import { createTransport } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

const bodySchema = z.object({
  email: z.string().email(),
  redirectTo: z.string().url().optional(),
});

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

  const { email, redirectTo } = parsed.data;

  const schema = getProjectSchema(keyInfo.projectId);
  const pool = getProjectPool();
  const client = await pool.connect();
  try {
    await ensureProjectAuthTables(client, schema);

    // Upsert user — create if not exists
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

    const token = nanoid(64);
    const expires = new Date(Date.now() + 60 * 60 * 1000);

    // Delete any existing token for this email then insert new one
    await client.query(
      `DELETE FROM "${schema}"."verification_tokens" WHERE "identifier" = $1`,
      [email]
    );
    await client.query(
      `INSERT INTO "${schema}"."verification_tokens" ("identifier", "token", "expires")
       VALUES ($1, $2, $3)`,
      [email, token, expires]
    );

    const baseUrl = process.env.NEXTAUTH_URL ?? req.nextUrl.origin;
    const magicLink = `${baseUrl}/api/auth/v1/${projectId}/verify?token=${token}&email=${encodeURIComponent(email)}${redirectTo ? `&redirectTo=${encodeURIComponent(redirectTo)}` : ""}`;

    // Email settings still live in _postbase (project config, not user data)
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
        return Response.json({ message: "OTP sent", _dev_magic_link: magicLink });
      }
      return Response.json({ error: "Email not configured for this project" }, { status: 500 });
    }

    const [template] = await db
      .select()
      .from(emailTemplates)
      .where(and(eq(emailTemplates.projectId, keyInfo.projectId), eq(emailTemplates.type, "magic_link")))
      .limit(1);

    const subject = template?.subject ?? "Your magic link";
    const htmlBody = template?.body
      ? template.body.replace("{{magic_link}}", magicLink).replace("{{email}}", email)
      : `<p>Click <a href="${magicLink}">here</a> to sign in.</p>`;

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
    await transporter.sendMail({
      from,
      to: email,
      subject,
      html: htmlBody,
    });

    return Response.json({ message: "OTP sent" });
  } finally {
    client.release();
    await pool.end();
  }
}
