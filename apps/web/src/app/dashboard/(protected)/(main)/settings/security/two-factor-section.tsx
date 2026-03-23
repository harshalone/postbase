"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { disableTotpAction } from "@/app/dashboard/2fa/actions";

export function TwoFactorSection({ totpEnabled }: { totpEnabled: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleDisable() {
    if (!confirm("Are you sure you want to disable two-factor authentication?")) return;
    setError("");
    setLoading(true);
    const result = await disableTotpAction();
    setLoading(false);
    if (!result.ok) {
      setError(result.error ?? "Something went wrong.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-white">Two-factor authentication</h2>
          <p className="text-sm text-zinc-400 mt-1">
            {totpEnabled
              ? "2FA is enabled. Your account is protected with an authenticator app."
              : "Add an extra layer of security by requiring a code from your authenticator app on login."}
          </p>
          {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
        </div>
        <div className="shrink-0">
          {totpEnabled ? (
            <button
              onClick={handleDisable}
              disabled={loading}
              className="cursor-pointer px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? "Disabling…" : "Disable 2FA"}
            </button>
          ) : (
            <button
              onClick={() => router.push("/dashboard/2fa/setup")}
              className="cursor-pointer px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors"
            >
              Enable 2FA
            </button>
          )}
        </div>
      </div>

      {totpEnabled && (
        <div className="mt-4 flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded-full px-2.5 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
            Active
          </span>
        </div>
      )}
    </div>
  );
}
