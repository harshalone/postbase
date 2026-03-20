import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { emailTemplates } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

const schema = z.object({
  projectId: z.string().uuid(),
  type: z.enum(["magic_link", "otp"]),
  subject: z.string().min(1),
  body: z.string().min(1),
});

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) {
    return Response.json({ error: "projectId required" }, { status: 400 });
  }

  const templates = await db
    .select()
    .from(emailTemplates)
    .where(eq(emailTemplates.projectId, projectId));

  return Response.json({ templates });
}

export async function POST(req: NextRequest) {
  const body = schema.safeParse(await req.json());
  if (!body.success) {
    return Response.json({ error: body.error.flatten() }, { status: 400 });
  }

  const { projectId, type, subject, body: templateBody } = body.data;

  const existing = await db
    .select()
    .from(emailTemplates)
    .where(
      and(
        eq(emailTemplates.projectId, projectId),
        eq(emailTemplates.type, type)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(emailTemplates)
      .set({ subject, body: templateBody, updatedAt: new Date() })
      .where(eq(emailTemplates.id, existing[0].id));
  } else {
    await db.insert(emailTemplates).values({
      projectId,
      type,
      subject,
      body: templateBody,
    });
  }

  return Response.json({ ok: true });
}
