import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getProjectPool, getProjectSchema, ensureProjectAuthTables } from "@/lib/project-db";
import { PageHeader } from "../_components/page-header";
import { UsersTable } from "./_components/users-table";
import type { UserColumnDef, DashboardUser } from "./_components/users-table";

export default async function UsersPage({
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

  let initialUsers: DashboardUser[] = [];
  let initialTotal = 0;
  let initialColumns: UserColumnDef[] = [];

  if (project) {
    const schema = getProjectSchema(projectId);
    const pool = getProjectPool(project.databaseUrl);
    const client = await pool.connect();

    // Locked columns that are always present — never shown as custom columns
    const LOCKED_COLUMNS = new Set([
      "id", "name", "email", "email_verified", "image", "password_hash",
      "phone", "phone_verified", "is_anonymous", "metadata", "banned_at",
      "created_at", "updated_at",
    ]);

    function pgTypeToColType(dataType: string): UserColumnDef["type"] {
      if (["integer", "smallint", "bigint", "numeric", "real", "double precision"].includes(dataType)) return "number";
      if (dataType === "boolean") return "boolean";
      if (["date", "time", "time with time zone", "timestamp without time zone", "timestamp with time zone"].includes(dataType)) return "date";
      return "text";
    }

    try {
      await ensureProjectAuthTables(client, schema);

      const countResult = await client.query(`SELECT COUNT(*)::int AS total FROM "${schema}"."users"`);
      const usersResult = await client.query(`SELECT * FROM "${schema}"."users" ORDER BY "created_at" LIMIT 50`);
      const colsResult = await client.query(
        `SELECT column_name, data_type FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = 'users'
         ORDER BY ordinal_position`,
        [schema]
      );

      initialTotal = countResult.rows[0]?.total ?? 0;

      initialUsers = usersResult.rows.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        image: u.image,
        emailVerified: !!u.email_verified,
        phone: u.phone,
        isAnonymous: u.is_anonymous,
        bannedAt: u.banned_at ? new Date(u.banned_at).toISOString() : null,
        metadata: u.metadata ?? {},
        createdAt: new Date(u.created_at).toISOString(),
        updatedAt: new Date(u.updated_at).toISOString(),
      }));

      initialColumns = colsResult.rows
        .filter((r) => !LOCKED_COLUMNS.has(r.column_name))
        .map((r) => ({
          key: r.column_name,
          label: r.column_name.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
          type: pgTypeToColType(r.data_type),
        }));
    } finally {
      client.release();
    }
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Users" />
      <div className="p-6 overflow-auto">
        <UsersTable
          projectId={projectId}
          initialUsers={initialUsers}
          initialTotal={initialTotal}
          initialColumns={initialColumns}
        />
      </div>
    </div>
  );
}
