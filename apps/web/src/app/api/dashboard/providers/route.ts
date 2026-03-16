import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { providerConfigs } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

const schema = z.object({
  projectId: z.string().uuid(),
  provider: z.string().min(1),
  enabled: z.boolean(),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  config: z.record(z.string()).optional(),
});

export async function POST(req: NextRequest) {
  const body = schema.safeParse(await req.json());
  if (!body.success) {
    return Response.json({ error: body.error.flatten() }, { status: 400 });
  }

  const { projectId, provider, enabled, clientId, clientSecret, config } = body.data;

  // Upsert provider config
  const existing = await db
    .select()
    .from(providerConfigs)
    .where(
      and(
        eq(providerConfigs.projectId, projectId),
        eq(providerConfigs.provider, provider)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(providerConfigs)
      .set({
        enabled,
        clientId: clientId ?? null,
        clientSecret: clientSecret ?? null,
        config: config ?? {},
        updatedAt: new Date(),
      })
      .where(eq(providerConfigs.id, existing[0].id));
  } else {
    await db.insert(providerConfigs).values({
      projectId,
      provider,
      enabled,
      clientId: clientId ?? null,
      clientSecret: clientSecret ?? null,
      config: config ?? {},
    });
  }

  return Response.json({ ok: true });
}
