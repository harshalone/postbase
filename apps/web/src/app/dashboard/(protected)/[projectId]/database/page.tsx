import { redirect } from "next/navigation";

export default async function DatabasePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  redirect(`/dashboard/${projectId}/database/tables`);
}
