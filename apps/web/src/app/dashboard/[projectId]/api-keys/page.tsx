import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { CopyButton } from "./copy-button";

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
    <div className="p-8">
      <h1 className="text-2xl font-bold text-white mb-2">API Keys</h1>
      <p className="text-zinc-400 mb-8">
        Use these keys to authenticate requests from your app.
      </p>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
        <h2 className="font-semibold text-white mb-1">{project.name}</h2>
        <p className="text-xs text-zinc-500 mb-6">ID: {project.id}</p>

        <div className="space-y-4">
          <KeyRow
            label="Anon Key"
            description="Safe to use in the browser. Respects Row Level Security."
            value={project.anonKey}
            badge="public"
          />
          <KeyRow
            label="Service Role Key"
            description="Server-side only. Bypasses RLS. Keep this secret."
            value={project.serviceRoleKey}
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
  );
}

function KeyRow({
  label,
  description,
  value,
  badge,
}: {
  label: string;
  description: string;
  value: string;
  badge: "public" | "secret";
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm font-medium text-zinc-200">{label}</span>
        <span
          className={`text-xs px-2 py-0.5 rounded-full ${
            badge === "public"
              ? "bg-brand-900 text-brand-400"
              : "bg-red-950 text-red-400"
          }`}
        >
          {badge}
        </span>
      </div>
      <p className="text-xs text-zinc-500 mb-2">{description}</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-xs text-zinc-300 font-mono truncate">
          {value}
        </code>
        <CopyButton value={value} />
      </div>
    </div>
  );
}
