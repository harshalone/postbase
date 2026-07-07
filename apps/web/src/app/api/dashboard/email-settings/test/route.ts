import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { emailSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createTransport } from "nodemailer";
import {
  isSmtpConfigured,
  isSesIamConfigured,
  isSesSmtpConfigured,
  buildTransportConfig,
  resolveFrom,
} from "@/lib/email/ses";

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

  if (!isSmtpConfigured(settings) && !isSesIamConfigured(settings) && !isSesSmtpConfigured(settings)) {
    return Response.json({ error: "Email is not fully configured. Please fill in all required fields and save." }, { status: 400 });
  }

  const transportConfig = buildTransportConfig(settings);

  try {
    const transporter = createTransport(transportConfig);
    const from = resolveFrom(settings);
    await transporter.sendMail({ from, to, subject, html: `<p>${body.replace(/\n/g, "<br>")}</p>` });
    return Response.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send email";
    return Response.json({ error: message }, { status: 500 });
  }
}
