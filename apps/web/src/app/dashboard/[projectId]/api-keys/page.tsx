import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { KeyRow } from "./key-row";
import { PageHeader } from "../_components/page-header";

export default async function ApiKeysPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project) notFound();

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="API Keys" />
      <div className="p-6 overflow-auto">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="font-semibold text-white mb-1">{project.name}</h2>
          <p className="text-xs text-zinc-500 mb-6">ID: {project.id}</p>

          <div className="space-y-4">
            <KeyRow
              projectId={projectId}
              label="Anon Key"
              description="Safe to use in the browser. Respects Row Level Security."
              initialValue={project.anonKey}
              type="anon"
              badge="public"
            />
            <KeyRow
              projectId={projectId}
              label="Service Role Key"
              description="Server-side only. Bypasses RLS. Keep this secret."
              initialValue={project.serviceRoleKey}
              type="service_role"
              badge="secret"
            />
          </div>

          <div className="mt-6 pt-4 border-t border-zinc-800">
            <p className="text-xs text-zinc-500 mb-2">SDK Initialization</p>
            <pre className="bg-zinc-800 rounded-lg p-3 text-xs text-zinc-300 overflow-x-auto">
              {`import { createClient } from '@postbase/client'

const postbase = createClient(
  '${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}',
  '${project.anonKey}'
)`}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
