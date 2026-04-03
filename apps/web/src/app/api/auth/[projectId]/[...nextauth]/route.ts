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

function corsHeaders(req: NextRequest) {
  const origin = req.headers.get("origin") ?? "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
  };
}

export async function OPTIONS(req: NextRequest) {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

async function getProject(projectId: string) {
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  return project;
}

async function getHandler(req: NextRequest, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params;

  const project = await getProject(projectId);
  if (!project) {
    return new Response(JSON.stringify({ error: "Project not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const enabledProviders = await getEnabledProviders(projectId);
  const config = await buildAuthConfig(projectId, enabledProviders);

  const { handlers } = NextAuth(config);
  const res = await handlers.GET(req);

  const headers = new Headers(res.headers);
  for (const [key, value] of Object.entries(corsHeaders(req))) {
    headers.set(key, value);
  }
  return new Response(res.body, { status: res.status, headers });
}

async function postHandler(req: NextRequest, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params;

  const project = await getProject(projectId);
  if (!project) {
    return new Response(JSON.stringify({ error: "Project not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const enabledProviders = await getEnabledProviders(projectId);
  const config = await buildAuthConfig(projectId, enabledProviders);

  const { handlers } = NextAuth(config);
  const res = await handlers.POST(req);

  const headers = new Headers(res.headers);
  for (const [key, value] of Object.entries(corsHeaders(req))) {
    headers.set(key, value);
  }
  return new Response(res.body, { status: res.status, headers });
}

export { getHandler as GET, postHandler as POST };
