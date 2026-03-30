"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useSlidePanel } from "@/hooks/use-slide-panel";
import { useToast } from "@/hooks/use-toast";
import {
  Zap,
  Plus,
  Trash2,
  RefreshCw,
  X,
  Pencil,
  Search,
  ChevronDown,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type DbTrigger = {
  trigger_name: string;
  table_name: string;
  timing: string;
  events: string[];
  orientation: string;
  function_schema: string;
  function_name: string;
  enabled: boolean;
};

type DbFunction = {
  function_name: string;
  argument_types: string;
};

type TriggerForm = {
  name: string;
  tableName: string;
  timing: string;
  events: string[];
  orientation: string;
  functionName: string;
  functionSchema: string;
};

const EMPTY_FORM: TriggerForm = {
  name: "",
  tableName: "",
  timing: "BEFORE",
  events: ["INSERT"],
  orientation: "ROW",
  functionName: "",
  functionSchema: "",
};

const TIMINGS = ["BEFORE", "AFTER", "INSTEAD OF"];
const EVENTS = ["INSERT", "UPDATE", "DELETE", "TRUNCATE"];
const ORIENTATIONS = ["ROW", "STATEMENT"];

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TriggersPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  const toast = useToast();

  const [triggers, setTriggers] = useState<DbTrigger[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Available tables and functions for dropdowns
  const [tables, setTables] = useState<string[]>([]);
  const [functions, setFunctions] = useState<DbFunction[]>([]);

  // Panels
  const createPanel = useSlidePanel();
  const editPanel = useSlidePanel();
  const [form, setForm] = useState<TriggerForm>({ ...EMPTY_FORM });
  const [editForm, setEditForm] = useState<TriggerForm>({ ...EMPTY_FORM });
  const [editOriginal, setEditOriginal] = useState<{ name: string; table: string }>({ name: "", table: "" });
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<DbTrigger | null>(null);

  // ─── Data fetchers ─────────────────────────────────────────────────────────

  const fetchTriggers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard/${projectId}/triggers`);
      const data = await res.json();
      if (data.error) { toast.error(data.error); return; }
      setTriggers(data.triggers ?? []);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const fetchTables = useCallback(async () => {
    try {
      const res = await fetch(`/api/dashboard/${projectId}/tables`);
      const data = await res.json();
      setTables((data.tables ?? []).map((t: { table_name: string }) => t.table_name));
    } catch { /* ignore */ }
  }, [projectId]);

  const fetchFunctions = useCallback(async () => {
    try {
      const res = await fetch(`/api/dashboard/${projectId}/functions`);
      const data = await res.json();
      setFunctions(data.functions ?? []);
    } catch { /* ignore */ }
  }, [projectId]);

  useEffect(() => {
    fetchTriggers();
    fetchTables();
    fetchFunctions();
  }, [fetchTriggers, fetchTables, fetchFunctions]);

  // ─── Actions ───────────────────────────────────────────────────────────────

  async function createTrigger() {
    if (!form.name.trim() || !form.tableName || !form.functionName || !form.events.length) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/dashboard/${projectId}/triggers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.error) { toast.error(data.error); return; }
      toast.success("Trigger created");
      createPanel.close();
      setForm({ ...EMPTY_FORM });
      await fetchTriggers();
    } finally {
      setSaving(false);
    }
  }

  async function updateTrigger() {
    if (!editForm.name.trim() || !editForm.tableName || !editForm.functionName || !editForm.events.length) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/dashboard/${projectId}/triggers`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalName: editOriginal.name,
          originalTable: editOriginal.table,
          ...editForm,
        }),
      });
      const data = await res.json();
      if (data.error) { toast.error(data.error); return; }
      toast.success("Trigger updated");
      editPanel.close();
      await fetchTriggers();
    } finally {
      setSaving(false);
    }
  }

  async function deleteTrigger(t: DbTrigger) {
    const res = await fetch(`/api/dashboard/${projectId}/triggers`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: t.trigger_name, tableName: t.table_name }),
    });
    const data = await res.json();
    if (data.error) { toast.error(data.error); return; }
    toast.success("Trigger deleted");
    setConfirmDelete(null);
    await fetchTriggers();
  }

  function openEdit(t: DbTrigger) {
    setEditOriginal({ name: t.trigger_name, table: t.table_name });
    setEditForm({
      name: t.trigger_name,
      tableName: t.table_name,
      timing: t.timing,
      events: t.events,
      orientation: t.orientation,
      functionName: t.function_name,
      functionSchema: t.function_schema,
    });
    editPanel.open();
  }

  function openCreate() {
    setForm({ ...EMPTY_FORM, tableName: tables[0] ?? "", functionName: functions[0]?.function_name ?? "" });
    createPanel.open();
  }

  // ─── Filtered list ─────────────────────────────────────────────────────────

  const filtered = search
    ? triggers.filter((t) =>
        t.trigger_name.toLowerCase().includes(search.toLowerCase()) ||
        t.table_name.toLowerCase().includes(search.toLowerCase())
      )
    : triggers;

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
        <div>
          <h1 className="text-sm font-semibold text-white">Database Triggers</h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Manage triggers that automatically execute functions in response to table events.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="bg-zinc-800 border border-zinc-700 rounded pl-7 pr-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-zinc-500 placeholder-zinc-600 w-48"
            />
          </div>
          <button
            onClick={fetchTriggers}
            title="Refresh"
            className="cursor-pointer p-1.5 rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            <RefreshCw size={14} />
          </button>
          <button
            onClick={openCreate}
            className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-xs font-medium transition-colors"
          >
            <Plus size={12} />
            Create trigger
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="px-6 py-12 text-center text-xs text-zinc-600">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
            <Zap size={48} className="mb-4 text-zinc-600" />
            <p className="text-sm">{triggers.length === 0 ? "No triggers found" : "No matching triggers"}</p>
            {triggers.length === 0 && (
              <p className="text-xs text-zinc-600 mt-1">
                Triggers will appear here once created.
              </p>
            )}
          </div>
        ) : (
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-zinc-950 z-10">
              <tr className="border-b border-zinc-800">
                <th className="text-left px-4 py-2.5 font-medium text-zinc-500 uppercase tracking-wider">Name</th>
                <th className="text-left px-4 py-2.5 font-medium text-zinc-500 uppercase tracking-wider">Table</th>
                <th className="text-left px-4 py-2.5 font-medium text-zinc-500 uppercase tracking-wider">Timing</th>
                <th className="text-left px-4 py-2.5 font-medium text-zinc-500 uppercase tracking-wider">Events</th>
                <th className="text-left px-4 py-2.5 font-medium text-zinc-500 uppercase tracking-wider">Orientation</th>
                <th className="text-left px-4 py-2.5 font-medium text-zinc-500 uppercase tracking-wider">Function</th>
                <th className="text-left px-4 py-2.5 font-medium text-zinc-500 uppercase tracking-wider">Enabled</th>
                <th className="w-20" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={`${t.trigger_name}-${t.table_name}`} className="border-b border-zinc-800/50 hover:bg-zinc-800/20 group">
                  <td className="px-4 py-3 text-sm text-white font-medium">{t.trigger_name}</td>
                  <td className="px-4 py-3 text-zinc-400 font-mono">{t.table_name}</td>
                  <td className="px-4 py-3 text-zinc-400">{t.timing}</td>
                  <td className="px-4 py-3 text-zinc-400">
                    <div className="flex gap-1 flex-wrap">
                      {t.events.map((e) => (
                        <span key={e} className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[10px] font-mono">{e}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{t.orientation}</td>
                  <td className="px-4 py-3 text-zinc-400 font-mono">{t.function_name}</td>
                  <td className="px-4 py-3">
                    <span className={`w-2 h-2 rounded-full inline-block ${t.enabled ? "bg-green-400" : "bg-zinc-600"}`} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => openEdit(t)}
                        className="cursor-pointer p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                        title="Edit"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => setConfirmDelete(t)}
                        className="cursor-pointer p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Create Trigger Slideover ── */}
      {createPanel.visible && (
        <>
          <div
            className={`slide-panel-backdrop fixed inset-0 z-40 bg-black/40 ${createPanel.closing ? "closing" : ""}`}
            onClick={() => createPanel.close()}
          />
          <div className={`slide-panel fixed inset-y-0 right-0 z-50 w-140 bg-zinc-950 border-l border-zinc-800 flex flex-col shadow-2xl ${createPanel.closing ? "closing" : ""}`}>
            <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-800">
              <h2 className="text-sm font-semibold text-white">Create Trigger</h2>
              <button onClick={() => createPanel.close()} className="cursor-pointer p-1.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1">
              <TriggerFormFields form={form} setForm={setForm} tables={tables} functions={functions} />
            </div>
            <div className="px-6 py-4 border-t border-zinc-800 flex justify-end gap-3">
              <button onClick={() => createPanel.close()} className="cursor-pointer px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
                Cancel
              </button>
              <button
                onClick={createTrigger}
                disabled={saving || !form.name.trim() || !form.tableName || !form.functionName || !form.events.length}
                className="cursor-pointer px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
              >
                {saving ? "Creating..." : "Create trigger"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Edit Trigger Slideover ── */}
      {editPanel.visible && (
        <>
          <div
            className={`slide-panel-backdrop fixed inset-0 z-40 bg-black/40 ${editPanel.closing ? "closing" : ""}`}
            onClick={() => editPanel.close()}
          />
          <div className={`slide-panel fixed inset-y-0 right-0 z-50 w-140 bg-zinc-950 border-l border-zinc-800 flex flex-col shadow-2xl ${editPanel.closing ? "closing" : ""}`}>
            <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-800">
              <h2 className="text-sm font-semibold text-white">Edit Trigger</h2>
              <button onClick={() => editPanel.close()} className="cursor-pointer p-1.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1">
              <TriggerFormFields form={editForm} setForm={setEditForm} tables={tables} functions={functions} />
            </div>
            <div className="px-6 py-4 border-t border-zinc-800 flex justify-end gap-3">
              <button onClick={() => editPanel.close()} className="cursor-pointer px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
                Cancel
              </button>
              <button
                onClick={updateTrigger}
                disabled={saving || !editForm.name.trim() || !editForm.tableName || !editForm.functionName || !editForm.events.length}
                className="cursor-pointer px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
              >
                {saving ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Delete Confirmation Modal ── */}
      {confirmDelete && (
        <>
          <div className="fixed inset-0 z-50 bg-black/50" onClick={() => setConfirmDelete(null)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-96 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-6">
            <h3 className="text-sm font-semibold text-white mb-2">Delete trigger</h3>
            <p className="text-xs text-zinc-400 mb-6">
              Are you sure you want to drop <span className="text-white font-medium">{confirmDelete.trigger_name}</span> on table <span className="text-white font-medium">{confirmDelete.table_name}</span>? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmDelete(null)} className="cursor-pointer px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
                Cancel
              </button>
              <button
                onClick={() => deleteTrigger(confirmDelete)}
                className="cursor-pointer px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Shared form fields component ─────────────────────────────────────────────

function TriggerFormFields({
  form,
  setForm,
  tables,
  functions,
}: {
  form: TriggerForm;
  setForm: React.Dispatch<React.SetStateAction<TriggerForm>>;
  tables: string[];
  functions: DbFunction[];
}) {
  function toggleEvent(event: string) {
    setForm((f) => ({
      ...f,
      events: f.events.includes(event)
        ? f.events.filter((e) => e !== event)
        : [...f.events, event],
    }));
  }

  return (
    <>
      {/* Name */}
      <div className="flex items-center gap-6 px-6 py-4 border-b border-zinc-800">
        <label className="w-28 text-sm text-zinc-300 shrink-0">Name</label>
        <input
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value.toLowerCase().replace(/\s+/g, "_") }))}
          placeholder="my_trigger"
          autoFocus
          className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-brand-500"
        />
      </div>

      {/* Table */}
      <div className="flex items-center gap-6 px-6 py-4 border-b border-zinc-800">
        <label className="w-28 text-sm text-zinc-300 shrink-0">Table</label>
        <div className="relative flex-1">
          <select
            value={form.tableName}
            onChange={(e) => setForm((f) => ({ ...f, tableName: e.target.value }))}
            className="cursor-pointer w-full appearance-none bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500 pr-8"
          >
            <option value="">Select a table</option>
            {tables.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <ChevronDown size={12} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        </div>
      </div>

      {/* Timing */}
      <div className="flex items-center gap-6 px-6 py-4 border-b border-zinc-800">
        <label className="w-28 text-sm text-zinc-300 shrink-0">Timing</label>
        <div className="flex gap-2">
          {TIMINGS.map((t) => (
            <button
              key={t}
              onClick={() => setForm((f) => ({ ...f, timing: t }))}
              className={`cursor-pointer px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                form.timing === t
                  ? "bg-brand-500/20 border-brand-500 text-brand-400"
                  : "bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-600"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Events */}
      <div className="flex items-start gap-6 px-6 py-4 border-b border-zinc-800">
        <label className="w-28 text-sm text-zinc-300 shrink-0 mt-1">Events</label>
        <div className="flex gap-2 flex-wrap">
          {EVENTS.map((e) => (
            <label key={e} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.events.includes(e)}
                onChange={() => toggleEvent(e)}
                className="cursor-pointer w-3.5 h-3.5 accent-[#C4623A]"
              />
              <span className="text-xs text-zinc-300">{e}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Orientation */}
      <div className="flex items-center gap-6 px-6 py-4 border-b border-zinc-800">
        <label className="w-28 text-sm text-zinc-300 shrink-0">Orientation</label>
        <div className="flex gap-2">
          {ORIENTATIONS.map((o) => (
            <button
              key={o}
              onClick={() => setForm((f) => ({ ...f, orientation: o }))}
              className={`cursor-pointer px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                form.orientation === o
                  ? "bg-brand-500/20 border-brand-500 text-brand-400"
                  : "bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-600"
              }`}
            >
              FOR EACH {o}
            </button>
          ))}
        </div>
      </div>

      {/* Function */}
      <div className="flex items-center gap-6 px-6 py-4 border-b border-zinc-800">
        <label className="w-28 text-sm text-zinc-300 shrink-0">Function</label>
        <div className="relative flex-1">
          <select
            value={form.functionName}
            onChange={(e) => setForm((f) => ({ ...f, functionName: e.target.value }))}
            className="cursor-pointer w-full appearance-none bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500 pr-8"
          >
            <option value="">Select a function</option>
            {functions.map((fn) => (
              <option key={`${fn.function_name}(${fn.argument_types})`} value={fn.function_name}>
                {fn.function_name}({fn.argument_types})
              </option>
            ))}
          </select>
          <ChevronDown size={12} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        </div>
      </div>

      {functions.length === 0 && (
        <div className="px-6 py-4 border-b border-zinc-800">
          <p className="text-xs text-zinc-500">
            No functions available. Create a function first in the Functions section.
          </p>
        </div>
      )}
    </>
  );
}
