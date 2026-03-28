"use client";

import { useState, useEffect, useRef } from "react";
import { X, ExternalLink } from "lucide-react";
import type { UserColumnDef } from "./users-table";

// ─── Type definitions with icons and descriptions ─────────────────────────────

type ColTypeGroup = {
  label: string;
  types: { value: string; label: string; description: string; icon: string }[];
};

const TYPE_GROUPS: ColTypeGroup[] = [
  {
    label: "Text",
    types: [
      { value: "text", label: "text", description: "Variable-length character string", icon: "T" },
      { value: "varchar", label: "varchar", description: "Variable-length character string", icon: "T" },
      { value: "uuid", label: "uuid", description: "Universally unique identifier", icon: "T" },
    ],
  },
  {
    label: "Numbers",
    types: [
      { value: "int2", label: "int2", description: "Signed two-byte integer", icon: "#" },
      { value: "int4", label: "int4", description: "Signed four-byte integer", icon: "#" },
      { value: "int8", label: "int8", description: "Signed eight-byte integer", icon: "#" },
      { value: "float4", label: "float4", description: "Single precision floating-point number (4 bytes)", icon: "#" },
      { value: "float8", label: "float8", description: "Double precision floating-point number (8 bytes)", icon: "#" },
      { value: "numeric", label: "numeric", description: "Exact numeric of selectable precision", icon: "#" },
    ],
  },
  {
    label: "JSON",
    types: [
      { value: "json", label: "json", description: "Textual JSON data", icon: "{}" },
      { value: "jsonb", label: "jsonb", description: "Binary JSON data, decomposed", icon: "{}" },
    ],
  },
  {
    label: "Date / Time",
    types: [
      { value: "date", label: "date", description: "Calendar date (year, month, day)", icon: "▦" },
      { value: "time", label: "time", description: "Time of day (no time zone)", icon: "▦" },
      { value: "timetz", label: "timetz", description: "Time of day, including time zone", icon: "▦" },
      { value: "timestamp", label: "timestamp", description: "Date and time (no time zone)", icon: "▦" },
      { value: "timestamptz", label: "timestamptz", description: "Date and time, including time zone", icon: "▦" },
    ],
  },
  {
    label: "Other",
    types: [
      { value: "bool", label: "bool", description: "Logical boolean (true/false)", icon: "○" },
      { value: "bytea", label: "bytea", description: "Variable-length binary string", icon: "≡" },
    ],
  },
];

const ALL_TYPES = TYPE_GROUPS.flatMap((g) => g.types);

function toSnakeCase(s: string) {
  return s
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/^(\d)/, "_$1");
}

// Map the rich type value back to the UserColumnDef type for storage
function toColumnDefType(rawType: string): UserColumnDef["type"] {
  if (["int2", "int4", "int8", "float4", "float8", "numeric"].includes(rawType)) return "number";
  if (["bool"].includes(rawType)) return "boolean";
  if (["date", "time", "timetz", "timestamp", "timestamptz"].includes(rawType)) return "date";
  return "text";
}

// ─── Type picker dropdown ─────────────────────────────────────────────────────

function TypePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

  const filtered = search.trim()
    ? ALL_TYPES.filter(
        (t) =>
          t.value.includes(search.toLowerCase()) ||
          t.description.toLowerCase().includes(search.toLowerCase())
      )
    : null;

  const selected = ALL_TYPES.find((t) => t.value === value);

  function openDropdown(btn: HTMLButtonElement) {
    const rect = btn.getBoundingClientRect();
    setDropdownStyle({
      position: "fixed",
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
      zIndex: 9999,
    });
    setOpen(true);
  }

  return (
    <div className="relative">
      <button
        type="button"
        ref={triggerRef}
        onClick={(e) => {
          if (open) { setOpen(false); return; }
          openDropdown(e.currentTarget);
        }}
        className="cursor-pointer w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-left flex items-center justify-between focus:outline-none focus:border-brand-500"
      >
        {selected ? (
          <span className="flex items-center gap-3">
            <span className="text-zinc-400 font-mono text-xs w-6 text-center shrink-0">{selected.icon}</span>
            <span className="text-zinc-100 font-medium">{selected.label}</span>
          </span>
        ) : (
          <span className="text-zinc-600">Choose a column type…</span>
        )}
        <svg className="text-zinc-500 shrink-0" width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path d="M7.247 11.14 2.451 5.658C1.885 5.013 2.345 4 3.204 4h9.592a1 1 0 0 1 .753 1.659l-4.796 5.48a1 1 0 0 1-1.506 0z"/>
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0" style={{ zIndex: 9998 }} onClick={() => { setOpen(false); setSearch(""); }} />
          <div
            style={dropdownStyle}
            className="bg-zinc-950 border border-zinc-700 rounded-lg shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Search */}
            <div className="p-2 border-b border-zinc-800 shrink-0">
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search types…"
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-brand-500"
              />
            </div>

            {/* List */}
            <div className="overflow-y-auto max-h-64">
              {filtered ? (
                filtered.map((t) => (
                  <TypeRow key={t.value} t={t} selected={value === t.value} onSelect={() => { onChange(t.value); setOpen(false); setSearch(""); }} />
                ))
              ) : (
                TYPE_GROUPS.map((g) => (
                  <div key={g.label}>
                    <div className="px-3 pt-2.5 pb-1 text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">
                      {g.label}
                    </div>
                    {g.types.map((t) => (
                      <TypeRow key={t.value} t={t} selected={value === t.value} onSelect={() => { onChange(t.value); setOpen(false); setSearch(""); }} />
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function TypeRow({
  t,
  selected,
  onSelect,
}: {
  t: (typeof ALL_TYPES)[number];
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`cursor-pointer w-full flex items-center gap-0 px-3 py-2 text-sm transition-colors text-left ${selected ? "bg-zinc-800" : "hover:bg-zinc-900"}`}
    >
      {/* Icon */}
      <span className="text-zinc-400 font-mono text-xs w-7 shrink-0 text-center">{t.icon}</span>
      {/* Name */}
      <span className="text-zinc-200 font-semibold w-24 shrink-0 text-xs">{t.label}</span>
      {/* Description */}
      <span className="text-zinc-500 text-xs">{t.description}</span>
    </button>
  );
}

// ─── Default value suggestions per type ──────────────────────────────────────

const DEFAULT_SUGGESTIONS: Record<string, { label: string; value: string }[]> = {
  date: [
    { label: "now()", value: "now()" },
    { label: "CURRENT_DATE", value: "CURRENT_DATE" },
  ],
  time: [
    { label: "now()", value: "now()" },
    { label: "CURRENT_TIME", value: "CURRENT_TIME" },
  ],
  timetz: [
    { label: "now()", value: "now()" },
    { label: "CURRENT_TIME", value: "CURRENT_TIME" },
  ],
  timestamp: [
    { label: "now()", value: "now()" },
    { label: "CURRENT_TIMESTAMP", value: "CURRENT_TIMESTAMP" },
  ],
  timestamptz: [
    { label: "now()", value: "now()" },
    { label: "CURRENT_TIMESTAMP", value: "CURRENT_TIMESTAMP" },
  ],
  int2: [{ label: "0", value: "0" }],
  int4: [{ label: "0", value: "0" }],
  int8: [{ label: "0", value: "0" }],
  float4: [{ label: "0", value: "0" }],
  float8: [{ label: "0", value: "0" }],
  numeric: [{ label: "0", value: "0" }],
  bool: [
    { label: "true", value: "true" },
    { label: "false", value: "false" },
  ],
  uuid: [{ label: "gen_random_uuid()", value: "gen_random_uuid()" }],
};

function DefaultValueInput({
  rawType,
  value,
  onChange,
}: {
  rawType: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const suggestions = DEFAULT_SUGGESTIONS[rawType] ?? [];

  return (
    <div className="space-y-2">
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => onChange(value === s.value ? "" : s.value)}
              className={`cursor-pointer px-2 py-0.5 rounded text-xs font-mono transition-colors border ${
                value === s.value
                  ? "bg-brand-500/20 border-brand-500 text-brand-400"
                  : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="NULL"
        className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-brand-500 font-mono"
      />
      <p className="text-xs text-zinc-500">
        Can be a literal or an expression, e.g. <code className="font-mono">(gen_random_uuid())</code>
      </p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const RESERVED_KEYS = new Set([
  "id","name","email","email_verified","image","password_hash",
  "phone","phone_verified","is_anonymous","metadata","banned_at",
  "created_at","updated_at",
]);

interface AddColumnModalProps {
  existingKeys: string[];
  onAdd: (col: UserColumnDef & { rawType: string; defaultValue?: string; nullable?: boolean }) => Promise<void>;
  onClose: () => void;
  closing?: boolean;
}

export function AddColumnModal({ existingKeys, onAdd, onClose, closing }: AddColumnModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [rawType, setRawType] = useState("");
  const [defaultValue, setDefaultValue] = useState("");
  const [isNullable, setIsNullable] = useState(true);
  const [createMore, setCreateMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const key = toSnakeCase(name);
  const isReserved = key !== "" && RESERVED_KEYS.has(key);
  const keyConflict = key !== "" && !isReserved && existingKeys.includes(key);
  const canSave = name.trim().length > 0 && key.length > 0 && !isReserved && !keyConflict && rawType !== "" && !saving;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") { onClose(); return; }
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        document.getElementById("add-col-form")?.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true })
        );
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function reset() {
    setName(""); setDescription(""); setRawType(""); setDefaultValue(""); setIsNullable(true); setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await onAdd({
        key,
        label: name.trim(),
        type: toColumnDefType(rawType),
        rawType,
        defaultValue: defaultValue || undefined,
        nullable: isNullable,
      });
      if (createMore) reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save column. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div className={`slide-panel-backdrop fixed inset-0 z-40 bg-black/40 ${closing ? "closing" : ""}`} onClick={onClose} />

      {/* Slideover */}
      <div className={`slide-panel fixed inset-y-0 right-0 z-50 w-170 bg-zinc-950 border-l border-zinc-800 flex flex-col shadow-2xl ${closing ? "closing" : ""}`}>

        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-800 shrink-0 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">Add new column to <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-sm font-mono text-zinc-200">users</code></h2>
          <button onClick={onClose} className="cursor-pointer text-zinc-500 hover:text-zinc-300 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <form id="add-col-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto">

          {/* General */}
          <div className="px-6 py-6 space-y-4 border-b border-zinc-800">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">General</p>
            <div>
              <label className="block text-sm text-zinc-300 mb-1.5">Name</label>
              <input
                autoFocus
                value={name}
                onChange={(e) => { setName(e.target.value); setError(null); }}
                placeholder="column_name"
                maxLength={64}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-brand-500"
              />
              {key ? (
                <p className={`text-xs mt-1.5 ${isReserved ? "text-amber-400" : keyConflict ? "text-red-400" : "text-zinc-500"}`}>
                  {isReserved
                    ? <><code className="font-mono">{key}</code> is a reserved built-in column</>
                    : keyConflict
                    ? <>Key <code className="font-mono">{key}</code> already exists</>
                    : <>Stored as <code className="font-mono">{key}</code> in user metadata</>
                  }
                </p>
              ) : (
                <p className="text-xs mt-1.5 text-zinc-500">
                  Use lowercase with underscores e.g. <code className="font-mono">column_name</code>
                </p>
              )}
            </div>
            <div>
              <div className="flex justify-between mb-1.5">
                <label className="text-sm text-zinc-300">Description</label>
                <span className="text-xs text-zinc-600">Optional</span>
              </div>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-brand-500"
              />
            </div>
          </div>

          {/* Data Type */}
          <div className="px-6 py-6 space-y-4 border-b border-zinc-800">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Data Type</p>
              <button type="button" className="cursor-pointer flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                <ExternalLink size={10} /> About data types
              </button>
            </div>
            <div>
              <label className="block text-sm text-zinc-300 mb-1.5">Type</label>
              <TypePicker value={rawType} onChange={setRawType} />
            </div>
            <div>
              <label className="block text-sm text-zinc-300 mb-1.5">Default Value</label>
              <DefaultValueInput rawType={rawType} value={defaultValue} onChange={setDefaultValue} />
            </div>
          </div>

          {/* Constraints */}
          <div className="px-6 py-6 space-y-4 border-b border-zinc-800">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Constraints</p>
            <label className="flex items-start gap-3 cursor-pointer">
              <div
                onClick={() => setIsNullable((v) => !v)}
                className={`cursor-pointer relative w-9 h-5 mt-0.5 rounded-full transition-colors shrink-0 ${isNullable ? "bg-brand-500" : "bg-zinc-700"}`}
              >
                <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${isNullable ? "translate-x-4" : "translate-x-0"}`} />
              </div>
              <div>
                <p className="text-sm text-zinc-300">Allow Nullable</p>
                <p className="text-xs text-zinc-500 mt-0.5">Allow the column to assume a NULL value if no value is provided</p>
              </div>
            </label>
          </div>

          {/* Note */}

          <div className="px-6 py-6">
            <p className="text-xs text-zinc-600 leading-relaxed">
              Custom columns are stored in each user&apos;s <code className="font-mono text-zinc-500">metadata</code> field.
              Fundamental auth fields (email, password, verified status) are read-only and cannot be modified here.
            </p>
          </div>

          {error && (
            <div className="px-6 py-3">
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-800 shrink-0">
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <div
              onClick={() => setCreateMore((v) => !v)}
              className={`cursor-pointer relative w-9 h-5 rounded-full transition-colors ${createMore ? "bg-brand-500" : "bg-zinc-700"}`}
            >
              <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${createMore ? "translate-x-4" : "translate-x-0"}`} />
            </div>
            <span className="text-sm text-zinc-400">Create more</span>
          </label>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-zinc-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="add-col-form"
              disabled={!canSave}
              className="cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium transition-colors"
            >
              {saving ? "Saving…" : (
                <>
                  <span>Save</span>
                  <kbd className="text-xs bg-brand-600 px-1.5 py-0.5 rounded">⌘↵</kbd>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
