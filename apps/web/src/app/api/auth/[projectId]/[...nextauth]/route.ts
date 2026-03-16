/**
 * Dynamic auth route per project.
 * URL: /api/auth/{projectId}/[...nextauth]
 *
 * Developer's app points NextAuth at:
 *   NEXTAUTH_URL=https://your-postbase.com/api/auth/{projectId}
 */
import NextAuth from "next-auth";
import { type NextRequest } from "next/server";
import { buildAuthConfig, getEnabledProviders } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

async function getHandler(req: NextRequest, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params;

  // Verify project exists
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project) {
    return new Response(JSON.stringify({ error: "Project not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const enabledProviders = await getEnabledProviders(projectId);
  const config = await buildAuthConfig(projectId, enabledProviders);

  const { handlers } = NextAuth(config);
  return handlers.GET(req);
}

async function postHandler(req: NextRequest, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params;

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project) {
    return new Response(JSON.stringify({ error: "Project not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const enabledProviders = await getEnabledProviders(projectId);
  const config = await buildAuthConfig(projectId, enabledProviders);

  const { handlers } = NextAuth(config);
  return handlers.POST(req);
}

export { getHandler as GET, postHandler as POST };
