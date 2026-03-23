"use server";

import * as OTPAuth from "otpauth";
import QRCode from "qrcode";
import { auth } from "@/lib/auth/admin";
import { db } from "@/lib/db";
import { adminUsers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/** Generate a new TOTP secret and return the provisioning URI + QR code data URL. */
export async function generateTotpSetupAction() {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated." };

  const secret = new OTPAuth.Secret({ size: 20 });

  const totp = new OTPAuth.TOTP({
    issuer: "Postbase",
    label: session.user.email ?? "admin",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret,
  });

  const uri = totp.toString();
  const qrDataUrl = await QRCode.toDataURL(uri);

  return { ok: true, secret: secret.base32, qrDataUrl };
}

/** Verify the TOTP code and, if valid, persist the secret and enable 2FA. */
export async function enableTotpAction(secretBase32: string, code: string) {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated." };

  const totp = new OTPAuth.TOTP({
    issuer: "Postbase",
    label: session.user.email ?? "admin",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });

  const delta = totp.validate({ token: code, window: 1 });
  if (delta === null) return { ok: false, error: "Invalid code. Please try again." };

  await db
    .update(adminUsers)
    .set({ totpSecret: secretBase32, totpEnabled: true, updatedAt: new Date() })
    .where(eq(adminUsers.id, session.user.id));

  return { ok: true };
}

/** Disable 2FA for the current admin. */
export async function disableTotpAction() {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated." };

  await db
    .update(adminUsers)
    .set({ totpSecret: null, totpEnabled: false, updatedAt: new Date() })
    .where(eq(adminUsers.id, session.user.id));

  return { ok: true };
}
