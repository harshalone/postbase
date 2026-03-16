"use client";

import { useState, useEffect, useCallback, useRef, use } from "react";
import dynamic from "next/dynamic";
import {
  Plus,
  X,
  Play,
  Search,
  ChevronDown,
  ChevronRight,
  Heart,
  Download,
  BarChart2,
  List,
  Loader2,
  Activity,
  Check,
} from "lucide-react";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

// ─── Types ───────────────────────────────────────────────────────────────────

interface SavedQuery {
  id: string;
  name: string;
  sql: string;
  isFavorite: boolean;
  createdAt: number;
}

interface QueryTab {
  id: string;
  name: string;
  sql: string;
}

interface SqlResult {
  rows: Record<string, unknown>[];
  fields: { name: string }[];
  rowCount: number | null;
  command: string;
  error?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function makeTab(name = "New query"): QueryTab {
  return { id: uid(), name, sql: "" };
}

const STORAGE_KEY = "postbase-sql-queries";

function loadSaved(projectId: string): SavedQuery[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}-${projectId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveToDisk(projectId: string, queries: SavedQuery[]) {
  localStorage.setItem(`${STORAGE_KEY}-${projectId}`, JSON.stringify(queries));
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SqlEditorPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);

  // Tabs
  const [tabs, setTabs] = useState<QueryTab[]>(() => [makeTab()]);
  const [activeId, setActiveId] = useState<string>(() => tabs[0].id);
  const activeTab = tabs.find((t) => t.id === activeId) ?? tabs[0];

  // Sidebar
  const [search, setSearch] = useState("");
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
  const [collapsed, setCollapsed] = useState({ shared: false, favorites: false, private: false });

  // Results
  const [resultTab, setResultTab] = useState<"results" | "explain" | "chart">("results");
  const [results, setResults] = useState<Record<string, SqlResult | null>>({});
  const [running, setRunning] = useState(false);
  const [explainResult, setExplainResult] = useState<string | null>(null);

  // Save query name modal
  const [saveModal, setSaveModal] = useState(false);
  const [saveName, setSaveName] = useState("");

  // "View running queries" panel
  const [showRunning, setShowRunning] = useState(false);

  // Copied state for export
  const [exported, setExported] = useState(false);

  const result = results[activeId] ?? null;

  // Load saved queries from localStorage
  useEffect(() => {
    setSavedQueries(loadSaved(projectId));
  }, [projectId]);

  // ─── Tab helpers ───────────────────────────────────────────────────────────

  function newTab() {
    const t = makeTab();
    setTabs((prev) => [...prev, t]);
    setActiveId(t.id);
  }

  function closeTab(id: string) {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (next.length === 0) {
        const fresh = makeTab();
        setActiveId(fresh.id);
        return [fresh];
      }
      if (id === activeId) setActiveId(next[next.length - 1].id);
      return next;
    });
    setResults((r) => { const n = { ...r }; delete n[id]; return n; });
  }

  function updateSql(sql: string) {
    setTabs((prev) => prev.map((t) => (t.id === activeId ? { ...t, sql } : t)));
  }

  // ─── Run / Explain ─────────────────────────────────────────────────────────

  const runQuery = useCallback(async () => {
    const sql = activeTab.sql.trim();
    if (!sql) return;
    setRunning(true);
    setResults((r) => ({ ...r, [activeId]: null }));
    setExplainResult(null);
    try {
      if (resultTab === "explain") {
        const res = await fetch(`/api/dashboard/${projectId}/sql`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sql: `EXPLAIN ANALYZE ${sql}` }),
        });
        const data = await res.json();
        if (data.error) {
          setExplainResult(`Error: ${data.error}`);
        } else {
          setExplainResult(data.rows.map((r: Record<string, unknown>) => Object.values(r)[0]).join("\n"));
        }
      } else {
        const res = await fetch(`/api/dashboard/${projectId}/sql`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sql }),
        });
        const data = await res.json();
        setResults((r) => ({ ...r, [activeId]: data }));
      }
    } finally {
      setRunning(false);
    }
  }, [activeTab.sql, activeId, projectId, resultTab]);

  // ─── Saved queries ─────────────────────────────────────────────────────────

  function saveQuery() {
    if (!saveName.trim()) return;
    const q: SavedQuery = {
      id: uid(),
      name: saveName.trim(),
      sql: activeTab.sql,
      isFavorite: false,
      createdAt: Date.now(),
    };
    const next = [q, ...savedQueries];
    setSavedQueries(next);
    saveToDisk(projectId, next);
    // Rename tab
    setTabs((prev) => prev.map((t) => t.id === activeId ? { ...t, name: q.name } : t));
    setSaveModal(false);
    setSaveName("");
  }

  function toggleFavorite(id: string) {
    const next = savedQueries.map((q) => q.id === id ? { ...q, isFavorite: !q.isFavorite } : q);
    setSavedQueries(next);
    saveToDisk(projectId, next);
  }

  function deleteQuery(id: string) {
    const next = savedQueries.filter((q) => q.id !== id);
    setSavedQueries(next);
    saveToDisk(projectId, next);
  }

  function loadQuery(q: SavedQuery) {
    // Open in current tab or a new tab
    setTabs((prev) => prev.map((t) => t.id === activeId ? { ...t, name: q.name, sql: q.sql } : t));
    setResults((r) => ({ ...r, [activeId]: null }));
  }

  // ─── Export CSV ────────────────────────────────────────────────────────────

  function exportCsv() {
    if (!result || result.error || result.rows.length === 0) return;
    const header = result.fields.map((f) => f.name).join(",");
    const rows = result.rows.map((row) =>
      result!.fields.map((f) => {
        const v = row[f.name];
        if (v === null || v === undefined) return "";
        const s = String(v);
        return s.includes(",") || s.includes('"') || s.includes("\n")
          ? `"${s.replace(/"/g, '""')}"`
          : s;
      }).join(",")
    );
    const csv = [header, ...rows].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `${activeTab.name.replace(/\s+/g, "_")}.csv`;
    a.click();
    setExported(true);
    setTimeout(() => setExported(false), 2000);
  }

  // ─── Sidebar query filter ──────────────────────────────────────────────────

  const filtered = savedQueries.filter((q) =>
    q.name.toLowerCase().includes(search.toLowerCase())
  );
  const favorites = filtered.filter((q) => q.isFavorite);
  const privates = filtered.filter((q) => !q.isFavorite);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full overflow-hidden bg-zinc-950">
      {/* ── Left Sidebar ── */}
      <aside className="w-[180px] shrink-0 border-r border-zinc-800 flex flex-col bg-zinc-950">
        {/* Search */}
        <div className="px-3 py-2 border-b border-zinc-800">
          <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5">
            <Search size={11} className="text-zinc-600 shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search queries..."
              className="bg-transparent text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none w-full"
            />
            {search && (
              <button onClick={() => setSearch("")} className="cursor-pointer text-zinc-600 hover:text-zinc-400">
                <X size={10} />
              </button>
            )}
          </div>
        </div>

        {/* Sections */}
        <div className="flex-1 overflow-y-auto py-1">
          {/* SHARED */}
          <Section
            label="Shared"
            count={0}
            collapsed={collapsed.shared}
            onToggle={() => setCollapsed((c) => ({ ...c, shared: !c.shared }))}
          >
            <EmptyState
              title="No shared queries"
              subtitle="Share queries with your team by right-clicking on the query."
            />
          </Section>

          {/* FAVORITES */}
          <Section
            label="Favorites"
            count={favorites.length}
            collapsed={collapsed.favorites}
            onToggle={() => setCollapsed((c) => ({ ...c, favorites: !c.favorites }))}
          >
            {favorites.length === 0 ? (
              <EmptyState
                title="No favorite queries"
                subtitle={`Save a query to favorites for easy accessibility by clicking the ♡ icon.`}
              />
            ) : (
              favorites.map((q) => (
                <QueryItem
                  key={q.id}
                  query={q}
                  onLoad={() => loadQuery(q)}
                  onToggleFavorite={() => toggleFavorite(q.id)}
                  onDelete={() => deleteQuery(q.id)}
                />
              ))
            )}
          </Section>

          {/* PRIVATE */}
          <Section
            label="Private"
            count={privates.length}
            collapsed={collapsed.private}
            onToggle={() => setCollapsed((c) => ({ ...c, private: !c.private }))}
          >
            {privates.length === 0 ? (
              <EmptyState
                title="No private queries"
                subtitle="Queries you save will appear here."
              />
            ) : (
              privates.map((q) => (
                <QueryItem
                  key={q.id}
                  query={q}
                  onLoad={() => loadQuery(q)}
                  onToggleFavorite={() => toggleFavorite(q.id)}
                  onDelete={() => deleteQuery(q.id)}
                />
              ))
            )}
          </Section>
        </div>

        {/* View running queries */}
        <div className="p-2 border-t border-zinc-800">
          <button
            onClick={() => setShowRunning(true)}
            className="cursor-pointer w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-zinc-800 transition-colors"
          >
            <Activity size={12} />
            View running queries
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Tab bar */}
        <div className="flex items-center border-b border-zinc-800 bg-zinc-950 shrink-0 overflow-x-auto">
          {tabs.map((t) => (
            <div
              key={t.id}
              onClick={() => setActiveId(t.id)}
              className={`cursor-pointer flex items-center gap-2 px-4 py-2.5 border-r border-zinc-800 text-xs shrink-0 group transition-colors ${
                t.id === activeId
                  ? "bg-zinc-900 text-white border-b-2 border-b-brand-500"
                  : "text-zinc-500 hover:bg-zinc-900/50 hover:text-zinc-300"
              }`}
            >
              <List size={12} className="text-zinc-600 shrink-0" />
              <span className="max-w-[120px] truncate">{t.name}</span>
              <button
                onClick={(e) => { e.stopPropagation(); closeTab(t.id); }}
                className="cursor-pointer opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all ml-0.5"
              >
                <X size={11} />
              </button>
            </div>
          ))}
          <button
            onClick={newTab}
            className="cursor-pointer flex items-center gap-1.5 px-3 py-2.5 text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors shrink-0"
          >
            <Plus size={13} /> New
          </button>
        </div>

        {/* Editor */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <MonacoEditor
            key={activeId}
            height="100%"
            defaultLanguage="sql"
            theme="vs-dark"
            value={activeTab.sql}
            onChange={(v) => updateSql(v ?? "")}
            options={{
              fontSize: 13,
              fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              lineNumbers: "on",
              glyphMargin: false,
              folding: false,
              lineDecorationsWidth: 0,
              overviewRulerLanes: 0,
              hideCursorInOverviewRuler: true,
              renderLineHighlight: "line",
              padding: { top: 12, bottom: 12 },
              automaticLayout: true,
              wordWrap: "on",
              placeholder: "Hit CMD+K to generate query or just start typing",
            }}
            onMount={(editor) => {
              editor.addCommand(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (window as any).monaco?.KeyMod?.CtrlCmd | (window as any).monaco?.KeyCode?.Enter ?? 2048 | 3,
                () => runQuery()
              );
            }}
          />
        </div>

        {/* ── Results panel ── */}
        <div className="h-[260px] shrink-0 border-t border-zinc-800 flex flex-col bg-zinc-950">
          {/* Results toolbar */}
          <div className="flex items-center justify-between px-4 py-1.5 border-b border-zinc-800 shrink-0">
            {/* Left: tabs */}
            <div className="flex items-center gap-1">
              {(["results", "explain", "chart"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setResultTab(t)}
                  className={`cursor-pointer px-3 py-1 text-xs rounded transition-colors capitalize ${
                    resultTab === t
                      ? "text-white border-b-2 border-brand-500"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Right: actions + run */}
            <div className="flex items-center gap-2">
              {/* Export CSV */}
              <button
                onClick={exportCsv}
                disabled={!result || !!result.error || result.rows.length === 0}
                title="Export as CSV"
                className="cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed p-1.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
              >
                {exported ? <Check size={13} className="text-green-400" /> : <Download size={13} />}
              </button>

              {/* Favorite / save */}
              <button
                onClick={() => { setSaveName(activeTab.name === "New query" ? "" : activeTab.name); setSaveModal(true); }}
                title="Save query"
                className="cursor-pointer p-1.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
              >
                <Heart size={13} />
              </button>

              {/* Chart icon */}
              <button
                onClick={() => setResultTab("chart")}
                title="Chart"
                className={`cursor-pointer p-1.5 rounded transition-colors ${resultTab === "chart" ? "text-brand-400" : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800"}`}
              >
                <BarChart2 size={13} />
              </button>

              <div className="w-px h-4 bg-zinc-800 mx-1" />

              {/* Source selector */}
              <div className="flex items-center gap-1.5 px-2 py-1 rounded border border-zinc-800 text-xs text-zinc-400">
                <span className="text-zinc-600">Source</span>
                <span>Primary Database</span>
                <ChevronDown size={10} className="text-zinc-600" />
              </div>

              {/* Role */}
              <div className="flex items-center gap-1 text-xs text-zinc-500">
                <span className="text-zinc-600">Role</span>
                <span>postgres</span>
              </div>

              {/* Run button */}
              <button
                onClick={runQuery}
                disabled={running || !activeTab.sql.trim()}
                className="cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 px-3 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-xs font-medium transition-colors"
              >
                {running ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                Run
                <kbd className="text-[10px] text-brand-200 bg-brand-600/60 px-1 rounded">⌘↵</kbd>
              </button>
            </div>
          </div>

          {/* Results content */}
          <div className="flex-1 overflow-auto">
            {resultTab === "results" && (
              <>
                {!result ? (
                  <div className="h-full flex items-center justify-center text-zinc-600 text-sm">
                    Click Run to execute your query.
                  </div>
                ) : result.error ? (
                  <div className="p-4">
                    <p className="text-red-400 text-sm font-mono whitespace-pre-wrap">{result.error}</p>
                  </div>
                ) : result.rows.length === 0 ? (
                  <div className="h-full flex items-center justify-center">
                    <div className="text-center">
                      <p className="text-zinc-500 text-sm">Query returned 0 rows</p>
                      <p className="text-zinc-700 text-xs mt-1">Command: {result.command}</p>
                    </div>
                  </div>
                ) : (
                  <table className="w-full text-xs border-collapse">
                    <thead className="sticky top-0 bg-zinc-950 z-10">
                      <tr>
                        {result.fields.map((f) => (
                          <th
                            key={f.name}
                            className="text-left px-4 py-2 text-zinc-500 font-medium border-b border-zinc-800 whitespace-nowrap"
                          >
                            {f.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.map((row, i) => (
                        <tr key={i} className="border-b border-zinc-800/40 hover:bg-zinc-900/50">
                          {result!.fields.map((f) => (
                            <td
                              key={f.name}
                              className="px-4 py-1.5 text-zinc-300 max-w-[260px] truncate"
                              title={String(row[f.name] ?? "")}
                            >
                              {row[f.name] === null ? (
                                <span className="text-zinc-700 italic">NULL</span>
                              ) : (
                                String(row[f.name])
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            )}

            {resultTab === "explain" && (
              <>
                {!explainResult ? (
                  <div className="h-full flex items-center justify-center text-zinc-600 text-sm">
                    Run a query to see the execution plan.
                  </div>
                ) : (
                  <pre className="p-4 text-xs font-mono text-zinc-300 whitespace-pre-wrap leading-relaxed">
                    {explainResult}
                  </pre>
                )}
              </>
            )}

            {resultTab === "chart" && (
              <div className="h-full flex items-center justify-center text-zinc-600 text-sm">
                Charts coming soon.
              </div>
            )}
          </div>

          {/* Status bar */}
          {result && !result.error && resultTab === "results" && (
            <div className="px-4 py-1 border-t border-zinc-800 flex items-center gap-4 text-xs text-zinc-600 shrink-0">
              <span>{result.command}</span>
              <span>{result.rowCount ?? result.rows.length} rows</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Save Query Modal ── */}
      {saveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <h3 className="text-sm font-semibold text-white mb-4">Save query</h3>
            <input
              autoFocus
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveQuery()}
              placeholder="Query name…"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-brand-500 mb-4"
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setSaveModal(false)}
                className="cursor-pointer px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-zinc-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveQuery}
                disabled={!saveName.trim()}
                className="cursor-pointer disabled:opacity-40 px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Running Queries Modal ── */}
      {showRunning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white">Running queries</h3>
              <button onClick={() => setShowRunning(false)} className="cursor-pointer text-zinc-500 hover:text-zinc-300">
                <X size={15} />
              </button>
            </div>
            {running ? (
              <div className="flex items-center gap-3 py-4 text-sm text-zinc-400">
                <Loader2 size={14} className="animate-spin text-brand-400" />
                Executing query…
              </div>
            ) : (
              <p className="text-sm text-zinc-500 py-4 text-center">No queries currently running.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({
  label,
  count,
  collapsed,
  onToggle,
  children,
}: {
  label: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-1">
      <button
        onClick={onToggle}
        className="cursor-pointer w-full flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-zinc-500 uppercase tracking-wider hover:text-zinc-300 transition-colors"
      >
        {collapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
        {label}
        {count > 0 && (
          <span className="ml-auto text-[10px] font-normal text-zinc-600 normal-case tracking-normal">
            ({count})
          </span>
        )}
      </button>
      {!collapsed && children}
    </div>
  );
}

function EmptyState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mx-3 mb-2 rounded-lg bg-zinc-900/60 p-3 text-center">
      <p className="text-[11px] text-zinc-400 font-medium mb-1">{title}</p>
      <p className="text-[10px] text-zinc-600 leading-relaxed">{subtitle}</p>
    </div>
  );
}

function QueryItem({
  query,
  onLoad,
  onToggleFavorite,
  onDelete,
}: {
  query: SavedQuery;
  onLoad: () => void;
  onToggleFavorite: () => void;
  onDelete: () => void;
}) {
  const [hover, setHover] = useState(false);

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-zinc-800/60 transition-colors group"
    >
      <button
        onClick={onLoad}
        className="cursor-pointer flex-1 text-left text-[11px] text-zinc-400 hover:text-zinc-200 truncate"
      >
        <span className="inline-flex items-center gap-1.5">
          <List size={10} className="text-zinc-600 shrink-0" />
          {query.name}
        </span>
      </button>
      {hover && (
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={onToggleFavorite}
            className="cursor-pointer p-0.5 rounded text-zinc-600 hover:text-brand-400 transition-colors"
          >
            <Heart size={10} fill={query.isFavorite ? "currentColor" : "none"} className={query.isFavorite ? "text-brand-400" : ""} />
          </button>
          <button
            onClick={onDelete}
            className="cursor-pointer p-0.5 rounded text-zinc-600 hover:text-red-400 transition-colors"
          >
            <X size={10} />
          </button>
        </div>
      )}
    </div>
  );
}
