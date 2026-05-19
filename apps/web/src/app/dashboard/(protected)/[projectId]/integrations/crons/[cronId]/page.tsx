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

  const prefix = `pb_${projectId.replace(/-/g, "")}_`;

  const fetchRuns = useCallback(
    async (p: number) => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/dashboard/${projectId}/cron/${cronId}/runs?page=${p}&limit=${LIMIT}`
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

  const displayName = job
    ? (job.name.startsWith(prefix) ? job.name.slice(prefix.length) : job.name)
    : "";

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

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
          onClick={() => fetchRuns(page)}
          className="cursor-pointer p-1.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
        >
          <RefreshCw size={13} />
        </button>
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
            <p className="text-zinc-500 text-sm">No runs yet.</p>
            <p className="text-zinc-600 text-xs mt-1">
              Runs will appear here once the job fires.
            </p>
          </div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500 text-xs uppercase tracking-wider">
                  <th className="text-left px-6 py-3 font-medium">Started</th>
                  <th className="text-left px-4 py-3 font-medium">Duration</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">Message</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {runs.map((run) => (
                  <tr
                    key={run.id}
                    onClick={() => setSelectedRun(run)}
                    className="hover:bg-zinc-900/40 transition-colors cursor-pointer"
                  >
                    <td className="px-6 py-3 text-zinc-300 font-mono text-xs">
                      {new Date(run.start_time).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-zinc-500 font-mono text-xs">
                      {duration(run)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={run.status} />
                    </td>
                    <td className="px-4 py-3 text-zinc-500 text-xs max-w-xs truncate">
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
                    onClick={() => { setPage(page - 1); fetchRuns(page - 1); }}
                    disabled={page <= 1}
                    className="cursor-pointer disabled:opacity-30 p-1.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span className="text-xs text-zinc-400">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    onClick={() => { setPage(page + 1); fetchRuns(page + 1); }}
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
    </div>
  );
}
