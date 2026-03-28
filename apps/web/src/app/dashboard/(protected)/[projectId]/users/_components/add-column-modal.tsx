"use client";

import { useState } from "react";
import type { UserColumnDef } from "./users-table";

const TYPES: { value: UserColumnDef["type"]; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Boolean (Yes/No)" },
  { value: "date", label: "Date" },
];

function toSnakeCase(s: string) {
  return s
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/^(\d)/, "_$1");
}

interface AddColumnModalProps {
  existingKeys: string[];
  onAdd: (col: UserColumnDef) => Promise<void>;
  onClose: () => void;
}

export function AddColumnModal({ existingKeys, onAdd, onClose }: AddColumnModalProps) {
  const [label, setLabel] = useState("");
  const [type, setType] = useState<UserColumnDef["type"]>("text");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const key = toSnakeCase(label);
  const keyConflict = existingKeys.includes(key);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim() || !key) return;
    if (keyConflict) { setError(`A column with key "${key}" already exists.`); return; }

    setSaving(true);
    setError(null);
    try {
      await onAdd({ key, label: label.trim(), type });
    } catch {
      setError("Failed to save column. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-sm mx-4 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <h2 className="text-sm font-semibold text-white">Add column</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854z"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-zinc-400 mb-1.5">Column label</label>
            <input
              autoFocus
              value={label}
              onChange={(e) => { setLabel(e.target.value); setError(null); }}
              placeholder="e.g. Company name"
              maxLength={64}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
            />
            {key && (
              <p className={`text-xs mt-1 ${keyConflict ? "text-red-400" : "text-zinc-600"}`}>
                Stored as <code className="font-mono">{key}</code>
                {keyConflict && " — already exists"}
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1.5">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as UserColumnDef["type"])}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-500"
            >
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Info note */}
          <p className="text-xs text-zinc-600 leading-relaxed">
            Custom columns are stored in each user&apos;s metadata. Fundamental auth fields (email, password, verified status) cannot be modified here.
          </p>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-600 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!label.trim() || !key || keyConflict || saving}
              className="flex-1 px-3 py-2 rounded-lg text-sm font-medium bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? "Saving…" : "Add column"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
