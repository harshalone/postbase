import { auth } from "@/lib/auth/admin";
import { ChangePasswordSection } from "./change-password-section";

export default async function SettingsPage() {
  const session = await auth();
  const email = session?.user?.email ?? "";

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-zinc-400 text-sm mt-1">Manage your account settings.</p>
      </div>

      <div className="space-y-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h2 className="text-base font-semibold text-white mb-1">Account</h2>
          <p className="text-sm text-zinc-400">{email}</p>
        </div>

        <ChangePasswordSection />
      </div>
    </div>
  );
}
