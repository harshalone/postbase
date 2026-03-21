"use client";

import { useState } from "react";

export function GeneralSettingsForm({
  projectId,
  initialName,
  slug,
}: {
  projectId: string;
  initialName: string;
  slug: string;
}) {
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const res = await fetch(`/api/dashboard/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error?.formErrors?.[0] ?? "Failed to save.");
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 mb-6">
      <h2 className="font-semibold text-white mb-4">General</h2>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">
            Project Name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">
            Project Slug
          </label>
          <input
            disabled
            defaultValue={slug}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-sm text-zinc-500 cursor-not-allowed font-mono"
          />
          <p className="text-xs text-zinc-500 mt-1">Used in API URLs and SDK config.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">
            Project ID
          </label>
          <input
            disabled
            defaultValue={projectId}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-sm text-zinc-500 cursor-not-allowed font-mono"
          />
          <p className="text-xs text-zinc-500 mt-1">Read-only. Used internally.</p>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="pt-2">
          <button
            onClick={handleSave}
            disabled={saving || !name.trim() || name.trim() === initialName}
            className="px-4 py-2 rounded-lg bg-brand-500 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-brand-600 transition-colors"
          >
            {saving ? "Saving…" : saved ? "Saved!" : "Save Changes"}
          </button>
        </div>
      </div>
    </section>
  );
}
