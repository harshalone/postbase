import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { emailSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createTransport } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import { createHmac } from "crypto";

function deriveSesSMTPPassword(secretKey: string, region: string): string {
  const date = "11111111";
  const service = "ses";
  const terminal = "aws4_request";
  const message = "SendRawEmail";
  const version = Buffer.from([0x04]);

  const kDate = createHmac("sha256", `AWS4${secretKey}`).update(date).digest();
  const kRegion = createHmac("sha256", kDate).update(region).digest();
  const kService = createHmac("sha256", kRegion).update(service).digest();
  const kTerminal = createHmac("sha256", kService).update(terminal).digest();
  const kMessage = createHmac("sha256", kTerminal).update(message).digest();
  const signatureAndVersion = Buffer.concat([version, kMessage]);
  return signatureAndVersion.toString("base64");
}

const schema = z.object({
  projectId: z.string().uuid(),
  to: z.string().email(),
  subject: z.string().min(1),
  body: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { projectId, to, subject, body } = parsed.data;

  const [settings] = await db
    .select()
    .from(emailSettings)
    .where(eq(emailSettings.projectId, projectId))
    .limit(1);

  if (!settings) {
    return Response.json({ error: "No email settings found. Save your configuration first." }, { status: 400 });
  }

  const isSmtpConfigured = settings.provider === "smtp" && settings.smtpHost;
  const isSesIamConfigured = settings.provider === "ses" && settings.sesAccessKeyId && settings.sesSecretAccessKey;
  const isSesSmtpConfigured = settings.provider === "ses" && settings.sesSmtpUsername && settings.sesSmtpPassword;

  if (!isSmtpConfigured && !isSesIamConfigured && !isSesSmtpConfigured) {
    return Response.json({ error: "Email is not fully configured. Please fill in all required fields and save." }, { status: 400 });
  }

  let transportConfig: SMTPTransport.Options;

  if (isSesSmtpConfigured) {
    const sesSmtpHost = `email-smtp.${settings.sesRegion ?? "us-east-1"}.amazonaws.com`;
    transportConfig = {
      host: sesSmtpHost,
      port: 587,
      secure: false,
      auth: { user: settings.sesSmtpUsername!, pass: settings.sesSmtpPassword! },
    };
  } else if (isSesIamConfigured) {
    const sesRegion = settings.sesRegion ?? "us-east-1";
    const sesSmtpHost = `email-smtp.${sesRegion}.amazonaws.com`;
    const smtpPassword = deriveSesSMTPPassword(settings.sesSecretAccessKey!, sesRegion);
    transportConfig = {
      host: sesSmtpHost,
      port: 587,
      secure: false,
      auth: { user: settings.sesAccessKeyId!, pass: smtpPassword },
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
    await transporter.sendMail({ from, to, subject, html: `<p>${body.replace(/\n/g, "<br>")}</p>` });
    return Response.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send email";
    return Response.json({ error: message }, { status: 500 });
  }
}
