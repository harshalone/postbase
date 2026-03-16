import { db } from "@/lib/db";
import { users, sessions } from "@/lib/db/schema";
import { count, eq } from "drizzle-orm";

export default async function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  const [userCount] = await db
    .select({ count: count() })
    .from(users)
    .where(eq(users.projectId, projectId));

  const [sessionCount] = await db
    .select({ count: count() })
    .from(sessions)
    .where(eq(sessions.projectId, projectId));

  const stats = [
    { label: "Total Users", value: userCount?.count ?? 0 },
    { label: "Active Sessions", value: sessionCount?.count ?? 0 },
  ];

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-white mb-2">Overview</h1>
      <p className="text-zinc-400 mb-8">Project dashboard.</p>

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
  );
}
