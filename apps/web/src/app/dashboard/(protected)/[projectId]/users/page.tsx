import { db } from "@/lib/db";
import { users, projects } from "@/lib/db/schema";
import { eq, count } from "drizzle-orm";
import { PageHeader } from "../_components/page-header";
import { UsersTable } from "./_components/users-table";
import type { UserColumnDef, DashboardUser } from "./_components/users-table";

export default async function UsersPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  const [[{ total }], rows, [project]] = await Promise.all([
    db.select({ total: count() }).from(users).where(eq(users.projectId, projectId)),
    db.select().from(users).where(eq(users.projectId, projectId)).limit(50).orderBy(users.createdAt),
    db.select({ userColumnDefs: projects.userColumnDefs }).from(projects).where(eq(projects.id, projectId)).limit(1),
  ]);

  const initialUsers: DashboardUser[] = rows.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    image: u.image,
    emailVerified: !!u.emailVerified,
    phone: u.phone,
    isAnonymous: u.isAnonymous,
    bannedAt: u.bannedAt?.toISOString() ?? null,
    metadata: (u.metadata ?? {}) as Record<string, unknown>,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  }));

  const initialColumns = (project?.userColumnDefs ?? []) as UserColumnDef[];

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Users" />
      <div className="p-6 overflow-auto">
        <UsersTable
          projectId={projectId}
          initialUsers={initialUsers}
          initialTotal={total}
          initialColumns={initialColumns}
        />
      </div>
    </div>
  );
}
