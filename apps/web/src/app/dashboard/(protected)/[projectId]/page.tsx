import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getProjectPool, getProjectSchema, ensureProjectAuthTables } from "@/lib/project-db";
import { PageHeader } from "./_components/page-header";

export default async function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  const [project] = await db
    .select({ databaseUrl: projects.databaseUrl })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  let userCount = 0;
  let sessionCount = 0;

  if (project) {
    const schema = getProjectSchema(projectId);
    const pool = getProjectPool(project.databaseUrl);
    const client = await pool.connect();
    try {
      await ensureProjectAuthTables(client, schema);
      const u = await client.query(`SELECT COUNT(*)::int AS c FROM "${schema}"."users"`);
      const s = await client.query(`SELECT COUNT(*)::int AS c FROM "${schema}"."sessions" WHERE "expires" > now()`);
      userCount = u.rows[0]?.c ?? 0;
      sessionCount = s.rows[0]?.c ?? 0;
    } finally {
      client.release();
      await pool.end();
    }
  }

  const stats = [
    { label: "Total Users", value: userCount },
    { label: "Active Sessions", value: sessionCount },
  ];

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Overview" />
      <div className="p-6 overflow-auto">
        <div className="grid grid-cols-2 gap-4 mb-10">
          {stats.map((s) => (
            <div
              key={s.label}
              className="p-6 rounded-xl border border-zinc-800 bg-zinc-900"
            >
              <p className="text-3xl font-bold text-white">{s.value}</p>
              <p className="text-zinc-400 text-sm mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="font-semibold text-white mb-4">Quick Start</h2>
          <ol className="space-y-3 text-sm text-zinc-400 list-decimal list-inside">
            <li>Enable auth providers in the Auth Providers tab</li>
            <li>
              Install the SDK:{" "}
              <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-200">
                npm install @postbase/client
              </code>
            </li>
            <li>
              Get your API keys from the API Keys tab and initialise the client:
              <pre className="mt-2 bg-zinc-800 rounded-lg p-3 text-zinc-200 overflow-x-auto">
                {`import { createClient } from '@postbase/client'

const postbase = createClient(
  'http://your-postbase.com',
  'pb_anon_...'
)`}
              </pre>
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}
