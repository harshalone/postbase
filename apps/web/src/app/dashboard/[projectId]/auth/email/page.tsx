import { EmailSettingsForm } from "./email-settings-form";

export default async function EmailSettingsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-base font-semibold text-white mb-1">Email Settings</h2>
        <p className="text-sm text-zinc-500">
          Configure how Postbase sends authentication emails (magic links, OTP codes, etc.) for this project.
        </p>
      </div>
      <EmailSettingsForm projectId={projectId} />
    </div>
  );
}
