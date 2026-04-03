"use client";

import { useState, useTransition } from "react";
import { useSlidePanel } from "@/hooks/use-slide-panel";
import { useToast } from "@/hooks/use-toast";
import { Plus, X, AlertTriangle, Trash2 } from "lucide-react";
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
  providers: string[];
  createdAt: string;
  updatedAt: string;
}

interface UsersTableProps {
  projectId: string;
  initialUsers: DashboardUser[];
  initialTotal: number;
  initialColumns: UserColumnDef[];
}

// ─── Locked fundamental fields ────────────────────────────────────────────────

const LOCKED_BADGE = (
  <span className="ml-1 inline-flex items-center text-zinc-600" title="Auth field — read only">
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
  userId, colKey, colType, value, projectId, onSaved,
}: {
  userId: string;
  colKey: string;
  colType: UserColumnDef["type"];
  value: unknown;
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
      const res = await fetch(`/api/dashboard/${projectId}/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [colKey]: parsed }),
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
      <button onClick={save} disabled={isPending} className="text-emerald-400 hover:text-emerald-300 text-xs disabled:opacity-50">✓</button>
      <button onClick={() => setEditing(false)} className="text-zinc-500 hover:text-zinc-300 text-xs">✕</button>
    </div>
  );
}

// ─── Column detail slide panel ────────────────────────────────────────────────

function ColumnPanel({
  col,
  projectId,
  onDeleted,
  onClose,
  closing,
}: {
  col: UserColumnDef;
  projectId: string;
  onDeleted: (key: string) => void;
  onClose: () => void;
  closing?: boolean;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (confirmText !== col.key) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard/projects/${projectId}/user-columns/${col.key}`, {
        method: "DELETE",
      });
      if (res.ok) {
        onDeleted(col.key);
        onClose();
      } else {
        const data = await res.json();
        setError(data.error ?? "Failed to delete column");
      }
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className={`slide-panel-backdrop fixed inset-0 z-40 bg-black/40 ${closing ? "closing" : ""}`} onClick={onClose} />
      <div className={`slide-panel fixed inset-y-0 right-0 z-50 w-[480px] bg-zinc-950 border-l border-zinc-800 flex flex-col shadow-2xl ${closing ? "closing" : ""}`}>

        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-800 shrink-0 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">{col.label}</h2>
            <p className="text-xs text-zinc-500 mt-0.5 font-mono">{col.key} · {col.type}</p>
          </div>
          <button onClick={onClose} className="cursor-pointer text-zinc-500 hover:text-zinc-300 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">Column name</span>
              <span className="text-zinc-200 font-mono">{col.key}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">Display label</span>
              <span className="text-zinc-200">{col.label}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">Type</span>
              <span className="text-zinc-200">{col.type}</span>
            </div>
          </div>

          <p className="text-xs text-zinc-600 leading-relaxed">
            This is a real column on your project&apos;s <span className="font-mono text-zinc-500">users</span> table.
            Values are stored directly in the database, not in metadata JSON.
          </p>
        </div>

        {/* Danger zone */}
        <div className="px-6 py-6 border-t border-zinc-800 shrink-0 space-y-4">
          <div className="flex items-center gap-2 text-red-400">
            <AlertTriangle size={14} />
            <span className="text-sm font-semibold">Danger Zone</span>
          </div>
          <div className="bg-red-950/30 border border-red-900/40 rounded-lg p-4 space-y-3">
            <p className="text-sm text-red-300 leading-relaxed">
              Deleting this column will <strong>permanently remove all data</strong> stored in{" "}
              <span className="font-mono text-red-200">{col.key}</span> for every user.
              This cannot be undone.
            </p>
            <p className="text-xs text-zinc-500">
              Type <span className="font-mono text-zinc-300">{col.key}</span> to confirm deletion:
            </p>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={col.key}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-red-500 font-mono"
            />
            {error && <p className="text-xs text-red-400">{error}</p>}
            <button
              onClick={handleDelete}
              disabled={confirmText !== col.key || deleting}
              className="cursor-pointer w-full px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
            >
              {deleting ? "Deleting…" : `Delete column "${col.key}"`}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Delete confirmation modal ────────────────────────────────────────────────

function DeleteUserModal({
  user,
  projectId,
  onDeleted,
  onClose,
}: {
  user: DashboardUser;
  projectId: string;
  onDeleted: (userId: string) => void;
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/dashboard/${projectId}/users/${user.id}`, {
        method: "DELETE",
      });
      if (res.ok || res.status === 204) {
        onDeleted(user.id);
        onClose();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to delete user");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl p-6 space-y-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-full bg-red-900/30 border border-red-800/40">
              <AlertTriangle size={16} className="text-red-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Delete user?</h2>
              <p className="text-xs text-zinc-500 mt-0.5">This action cannot be undone</p>
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3">
          <p className="text-xs text-zinc-400 mb-1">User to be deleted</p>
          <p className="text-sm font-medium text-white">{user.name ?? user.email}</p>
          {user.name && <p className="text-xs text-zinc-500">{user.email}</p>}
        </div>

        <p className="text-xs text-zinc-500 leading-relaxed">
          This will permanently remove the user and all associated data from your project database.
        </p>

        {error && (
          <p className="text-xs text-red-400 bg-red-950/30 border border-red-900/40 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="flex gap-3 pt-1">
          <button
            onClick={onClose}
            className="cursor-pointer flex-1 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={isPending}
            className="cursor-pointer flex-1 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
          >
            {isPending ? "Deleting…" : "Delete user"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function UsersTable({ projectId, initialUsers, initialTotal, initialColumns }: UsersTableProps) {
  const toast = useToast();
  const [users, setUsers] = useState<DashboardUser[]>(initialUsers);
  const [total, setTotal] = useState(initialTotal);
  const [columns, setColumns] = useState<UserColumnDef[]>(initialColumns);
  const [search, setSearch] = useState("");
  const [selectedCol, setSelectedCol] = useState<UserColumnDef | null>(null);
  const [userToDelete, setUserToDelete] = useState<DashboardUser | null>(null);

  const addColumnPanel = useSlidePanel();
  const colDetailPanel = useSlidePanel();

  function handleMetadataSaved(userId: string, key: string, value: unknown) {
    setUsers((prev) =>
      prev.map((u) =>
        u.id === userId ? { ...u, metadata: { ...u.metadata, [key]: value } } : u
      )
    );
  }

  function openColumnPanel(col: UserColumnDef) {
    setSelectedCol(col);
    colDetailPanel.open();
  }

  async function handleAddColumn(col: UserColumnDef & { rawType: string; defaultValue?: string; nullable?: boolean }) {
    const res = await fetch(`/api/dashboard/projects/${projectId}/user-columns`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: col.key,
        label: col.label,
        rawType: col.rawType,
        defaultValue: col.defaultValue,
        nullable: col.nullable ?? true,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const msg = body?.error ? (typeof body.error === "string" ? body.error : JSON.stringify(body.error)) : `HTTP ${res.status}`;
      toast.error("Failed to add column", msg);
      throw new Error(msg);
    }
    setColumns((prev) => [...prev, { key: col.key, label: col.label, type: col.type }]);
    toast.success("Column added", `"${col.label}" is now available on all users`);
    addColumnPanel.close();
  }

  function handleColumnDeleted(key: string) {
    setColumns((prev) => prev.filter((c) => c.key !== key));
    setSelectedCol(null);
  }

  function handleUserDeleted(userId: string) {
    setUsers((prev) => prev.filter((u) => u.id !== userId));
    setTotal((prev) => prev - 1);
    toast.success("User deleted", "The user has been permanently removed");
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
              <th className="text-left px-4 py-3 font-medium whitespace-nowrap">User {LOCKED_BADGE}</th>
              <th className="text-left px-4 py-3 font-medium whitespace-nowrap">Verified {LOCKED_BADGE}</th>
              <th className="text-left px-4 py-3 font-medium whitespace-nowrap">Created {LOCKED_BADGE}</th>
              <th className="text-left px-4 py-3 font-medium whitespace-nowrap">Status {LOCKED_BADGE}</th>
              <th className="text-left px-4 py-3 font-medium whitespace-nowrap">Providers {LOCKED_BADGE}</th>

              {columns.map((col) => (
                <th key={col.key} className="text-left px-4 py-3 font-medium whitespace-nowrap">
                  <button
                    onClick={() => openColumnPanel(col)}
                    className="cursor-pointer flex items-center gap-1.5 hover:text-zinc-300 transition-colors group"
                    title={`Edit column "${col.label}"`}
                  >
                    {col.label}
                    <span className="text-zinc-700 text-xs normal-case tracking-normal font-normal">({col.type})</span>
                    {/* Open lock icon — indicates editable/configurable */}
                    <svg className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-500 shrink-0" width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M11 1a2 2 0 0 0-2 2v4a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h5V3a3 3 0 0 1 6 0v4a.5.5 0 0 1-1 0V3a2 2 0 0 0-2-2z"/>
                    </svg>
                  </button>
                </th>
              ))}
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4 + columns.length} className="px-6 py-20 text-center text-zinc-500">
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
                <tr key={user.id} className="group hover:bg-zinc-800/40 transition-colors">
                  {/* User — locked */}
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

                  {/* Providers — locked */}
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {user.providers.length === 0 ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-zinc-800 text-zinc-500 border border-zinc-700">Email</span>
                      ) : (
                        user.providers.map((p) => (
                          <span key={p} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-blue-900/30 text-blue-300 border border-blue-800/40 capitalize">{p}</span>
                        ))
                      )}
                    </div>
                  </td>

                  {/* Custom columns — editable */}
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3 text-zinc-300 text-xs max-w-[180px]">
                      <MetadataCell
                        userId={user.id}
                        colKey={col.key}
                        colType={col.type}
                        value={user.metadata[col.key]}
                        projectId={projectId}
                        onSaved={handleMetadataSaved}
                      />
                    </td>
                  ))}

                  {/* Actions */}
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setUserToDelete(user)}
                        className="cursor-pointer flex items-center gap-1.5 px-2 py-1 rounded-md text-zinc-500 hover:text-red-400 hover:bg-red-950/30 transition-colors"
                        title="Delete user"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add column panel */}
      {addColumnPanel.visible && (
        <AddColumnModal
          existingKeys={[
            "id","name","email","email_verified","image","password_hash",
            "phone","phone_verified","is_anonymous","metadata","banned_at",
            "created_at","updated_at",
            ...columns.map((c) => c.key),
          ]}
          onAdd={handleAddColumn}
          onClose={() => addColumnPanel.close()}
          closing={addColumnPanel.closing}
        />
      )}

      {/* Column detail / danger zone panel */}
      {colDetailPanel.visible && selectedCol && (
        <ColumnPanel
          col={selectedCol}
          projectId={projectId}
          onDeleted={handleColumnDeleted}
          onClose={() => colDetailPanel.close()}
          closing={colDetailPanel.closing}
        />
      )}

      {/* Delete user confirmation modal */}
      {userToDelete && (
        <DeleteUserModal
          user={userToDelete}
          projectId={projectId}
          onDeleted={handleUserDeleted}
          onClose={() => setUserToDelete(null)}
        />
      )}
    </>
  );
}
