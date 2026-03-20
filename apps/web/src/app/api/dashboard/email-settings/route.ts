import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { emailSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const schema = z.object({
  projectId: z.string().uuid(),
  provider: z.enum(["smtp", "ses"]),
  // SMTP
  smtpHost: z.string().optional(),
  smtpPort: z.number().int().optional(),
  smtpUser: z.string().optional(),
  smtpPassword: z.string().optional(),
  smtpSecure: z.boolean().optional(),
  smtpFrom: z.string().optional(),
  // SES
  sesRegion: z.string().optional(),
  sesAccessKeyId: z.string().optional(),
  sesSecretAccessKey: z.string().optional(),
  sesFrom: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) {
    return Response.json({ error: "projectId required" }, { status: 400 });
  }

  const [settings] = await db
    .select()
    .from(emailSettings)
    .where(eq(emailSettings.projectId, projectId))
    .limit(1);

  return Response.json({ settings: settings ?? null });
}

export async function POST(req: NextRequest) {
  const body = schema.safeParse(await req.json());
  if (!body.success) {
    return Response.json({ error: body.error.flatten() }, { status: 400 });
  }

  const data = body.data;

  const existing = await db
    .select()
    .from(emailSettings)
    .where(eq(emailSettings.projectId, data.projectId))
    .limit(1);

  const values = {
    provider: data.provider,
    smtpHost: data.smtpHost ?? null,
    smtpPort: data.smtpPort ?? null,
    smtpUser: data.smtpUser ?? null,
    smtpPassword: data.smtpPassword ?? null,
    smtpSecure: data.smtpSecure ?? true,
    smtpFrom: data.smtpFrom ?? null,
    sesRegion: data.sesRegion ?? null,
    sesAccessKeyId: data.sesAccessKeyId ?? null,
    sesSecretAccessKey: data.sesSecretAccessKey ?? null,
    sesFrom: data.sesFrom ?? null,
    updatedAt: new Date(),
  };

  if (existing.length > 0) {
    await db
      .update(emailSettings)
      .set(values)
      .where(eq(emailSettings.id, existing[0].id));
  } else {
    await db.insert(emailSettings).values({
      projectId: data.projectId,
      ...values,
    });
  }

  return Response.json({ ok: true });
}
