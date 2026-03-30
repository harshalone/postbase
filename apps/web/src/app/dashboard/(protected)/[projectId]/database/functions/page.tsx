"use client";

import { useState, useEffect, useCallback, use } from "react";
import dynamic from "next/dynamic";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });
import { useSlidePanel } from "@/hooks/use-slide-panel";
import { useToast } from "@/hooks/use-toast";
import {
  FunctionSquare,
  Plus,
  Trash2,
  RefreshCw,
  X,
  Pencil,
  Search,
  ChevronDown,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type DbFunction = {
  function_name: string;
  argument_types: string;
  return_type: string;
  language: string;
  volatility: string;
  security: string;
  definition: string;
};

type FunctionForm = {
  name: string;
  args: string;
  returnType: string;
  language: string;
  body: string;
  volatility: string;
  security: string;
};

const EMPTY_FORM: FunctionForm = {
  name: "",
  args: "",
  returnType: "void",
  language: "plpgsql",
  body: "BEGIN\n  -- your code here\nEND;",
  volatility: "VOLATILE",
  security: "SECURITY INVOKER",
};

const LANGUAGES = ["sql", "plpgsql"];
const VOLATILITIES = ["VOLATILE", "STABLE", "IMMUTABLE"];
const SECURITIES = ["SECURITY INVOKER", "SECURITY DEFINER"];

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function FunctionsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  const toast = useToast();

  const [functions, setFunctions] = useState<DbFunction[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<DbFunction | null>(null);
  const [search, setSearch] = useState("");

  // Panels
  const createPanel = useSlidePanel();
  const editPanel = useSlidePanel();
  const [form, setForm] = useState<FunctionForm>({ ...EMPTY_FORM });
  const [editForm, setEditForm] = useState<FunctionForm>({ ...EMPTY_FORM });
  const [editOriginal, setEditOriginal] = useState<{ name: string; args: string }>({ name: "", args: "" });
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<DbFunction | null>(null);

  // ─── Data fetcher ──────────────────────────────────────────────────────────

  const fetchFunctions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard/${projectId}/functions`);
      const data = await res.json();
      if (data.error) { toast.error(data.error); return; }
      setFunctions(data.functions ?? []);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchFunctions(); }, [fetchFunctions]);

  // ─── Actions ───────────────────────────────────────────────────────────────

  async function createFunction() {
    if (!form.name.trim() || !form.body.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/dashboard/${projectId}/functions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.error) { toast.error(data.error); return; }
      toast.success("Function created");
      createPanel.close();
      setForm({ ...EMPTY_FORM });
      await fetchFunctions();
    } finally {
      setSaving(false);
    }
  }

  async function updateFunction() {
    if (!editForm.name.trim() || !editForm.body.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/dashboard/${projectId}/functions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalName: editOriginal.name,
          originalArgs: editOriginal.args,
          ...editForm,
        }),
      });
      const data = await res.json();
      if (data.error) { toast.error(data.error); return; }
      toast.success("Function updated");
      editPanel.close();
      setSelected(null);
      await fetchFunctions();
    } finally {
      setSaving(false);
    }
  }

  async function deleteFunction(fn: DbFunction) {
    const res = await fetch(`/api/dashboard/${projectId}/functions`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: fn.function_name, args: fn.argument_types }),
    });
    const data = await res.json();
    if (data.error) { toast.error(data.error); return; }
    toast.success("Function deleted");
    setConfirmDelete(null);
    if (selected?.function_name === fn.function_name) setSelected(null);
    await fetchFunctions();
  }

  function openEdit(fn: DbFunction) {
    setEditOriginal({ name: fn.function_name, args: fn.argument_types });
    setEditForm({
      name: fn.function_name,
      args: fn.argument_types,
      returnType: fn.return_type,
      language: fn.language,
      body: fn.definition,
      volatility: fn.volatility,
      security: fn.security,
    });
    editPanel.open();
  }

  // ─── Filtered list ─────────────────────────────────────────────────────────

  const filtered = search
    ? functions.filter((f) => f.function_name.toLowerCase().includes(search.toLowerCase()))
    : functions;

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="w-64 shrink-0 border-r border-zinc-800 flex flex-col">
        <div className="px-3 py-2 border-b border-zinc-800 flex items-center gap-2">
          <div className="flex-1 relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search functions..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded pl-7 pr-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-zinc-500 placeholder-zinc-600"
            />
          </div>
          <button
            onClick={fetchFunctions}
            title="Refresh"
            className="cursor-pointer p-1.5 rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            <RefreshCw size={12} />
          </button>
          <button
            onClick={() => { setForm({ ...EMPTY_FORM }); createPanel.open(); }}
            title="New function"
            className="cursor-pointer p-1.5 rounded bg-brand-500 hover:bg-brand-600 text-white transition-colors"
          >
            <Plus size={12} />
          </button>
        </div>
        <ul className="flex-1 overflow-y-auto py-2">
          {loading ? (
            <li className="px-4 py-3 text-xs text-zinc-600">Loading...</li>
          ) : filtered.length === 0 ? (
            <li className="px-4 py-8 text-center text-xs text-zinc-600">
              {functions.length === 0 ? (
                <>
                  No functions yet.
                  <br />
                  <button
                    onClick={() => { setForm({ ...EMPTY_FORM }); createPanel.open(); }}
                    className="cursor-pointer mt-2 text-brand-400 hover:text-brand-300"
                  >
                    Create one
                  </button>
                </>
              ) : (
                "No matching functions"
              )}
            </li>
          ) : filtered.map((fn) => (
            <li key={`${fn.function_name}(${fn.argument_types})`}>
              <button
                onClick={() => setSelected(fn)}
                className={`cursor-pointer w-full text-left px-4 py-2 text-sm transition-colors ${
                  selected?.function_name === fn.function_name && selected?.argument_types === fn.argument_types
                    ? "bg-zinc-800 text-white"
                    : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-100"
                }`}
              >
                <span className="block truncate">{fn.function_name}</span>
                <span className="block text-xs text-zinc-600 truncate">
                  ({fn.argument_types || ""}) → {fn.return_type}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center text-zinc-500">
            <FunctionSquare size={48} className="mb-4 text-zinc-600" />
            <p className="text-sm">
              {functions.length === 0 ? "No functions found" : "Select a function to view its definition"}
            </p>
            {functions.length === 0 && (
              <p className="text-xs text-zinc-600 mt-1">
                Functions will appear here once created.
              </p>
            )}
          </div>
        ) : (
          <>
            {/* Toolbar */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
              <div>
                <h2 className="text-sm font-medium text-white">{selected.function_name}</h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  ({selected.argument_types || "void"}) → {selected.return_type}
                  {" | "}
                  {selected.language}
                  {" | "}
                  {selected.volatility}
                  {" | "}
                  {selected.security}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => openEdit(selected)}
                  className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-700 text-xs text-zinc-300 hover:bg-zinc-800 transition-colors"
                >
                  <Pencil size={12} />
                  Edit
                </button>
                <button
                  onClick={() => setConfirmDelete(selected)}
                  className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-700 text-xs text-red-400 hover:bg-zinc-800 transition-colors"
                >
                  <Trash2 size={12} />
                  Delete
                </button>
              </div>
            </div>
            {/* Definition */}
            <div className="flex-1 overflow-hidden">
              <MonacoEditor
                height="100%"
                language="sql"
                theme="vs-dark"
                value={selected.definition}
                options={{
                  readOnly: true,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  lineNumbers: "on",
                  fontSize: 13,
                  glyphMargin: false,
                  folding: false,
                  lineDecorationsWidth: 16,
                  lineNumbersMinChars: 3,
                  overviewRulerLanes: 0,
                  renderLineHighlight: "none",
                  padding: { top: 12, bottom: 12 },
                  automaticLayout: true,
                  wordWrap: "on",
                  domReadOnly: true,
                }}
              />
            </div>
          </>
        )}
      </div>

      {/* ── Create Function Slideover ── */}
      {createPanel.visible && (
        <>
          <div
            className={`slide-panel-backdrop fixed inset-0 z-40 bg-black/40 ${createPanel.closing ? "closing" : ""}`}
            onClick={() => createPanel.close()}
          />
          <div className={`slide-panel fixed inset-y-0 right-0 z-50 w-170 bg-zinc-950 border-l border-zinc-800 flex flex-col shadow-2xl ${createPanel.closing ? "closing" : ""}`}>
            <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-800">
              <h2 className="text-sm font-semibold text-white">Create Function</h2>
              <button onClick={() => createPanel.close()} className="cursor-pointer p-1.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1">
              <FunctionFormFields form={form} setForm={setForm} />
            </div>
            <div className="px-6 py-4 border-t border-zinc-800 flex justify-end gap-3">
              <button onClick={() => createPanel.close()} className="cursor-pointer px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
                Cancel
              </button>
              <button
                onClick={createFunction}
                disabled={saving || !form.name.trim() || !form.body.trim()}
                className="cursor-pointer px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
              >
                {saving ? "Creating..." : "Create function"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Edit Function Slideover ── */}
      {editPanel.visible && (
        <>
          <div
            className={`slide-panel-backdrop fixed inset-0 z-40 bg-black/40 ${editPanel.closing ? "closing" : ""}`}
            onClick={() => editPanel.close()}
          />
          <div className={`slide-panel fixed inset-y-0 right-0 z-50 w-170 bg-zinc-950 border-l border-zinc-800 flex flex-col shadow-2xl ${editPanel.closing ? "closing" : ""}`}>
            <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-800">
              <h2 className="text-sm font-semibold text-white">Edit Function</h2>
              <button onClick={() => editPanel.close()} className="cursor-pointer p-1.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1">
              <FunctionFormFields form={editForm} setForm={setEditForm} />
            </div>
            <div className="px-6 py-4 border-t border-zinc-800 flex justify-end gap-3">
              <button onClick={() => editPanel.close()} className="cursor-pointer px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
                Cancel
              </button>
              <button
                onClick={updateFunction}
                disabled={saving || !editForm.name.trim() || !editForm.body.trim()}
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
            <h3 className="text-sm font-semibold text-white mb-2">Delete function</h3>
            <p className="text-xs text-zinc-400 mb-6">
              Are you sure you want to drop <span className="text-white font-medium">{confirmDelete.function_name}</span>? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmDelete(null)} className="cursor-pointer px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
                Cancel
              </button>
              <button
                onClick={() => deleteFunction(confirmDelete)}
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

function FunctionFormFields({
  form,
  setForm,
}: {
  form: FunctionForm;
  setForm: React.Dispatch<React.SetStateAction<FunctionForm>>;
}) {
  return (
    <>
      {/* Name */}
      <div className="flex items-center gap-6 px-6 py-4 border-b border-zinc-800">
        <label className="w-28 text-sm text-zinc-300 shrink-0">Name</label>
        <input
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value.toLowerCase().replace(/\s+/g, "_") }))}
          placeholder="my_function"
          autoFocus
          className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-brand-500"
        />
      </div>

      {/* Arguments */}
      <div className="flex items-center gap-6 px-6 py-4 border-b border-zinc-800">
        <label className="w-28 text-sm text-zinc-300 shrink-0">Arguments</label>
        <input
          value={form.args}
          onChange={(e) => setForm((f) => ({ ...f, args: e.target.value }))}
          placeholder="arg1 text, arg2 integer"
          className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-brand-500 font-mono"
        />
      </div>

      {/* Return type */}
      <div className="flex items-center gap-6 px-6 py-4 border-b border-zinc-800">
        <label className="w-28 text-sm text-zinc-300 shrink-0">Return type</label>
        <input
          value={form.returnType}
          onChange={(e) => setForm((f) => ({ ...f, returnType: e.target.value }))}
          placeholder="void"
          className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-brand-500 font-mono"
        />
      </div>

      {/* Language */}
      <div className="flex items-center gap-6 px-6 py-4 border-b border-zinc-800">
        <label className="w-28 text-sm text-zinc-300 shrink-0">Language</label>
        <div className="relative flex-1">
          <select
            value={form.language}
            onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))}
            className="cursor-pointer w-full appearance-none bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500 pr-8"
          >
            {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          <ChevronDown size={12} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        </div>
      </div>

      {/* Volatility */}
      <div className="flex items-center gap-6 px-6 py-4 border-b border-zinc-800">
        <label className="w-28 text-sm text-zinc-300 shrink-0">Volatility</label>
        <div className="relative flex-1">
          <select
            value={form.volatility}
            onChange={(e) => setForm((f) => ({ ...f, volatility: e.target.value }))}
            className="cursor-pointer w-full appearance-none bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500 pr-8"
          >
            {VOLATILITIES.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <ChevronDown size={12} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        </div>
      </div>

      {/* Security */}
      <div className="flex items-center gap-6 px-6 py-4 border-b border-zinc-800">
        <label className="w-28 text-sm text-zinc-300 shrink-0">Security</label>
        <div className="relative flex-1">
          <select
            value={form.security}
            onChange={(e) => setForm((f) => ({ ...f, security: e.target.value }))}
            className="cursor-pointer w-full appearance-none bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500 pr-8"
          >
            {SECURITIES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <ChevronDown size={12} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        </div>
      </div>

      {/* Body (Monaco) */}
      <div className="px-6 pt-5 pb-6">
        <label className="block text-sm text-zinc-300 mb-3">Function body</label>
        <div className="border border-zinc-700 rounded-lg overflow-hidden" style={{ height: 300 }}>
          <MonacoEditor
            height="100%"
            language="sql"
            theme="vs-dark"
            value={form.body}
            onChange={(v) => setForm((f) => ({ ...f, body: v ?? "" }))}
            options={{
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              lineNumbers: "on",
              fontSize: 13,
              glyphMargin: false,
              folding: false,
              lineDecorationsWidth: 16,
              lineNumbersMinChars: 3,
              overviewRulerLanes: 0,
              renderLineHighlight: "none",
              padding: { top: 12, bottom: 12 },
              automaticLayout: true,
              wordWrap: "on",
            }}
          />
        </div>
      </div>
    </>
  );
}

