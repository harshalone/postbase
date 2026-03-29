import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { ProjectSidebar } from "./_components/sidebar";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
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
    <div className="flex h-screen bg-zinc-950 text-zinc-100">
      <ProjectSidebar projectId={projectId} />
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
