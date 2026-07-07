import { createHmac } from "crypto";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import type { emailSettings } from "@/lib/db/schema";

type EmailSettings = typeof emailSettings.$inferSelect;

/**
 * Derives an SES SMTP password from an IAM secret access key.
 * SES SMTP does not accept the raw IAM secret key — it requires this
 * SigV4-derived signature (AWS's documented conversion algorithm).
 */
export function deriveSesSMTPPassword(secretKey: string, region: string): string {
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

export function isSmtpConfigured(settings: EmailSettings | undefined): boolean {
  return Boolean(settings?.provider === "smtp" && settings.smtpHost);
}

export function isSesIamConfigured(settings: EmailSettings | undefined): boolean {
  return Boolean(settings?.provider === "ses" && settings.sesAccessKeyId && settings.sesSecretAccessKey);
}

export function isSesSmtpConfigured(settings: EmailSettings | undefined): boolean {
  return Boolean(settings?.provider === "ses" && settings.sesSmtpUsername && settings.sesSmtpPassword);
}

export function buildTransportConfig(settings: EmailSettings): SMTPTransport.Options {
  if (isSesSmtpConfigured(settings)) {
    const sesRegion = settings.sesRegion ?? "us-east-1";
    return {
      host: `email-smtp.${sesRegion}.amazonaws.com`,
      port: 587,
      secure: false,
      auth: { user: settings.sesSmtpUsername!, pass: settings.sesSmtpPassword! },
    };
  }

  if (isSesIamConfigured(settings)) {
    const sesRegion = settings.sesRegion ?? "us-east-1";
    const smtpPassword = deriveSesSMTPPassword(settings.sesSecretAccessKey!, sesRegion);
    return {
      host: `email-smtp.${sesRegion}.amazonaws.com`,
      port: 587,
      secure: false,
      auth: { user: settings.sesAccessKeyId!, pass: smtpPassword },
    };
  }

  return {
    host: settings.smtpHost!,
    port: settings.smtpPort ?? 587,
    secure: settings.smtpSecure ?? true,
    auth: settings.smtpUser
      ? { user: settings.smtpUser, pass: settings.smtpPassword ?? "" }
      : undefined,
  };
}

export function resolveFrom(settings: EmailSettings): string | undefined {
  const fromEmail = settings.sesFrom ?? settings.smtpFrom ?? settings.smtpUser ?? undefined;
  const fromName = settings.sesFromName ?? settings.smtpFromName ?? undefined;
  return fromEmail && fromName ? `"${fromName}" <${fromEmail}>` : fromEmail;
}
