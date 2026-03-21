import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { organisations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const schema = z.object({
  name: z.string().min(1).max(100),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;

  const body = schema.safeParse(await req.json());
  if (!body.success) {
    return Response.json({ error: body.error.flatten() }, { status: 400 });
  }

  const [organisation] = await db
    .update(organisations)
    .set({ name: body.data.name })
    .where(eq(organisations.id, orgId))
    .returning();

  if (!organisation) {
    return Response.json({ error: "Organisation not found" }, { status: 404 });
  }

  return Response.json({ organisation });
}
