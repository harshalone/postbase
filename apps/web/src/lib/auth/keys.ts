import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * Generate a new API key with a typed prefix.
 * anon keys:         pb_anon_<random>
 * service role keys: pb_service_<random>
 */
export function generateAnonKey(): string {
  return `pb_anon_${nanoid(64)}`;
}

export function generateServiceRoleKey(): string {
  return `pb_service_${nanoid(64)}`;
}

/**
 * Validate an API key and return the project + key type.
 * If projectId is provided, the key must belong to that specific project.
 * Returns null if the key is invalid or belongs to a different project.
 */
export async function validateApiKey(
  key: string,
  projectId?: string
): Promise<{ projectId: string; type: "anon" | "service_role" } | null> {
  if (key.startsWith("pb_anon_")) {
    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.anonKey, key))
      .limit(1);
    if (project) {
      if (projectId && project.id !== projectId) return null;
      return { projectId: project.id, type: "anon" };
    }
  }

  if (key.startsWith("pb_service_")) {
    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.serviceRoleKey, key))
      .limit(1);
    if (project) {
      if (projectId && project.id !== projectId) return null;
      return { projectId: project.id, type: "service_role" };
    }
  }

  return null;
}
