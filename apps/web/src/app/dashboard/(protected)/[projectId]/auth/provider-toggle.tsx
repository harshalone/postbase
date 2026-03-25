"use client";

import { useState } from "react";
import Link from "next/link";
import { OAUTH_PROVIDERS } from "@/lib/auth/providers";

type Provider = (typeof OAUTH_PROVIDERS)[number];

interface ProviderConfig {
  id: string;
  enabled: boolean;
  clientId: string | null;
  clientSecret: string | null;
}

interface Props {
  provider: Provider;
  projectId: string;
  existing?: ProviderConfig;
}

export function ProviderToggle({ provider, projectId, existing }: Props) {
  const [enabled, setEnabled] = useState(existing?.enabled ?? false);
  const [saving, setSaving] = useState(false);

  const configUrl = `/dashboard/${projectId}/auth/providers/${provider.id}`;

  async function toggleEnabled() {
    const next = !enabled;
    setEnabled(next);
    setSaving(true);
    try {
      await fetch("/api/dashboard/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          provider: provider.id,
          enabled: next,
          clientId: existing?.clientId ?? undefined,
          clientSecret: existing?.clientSecret ?? undefined,
        }),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-zinc-200">{provider.name}</span>
          {enabled && (
            <span className="text-xs bg-brand-900 text-brand-400 px-2 py-0.5 rounded-full">
              Enabled
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={configUrl}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Configure
          </Link>
          {/* Toggle switch */}
          <button
            role="switch"
            aria-checked={enabled}
            onClick={toggleEnabled}
            disabled={saving}
            className={`cursor-pointer relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-60 ${
              enabled ? "bg-brand-600" : "bg-zinc-700"
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                enabled ? "translate-x-4" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
