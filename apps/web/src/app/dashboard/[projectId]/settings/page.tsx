import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PageHeader } from "../_components/page-header";

export default async function SettingsPage({
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
      <PageHeader title="Settings" />
      <div className="p-6 overflow-auto">
        <div className="max-w-2xl">
          {/* General */}
          <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 mb-6">
            <h2 className="font-semibold text-white mb-4">General</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                  Project Name
                </label>
                <input
                  disabled
                  defaultValue={project.name}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-sm text-zinc-300 cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                  Project Slug
                </label>
                <input
                  disabled
                  defaultValue={project.slug}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-sm text-zinc-300 cursor-not-allowed font-mono"
                />
                <p className="text-xs text-zinc-500 mt-1">Used in API URLs and SDK config.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                  Project ID
                </label>
                <input
                  disabled
                  defaultValue={project.id}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-sm text-zinc-500 cursor-not-allowed font-mono"
                />
                <p className="text-xs text-zinc-500 mt-1">Read-only. Used internally.</p>
              </div>
              <div className="pt-2">
                <button
                  disabled
                  className="cursor-not-allowed px-4 py-2 rounded-lg bg-brand-500 text-white text-sm font-medium opacity-50"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </section>

          {/* Auth Settings */}
          <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 mb-6">
            <h2 className="font-semibold text-white mb-4">Auth Settings</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                  Allowed Redirect URLs
                </label>
                <textarea
                  disabled
                  placeholder={"http://localhost:3000/**\nhttps://yourdomain.com/**"}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-sm text-zinc-500 placeholder-zinc-600 cursor-not-allowed h-24 resize-none font-mono"
                />
                <p className="text-xs text-zinc-500 mt-1">One URL pattern per line. Wildcards supported.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                  JWT Expiry (seconds)
                </label>
                <input
                  disabled
                  defaultValue={3600}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-sm text-zinc-300 cursor-not-allowed"
                />
              </div>
            </div>
          </section>

          {/* Danger Zone */}
          <section className="rounded-xl border border-red-900 bg-zinc-900 p-6">
            <h2 className="font-semibold text-red-400 mb-4">Danger Zone</h2>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-200">Delete Project</p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Permanently delete this project, all users, and all data. This cannot be undone.
                </p>
              </div>
              <button
                disabled
                className="cursor-not-allowed px-4 py-2 rounded-lg border border-red-800 text-red-400 text-sm font-medium opacity-50 shrink-0 ml-6"
              >
                Delete Project
              </button>
            </div>
          </section>

          <p className="text-xs text-zinc-600 mt-4 text-center">
            Editable settings coming soon.
          </p>
        </div>
      </div>
    </div>
  );
}
