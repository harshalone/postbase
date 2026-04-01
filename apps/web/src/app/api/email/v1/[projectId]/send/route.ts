/**
 * @swagger
 * /api/email/v1/{projectId}/send:
 *   post:
 *     summary: Send a transactional email
 *     tags: [Email]
 *     description: Send an email to a recipient using the project's configured email provider.
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         description: The project ID
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - to
 *               - subject
 *             properties:
 *               to:
 *                 type: string
 *                 format: email
 *                 description: Recipient email address
 *               subject:
 *                 type: string
 *                 description: Email subject line
 *               text:
 *                 type: string
 *                 description: Plain text body (at least one of text or html is required)
 *               html:
 *                 type: string
 *                 description: HTML body (at least one of text or html is required)
 *     responses:
 *       200:
 *         description: Email sent successfully
 *       400:
 *         description: Invalid request body
 *       401:
 *         description: Missing or invalid API key
 *       500:
 *         description: Email provider not configured or send failed
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { emailSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { validateApiKey } from "@/lib/auth/keys";
import { createTransport } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

const bodySchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1),
  text: z.string().optional(),
  html: z.string().optional(),
}).refine((data) => data.text || data.html, {
  message: "At least one of 'text' or 'html' is required",
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

  const { to, subject, text, html } = parsed.data;

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
    return Response.json({ error: "Email not configured for this project" }, { status: 500 });
  }

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

  try {
    const transporter = createTransport(transportConfig);
    const fromEmail = settings.sesFrom ?? settings.smtpFrom ?? settings.smtpUser ?? undefined;
    const fromName = settings.sesFromName ?? settings.smtpFromName ?? undefined;
    const from = fromEmail && fromName ? `"${fromName}" <${fromEmail}>` : fromEmail;

    await transporter.sendMail({ from, to, subject, text, html });

    return Response.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send email";
    return Response.json({ error: message }, { status: 500 });
  }
}
