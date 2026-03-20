import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateAnonKey, generateServiceRoleKey } from "@/lib/auth/keys";

const schema = z.object({
  projectId: z.string().uuid(),
  type: z.enum(["anon", "service_role"]),
});

export async function POST(req: NextRequest) {
  const body = schema.safeParse(await req.json());
  if (!body.success) {
    return Response.json({ error: body.error.flatten() }, { status: 400 });
  }

  const { projectId, type } = body.data;

  const newKey =
    type === "anon" ? generateAnonKey() : generateServiceRoleKey();

  const [updated] = await db
    .update(projects)
    .set(type === "anon" ? { anonKey: newKey } : { serviceRoleKey: newKey })
    .where(eq(projects.id, projectId))
    .returning();

  if (!updated) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  return Response.json({ key: newKey });
}
