import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { generateAnonKey, generateServiceRoleKey } from "@/lib/auth/keys";

const schema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
  organisationId: z.string().uuid().optional(),
});

export async function POST(req: NextRequest) {
  const body = schema.safeParse(await req.json());
  if (!body.success) {
    return Response.json({ error: body.error.flatten() }, { status: 400 });
  }

  const { name, slug, organisationId } = body.data;

  const [project] = await db
    .insert(projects)
    .values({
      name,
      slug,
      organisationId: organisationId ?? null,
      anonKey: generateAnonKey(),
      serviceRoleKey: generateServiceRoleKey(),
    })
    .returning();

  return Response.json({ project });
}

export async function GET() {
  const allProjects = await db.select().from(projects);
  return Response.json({ projects: allProjects });
}
