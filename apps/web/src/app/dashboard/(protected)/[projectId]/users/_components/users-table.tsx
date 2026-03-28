"use client";

import { useState, useTransition } from "react";
import { useSlidePanel } from "@/hooks/use-slide-panel";
import { Plus } from "lucide-react";
import { AddColumnModal } from "./add-column-modal";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UserColumnDef {
  key: string;
  label: string;
  type: "text" | "number" | "boolean" | "date";
}

export interface DashboardUser {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  emailVerified: boolean;
  phone: string | null;
  isAnonymous: boolean | null;
  bannedAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface UsersTableProps {
  projectId: string;
  initialUsers: DashboardUser[];
  initialTotal: number;
  initialColumns: UserColumnDef[];
}

// ─── Locked fundamental fields — never editable / removable ──────────────────

const LOCKED_BADGE = (
  <span className="ml-1.5 inline-flex items-center gap-0.5 text-zinc-600" title="Auth field — read only">
    <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
      <path d="M11 7V5a3 3 0 0 0-6 0v2H4a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-1zm-5-2a2 2 0 1 1 4 0v2H6V5z"/>
    </svg>
  </span>
);

// ─── Cell display helpers ─────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function MetadataCell({
  userId, colKey, colType, value, fullMetadata, projectId, onSaved,
}: {
  userId: string;
  colKey: string;
  colType: UserColumnDef["type"];
  value: unknown;
  fullMetadata: Record<string, unknown>;
  projectId: string;
  onSaved: (userId: string, key: string, value: unknown) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ""));
  const [isPending, startTransition] = useTransition();

  function save() {
    let parsed: unknown = draft;
    if (colType === "number") parsed = draft === "" ? null : Number(draft);
    if (colType === "boolean") parsed = draft === "true";

    startTransition(async () => {
      // We need the full current metadata to merge — passed via the parent
      const res = await fetch(`/api/dashboard/${projectId}/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metadata: { ...fullMetadata, [colKey]: parsed } }),
      });
      if (res.ok) {
        onSaved(userId, colKey, parsed);
        setEditing(false);
      }
    });
  }

  if (!editing) {
    const display = value === null || value === undefined ? (
      <span className="text-zinc-600 italic text-xs">—</span>
    ) : colType === "boolean" ? (
      <span className={String(value) === "true" ? "text-emerald-400" : "text-zinc-500"}>
        {String(value) === "true" ? "Yes" : "No"}
      </span>
    ) : colType === "date" && typeof value === "string" ? (
      <span>{formatDate(value)}</span>
    ) : (
      <span>{String(value)}</span>
    );

    return (
      <button
        onClick={() => { setDraft(String(value ?? "")); setEditing(true); }}
        className="w-full text-left hover:bg-zinc-800 rounded px-1 py-0.5 transition-colors group"
        title="Click to edit"
      >
        {display}
        <span className="ml-1 opacity-0 group-hover:opacity-100 text-zinc-600 text-xs">✎</span>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {colType === "boolean" ? (
        <select
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="flex-1 bg-zinc-800 border border-brand-500 rounded px-1 py-0.5 text-xs text-white"
        >
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      ) : (
        <input
          autoFocus
          type={colType === "number" ? "number" : colType === "date" ? "date" : "text"}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
          className="flex-1 bg-zinc-800 border border-brand-500 rounded px-1 py-0.5 text-xs text-white min-w-0"
        />
      )}
      <button
        onClick={save}
        disabled={isPending}
        className="text-emerald-400 hover:text-emerald-300 text-xs disabled:opacity-50"
      >✓</button>
      <button
        onClick={() => setEditing(false)}
        className="text-zinc-500 hover:text-zinc-300 text-xs"
      >✕</button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function UsersTable({ projectId, initialUsers, initialTotal, initialColumns }: UsersTableProps) {
  const [users, setUsers] = useState<DashboardUser[]>(initialUsers);
  const [total] = useState(initialTotal);
  const [columns, setColumns] = useState<UserColumnDef[]>(initialColumns);
  const addColumnPanel = useSlidePanel();
  const showAddColumn = addColumnPanel.visible;
  const [search, setSearch] = useState("");

  function handleMetadataSaved(userId: string, key: string, value: unknown) {
    setUsers((prev) =>
      prev.map((u) =>
        u.id === userId
          ? { ...u, metadata: { ...u.metadata, [key]: value } }
          : u
      )
    );
  }

  async function handleRemoveColumn(key: string) {
    const next = columns.filter((c) => c.key !== key);
    const res = await fetch(`/api/dashboard/projects/${projectId}/user-columns`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ columns: next }),
    });
    if (res.ok) setColumns(next);
  }

  async function handleAddColumn(col: UserColumnDef) {
    const next = [...columns, col];
    const res = await fetch(`/api/dashboard/projects/${projectId}/user-columns`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ columns: next }),
    });
    if (res.ok) {
      setColumns(next);
      addColumnPanel.close();
    }
  }

  const filtered = search.trim()
    ? users.filter(
        (u) =>
          u.email.toLowerCase().includes(search.toLowerCase()) ||
          (u.name ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : users;

  return (
    <>
      {/* Toolbar */}
      <div className="flex gap-3 mb-6">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by email or name…"
          className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
        />
        <div className="text-xs text-zinc-600 flex items-center px-2">
          {total} user{total !== 1 ? "s" : ""}
        </div>
        <button
          onClick={() => addColumnPanel.open()}
          className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-xs font-medium transition-colors whitespace-nowrap"
        >
          <Plus size={11} />
          Add column
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-500 text-xs uppercase tracking-wider">
              {/* Locked columns */}
              <th className="text-left px-4 py-3 font-medium whitespace-nowrap">
                User {LOCKED_BADGE}
              </th>
              <th className="text-left px-4 py-3 font-medium whitespace-nowrap">
                Verified {LOCKED_BADGE}
              </th>
              <th className="text-left px-4 py-3 font-medium whitespace-nowrap">
                Created {LOCKED_BADGE}
              </th>
              <th className="text-left px-4 py-3 font-medium whitespace-nowrap">
                Status {LOCKED_BADGE}
              </th>

              {/* Custom columns */}
              {columns.map((col) => (
                <th key={col.key} className="text-left px-4 py-3 font-medium whitespace-nowrap">
                  <span className="flex items-center gap-1.5">
                    {col.label}
                    <span className="text-zinc-700 text-xs normal-case tracking-normal font-normal">
                      ({col.type})
                    </span>
                    <button
                      onClick={() => handleRemoveColumn(col.key)}
                      className="text-zinc-700 hover:text-red-400 transition-colors ml-0.5"
                      title={`Remove column "${col.label}"`}
                    >
                      ×
                    </button>
                  </span>
                </th>
              ))}

            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5 + columns.length} className="px-6 py-20 text-center text-zinc-500">
                  {search ? (
                    <p>No users match <span className="text-zinc-400">"{search}"</span></p>
                  ) : (
                    <>
                      <p className="text-base font-medium text-zinc-400 mb-1">No users yet</p>
                      <p className="text-sm">Users will appear here once they sign up via your auth providers.</p>
                    </>
                  )}
                </td>
              </tr>
            ) : (
              filtered.map((user) => (
                <tr key={user.id} className="hover:bg-zinc-800/40 transition-colors">
                  {/* Email + name — locked */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-medium text-zinc-300 shrink-0">
                        {user.email[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="text-white text-xs font-medium">{user.name ?? user.email}</p>
                        {user.name && <p className="text-zinc-500 text-xs">{user.email}</p>}
                      </div>
                    </div>
                  </td>

                  {/* Email verified — locked */}
                  <td className="px-4 py-3">
                    {user.emailVerified ? (
                      <span className="inline-flex items-center gap-1 text-emerald-400 text-xs">
                        <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/></svg>
                        Verified
                      </span>
                    ) : (
                      <span className="text-zinc-600 text-xs">Unverified</span>
                    )}
                  </td>

                  {/* Created at — locked */}
                  <td className="px-4 py-3 text-zinc-400 text-xs whitespace-nowrap">
                    {formatDate(user.createdAt)}
                  </td>

                  {/* Status — locked */}
                  <td className="px-4 py-3">
                    {user.bannedAt ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-red-900/30 text-red-400 border border-red-800/40">Banned</span>
                    ) : user.isAnonymous ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-zinc-800 text-zinc-400 border border-zinc-700">Anonymous</span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-emerald-900/30 text-emerald-400 border border-emerald-800/40">Active</span>
                    )}
                  </td>

                  {/* Custom metadata columns — editable */}
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3 text-zinc-300 text-xs max-w-[180px]">
                      <MetadataCell
                        userId={user.id}
                        colKey={col.key}
                        colType={col.type}
                        value={user.metadata[col.key]}
                        fullMetadata={user.metadata}
                        projectId={projectId}
                        onSaved={handleMetadataSaved}
                      />
                    </td>
                  ))}

                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showAddColumn && (
        <AddColumnModal
          existingKeys={columns.map((c) => c.key)}
          onAdd={handleAddColumn}
          onClose={() => addColumnPanel.close()}
          closing={addColumnPanel.closing}
        />
      )}
    </>
  );
}
