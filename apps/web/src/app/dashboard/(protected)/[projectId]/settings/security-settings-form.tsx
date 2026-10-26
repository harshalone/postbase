"use client";

import { useState } from "react";

export function SecuritySettingsForm({
  projectId,
  initialEnforceRls,
  lockedByEnv,
}: {
  projectId: string;
  initialEnforceRls: boolean;
  lockedByEnv: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnforceRls || lockedByEnv);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleToggle() {
    const next = !enabled;
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/dashboard/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enforceRls: next }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error?.formErrors?.[0] ?? "Failed to save.");
      } else {
        setEnabled(next);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 mb-6">
      <h2 className="font-semibold text-white mb-4">Security</h2>
      <div className="flex items-start justify-between gap-6">
        <div>
          <p className="text-sm font-medium text-zinc-200">Enforce Row Level Security</p>
          <p className="text-xs text-zinc-500 mt-0.5">
            Run anon and user-token requests as restricted database roles so your RLS
            policies apply. Service-key requests keep full access. Make sure your tables
            have policies before enabling, or anon and user requests will be denied.
          </p>
          {lockedByEnv && (
            <p className="text-xs text-amber-400 mt-1">
              Enabled by the server&apos;s ENFORCE_RLS_PROJECT_IDS setting; it can&apos;t be
              turned off here.
            </p>
          )}
          {error && <p className="text-sm text-red-400 mt-1">{error}</p>}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Enforce Row Level Security"
          onClick={handleToggle}
          disabled={saving || lockedByEnv}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            enabled ? "bg-brand-500" : "bg-zinc-700"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
              enabled ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>
    </section>
  );
}
