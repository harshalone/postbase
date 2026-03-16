import Link from "next/link";
import { db } from "@/lib/db";
import { organisations, projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { CreateOrgDialog } from "../create-org-dialog";
import { CreateProjectDialog } from "../create-project-dialog";

export default async function DashboardPage() {
  const allOrgs = await db.select().from(organisations).orderBy(organisations.createdAt);

  const orgProjects = await Promise.all(
    allOrgs.map(async (org) => {
      const ps = await db
        .select()
        .from(projects)
        .where(eq(projects.organisationId, org.id))
        .orderBy(projects.createdAt);
      return { org, projects: ps };
    })
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Manage your organisations and projects.
          </p>
        </div>
        <CreateOrgDialog />
      </div>

      {allOrgs.length === 0 && (
        <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-900/50 p-12 text-center">
          <p className="text-zinc-400 mb-1">No organisations yet.</p>
          <p className="text-zinc-500 text-sm">
            Create an organisation to get started.
          </p>
        </div>
      )}

      <div className="space-y-8">
        {orgProjects.map(({ org, projects: ps }) => (
          <div key={org.id} className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-semibold text-white">{org.name}</h2>
                <p className="text-xs text-zinc-500 mt-0.5">{org.slug}</p>
              </div>
              <CreateProjectDialog organisationId={org.id} />
            </div>

            {ps.length === 0 ? (
              <p className="text-sm text-zinc-500 py-4 text-center border border-dashed border-zinc-800 rounded-lg">
                No projects yet. Create your first project.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {ps.map((project) => (
                  <Link
                    key={project.id}
                    href={`/dashboard/${project.id}`}
                    className="cursor-pointer group rounded-lg border border-zinc-800 bg-zinc-950 hover:border-zinc-600 hover:bg-zinc-800/50 p-4 transition-all"
                  >
                    <p className="font-medium text-zinc-100 group-hover:text-white text-sm">
                      {project.name}
                    </p>
                    <p className="text-xs text-zinc-500 mt-1">{project.slug}</p>
                    <p className="text-xs text-zinc-600 mt-3 group-hover:text-zinc-500 transition-colors">
                      Open project →
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
