"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Copy,
  Check,
  X,
  AlertCircle,
  Loader2,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ClipboardCopy,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Organisation {
  id: string;
  name: string;
  slug: string;
}

type PhaseStatus = "pending" | "running" | "done" | "skipped" | "error";

interface PhaseState {
  id: string;
  label: string;
  status: PhaseStatus;
  message: string;
  detail?: string;
}

interface TableDataState {
  table: string;
  status: "running" | "done" | "error";
  rows?: number;
  error?: string;
}

const PHASES: { id: string; label: string }[] = [
  { id: "init", label: "Create project" },
  { id: "schema_init", label: "Initialise schema" },
  { id: "table_schemas", label: "Table structures" },
  { id: "functions", label: "Functions" },
  { id: "triggers", label: "Triggers" },
  { id: "rls", label: "RLS policies" },
  { id: "auth_providers", label: "Auth providers" },
  { id: "email", label: "Email settings" },
  { id: "storage", label: "Storage config" },
  { id: "cron_jobs", label: "Cron jobs" },
  { id: "users", label: "Users" },
  { id: "data", label: "Table data" },
];

// ─── Phase row ────────────────────────────────────────────────────────────────

function PhaseRow({
  phase,
  expanded,
  onToggle,
  tableData,
}: {
  phase: PhaseState;
  expanded: boolean;
  onToggle: () => void;
  tableData?: TableDataState[];
}) {
  const isDataPhase = phase.id === "data";
  const hasTableData = isDataPhase && tableData && tableData.length > 0;
  const errorCount = tableData?.filter((t) => t.status === "error").length ?? 0;

  const icon = () => {
    switch (phase.status) {
      case "running":
        return <Loader2 size={13} className="text-blue-400 animate-spin shrink-0" />;
      case "done":
        return <Check size={13} className="text-emerald-400 shrink-0" />;
      case "skipped":
        return <span className="w-3 h-3 rounded-full border border-zinc-700 inline-block shrink-0" />;
      case "error":
        return <AlertCircle size={13} className="text-red-400 shrink-0" />;
      default:
        return <span className="w-3 h-3 rounded-full border border-zinc-700 inline-block shrink-0" />;
    }
  };

  const labelColor =
    phase.status === "pending" || phase.status === "skipped"
      ? "text-zinc-600"
      : phase.status === "error"
      ? "text-red-300"
      : phase.status === "running"
      ? "text-zinc-100"
      : "text-zinc-300";

  return (
    <div>
      <div
        className={`flex items-center gap-2.5 py-1.5 ${hasTableData ? "cursor-pointer" : ""}`}
        onClick={hasTableData ? onToggle : undefined}
      >
        <span className="w-3.5 flex items-center justify-center">{icon()}</span>
        <span className={`text-xs flex-1 ${labelColor}`}>{phase.label}</span>

        {phase.status === "running" && !hasTableData && (
          <span className="text-xs text-zinc-600 animate-pulse">running…</span>
        )}
        {phase.detail && (phase.status === "done" || phase.status === "error") && (
          <span className={`text-xs ${phase.status === "error" ? "text-red-500" : "text-zinc-500"}`}>
            {phase.detail}
          </span>
        )}
        {phase.status === "running" && hasTableData && (
          <span className="text-xs text-zinc-500">
            {tableData!.filter((t) => t.status === "done").length}/{tableData!.length}
          </span>
        )}
        {hasTableData && (
          <span className="text-zinc-600 ml-0.5">
            {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </span>
        )}
      </div>

      {hasTableData && expanded && (
        <div className="ml-6 mb-1 max-h-64 overflow-y-auto rounded border border-zinc-800 bg-zinc-950">
          {tableData!.map((t) => (
            <div
              key={t.table}
              className="flex items-center gap-2 px-3 py-1 border-b border-zinc-800/50 last:border-0"
            >
              {t.status === "running" ? (
                <Loader2 size={10} className="text-blue-400 animate-spin shrink-0" />
              ) : t.status === "done" ? (
                <Check size={10} className="text-emerald-500 shrink-0" />
              ) : (
                <AlertCircle size={10} className="text-red-400 shrink-0" />
              )}
              <span className="text-xs text-zinc-400 flex-1 font-mono truncate">{t.table}</span>
              {t.status === "done" && (
                <span className="text-xs text-zinc-600">
                  {t.rows?.toLocaleString()} rows
                </span>
              )}
              {t.status === "error" && (
                <span className="text-xs text-red-500 truncate max-w-[200px]" title={t.error}>
                  {t.error}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {!isDataPhase && phase.status === "error" && phase.message && (
        <div className="ml-6 mb-1 px-2 py-1.5 rounded bg-red-950/40 border border-red-900/40">
          <p className="text-xs text-red-300 break-all">{phase.message}</p>
        </div>
      )}

      {isDataPhase && phase.status === "error" && errorCount > 0 && !expanded && (
        <div className="ml-6 mb-1">
          <p className="text-xs text-red-400">{errorCount} table{errorCount !== 1 ? "s" : ""} failed — click to expand</p>
        </div>
      )}
    </div>
  );
}

// ─── Logs textarea ────────────────────────────────────────────────────────────

function LogsPanel({ logs }: { logs: string }) {
  const [copied, setCopied] = useState(false);

  function copyLogs() {
    navigator.clipboard.writeText(logs).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-xs text-zinc-500 font-medium">Full log</p>
        <button
          onClick={copyLogs}
          className="cursor-pointer flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
        >
          {copied ? <Check size={11} className="text-emerald-400" /> : <ClipboardCopy size={11} />}
          {copied ? "Copied" : "Copy log"}
        </button>
      </div>
      <textarea
        readOnly
        value={logs}
        className="w-full h-48 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-400 font-mono resize-none focus:outline-none"
      />
    </div>
  );
}

// ─── Main dialog (fullscreen overlay) ────────────────────────────────────────

export function CopyProjectDialog({
  projectId,
  projectName,
  defaultOrgId,
  onClose,
}: {
  projectId: string;
  projectName: string;
  defaultOrgId: string | null;
  onClose: () => void;
}) {
  const router = useRouter();

  // Form state
  const [name, setName] = useState(`${projectName}-copy`);
  const [slug, setSlug] = useState(
    `${projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}-copy`
  );
  const [orgId, setOrgId] = useState<string>(defaultOrgId ?? "");
  const [orgs, setOrgs] = useState<Organisation[]>([]);
  const [options, setOptions] = useState({
    tables: true,
    functions: true,
    triggers: true,
    rls: true,
    authProviders: true,
    emailSettings: true,
    storageBuckets: true,
    storageConnections: true,
    cronJobs: true,
    copyUsers: false,
  });

  // Progress state
  const [view, setView] = useState<"form" | "progress" | "done">("form");
  const [phases, setPhases] = useState<PhaseState[]>(
    PHASES.map(({ id, label }) => ({ id, label, status: "pending", message: "" }))
  );
  const [tableData, setTableData] = useState<TableDataState[]>([]);
  const [dataExpanded, setDataExpanded] = useState(false);
  const [summaryErrors, setSummaryErrors] = useState<string[]>([]);
  const [doneProjectId, setDoneProjectId] = useState<string | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const logLines = useRef<string[]>([]);
  const [logText, setLogText] = useState("");

  useEffect(() => {
    fetch("/api/dashboard/organisations")
      .then((r) => r.json())
      .then((d) => { if (d.organisations) setOrgs(d.organisations); })
      .catch(() => {});
  }, []);

  function appendLog(line: string) {
    logLines.current.push(line);
    setLogText(logLines.current.join("\n"));
  }

  function updatePhase(id: string, update: Partial<PhaseState>) {
    setPhases((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...update } : p))
    );
  }

  async function startCopy() {
    setView("progress");
    setDataExpanded(true);
    logLines.current = [];
    appendLog(`Copy started: "${name}" from "${projectName}"`);
    appendLog(`Time: ${new Date().toISOString()}`);
    appendLog("─".repeat(60));

    try {
      const res = await fetch(`/api/dashboard/projects/${projectId}/copy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug, organisationId: orgId || null, options }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        const msg = data.error ?? "Failed to start copy";
        setFatalError(msg);
        appendLog(`FATAL: ${msg}`);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";

        for (const chunk of chunks) {
          const dataLine = chunk.split("\n").find((l) => l.startsWith("data: "));
          if (!dataLine) continue;
          try {
            const event = JSON.parse(dataLine.slice(6));

            if (event.type === "phase") {
              updatePhase(event.phase, {
                status: event.status,
                message: event.message,
                detail: event.detail,
              });
              if (event.newProjectId) setDoneProjectId(event.newProjectId);
              const statusTag = event.status.toUpperCase().padEnd(7);
              appendLog(`[${statusTag}] ${event.phase}: ${event.message}${event.detail ? ` (${event.detail})` : ""}`);
            } else if (event.type === "table_data") {
              setTableData((prev) => {
                const exists = prev.find((t) => t.table === event.table);
                if (exists) {
                  return prev.map((t) =>
                    t.table === event.table
                      ? { ...t, status: event.status, rows: event.rows, error: event.error }
                      : t
                  );
                }
                return [...prev, { table: event.table, status: event.status }];
              });
              if (event.status === "done") {
                appendLog(`  table ${event.table}: ${event.rows?.toLocaleString()} rows`);
              } else if (event.status === "error") {
                appendLog(`  table ${event.table}: ERROR — ${event.error}`);
              }
            } else if (event.type === "summary") {
              setSummaryErrors(event.errors ?? []);
              if (event.newProjectId) setDoneProjectId(event.newProjectId);
              appendLog("─".repeat(60));
              appendLog(`DONE. ${event.errors?.length ?? 0} error(s).`);
              if (event.errors?.length) {
                appendLog("Errors:");
                for (const e of event.errors) appendLog(`  • ${e}`);
              }
              setView("done");
            }
          } catch {
            // malformed SSE line — skip
          }
        }
      }
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") {
        const msg = err instanceof Error ? err.message : "Connection lost";
        setFatalError(msg);
        appendLog(`CONNECTION ERROR: ${msg}`);
      }
    }
  }

  const completedPhases = phases.filter(
    (p) => p.status === "done" || p.status === "skipped" || p.status === "error"
  ).length;
  const progress = Math.round((completedPhases / phases.length) * 100);
  const totalErrors = summaryErrors.length;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950 overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-2">
          <Copy size={15} className="text-zinc-400" />
          <h1 className="text-sm font-semibold text-white">
            {view === "form"
              ? `Copy "${projectName}"`
              : view === "done"
              ? totalErrors === 0 ? "Copy complete" : "Copy finished with errors"
              : `Copying "${projectName}"…`}
          </h1>
        </div>
        {view !== "progress" && (
          <button
            onClick={onClose}
            className="cursor-pointer p-1.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {/* ── Form ── */}
      {view === "form" && (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-lg mx-auto px-6 py-8 space-y-5">
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Project name</label>
              <input
                autoFocus
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
              />
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Slug</label>
              <input
                type="text"
                value={slug}
                onChange={(e) =>
                  setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
                }
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500 font-mono"
              />
            </div>

            {orgs.length > 0 && (
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Organisation</label>
                <select
                  value={orgId}
                  onChange={(e) => setOrgId(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
                >
                  <option value="">No organisation</option>
                  {orgs.map((org) => (
                    <option key={org.id} value={org.id}>{org.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <p className="text-xs text-zinc-400 mb-2.5">What to copy</p>
              <div className="space-y-2.5">
                {[
                  { key: "tables", label: "Tables (schema + data)" },
                  { key: "functions", label: "Functions" },
                  { key: "triggers", label: "Triggers" },
                  { key: "rls", label: "RLS policies" },
                  { key: "authProviders", label: "Auth providers" },
                  { key: "emailSettings", label: "Email settings & templates" },
                  { key: "storageBuckets", label: "Storage buckets" },
                  { key: "storageConnections", label: "External storage connections" },
                  { key: "cronJobs", label: "Cron jobs" },
                ].map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2.5 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={options[key as keyof typeof options]}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setOptions((prev) => {
                          const next = { ...prev, [key]: checked };
                          if (key === "functions" && !checked) next.triggers = false;
                          if (key === "triggers" && checked) next.functions = true;
                          return next;
                        });
                      }}
                      className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 accent-blue-500"
                    />
                    <span className="text-sm text-zinc-300 group-hover:text-zinc-100 transition-colors">
                      {label}
                    </span>
                  </label>
                ))}

                {/* Users — separated with a divider since it copies PII */}
                <div className="pt-1 border-t border-zinc-800">
                  <label className="flex items-start gap-2.5 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={options.copyUsers}
                      onChange={(e) => setOptions((prev) => ({ ...prev, copyUsers: e.target.checked }))}
                      className="w-4 h-4 mt-0.5 rounded border-zinc-600 bg-zinc-800 accent-blue-500"
                    />
                    <span>
                      <span className="text-sm text-zinc-300 group-hover:text-zinc-100 transition-colors">
                        Users
                      </span>
                      <span className="ml-2 text-xs text-zinc-600">
                        copies users, accounts &amp; sessions — includes passwords &amp; tokens
                      </span>
                    </span>
                  </label>
                </div>
              </div>
            </div>

            <p className="text-xs text-zinc-600 pt-1">
              New API keys will be generated. Stored files are not copied.
            </p>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={onClose}
                className="cursor-pointer px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={startCopy}
                disabled={!name.trim() || !slug.trim()}
                className="cursor-pointer flex items-center gap-1.5 px-5 py-2.5 text-sm bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Start copy <ChevronRight size={13} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Progress ── */}
      {view === "progress" && (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-6 py-8">
            <div className="flex items-center gap-2 mb-5">
              <Loader2 size={13} className="animate-spin text-zinc-500" />
              <p className="text-xs text-zinc-500">Keep this page open while copying…</p>
            </div>

            <div className="space-y-0.5">
              {phases.map((p) => (
                <PhaseRow
                  key={p.id}
                  phase={p}
                  expanded={p.id === "data" && dataExpanded}
                  onToggle={() => setDataExpanded((v) => !v)}
                  tableData={p.id === "data" ? tableData : undefined}
                />
              ))}
            </div>

            {fatalError && (
              <div className="mt-4 flex items-start gap-2 bg-red-950/40 border border-red-800/50 rounded-lg p-3">
                <AlertCircle size={13} className="text-red-400 mt-0.5 shrink-0" />
                <p className="text-xs text-red-300">{fatalError}</p>
              </div>
            )}

            <div className="mt-6">
              <div className="flex justify-between text-xs text-zinc-600 mb-1.5">
                <span>Progress</span>
                <span>{progress}%</span>
              </div>
              <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            <LogsPanel logs={logText} />
          </div>
        </div>
      )}

      {/* ── Done ── */}
      {view === "done" && (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-6 py-8">
            <div className="flex items-start gap-4 mb-6">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                  totalErrors === 0 ? "bg-emerald-500/10" : "bg-yellow-500/10"
                }`}
              >
                {totalErrors === 0 ? (
                  <Check size={18} className="text-emerald-400" />
                ) : (
                  <AlertCircle size={18} className="text-yellow-400" />
                )}
              </div>
              <div>
                <p className="text-base font-semibold text-white">
                  {totalErrors === 0 ? `"${name}" is ready` : `"${name}" created with ${totalErrors} error${totalErrors !== 1 ? "s" : ""}`}
                </p>
                <p className="text-sm text-zinc-500 mt-0.5">
                  {totalErrors === 0
                    ? "All selected items were copied successfully."
                    : "Most items copied. Review errors below — you can fix them manually."}
                </p>
              </div>
            </div>

            <div className="space-y-0.5 mb-3">
              {phases.map((p) => (
                <PhaseRow
                  key={p.id}
                  phase={p}
                  expanded={p.id === "data" && dataExpanded}
                  onToggle={() => setDataExpanded((v) => !v)}
                  tableData={p.id === "data" ? tableData : undefined}
                />
              ))}
            </div>

            {summaryErrors.length > 0 && (
              <ErrorPanel errors={summaryErrors} />
            )}

            <LogsPanel logs={logText} />

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => { onClose(); router.refresh(); }}
                className="cursor-pointer px-4 py-2.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Close
              </button>
              {doneProjectId && (
                <button
                  onClick={() => { onClose(); router.push(`/dashboard/${doneProjectId}`); }}
                  className="cursor-pointer flex items-center gap-1.5 px-5 py-2.5 text-sm bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg transition-colors"
                >
                  Open new project <ChevronRight size={13} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Error panel ──────────────────────────────────────────────────────────────

function ErrorPanel({ errors }: { errors: string[] }) {
  const [open, setOpen] = useState(true);
  if (errors.length === 0) return null;
  return (
    <div className="rounded-lg border border-red-900/50 bg-red-950/30 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="cursor-pointer w-full flex items-center justify-between px-3 py-2.5 text-xs text-red-300 hover:bg-red-950/40 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <AlertCircle size={12} />
          {errors.length} error{errors.length !== 1 ? "s" : ""} occurred
        </span>
        {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-1.5 max-h-48 overflow-y-auto">
          {errors.map((e, i) => (
            <p key={i} className="text-xs text-red-300/80 break-all font-mono leading-relaxed">
              • {e}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
