import { NextRequest, NextResponse } from "next/server";
import * as OTPAuth from "otpauth";
import { auth } from "@/lib/auth/admin";
import { db } from "@/lib/db";
import { adminUsers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
  }

  const { code } = await req.json();
  if (!code) {
    return NextResponse.json({ ok: false, error: "Code required." }, { status: 400 });
  }

  const [admin] = await db
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.id, session.user.id))
    .limit(1);

  if (!admin?.totpSecret || !admin.totpEnabled) {
    return NextResponse.json({ ok: false, error: "2FA not configured." }, { status: 400 });
  }

  const totp = new OTPAuth.TOTP({
    issuer: "Postbase",
    label: admin.email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(admin.totpSecret),
  });

  const delta = totp.validate({ token: code, window: 1 });
  if (delta === null) {
    return NextResponse.json({ ok: false, error: "Invalid code." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
