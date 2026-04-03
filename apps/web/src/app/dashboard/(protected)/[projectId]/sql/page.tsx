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
  Star,
  Users,
  Lock,
  Pencil,
  Trash2,
  Info,
  AlertTriangle,
} from "lucide-react";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

// ─── Types ───────────────────────────────────────────────────────────────────

interface HistoryQuery {
  id: string;
  name: string | null;
  sql: string;
  visibility: "private" | "shared" | "favorite";
  executedAt: string;
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
  const [history, setHistory] = useState<HistoryQuery[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
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

  // Destructive command confirmation modal
  const [confirmModal, setConfirmModal] = useState(false);
  const [pendingSql, setPendingSql] = useState<string | null>(null);

  // Info banner visibility
  const [showInfo, setShowInfo] = useState(true);

  // Resizable results panel
  const [resultsHeight, setResultsHeight] = useState(260);
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);
  const mainRef = useRef<HTMLDivElement>(null);

  const result = results[activeId] ?? null;

  // ─── Resizable divider ─────────────────────────────────────────────────────

  const onDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startH: resultsHeight };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current || !mainRef.current) return;
      const delta = dragRef.current.startY - ev.clientY;
      const maxH = mainRef.current.clientHeight - 80;
      setResultsHeight(Math.min(maxH, Math.max(80, dragRef.current.startH + delta)));
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [resultsHeight]);

  // Load history from API
  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/dashboard/${projectId}/sql/history`);
      const data = await res.json();
      setHistory(data.queries ?? []);
    } finally {
      setHistoryLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

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

  // ─── Destructive check ─────────────────────────────────────────────────────

  function isDestructive(sql: string): boolean {
    const normalized = sql.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").trim().toUpperCase();
    if (/^\s*(DROP|TRUNCATE)\b/.test(normalized)) return true;
    // DELETE without WHERE clause
    if (/^\s*DELETE\s+FROM\b/.test(normalized) && !/\bWHERE\b/.test(normalized)) return true;
    return false;
  }

  // ─── Run / Explain ─────────────────────────────────────────────────────────

  const executeQuery = useCallback(async (sql: string) => {
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
      const saveRes = await fetch(`/api/dashboard/${projectId}/sql/history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql }),
      });
      const saveData = await saveRes.json();
      if (saveData.query) {
        setHistory((prev) => [saveData.query, ...prev].slice(0, 200));
      }
    } finally {
      setRunning(false);
    }
  }, [activeId, projectId, resultTab]);

  const runQuery = useCallback(async () => {
    const sql = activeTab.sql.trim();
    if (!sql) return;
    if (isDestructive(sql)) {
      setPendingSql(sql);
      setConfirmModal(true);
      return;
    }
    await executeQuery(sql);
  }, [activeTab.sql, executeQuery]);

  // ─── History actions ───────────────────────────────────────────────────────

  async function updateVisibility(id: string, visibility: HistoryQuery["visibility"]) {
    const res = await fetch(`/api/dashboard/${projectId}/sql/history/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visibility }),
    });
    const data = await res.json();
    if (data.query) {
      setHistory((prev) => prev.map((q) => (q.id === id ? data.query : q)));
    }
  }

  async function renameHistory(id: string, name: string) {
    const res = await fetch(`/api/dashboard/${projectId}/sql/history/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (data.query) {
      setHistory((prev) => prev.map((q) => (q.id === id ? data.query : q)));
    }
    setRenamingId(null);
  }

  async function deleteHistory(id: string) {
    await fetch(`/api/dashboard/${projectId}/sql/history/${id}`, { method: "DELETE" });
    setHistory((prev) => prev.filter((q) => q.id !== id));
  }

  function loadHistoryQuery(q: HistoryQuery) {
    setTabs((prev) => prev.map((t) => t.id === activeId ? { ...t, sql: q.sql } : t));
    setResults((r) => ({ ...r, [activeId]: null }));
  }

  // ─── Saved queries (name modal) ────────────────────────────────────────────

  async function saveQuery() {
    if (!saveName.trim()) return;
    // Find the most recently added private query and rename it
    const latest = history.find((q) => q.visibility === "private");
    if (latest) {
      await renameHistory(latest.id, saveName.trim());
    }
    setTabs((prev) => prev.map((t) => t.id === activeId ? { ...t, name: saveName.trim() } : t));
    setSaveModal(false);
    setSaveName("");
  }

  // ─── Export CSV ────────────────────────────────────────────────────────────

  function exportCsv() {
    if (!result || result.error || !result.rows || result.rows.length === 0) return;
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

  const filtered = history.filter((q) => {
    if (!search) return true;
    const label = q.name ?? q.sql;
    return label.toLowerCase().includes(search.toLowerCase());
  });
  const favorites = filtered.filter((q) => q.visibility === "favorite");
  const shared = filtered.filter((q) => q.visibility === "shared");
  const privates = filtered.filter((q) => q.visibility === "private");

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden bg-zinc-950 relative">
      {/* ── Navbar info banner (absolutely positioned over the page header) ── */}
      {showInfo && (
        <div className="absolute top-0 left-0 right-0 z-30 flex items-center gap-3 px-5 h-14 bg-blue-950/95 backdrop-blur-sm border-b border-blue-900/60">
          <Info size={12} className="text-blue-400 shrink-0" />
          <p className="flex-1 text-xs text-blue-300/90 leading-relaxed truncate">
            <span className="font-medium text-blue-200">Schema-aware SQL runner — </span>
            Queries use <code className="text-blue-300 bg-blue-900/50 px-1 rounded">search_path</code> so unqualified tables work.{" "}
            <span className="text-yellow-300/80">Trigger bodies</span> run on a separate connection — the editor auto-injects <code className="text-blue-300 bg-blue-900/50 px-1 rounded">SET search_path</code> into function bodies, or use <code className="text-blue-300 bg-blue-900/50 px-1 rounded">TG_TABLE_SCHEMA</code> with <code className="text-blue-300 bg-blue-900/50 px-1 rounded">EXECUTE format()</code>.
          </p>
          <button onClick={() => setShowInfo(false)} className="cursor-pointer text-blue-500 hover:text-blue-300 shrink-0 transition-colors">
            <X size={13} />
          </button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
      {/* ── Left Sidebar ── */}
      <aside className="w-[180px] shrink-0 border-r border-zinc-800 flex flex-col bg-zinc-950">
        {/* Search */}
        <div className="px-3 border-b border-zinc-800 h-14 flex items-center">
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
          {historyLoading && (
            <div className="flex items-center justify-center py-4">
              <Loader2 size={12} className="animate-spin text-zinc-600" />
            </div>
          )}

          {/* FAVORITES */}
          <Section
            label="Favorites"
            icon={Star}
            count={favorites.length}
            collapsed={collapsed.favorites}
            onToggle={() => setCollapsed((c) => ({ ...c, favorites: !c.favorites }))}
          >
            {favorites.length === 0 ? (
              <EmptyState
                title="No favorites yet"
                subtitle="Click the star on any query to add it here."
              />
            ) : (
              favorites.map((q) => (
                <HistoryItem
                  key={q.id}
                  query={q}
                  renamingId={renamingId}
                  renameValue={renameValue}
                  onRenameValueChange={setRenameValue}
                  onLoad={() => loadHistoryQuery(q)}
                  onVisibility={(v) => updateVisibility(q.id, v)}
                  onRename={() => { setRenamingId(q.id); setRenameValue(q.name ?? ""); }}
                  onRenameConfirm={() => renameHistory(q.id, renameValue)}
                  onRenameCancel={() => setRenamingId(null)}
                  onDelete={() => deleteHistory(q.id)}
                />
              ))
            )}
          </Section>

          {/* SHARED */}
          <Section
            label="Shared"
            icon={Users}
            count={shared.length}
            collapsed={collapsed.shared}
            onToggle={() => setCollapsed((c) => ({ ...c, shared: !c.shared }))}
          >
            {shared.length === 0 ? (
              <EmptyState
                title="No shared queries"
                subtitle="Click the share icon on any query to share it."
              />
            ) : (
              shared.map((q) => (
                <HistoryItem
                  key={q.id}
                  query={q}
                  renamingId={renamingId}
                  renameValue={renameValue}
                  onRenameValueChange={setRenameValue}
                  onLoad={() => loadHistoryQuery(q)}
                  onVisibility={(v) => updateVisibility(q.id, v)}
                  onRename={() => { setRenamingId(q.id); setRenameValue(q.name ?? ""); }}
                  onRenameConfirm={() => renameHistory(q.id, renameValue)}
                  onRenameCancel={() => setRenamingId(null)}
                  onDelete={() => deleteHistory(q.id)}
                />
              ))
            )}
          </Section>

          {/* PRIVATE */}
          <Section
            label="Private"
            icon={Lock}
            count={privates.length}
            collapsed={collapsed.private}
            onToggle={() => setCollapsed((c) => ({ ...c, private: !c.private }))}
          >
            {privates.length === 0 ? (
              <EmptyState
                title="No history yet"
                subtitle="Queries you run will appear here automatically."
              />
            ) : (
              privates.map((q) => (
                <HistoryItem
                  key={q.id}
                  query={q}
                  renamingId={renamingId}
                  renameValue={renameValue}
                  onRenameValueChange={setRenameValue}
                  onLoad={() => loadHistoryQuery(q)}
                  onVisibility={(v) => updateVisibility(q.id, v)}
                  onRename={() => { setRenamingId(q.id); setRenameValue(q.name ?? ""); }}
                  onRenameConfirm={() => renameHistory(q.id, renameValue)}
                  onRenameCancel={() => setRenamingId(null)}
                  onDelete={() => deleteHistory(q.id)}
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
      <div ref={mainRef} className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Tab bar */}
        <div className="flex items-center border-b border-zinc-800 bg-zinc-950 shrink-0 overflow-x-auto h-14">
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
              lineDecorationsWidth: 16,
              lineNumbersMinChars: 3,
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
                ((window as any).monaco?.KeyMod?.CtrlCmd ?? 2048) | ((window as any).monaco?.KeyCode?.Enter ?? 3),
                () => runQuery()
              );
            }}
          />
        </div>

        {/* ── Drag divider ── */}
        <div
          onMouseDown={onDividerMouseDown}
          className="h-1 shrink-0 cursor-row-resize bg-zinc-800 hover:bg-brand-500 transition-colors"
        />

        {/* ── Results panel ── */}
        <div style={{ height: resultsHeight }} className="shrink-0 flex flex-col bg-zinc-950">
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
                disabled={!result || !!result.error || !result.rows || result.rows.length === 0}
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
                {running ? (
                  <div className="h-full flex items-center justify-center gap-2 text-zinc-500 text-sm">
                    <Loader2 size={14} className="animate-spin text-brand-400" />
                    Running query…
                  </div>
                ) : !result ? (
                  <div className="h-full flex items-center justify-center text-zinc-600 text-sm">
                    Click Run to execute your query.
                  </div>
                ) : result.error ? (
                  <div className="p-4">
                    <p className="text-red-400 text-sm font-mono whitespace-pre-wrap">{result.error}</p>
                  </div>
                ) : !result.rows || result.rows.length === 0 ? (
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
                {running ? (
                  <div className="h-full flex items-center justify-center gap-2 text-zinc-500 text-sm">
                    <Loader2 size={14} className="animate-spin text-brand-400" />
                    Analyzing query…
                  </div>
                ) : !explainResult ? (
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
              <span>{result.rowCount ?? result.rows?.length ?? 0} rows</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Destructive Confirmation Modal ── */}
      {confirmModal && pendingSql && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-zinc-900 border border-red-900/60 rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-red-900/40 shrink-0">
                <AlertTriangle size={15} className="text-red-400" />
              </div>
              <h3 className="text-sm font-semibold text-white">Destructive operation</h3>
            </div>
            <p className="text-xs text-zinc-400 mb-3 leading-relaxed">
              This query contains a <span className="text-red-400 font-medium">DROP</span>, <span className="text-red-400 font-medium">TRUNCATE</span>, or <span className="text-red-400 font-medium">DELETE without WHERE</span> — it may permanently remove data. Are you sure you want to run it?
            </p>
            <pre className="text-[11px] font-mono text-zinc-400 bg-zinc-800 rounded-lg px-3 py-2 mb-4 max-h-24 overflow-auto whitespace-pre-wrap border border-zinc-700">
              {pendingSql.length > 300 ? pendingSql.slice(0, 300) + "…" : pendingSql}
            </pre>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setConfirmModal(false); setPendingSql(null); }}
                className="cursor-pointer px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-zinc-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setConfirmModal(false);
                  const sql = pendingSql;
                  setPendingSql(null);
                  await executeQuery(sql);
                }}
                className="cursor-pointer px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors"
              >
                Run anyway
              </button>
            </div>
          </div>
        </div>
      )}

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
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({
  label,
  icon: Icon,
  count,
  collapsed,
  onToggle,
  children,
}: {
  label: string;
  icon: React.ElementType;
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
        <Icon size={10} className="shrink-0" />
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

function HistoryItem({
  query,
  renamingId,
  renameValue,
  onRenameValueChange,
  onLoad,
  onVisibility,
  onRename,
  onRenameConfirm,
  onRenameCancel,
  onDelete,
}: {
  query: HistoryQuery;
  renamingId: string | null;
  renameValue: string;
  onRenameValueChange: (v: string) => void;
  onLoad: () => void;
  onVisibility: (v: HistoryQuery["visibility"]) => void;
  onRename: () => void;
  onRenameConfirm: () => void;
  onRenameCancel: () => void;
  onDelete: () => void;
}) {
  if (renamingId === query.id) {
    return (
      <div className="flex items-center gap-1 px-2 py-1.5">
        <input
          autoFocus
          className="flex-1 bg-zinc-800 text-zinc-200 text-xs px-2 py-1 rounded focus:outline-none"
          value={renameValue}
          onChange={(e) => onRenameValueChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onRenameConfirm();
            if (e.key === "Escape") onRenameCancel();
          }}
        />
        <button onClick={onRenameConfirm} className="cursor-pointer p-1 text-green-400 hover:text-green-300">
          <Check size={11} />
        </button>
        <button onClick={onRenameCancel} className="cursor-pointer p-1 text-zinc-500 hover:text-zinc-300">
          <X size={11} />
        </button>
      </div>
    );
  }

  return (
    <div className="group border-b border-zinc-900/50">
      <div
        onClick={onLoad}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && onLoad()}
        className="cursor-pointer w-full text-left px-3 py-2 hover:bg-zinc-800/60 transition-colors"
      >
        <div className="text-[11px] text-zinc-300 truncate flex items-center gap-1.5">
          <List size={10} className="text-zinc-600 shrink-0" />
          {query.name ?? query.sql.replace(/\s+/g, " ").slice(0, 50)}
        </div>
        <div className="text-[10px] text-zinc-600 mt-0.5 pl-4">
          {new Date(query.executedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
        </div>
        {/* Hover actions */}
        <div className="hidden group-hover:flex items-center gap-1 mt-1 pl-4">
          <button
            onClick={(e) => { e.stopPropagation(); onVisibility("favorite"); }}
            title="Favorite"
            className={`cursor-pointer p-0.5 rounded transition-colors ${query.visibility === "favorite" ? "text-yellow-400" : "text-zinc-600 hover:text-yellow-400"}`}
          >
            <Star size={10} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onVisibility(query.visibility === "shared" ? "private" : "shared"); }}
            title={query.visibility === "shared" ? "Make private" : "Share"}
            className={`cursor-pointer p-0.5 rounded transition-colors ${query.visibility === "shared" ? "text-blue-400" : "text-zinc-600 hover:text-blue-400"}`}
          >
            <Users size={10} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onRename(); }}
            title="Rename"
            className="cursor-pointer p-0.5 rounded text-zinc-600 hover:text-zinc-300 transition-colors"
          >
            <Pencil size={10} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            title="Delete"
            className="cursor-pointer p-0.5 rounded text-zinc-600 hover:text-red-400 transition-colors ml-auto"
          >
            <Trash2 size={10} />
          </button>
        </div>
      </div>
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

