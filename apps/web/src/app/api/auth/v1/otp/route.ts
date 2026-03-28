/**
 * POST /api/auth/v1/otp
 *
 * Send a magic link / OTP to the user's email.
 * Requires: Authorization: Bearer <anon-key>
 * Body: { email, redirectTo? }
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { users, verificationTokens, emailSettings, emailTemplates } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { validateApiKey } from "@/lib/auth/keys";
import { nanoid } from "nanoid";
import { createTransport } from "nodemailer";

const bodySchema = z.object({
  email: z.string().email(),
  redirectTo: z.string().url().optional(),
});

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return Response.json({ error: "Missing API key" }, { status: 401 });
  }
  const keyInfo = await validateApiKey(authHeader.slice(7));
  if (!keyInfo) return Response.json({ error: "Invalid API key" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const { email, redirectTo } = parsed.data;

  // Ensure user exists (or create a placeholder)
  let [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.projectId, keyInfo.projectId), eq(users.email, email)))
    .limit(1);

  if (!user) {
    const [newUser] = await db
      .insert(users)
      .values({ projectId: keyInfo.projectId, email })
      .returning({ id: users.id });
    user = newUser;
  }

  // Create verification token (valid 1 hour)
  const token = nanoid(64);
  const expires = new Date(Date.now() + 60 * 60 * 1000);

  await db
    .delete(verificationTokens)
    .where(eq(verificationTokens.identifier, email));

  await db.insert(verificationTokens).values({ identifier: email, token, expires });

  // Build magic link
  const baseUrl = process.env.NEXTAUTH_URL ?? req.nextUrl.origin;
  const magicLink = `${baseUrl}/api/auth/v1/verify?token=${token}&email=${encodeURIComponent(email)}${redirectTo ? `&redirectTo=${encodeURIComponent(redirectTo)}` : ""}`;

  // Get email settings for this project
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
    // No email configured — in dev, just return the link
    if (process.env.NODE_ENV === "development") {
      return Response.json({ message: "OTP sent", _dev_magic_link: magicLink });
    }
    return Response.json({ error: "Email not configured for this project" }, { status: 500 });
  }

  // Get template
  const [template] = await db
    .select()
    .from(emailTemplates)
    .where(and(eq(emailTemplates.projectId, keyInfo.projectId), eq(emailTemplates.type, "magic_link")))
    .limit(1);

  const subject = template?.subject ?? "Your magic link";
  const htmlBody = template?.body
    ? template.body.replace("{{magic_link}}", magicLink).replace("{{email}}", email)
    : `<p>Click <a href="${magicLink}">here</a> to sign in.</p>`;

  let transportConfig: Parameters<typeof createTransport>[0];

  if (isSesSmtpConfigured) {
    // AWS SES via SMTP credentials (downloaded CSV)
    const sesSmtpHost = `email-smtp.${settings.sesRegion ?? "us-east-1"}.amazonaws.com`;
    transportConfig = {
      host: sesSmtpHost,
      port: 587,
      secure: false,
      auth: { user: settings.sesSmtpUsername!, pass: settings.sesSmtpPassword! },
    };
  } else if (isSesIamConfigured) {
    // AWS SES via IAM access keys — use SES SMTP endpoint with STARTTLS
    // IAM keys are used directly as SMTP credentials for the SES SMTP interface
    const sesSmtpHost = `email-smtp.${settings.sesRegion ?? "us-east-1"}.amazonaws.com`;
    transportConfig = {
      host: sesSmtpHost,
      port: 587,
      secure: false,
      auth: { user: settings.sesAccessKeyId!, pass: settings.sesSecretAccessKey! },
    };
  } else {
    // Standard SMTP
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

  await transporter.sendMail({
    from: settings.sesFrom ?? settings.smtpFrom ?? settings.smtpUser ?? undefined,
    to: email,
    subject,
    html: htmlBody,
  });

  return Response.json({ message: "OTP sent" });
}
