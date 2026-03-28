import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { KeyRow } from "./key-row";
import { CopyButton } from "./copy-button";
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
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium text-zinc-200">URL</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">public</span>
              </div>
              <p className="text-xs text-zinc-500 mb-2">The base URL of this postbase instance.</p>
              <div className="flex items-start gap-2">
                <code className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-xs text-zinc-300 font-mono break-all">
                  {process.env.NEXTAUTH_URL ?? "http://localhost:3000"}
                </code>
                <div className="shrink-0">
                  <CopyButton value={process.env.NEXTAUTH_URL ?? "http://localhost:3000"} />
                </div>
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium text-zinc-200">Project ID</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">public</span>
              </div>
              <p className="text-xs text-zinc-500 mb-2">Identifies this project in all API calls.</p>
              <div className="flex items-start gap-2">
                <code className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-xs text-zinc-300 font-mono break-all">
                  {projectId}
                </code>
                <div className="shrink-0">
                  <CopyButton value={projectId} />
                </div>
              </div>
            </div>
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

// Anon client (browser-safe, respects RLS)
const postbase = createClient(
  '${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}',
  '${projectId}',
  '${project.anonKey}'
)

// Service role client (server-side only, bypasses RLS)
const postbaseAdmin = createClient(
  '${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}',
  '${projectId}',
  '${project.serviceRoleKey}'
)`}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
