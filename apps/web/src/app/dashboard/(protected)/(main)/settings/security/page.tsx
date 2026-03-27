import { auth } from "@/lib/auth/admin";
import { TwoFactorSection } from "./two-factor-section";

export const dynamic = "force-dynamic";

export default async function SecuritySettingsPage() {
  const session = await auth();
  const totpEnabled = (session?.user as { totpEnabled?: boolean })?.totpEnabled ?? false;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Security</h1>
        <p className="text-zinc-400 text-sm mt-1">Manage your account security settings.</p>
      </div>

      <TwoFactorSection totpEnabled={totpEnabled} />
    </div>
  );
}
