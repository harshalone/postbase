import { TemplatesForm } from "./templates-form";

export default async function TemplatesPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-base font-semibold text-white mb-1">Email Templates</h2>
        <p className="text-sm text-zinc-500">
          Customize the emails sent to users during authentication. Use variables like{" "}
          <code className="text-brand-400 bg-brand-950/30 px-1 rounded text-xs">
            {"{{code}}"}
          </code>{" "}
          or{" "}
          <code className="text-brand-400 bg-brand-950/30 px-1 rounded text-xs">
            {"{{magic_link}}"}
          </code>{" "}
          to insert dynamic content.
        </p>
      </div>
      <TemplatesForm projectId={projectId} />
    </div>
  );
}
