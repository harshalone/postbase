import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { organisations } from "@/lib/db/schema";

const schema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
});

export async function POST(req: NextRequest) {
  const body = schema.safeParse(await req.json());
  if (!body.success) {
    return Response.json({ error: body.error.flatten() }, { status: 400 });
  }

  const { name, slug } = body.data;

  const [organisation] = await db
    .insert(organisations)
    .values({ name, slug })
    .returning();

  return Response.json({ organisation });
}

export async function GET() {
  const allOrgs = await db.select().from(organisations);
  return Response.json({ organisations: allOrgs });
}
