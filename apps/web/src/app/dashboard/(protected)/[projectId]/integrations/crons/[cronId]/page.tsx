"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Clock,
  X,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Calendar,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type CronRun = {
  id: string;
  start_time: string;
  end_time: string | null;
  status: "running" | "succeeded" | "failed";
  return_message: string | null;
  response_body: string | null;
};

type CronJob = {
  id: string;
  name: string;
  schedule: string;
  command: string;
  active: boolean;
};

const HTTP_PREFIX = "__http__:";

type HttpConfig = {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
};

function parseHttpConfig(command: string): HttpConfig | null {
  if (!command.startsWith(HTTP_PREFIX)) return null;
  try {
    return JSON.parse(command.slice(HTTP_PREFIX.length)) as HttpConfig;
  } catch {
    return null;
  }
}

function duration(run: CronRun): string {
  if (!run.end_time) return "—";
  const ms = new Date(run.end_time).getTime() - new Date(run.start_time).getTime();
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function StatusBadge({ status }: { status: CronRun["status"] }) {
  if (status === "succeeded") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-900/40 text-emerald-400">
        <CheckCircle2 size={11} />
        Succeeded
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-red-900/40 text-red-400">
        <XCircle size={11} />
        Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-800 text-zinc-400">
      <Loader2 size={11} className="animate-spin" />
      Running
    </span>
  );
}

// ─── Run detail slide panel ───────────────────────────────────────────────────

function RunDetailPanel({
  run,
  job,
  onClose,
}: {
  run: CronRun;
  job: CronJob;
  onClose: () => void;
}) {
  const http = parseHttpConfig(job.command);

  return (
    <div className="fixed inset-0 z-40 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className="w-[520px] shrink-0 bg-zinc-950 border-l border-zinc-800 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div>
            <p className="text-xs text-zinc-500 mb-0.5">Run details</p>
            <p className="text-sm font-mono text-zinc-300">{run.id}</p>
          </div>
          <button
            onClick={onClose}
            className="cursor-pointer p-1.5 rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Summary row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-zinc-900 rounded-lg p-3">
              <p className="text-xs text-zinc-500 mb-1">Status</p>
              <StatusBadge status={run.status} />
            </div>
            <div className="bg-zinc-900 rounded-lg p-3">
              <p className="text-xs text-zinc-500 mb-1">Duration</p>
              <p className="text-sm text-white font-mono">{duration(run)}</p>
            </div>
            <div className="bg-zinc-900 rounded-lg p-3">
              <p className="text-xs text-zinc-500 mb-1">Started</p>
              <p className="text-xs text-zinc-300">
                {new Date(run.start_time).toLocaleString()}
              </p>
            </div>
          </div>

          {/* Request section */}
          <div>
            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
              Request
            </h3>
            {http ? (
              <div className="space-y-3">
                <div className="bg-zinc-900 rounded-lg p-3">
                  <p className="text-xs text-zinc-500 mb-1">Method &amp; URL</p>
                  <p className="text-sm font-mono text-white break-all">
                    <span className="text-brand-400 mr-2">{http.method}</span>
                    {http.url}
                  </p>
                </div>

                {Object.keys(http.headers).length > 0 && (
                  <div className="bg-zinc-900 rounded-lg p-3">
                    <p className="text-xs text-zinc-500 mb-2">Headers</p>
                    <div className="space-y-1 font-mono text-xs">
                      {Object.entries(http.headers).map(([k, v]) => (
                        <div key={k} className="flex gap-2">
                          <span className="text-zinc-400 shrink-0">{k}:</span>
                          <span className="text-zinc-300 break-all">{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {http.body && http.method !== "GET" && http.method !== "DELETE" && (
                  <div className="bg-zinc-900 rounded-lg p-3">
                    <p className="text-xs text-zinc-500 mb-2">Body</p>
                    <pre className="text-xs text-zinc-300 font-mono whitespace-pre-wrap break-all">
                      {(() => {
                        try {
                          return JSON.stringify(JSON.parse(http.body), null, 2);
                        } catch {
                          return http.body;
                        }
                      })()}
                    </pre>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-zinc-900 rounded-lg p-3">
                <p className="text-xs text-zinc-500 mb-1">SQL Command</p>
                <pre className="text-xs text-zinc-300 font-mono whitespace-pre-wrap break-all">
                  {job.command}
                </pre>
              </div>
            )}
          </div>

          {/* Response section */}
          <div>
            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
              Response
            </h3>
            <div className="space-y-3">
              {run.return_message && (
                <div className="bg-zinc-900 rounded-lg p-3">
                  <p className="text-xs text-zinc-500 mb-1">
                    {http ? "Status" : run.status === "failed" ? "Error" : "Result"}
                  </p>
                  <p
                    className={`text-sm font-mono ${
                      run.status === "failed" ? "text-red-400" : "text-zinc-300"
                    }`}
                  >
                    {run.return_message}
                  </p>
                </div>
              )}

              {run.response_body && (
                <div className="bg-zinc-900 rounded-lg p-3">
                  <p className="text-xs text-zinc-500 mb-2">Response Body</p>
                  <pre className="text-xs text-zinc-300 font-mono whitespace-pre-wrap break-all max-h-64 overflow-y-auto">
                    {(() => {
                      try {
                        return JSON.stringify(JSON.parse(run.response_body), null, 2);
                      } catch {
                        return run.response_body;
                      }
                    })()}
                  </pre>
                </div>
              )}

              {!run.return_message && !run.response_body && (
                <div className="bg-zinc-900 rounded-lg p-3">
                  <p className="text-xs text-zinc-500">No response captured.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Confirm Delete Modal ─────────────────────────────────────────────────────

function ConfirmDeleteModal({
  message,
  onConfirm,
  onCancel,
  loading,
}: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl w-full max-w-sm mx-4 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <h2 className="text-base font-semibold text-white">Confirm deletion</h2>
          <button
            onClick={onCancel}
            className="cursor-pointer p-1.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
        <div className="px-6 py-4">
          <p className="text-sm text-zinc-400">{message}</p>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-zinc-800">
          <button
            onClick={onCancel}
            className="cursor-pointer px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors"
          >
            <Trash2 size={13} />
            {loading ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const LIMIT = 50;

export default function CronDashboardPage({
  params,
}: {
  params: Promise<{ projectId: string; cronId: string }>;
}) {
  const { projectId, cronId } = use(params);
  const router = useRouter();

  const [job, setJob] = useState<CronJob | null>(null);
  const [runs, setRuns] = useState<CronRun[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selectedRun, setSelectedRun] = useState<CronRun | null>(null);

  // Date filter
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  // Confirm delete modal
  const [confirmModal, setConfirmModal] = useState<{
    message: string;
    onConfirm: () => Promise<void>;
  } | null>(null);

  const prefix = `pb_${projectId.replace(/-/g, "")}_`;

  const fetchRuns = useCallback(
    async (p: number, from?: string, to?: string) => {
      setLoading(true);
      setSelectedIds(new Set());
      try {
        const qs = new URLSearchParams({ page: String(p), limit: String(LIMIT) });
        if (from) qs.set("from", from);
        if (to) qs.set("to", to);
        const res = await fetch(
          `/api/dashboard/${projectId}/cron/${cronId}/runs?${qs}`
        );
        if (!res.ok) { router.push(`/dashboard/${projectId}/integrations`); return; }
        const data = await res.json();
        setJob(data.job);
        setRuns(data.runs);
        setTotal(data.total);
        setPage(data.page);
      } finally {
        setLoading(false);
      }
    },
    [projectId, cronId, router]
  );

  useEffect(() => { fetchRuns(1); }, [fetchRuns]);

  const applyFilter = () => {
    fetchRuns(1, fromDate || undefined, toDate || undefined);
  };

  const clearFilter = () => {
    setFromDate("");
    setToDate("");
    fetchRuns(1);
  };

  const allOnPageSelected = runs.length > 0 && runs.every((r) => selectedIds.has(r.id));
  const someSelected = selectedIds.size > 0;

  const toggleSelectAll = () => {
    if (allOnPageSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(runs.map((r) => r.id)));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const deleteSelected = () => {
    const count = selectedIds.size;
    setConfirmModal({
      message: `Delete ${count} run${count !== 1 ? "s" : ""}? This cannot be undone.`,
      onConfirm: async () => {
        setDeleting(true);
        try {
          await fetch(`/api/dashboard/${projectId}/cron/${cronId}/runs`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: Array.from(selectedIds) }),
          });
          fetchRuns(page, fromDate || undefined, toDate || undefined);
        } finally {
          setDeleting(false);
          setConfirmModal(null);
        }
      },
    });
  };

  const deleteAllFiltered = () => {
    const scope = fromDate || toDate
      ? "all runs matching the current date filter"
      : "all runs for this cron job";
    setConfirmModal({
      message: `This will permanently delete ${scope}. This cannot be undone.`,
      onConfirm: async () => {
        setDeleting(true);
        try {
          await fetch(`/api/dashboard/${projectId}/cron/${cronId}/runs`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              deleteAll: true,
              from: fromDate || undefined,
              to: toDate || undefined,
            }),
          });
          fetchRuns(1, fromDate || undefined, toDate || undefined);
        } finally {
          setDeleting(false);
          setConfirmModal(null);
        }
      },
    });
  };

  const displayName = job
    ? (job.name.startsWith(prefix) ? job.name.slice(prefix.length) : job.name)
    : "";

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  const hasFilter = fromDate || toDate;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 h-14 border-b border-zinc-800 shrink-0">
        <button
          onClick={() => router.push(`/dashboard/${projectId}/integrations`)}
          className="cursor-pointer p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <Clock size={14} className="text-zinc-500 shrink-0" />
          <span className="text-sm font-semibold text-white truncate">{displayName}</span>
          {job && (
            <span className="text-xs text-zinc-500 font-mono">{job.schedule}</span>
          )}
        </div>
        {job && (
          <span
            className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium ${
              job.active
                ? "bg-emerald-900/40 text-emerald-400"
                : "bg-zinc-800 text-zinc-500"
            }`}
          >
            {job.active ? "Active" : "Paused"}
          </span>
        )}
        <button
          onClick={() => fetchRuns(page, fromDate || undefined, toDate || undefined)}
          className="cursor-pointer p-1.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
        >
          <RefreshCw size={13} />
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-zinc-800 shrink-0 flex-wrap">
        <Calendar size={13} className="text-zinc-500 shrink-0" />
        <div className="flex items-center gap-2">
          <label className="text-xs text-zinc-500">From</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-300 focus:outline-none focus:border-zinc-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-zinc-500">To</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-300 focus:outline-none focus:border-zinc-500"
          />
        </div>
        <button
          onClick={applyFilter}
          className="cursor-pointer px-3 py-1 rounded text-xs bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
        >
          Apply
        </button>
        {hasFilter && (
          <button
            onClick={clearFilter}
            className="cursor-pointer px-2 py-1 rounded text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Clear
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          {someSelected && (
            <button
              onClick={deleteSelected}
              disabled={deleting}
              className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs bg-red-900/40 text-red-400 hover:bg-red-900/60 transition-colors disabled:opacity-50"
            >
              <Trash2 size={11} />
              Delete {selectedIds.size} selected
            </button>
          )}
          <button
            onClick={deleteAllFiltered}
            disabled={deleting}
            className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs text-zinc-500 hover:text-red-400 hover:bg-red-900/20 transition-colors disabled:opacity-50"
          >
            <Trash2 size={11} />
            {hasFilter ? "Delete filtered" : "Delete all"}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-zinc-600 text-sm">
            Loading…
          </div>
        ) : runs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Clock size={32} className="text-zinc-700 mb-3" />
            <p className="text-zinc-500 text-sm">No runs{hasFilter ? " matching filter" : " yet"}.</p>
            {!hasFilter && (
              <p className="text-zinc-600 text-xs mt-1">
                Runs will appear here once the job fires.
              </p>
            )}
          </div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500 text-xs uppercase tracking-wider">
                  <th className="px-6 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={allOnPageSelected}
                      onChange={toggleSelectAll}
                      className="cursor-pointer accent-brand-500"
                    />
                  </th>
                  <th className="text-left px-3 py-3 font-medium">Started</th>
                  <th className="text-left px-4 py-3 font-medium">Duration</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">Message</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {runs.map((run) => (
                  <tr
                    key={run.id}
                    className={`hover:bg-zinc-900/40 transition-colors ${
                      selectedIds.has(run.id) ? "bg-zinc-900/60" : ""
                    }`}
                  >
                    <td
                      className="px-6 py-3"
                      onClick={(e) => { e.stopPropagation(); toggleSelect(run.id); }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(run.id)}
                        onChange={() => toggleSelect(run.id)}
                        className="cursor-pointer accent-brand-500"
                      />
                    </td>
                    <td
                      className="px-3 py-3 text-zinc-300 font-mono text-xs cursor-pointer"
                      onClick={() => setSelectedRun(run)}
                    >
                      {new Date(run.start_time).toLocaleString()}
                    </td>
                    <td
                      className="px-4 py-3 text-zinc-500 font-mono text-xs cursor-pointer"
                      onClick={() => setSelectedRun(run)}
                    >
                      {duration(run)}
                    </td>
                    <td
                      className="px-4 py-3 cursor-pointer"
                      onClick={() => setSelectedRun(run)}
                    >
                      <StatusBadge status={run.status} />
                    </td>
                    <td
                      className="px-4 py-3 text-zinc-500 text-xs max-w-xs truncate cursor-pointer"
                      onClick={() => setSelectedRun(run)}
                    >
                      {run.return_message ?? <span className="text-zinc-700">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-3 border-t border-zinc-800">
                <span className="text-xs text-zinc-500">
                  {total} run{total !== 1 ? "s" : ""} total
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setPage(page - 1); fetchRuns(page - 1, fromDate || undefined, toDate || undefined); }}
                    disabled={page <= 1}
                    className="cursor-pointer disabled:opacity-30 p-1.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span className="text-xs text-zinc-400">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    onClick={() => { setPage(page + 1); fetchRuns(page + 1, fromDate || undefined, toDate || undefined); }}
                    disabled={page >= totalPages}
                    className="cursor-pointer disabled:opacity-30 p-1.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Run detail slide panel */}
      {selectedRun && job && (
        <RunDetailPanel
          run={selectedRun}
          job={job}
          onClose={() => setSelectedRun(null)}
        />
      )}

      {/* Confirm delete modal */}
      {confirmModal && (
        <ConfirmDeleteModal
          message={confirmModal.message}
          onConfirm={confirmModal.onConfirm}
          onCancel={() => setConfirmModal(null)}
          loading={deleting}
        />
      )}
    </div>
  );
}
