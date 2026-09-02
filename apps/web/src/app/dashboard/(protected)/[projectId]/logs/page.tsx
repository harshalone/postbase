import { db } from "@/lib/db";
import { auditLogs, projects } from "@/lib/db/schema";
import { and, count, desc, eq } from "drizzle-orm";
import { PageHeader } from "../_components/page-header";
import { LogsTable } from "./_components/logs-table";
import type { AuditEvent } from "./_components/logs-table";
import { resolveUserEmails } from "@/lib/resolve-user-emails";

const PER_PAGE = 50;

export default async function AuditLogsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  const [project] = await db
    .select({ id: projects.id, databaseUrl: projects.databaseUrl })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  let initialEvents: AuditEvent[] = [];
  let initialTotal = 0;

  if (project) {
    const where = and(eq(auditLogs.projectId, projectId));

    const [{ total }] = await db.select({ total: count() }).from(auditLogs).where(where);
    initialTotal = total;

    const rows = await db
      .select()
      .from(auditLogs)
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(PER_PAGE);

    const userIds = [...new Set(rows.map((r) => r.userId).filter((id): id is string => !!id))];
    const emailById = await resolveUserEmails(projectId, project.databaseUrl, userIds);

    initialEvents = rows.map((r) => ({
      id: r.id,
      action: r.action,
      userId: r.userId,
      userEmail: r.userId ? emailById.get(r.userId) ?? null : null,
      ipAddress: r.ipAddress,
      userAgent: r.userAgent,
      metadata: r.metadata as Record<string, unknown>,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Audit Logs" />
      <div className="p-6 overflow-auto">
        <LogsTable projectId={projectId} initialEvents={initialEvents} initialTotal={initialTotal} />
      </div>
    </div>
  );
}
