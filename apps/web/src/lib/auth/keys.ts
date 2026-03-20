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
 * Returns null if the key is invalid.
 */
export async function validateApiKey(
  key: string
): Promise<{ projectId: string; type: "anon" | "service_role" } | null> {
  if (key.startsWith("pb_anon_")) {
    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.anonKey, key))
      .limit(1);
    if (project) return { projectId: project.id, type: "anon" };
  }

  if (key.startsWith("pb_service_")) {
    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.serviceRoleKey, key))
      .limit(1);
    if (project) return { projectId: project.id, type: "service_role" };
  }

  return null;
}
