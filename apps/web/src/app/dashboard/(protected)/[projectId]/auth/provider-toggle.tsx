"use client";

import { useState } from "react";
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
  const [expanded, setExpanded] = useState(false);
  const [clientId, setClientId] = useState(existing?.clientId ?? "");
  const [clientSecret, setClientSecret] = useState(existing?.clientSecret ?? "");
  const [saving, setSaving] = useState(false);

  const needsCredentials = !["anonymous", "passkey"].includes(provider.id);

  async function save() {
    setSaving(true);
    try {
      await fetch("/api/dashboard/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          provider: provider.id,
          enabled,
          clientId,
          clientSecret,
        }),
      });
    } finally {
      setSaving(false);
      setExpanded(false);
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
          {needsCredentials && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Configure
            </button>
          )}
          {/* Toggle switch */}
          <button
            role="switch"
            aria-checked={enabled}
            onClick={() => setEnabled(!enabled)}
            className={`cursor-pointer relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
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

      {expanded && needsCredentials && (
        <div className="border-t border-zinc-800 px-4 py-4 space-y-3">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Client ID</label>
            <input
              type="text"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-brand-500"
              placeholder="Enter client ID"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Client Secret</label>
            <input
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-brand-500"
              placeholder="Enter client secret"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setExpanded(false)}
              className="cursor-pointer px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="cursor-pointer px-3 py-1.5 text-xs bg-brand-600 hover:bg-brand-700 text-white rounded transition-colors disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
