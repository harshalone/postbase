"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  Clock,
  Layers,
  Plus,
  Trash2,
  RefreshCw,
  Search,
  MoreVertical,
  X,
  Edit2,
  Globe,
  Code2,
  Send,
  Inbox,
  PackagePlus,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Minus,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type CronRun = {
  start_time: string;
  end_time: string;
  status: string;
  return_message: string;
};

type CronJob = {
  jobid: number;
  jobname: string;
  schedule: string;
  command: string;
  active: boolean;
  runs: CronRun[];
};

type QueueMetrics = {
  queue_name?: string;
  queue_length?: number;
  newest_msg_age_sec?: number;
  oldest_msg_age_sec?: number;
  total_messages?: number;
};

type Queue = {
  name: string;
  fullName: string;
  metrics: QueueMetrics;
};

type QueueMessage = {
  msg_id: number;
  read_ct: number;
  enqueued_at: string;
  vt: string;
  message: Record<string, unknown>;
};

type Tab = "cron" | "queues";
type JobType = "sql" | "http";
type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type HttpConfig = {
  method: HttpMethod;
  url: string;
  headers: { key: string; value: string }[];
  body: string;
};

const HTTP_PREFIX = "__http__:";

function serializeHttpConfig(cfg: HttpConfig): string {
  const headers: Record<string, string> = {};
  for (const h of cfg.headers) {
    if (h.key.trim()) headers[h.key.trim()] = h.value;
  }
  return HTTP_PREFIX + JSON.stringify({
    method: cfg.method,
    url: cfg.url,
    headers,
    body: cfg.body,
  });
}

function parseHttpConfig(command: string): HttpConfig | null {
  if (!command.startsWith(HTTP_PREFIX)) return null;
  try {
    const raw = JSON.parse(command.slice(HTTP_PREFIX.length)) as {
      method: HttpMethod;
      url: string;
      headers: Record<string, string>;
      body: string;
    };
    return {
      method: raw.method ?? "POST",
      url: raw.url ?? "",
      headers: Object.entries(raw.headers ?? {}).map(([key, value]) => ({ key, value })),
      body: raw.body ?? "",
    };
  } catch {
    return null;
  }
}

function describeCommand(command: string): string {
  const http = parseHttpConfig(command);
  if (http) return `${http.method} ${http.url}`;
  return command;
}

// ─── Cron schedule presets ────────────────────────────────────────────────────

const CRON_PRESETS = [
  { label: "Every 30 seconds", value: "*/30 * * * * *", seconds: true },
  { label: "Every minute",     value: "* * * * *"                      },
  { label: "Every 5 minutes",  value: "*/5 * * * *"                    },
  { label: "Every first of the month, at 00:00", value: "0 0 1 * *"   },
  { label: "Every night at midnight", value: "0 0 * * *"              },
  { label: "Every Monday at 2 AM",    value: "0 2 * * 1"              },
];

// Human-readable description of a cron expression (very simple)
function describeCron(expr: string): string {
  const preset = CRON_PRESETS.find((p) => p.value === expr);
  if (preset) return preset.label;
  const parts = expr.trim().split(/\s+/);
  if (parts.length === 5) {
    const [min, hour, dom, , dow] = parts;
    if (min === "*" && hour === "*" && dom === "*" && dow === "*") return "Every minute";
    if (min.startsWith("*/") && hour === "*") return `Every ${min.slice(2)} minutes`;
    if (hour.startsWith("*/") && min === "0") return `Every ${hour.slice(2)} hours`;
  }
  return expr;
}

// Format schedule for display in table (e.g. "6 seconds", "5 minutes")
function formatSchedule(expr: string): string {
  const desc = describeCron(expr);
  return desc.replace(/^Every /, "").replace(/^every /, "");
}

// Visual breakdown of a 5-part cron expression
function CronVisual({ expr }: { expr: string }) {
  const parts = expr.trim().split(/\s+/);
  const labels = ["minute", "hour", "day\n(month)", "month", "day\n(week)"];
  if (parts.length !== 5) {
    return <p className="text-sm text-zinc-400">{describeCron(expr)}</p>;
  }
  return (
    <div className="space-y-2">
      <div className="flex gap-3 font-mono text-2xl text-white font-light tracking-wide">
        {parts.map((p, i) => (
          <span key={i} className="flex flex-col items-center gap-1">
            <span>{p}</span>
            <span className="text-[10px] text-zinc-500 font-sans whitespace-pre-wrap text-center leading-tight">
              {labels[i]}
            </span>
          </span>
        ))}
      </div>
      <p className="text-sm text-zinc-400">{describeCron(expr)}</p>
    </div>
  );
}

// ─── Not installed banner ─────────────────────────────────────────────────────

function NotInstalled({
  name,
  description,
  onInstall,
  installing,
}: {
  name: string;
  description: string;
  onInstall: () => void;
  installing: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 text-center px-8">
      <div className="w-14 h-14 rounded-2xl bg-zinc-800 flex items-center justify-center">
        <AlertTriangle size={24} className="text-zinc-500" />
      </div>
      <div>
        <h3 className="text-lg font-semibold text-white mb-1">{name} not installed</h3>
        <p className="text-sm text-zinc-500 max-w-sm">{description}</p>
      </div>
      <button
        onClick={onInstall}
        disabled={installing}
        className="cursor-pointer disabled:opacity-50 flex items-center gap-2 px-5 py-2.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium transition-colors"
      >
        <PackagePlus size={16} />
        {installing ? "Installing…" : `Install ${name}`}
      </button>
    </div>
  );
}

// ─── Cron Job Dialog (Create / Edit) ─────────────────────────────────────────

const HTTP_METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

function CronJobDialog({
  initial,
  onClose,
  onSave,
  saving,
}: {
  initial?: { name: string; schedule: string; command: string; type: JobType };
  onClose: () => void;
  onSave: (v: { name: string; schedule: string; command: string; type: JobType }) => void;
  saving: boolean;
}) {
  const isEdit = !!initial;
  const [name, setName] = useState(initial?.name ?? "");
  const [schedule, setSchedule] = useState(initial?.schedule ?? "*/5 * * * *");
  const [type, setType] = useState<JobType>(initial?.type ?? "sql");
  const [showSyntax, setShowSyntax] = useState(false);

  // SQL state
  const [sqlCommand, setSqlCommand] = useState(
    initial?.type === "sql" ? (initial?.command ?? "") : ""
  );

  // HTTP state — parse from command if editing an http job
  const initialHttp = initial?.type === "http" ? parseHttpConfig(initial.command) : null;
  const [httpMethod, setHttpMethod] = useState<HttpMethod>(initialHttp?.method ?? "POST");
  const [httpUrl, setHttpUrl] = useState(initialHttp?.url ?? "");
  const [httpHeaders, setHttpHeaders] = useState<{ key: string; value: string }[]>(
    initialHttp?.headers ?? [{ key: "", value: "" }]
  );
  const [httpBody, setHttpBody] = useState(initialHttp?.body ?? "");

  function addHeader() {
    setHttpHeaders((h) => [...h, { key: "", value: "" }]);
  }

  function removeHeader(i: number) {
    setHttpHeaders((h) => h.filter((_, idx) => idx !== i));
  }

  function updateHeader(i: number, field: "key" | "value", val: string) {
    setHttpHeaders((h) => h.map((row, idx) => idx === i ? { ...row, [field]: val } : row));
  }

  function buildCommand(): string {
    if (type === "sql") return sqlCommand;
    return serializeHttpConfig({ method: httpMethod, url: httpUrl, headers: httpHeaders, body: httpBody });
  }

  const isValid = name.trim() && (
    type === "sql" ? sqlCommand.trim() : httpUrl.trim()
  );

  const showBody = type === "http" && httpMethod !== "GET" && httpMethod !== "DELETE";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl w-full max-w-2xl mx-4 shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
          <h2 className="text-base font-semibold text-white">
            {isEdit ? "Edit cron job" : "Create a new cron job"}
          </h2>
          <button
            onClick={onClose}
            className="cursor-pointer p-1.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          <div className="px-6 py-5 space-y-6">

            {/* Name */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm text-zinc-300 font-medium">Name</label>
                {!isEdit && (
                  <span className="text-xs text-zinc-500">Cron jobs cannot be renamed once created</span>
                )}
              </div>
              <input
                value={name}
                onChange={(e) => !isEdit && setName(e.target.value)}
                disabled={isEdit}
                placeholder="e.g. cleanup_old_records"
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-brand-500 disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>

            {/* Schedule */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm text-zinc-300 font-medium">Schedule</label>
                <span className="text-xs text-zinc-500">Enter a cron expression</span>
              </div>
              <input
                value={schedule}
                onChange={(e) => setSchedule(e.target.value)}
                placeholder="*/5 * * * *"
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-brand-500 mb-3"
              />

              {/* Preset chips */}
              <div className="flex flex-wrap gap-2 mb-4">
                {CRON_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => setSchedule(p.value)}
                    className={`cursor-pointer px-3 py-1.5 rounded-full text-xs border transition-colors ${
                      schedule === p.value
                        ? "bg-brand-500 border-brand-500 text-white"
                        : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Syntax chart toggle */}
              <button
                onClick={() => setShowSyntax((v) => !v)}
                className="cursor-pointer flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors mb-2"
              >
                {showSyntax ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                View syntax chart
              </button>

              {showSyntax && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-5 py-4">
                  <p className="text-xs text-zinc-500 mb-3 font-medium uppercase tracking-wider">Schedule (GMT)</p>
                  <CronVisual expr={schedule} />
                </div>
              )}

              {!showSyntax && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3">
                  <p className="text-sm text-zinc-400">{describeCron(schedule)}</p>
                </div>
              )}
            </div>

            {/* Type */}
            <div>
              <label className="text-sm text-zinc-300 font-medium block mb-2">Type</label>
              <div className="space-y-2">
                <button
                  onClick={() => setType("sql")}
                  className={`cursor-pointer w-full flex items-center gap-4 px-4 py-3 rounded-lg border transition-colors text-left ${
                    type === "sql"
                      ? "border-brand-500 bg-brand-500/10"
                      : "border-zinc-800 hover:border-zinc-600"
                  }`}
                >
                  <div className={`w-8 h-8 rounded-md flex items-center justify-center ${type === "sql" ? "bg-brand-500/20" : "bg-zinc-800"}`}>
                    <Code2 size={15} className={type === "sql" ? "text-brand-400" : "text-zinc-500"} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">SQL Snippet</p>
                    <p className="text-xs text-zinc-500">Write a SQL snippet to run.</p>
                  </div>
                </button>
                <button
                  onClick={() => setType("http")}
                  className={`cursor-pointer w-full flex items-center gap-4 px-4 py-3 rounded-lg border transition-colors text-left ${
                    type === "http"
                      ? "border-brand-500 bg-brand-500/10"
                      : "border-zinc-800 hover:border-zinc-600"
                  }`}
                >
                  <div className={`w-8 h-8 rounded-md flex items-center justify-center ${type === "http" ? "bg-brand-500/20" : "bg-zinc-800"}`}>
                    <Globe size={15} className={type === "http" ? "text-brand-400" : "text-zinc-500"} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">HTTP Request</p>
                    <p className="text-xs text-zinc-500">Send an HTTP request to any URL.</p>
                  </div>
                </button>
              </div>
            </div>

            {/* ── SQL fields ── */}
            {type === "sql" && (
              <div>
                <label className="text-sm text-zinc-300 font-medium block mb-1.5">SQL Snippet</label>
                <textarea
                  value={sqlCommand}
                  onChange={(e) => setSqlCommand(e.target.value)}
                  placeholder="select 1;"
                  rows={6}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-brand-500 resize-none"
                />
                <p className="text-xs text-zinc-600 mt-1">
                  Unqualified table names resolve to your project schema automatically.
                </p>
              </div>
            )}

            {/* ── HTTP fields ── */}
            {type === "http" && (
              <div className="space-y-4">
                {/* Method + URL */}
                <div>
                  <label className="text-sm text-zinc-300 font-medium block mb-1.5">Request</label>
                  <div className="flex gap-2">
                    <select
                      value={httpMethod}
                      onChange={(e) => setHttpMethod(e.target.value as HttpMethod)}
                      className="cursor-pointer bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500 shrink-0"
                    >
                      {HTTP_METHODS.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                    <input
                      value={httpUrl}
                      onChange={(e) => setHttpUrl(e.target.value)}
                      placeholder="https://example.com/webhook"
                      className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-brand-500"
                    />
                  </div>
                </div>

                {/* Headers */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-sm text-zinc-300 font-medium">Headers</label>
                    <button
                      onClick={addHeader}
                      className="cursor-pointer flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 transition-colors"
                    >
                      <Plus size={11} />
                      Add header
                    </button>
                  </div>
                  <div className="space-y-2">
                    {httpHeaders.map((h, i) => (
                      <div key={i} className="flex gap-2 items-center">
                        <input
                          value={h.key}
                          onChange={(e) => updateHeader(i, "key", e.target.value)}
                          placeholder="Header name"
                          className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-brand-500"
                        />
                        <input
                          value={h.value}
                          onChange={(e) => updateHeader(i, "value", e.target.value)}
                          placeholder="Value"
                          className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-brand-500"
                        />
                        <button
                          onClick={() => removeHeader(i)}
                          className="cursor-pointer p-1.5 rounded text-zinc-600 hover:text-red-400 hover:bg-zinc-800 transition-colors shrink-0"
                        >
                          <Minus size={13} />
                        </button>
                      </div>
                    ))}
                    {httpHeaders.length === 0 && (
                      <p className="text-xs text-zinc-600">No headers. <button onClick={addHeader} className="cursor-pointer text-brand-400 hover:text-brand-300">Add one</button></p>
                    )}
                  </div>
                </div>

                {/* Body */}
                {showBody && (
                  <div>
                    <label className="text-sm text-zinc-300 font-medium block mb-1.5">Body</label>
                    <textarea
                      value={httpBody}
                      onChange={(e) => setHttpBody(e.target.value)}
                      placeholder='{"key": "value"}'
                      rows={5}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-brand-500 resize-none"
                    />
                    <p className="text-xs text-zinc-600 mt-1">
                      Raw body content. Add a Content-Type header if needed.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-zinc-800 shrink-0">
          <button
            onClick={onClose}
            className="cursor-pointer px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave({ name, schedule, command: buildCommand(), type })}
            disabled={!isValid || saving}
            className="cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium transition-colors"
          >
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create job"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function IntegrationsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("cron");

  // ── Cron state ──────────────────────────────────────────────────────────────
  const [cronInstalled, setCronInstalled] = useState<boolean | null>(null);
  const [cronJobs, setCronJobs] = useState<CronJob[]>([]);
  const [cronLoading, setCronLoading] = useState(true);
  const [installingCron, setInstallingCron] = useState(false);
  const [search, setSearch] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [editingJob, setEditingJob] = useState<CronJob | null>(null);
  const [savingJob, setSavingJob] = useState(false);
  const [menuOpen, setMenuOpen] = useState<number | null>(null);

  // ── Queue state ─────────────────────────────────────────────────────────────
  const [queueInstalled, setQueueInstalled] = useState<boolean | null>(null);
  const [queues, setQueues] = useState<Queue[]>([]);
  const [queuesLoading, setQueuesLoading] = useState(false);
  const [installingQueue, setInstallingQueue] = useState(false);
  const [showNewQueue, setShowNewQueue] = useState(false);
  const [newQueueName, setNewQueueName] = useState("");
  const [creatingQueue, setCreatingQueue] = useState(false);
  const [selectedQueue, setSelectedQueue] = useState<Queue | null>(null);
  const [queueMessages, setQueueMessages] = useState<QueueMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sendForm, setSendForm] = useState("");
  const [showSend, setShowSend] = useState(false);

  // ── Fetchers ─────────────────────────────────────────────────────────────────

  const fetchCron = useCallback(async () => {
    setCronLoading(true);
    try {
      const res = await fetch(`/api/dashboard/${projectId}/cron`);
      const data = await res.json();
      setCronInstalled(data.installed !== false);
      setCronJobs(data.jobs ?? []);
    } finally {
      setCronLoading(false);
    }
  }, [projectId]);

  const fetchQueues = useCallback(async () => {
    setQueuesLoading(true);
    try {
      const res = await fetch(`/api/dashboard/${projectId}/queues`);
      const data = await res.json();
      setQueueInstalled(data.installed !== false);
      setQueues(data.queues ?? []);
    } finally {
      setQueuesLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchCron(); }, [fetchCron]);
  useEffect(() => { if (tab === "queues" && queueInstalled === null) fetchQueues(); }, [tab, fetchQueues, queueInstalled]);

  // ── Cron actions ──────────────────────────────────────────────────────────────

  async function installCron() {
    setInstallingCron(true);
    try {
      const res = await fetch(`/api/dashboard/${projectId}/cron`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "install" }),
      });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
        return;
      }
      await fetchCron();
    } finally {
      setInstallingCron(false);
    }
  }

  function detectType(command: string): JobType {
    return command.startsWith(HTTP_PREFIX) ? "http" : "sql";
  }

  async function saveJob(v: { name: string; schedule: string; command: string; type: JobType }) {
    setSavingJob(true);
    try {
      const cmd = v.command;

      if (editingJob) {
        // Edit: delete old + create new with same name
        const prefix = `pb_${projectId.replace(/-/g, "")}_`;
        const displayName = editingJob.jobname.startsWith(prefix)
          ? editingJob.jobname.slice(prefix.length)
          : editingJob.jobname;
        await fetch(`/api/dashboard/${projectId}/cron`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "delete", jobName: displayName }),
        });
        const res = await fetch(`/api/dashboard/${projectId}/cron`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "create", jobName: v.name, schedule: v.schedule, command: cmd }),
        });
        const data = await res.json();
        if (data.error) { toast.error(data.error); return; }
      } else {
        const res = await fetch(`/api/dashboard/${projectId}/cron`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "create", jobName: v.name, schedule: v.schedule, command: cmd }),
        });
        const data = await res.json();
        if (data.error) { toast.error(data.error); return; }
      }
      setShowDialog(false);
      setEditingJob(null);
      await fetchCron();
    } finally {
      setSavingJob(false);
    }
  }

  async function toggleJob(job: CronJob) {
    await fetch(`/api/dashboard/${projectId}/cron`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggle", jobId: job.jobid, active: !job.active }),
    });
    fetchCron();
  }

  async function deleteJob(job: CronJob) {
    const prefix = `pb_${projectId.replace(/-/g, "")}_`;
    const displayName = job.jobname.startsWith(prefix)
      ? job.jobname.slice(prefix.length)
      : job.jobname;
    if (!confirm(`Delete job "${displayName}"?`)) return;
    await fetch(`/api/dashboard/${projectId}/cron`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", jobName: displayName }),
    });
    fetchCron();
  }

  // ── Queue actions ─────────────────────────────────────────────────────────────

  async function installQueue() {
    setInstallingQueue(true);
    try {
      await fetch(`/api/dashboard/${projectId}/queues`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "install" }),
      });
      await fetchQueues();
    } finally {
      setInstallingQueue(false);
    }
  }

  async function createQueue() {
    if (!newQueueName.trim()) return;
    setCreatingQueue(true);
    try {
      const res = await fetch(`/api/dashboard/${projectId}/queues`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", queueName: newQueueName }),
      });
      const data = await res.json();
      if (data.error) { toast.error(data.error); return; }
      setShowNewQueue(false);
      setNewQueueName("");
      fetchQueues();
    } finally {
      setCreatingQueue(false);
    }
  }

  async function dropQueue(q: Queue) {
    if (!confirm(`Drop queue "${q.name}"? All messages will be lost.`)) return;
    await fetch(`/api/dashboard/${projectId}/queues`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "drop", queueName: q.name }),
    });
    if (selectedQueue?.name === q.name) setSelectedQueue(null);
    fetchQueues();
  }

  async function readMessages(q: Queue) {
    setSelectedQueue(q);
    setLoadingMessages(true);
    try {
      const res = await fetch(`/api/dashboard/${projectId}/queues`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "read", queueName: q.name, vt: 0, limit: 20 }),
      });
      const data = await res.json();
      setQueueMessages(data.messages ?? []);
    } finally {
      setLoadingMessages(false);
    }
  }

  async function sendMessage(q: Queue) {
    if (!sendForm.trim()) return;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(sendForm);
    } catch {
      toast.error("Message must be valid JSON"); return;
      return;
    }
    const res = await fetch(`/api/dashboard/${projectId}/queues`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "send", queueName: q.name, message: parsed }),
    });
    const data = await res.json();
    if (data.error) { toast.error(data.error); return; }
    setSendForm("");
    setShowSend(false);
    readMessages(q);
    fetchQueues();
  }

  async function deleteMessage(msgId: number) {
    if (!selectedQueue) return;
    await fetch(`/api/dashboard/${projectId}/queues`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete_msg", queueName: selectedQueue.name, msgId }),
    });
    readMessages(selectedQueue);
  }

  // ── Derived ──────────────────────────────────────────────────────────────────

  const prefix = `pb_${projectId.replace(/-/g, "")}_`;

  const filteredJobs = cronJobs.filter((job) => {
    const displayName = job.jobname.startsWith(prefix)
      ? job.jobname.slice(prefix.length)
      : job.jobname;
    return displayName.toLowerCase().includes(search.toLowerCase());
  });

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full" onClick={() => setMenuOpen(null)}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 h-14 border-b border-zinc-800 shrink-0">
        <h1 className="text-sm font-semibold text-white">Integrations</h1>
        <div className="flex gap-1">
          {(
            [
              { id: "cron",   label: "Cron Jobs",     icon: Clock  },
              { id: "queues", label: "Message Queues", icon: Layers },
            ] as const
          ).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`cursor-pointer flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === id
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900"
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto">

        {/* ── Cron Tab ── */}
        {tab === "cron" && (
          <div className="flex flex-col h-full">
            {cronLoading ? (
              <p className="text-zinc-600 text-sm pt-8 text-center">Loading…</p>
            ) : !cronInstalled ? (
              <NotInstalled
                name="pg_cron"
                description="pg_cron is a cron-based job scheduler for PostgreSQL. It lets you schedule SQL commands to run at regular intervals, directly in your database."
                onInstall={installCron}
                installing={installingCron}
              />
            ) : (
              <>
                {/* Cron toolbar */}
                <div className="flex items-center gap-3 px-6 py-3 border-b border-zinc-800">
                  <div className="relative flex-1 max-w-xs">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search for a job"
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
                    />
                  </div>
                  <div className="flex-1" />
                  <button
                    onClick={fetchCron}
                    className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 text-sm transition-colors"
                  >
                    <RefreshCw size={13} />
                    Refresh
                  </button>
                  <button
                    onClick={() => { setEditingJob(null); setShowDialog(true); }}
                    className="cursor-pointer flex items-center gap-2 px-3 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium transition-colors"
                  >
                    <Plus size={14} />
                    Create job
                  </button>
                </div>

                {/* Table */}
                {filteredJobs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <Clock size={32} className="text-zinc-700 mb-3" />
                    <p className="text-zinc-500 text-sm">
                      {search ? "No jobs match your search." : "No cron jobs yet."}
                    </p>
                    {!search && (
                      <button
                        onClick={() => { setEditingJob(null); setShowDialog(true); }}
                        className="cursor-pointer mt-3 text-brand-400 hover:text-brand-300 text-sm"
                      >
                        Create your first job
                      </button>
                    )}
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-800 text-zinc-500 text-xs uppercase tracking-wider">
                        <th className="text-left px-6 py-3 font-medium">Name</th>
                        <th className="text-left px-4 py-3 font-medium">Schedule</th>
                        <th className="text-left px-4 py-3 font-medium">Last run</th>
                        <th className="text-left px-4 py-3 font-medium">Next run</th>
                        <th className="text-left px-4 py-3 font-medium">Command</th>
                        <th className="text-left px-4 py-3 font-medium">Active</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60">
                      {filteredJobs.map((job) => {
                        const displayName = job.jobname.startsWith(prefix)
                          ? job.jobname.slice(prefix.length)
                          : job.jobname;
                        const lastRun = job.runs[0];
                        return (
                          <tr key={job.jobid} className="hover:bg-zinc-900/40 transition-colors group">
                            <td className="px-6 py-3 text-white font-medium">{displayName}</td>
                            <td className="px-4 py-3 text-zinc-400">{formatSchedule(job.schedule)}</td>
                            <td className="px-4 py-3 text-zinc-500">
                              {lastRun
                                ? new Date(lastRun.start_time).toLocaleString()
                                : <span className="text-zinc-700">—</span>}
                            </td>
                            <td className="px-4 py-3 text-zinc-500">
                              <span className="text-zinc-700">—</span>
                            </td>
                            <td className="px-4 py-3 max-w-xs">
                              <code className="text-xs text-zinc-400 truncate block">{describeCommand(job.command)}</code>
                            </td>
                            <td className="px-4 py-3">
                              {/* Toggle switch */}
                              <button
                                onClick={() => toggleJob(job)}
                                className={`cursor-pointer relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                                  job.active ? "bg-brand-500" : "bg-zinc-700"
                                }`}
                              >
                                <span
                                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                                    job.active ? "translate-x-[18px]" : "translate-x-[3px]"
                                  }`}
                                />
                              </button>
                            </td>
                            <td className="px-4 py-3 relative">
                              <button
                                onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === job.jobid ? null : job.jobid); }}
                                className="cursor-pointer p-1 rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors opacity-0 group-hover:opacity-100"
                              >
                                <MoreVertical size={15} />
                              </button>
                              {menuOpen === job.jobid && (
                                <div
                                  onClick={(e) => e.stopPropagation()}
                                  className="absolute right-4 top-full mt-1 z-20 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl py-1 w-36"
                                >
                                  <button
                                    onClick={() => { setEditingJob(job); setShowDialog(true); setMenuOpen(null); }}
                                    className="cursor-pointer w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
                                  >
                                    <Edit2 size={13} />
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => { deleteJob(job); setMenuOpen(null); }}
                                    className="cursor-pointer w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-zinc-800 transition-colors"
                                  >
                                    <Trash2 size={13} />
                                    Delete
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Queues Tab ── */}
        {tab === "queues" && (
          <div className="flex h-full">
            {queuesLoading ? (
              <p className="text-zinc-600 text-sm p-8">Loading…</p>
            ) : !queueInstalled ? (
              <div className="flex-1">
                <NotInstalled
                  name="pgmq"
                  description="pgmq is a lightweight message queue built on PostgreSQL. Send, receive, and process messages with visibility timeouts, exactly like AWS SQS but inside your database."
                  onInstall={installQueue}
                  installing={installingQueue}
                />
              </div>
            ) : (
              <>
                {/* Queue list sidebar */}
                <div className="w-64 shrink-0 border-r border-zinc-800 flex flex-col">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
                    <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                      Queues
                    </span>
                    <div className="flex gap-1">
                      <button
                        onClick={fetchQueues}
                        className="cursor-pointer p-1 rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
                      >
                        <RefreshCw size={12} />
                      </button>
                      <button
                        onClick={() => setShowNewQueue(true)}
                        className="cursor-pointer p-1 rounded bg-brand-500 hover:bg-brand-600 text-white transition-colors"
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                  </div>
                  <ul className="flex-1 overflow-y-auto py-2">
                    {queues.length === 0 ? (
                      <li className="px-4 py-8 text-center text-xs text-zinc-600">
                        No queues yet.
                        <br />
                        <button
                          onClick={() => setShowNewQueue(true)}
                          className="cursor-pointer mt-2 text-brand-400 hover:text-brand-300"
                        >
                          Create one
                        </button>
                      </li>
                    ) : (
                      queues.map((q) => (
                        <li key={q.name}>
                          <button
                            onClick={() => readMessages(q)}
                            className={`cursor-pointer w-full text-left px-4 py-2.5 transition-colors ${
                              selectedQueue?.name === q.name
                                ? "bg-zinc-800 text-white"
                                : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-100"
                            }`}
                          >
                            <span className="block text-sm truncate">{q.name}</span>
                            <span className="block text-xs text-zinc-600 mt-0.5">
                              {q.metrics.queue_length ?? 0} messages
                            </span>
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                </div>

                {/* Queue detail */}
                <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                  {!selectedQueue ? (
                    <div className="flex-1 flex items-center justify-center text-zinc-600 text-sm">
                      Select a queue to browse messages
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between px-6 py-3 border-b border-zinc-800 shrink-0">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-semibold text-white">{selectedQueue.name}</span>
                          <span className="text-xs text-zinc-600">
                            {selectedQueue.metrics.queue_length ?? 0} queued ·{" "}
                            {selectedQueue.metrics.total_messages ?? 0} total
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setShowSend(true)}
                            className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-xs font-medium transition-colors"
                          >
                            <Send size={12} />
                            Send
                          </button>
                          <button
                            onClick={() => readMessages(selectedQueue)}
                            className="cursor-pointer p-1.5 rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
                          >
                            <RefreshCw size={13} />
                          </button>
                          <button
                            onClick={() => dropQueue(selectedQueue)}
                            className="cursor-pointer p-1.5 rounded text-zinc-600 hover:text-red-400 hover:bg-zinc-800 transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      <div className="flex-1 overflow-auto">
                        {loadingMessages ? (
                          <div className="flex items-center justify-center h-32 text-zinc-600 text-sm">Loading…</div>
                        ) : queueMessages.length === 0 ? (
                          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                            <Inbox size={28} className="text-zinc-700" />
                            <p className="text-zinc-600 text-sm">Queue is empty</p>
                            <button
                              onClick={() => setShowSend(true)}
                              className="cursor-pointer text-brand-400 hover:text-brand-300 text-sm"
                            >
                              Send a message
                            </button>
                          </div>
                        ) : (
                          <div className="divide-y divide-zinc-800">
                            {queueMessages.map((msg) => (
                              <div key={msg.msg_id} className="flex items-start gap-4 px-6 py-4 group hover:bg-zinc-900/50">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-2">
                                    <span className="text-xs font-mono text-zinc-500">#{msg.msg_id}</span>
                                    <span className="text-xs text-zinc-600">
                                      {new Date(msg.enqueued_at).toLocaleString()}
                                    </span>
                                    {msg.read_ct > 0 && (
                                      <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">
                                        read {msg.read_ct}×
                                      </span>
                                    )}
                                  </div>
                                  <pre className="text-xs text-zinc-300 bg-zinc-800 rounded-lg px-3 py-2 overflow-x-auto">
                                    {JSON.stringify(msg.message, null, 2)}
                                  </pre>
                                </div>
                                <button
                                  onClick={() => deleteMessage(msg.msg_id)}
                                  className="cursor-pointer opacity-0 group-hover:opacity-100 p-1.5 rounded text-zinc-600 hover:text-red-400 hover:bg-zinc-800 transition-all mt-1"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Cron Job Dialog ── */}
      {showDialog && (
        <CronJobDialog
          initial={editingJob ? {
            name: editingJob.jobname.startsWith(prefix)
              ? editingJob.jobname.slice(prefix.length)
              : editingJob.jobname,
            schedule: editingJob.schedule,
            command: editingJob.command,
            type: detectType(editingJob.command),
          } : undefined}
          onClose={() => { setShowDialog(false); setEditingJob(null); }}
          onSave={saveJob}
          saving={savingJob}
        />
      )}

      {/* ── New Queue Dialog ── */}
      {showNewQueue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl w-full max-w-sm mx-4 shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
              <h2 className="text-base font-semibold text-white">New Queue</h2>
              <button
                onClick={() => setShowNewQueue(false)}
                className="cursor-pointer p-1.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            <div className="px-6 py-4">
              <label className="block text-xs text-zinc-400 mb-1.5">Queue name</label>
              <input
                value={newQueueName}
                onChange={(e) => setNewQueueName(e.target.value.toLowerCase().replace(/\s+/g, "_"))}
                placeholder="my_queue"
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-brand-500"
                onKeyDown={(e) => { if (e.key === "Enter") createQueue(); }}
              />
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-zinc-800">
              <button
                onClick={() => setShowNewQueue(false)}
                className="cursor-pointer px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createQueue}
                disabled={!newQueueName.trim() || creatingQueue}
                className="cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium transition-colors"
              >
                {creatingQueue ? "Creating…" : "Create Queue"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Send Message Dialog ── */}
      {showSend && selectedQueue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl w-full max-w-sm mx-4 shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
              <h2 className="text-base font-semibold text-white">
                Send to <span className="text-brand-400">{selectedQueue.name}</span>
              </h2>
              <button
                onClick={() => setShowSend(false)}
                className="cursor-pointer p-1.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            <div className="px-6 py-4">
              <label className="block text-xs text-zinc-400 mb-1.5">Message (JSON)</label>
              <textarea
                value={sendForm}
                onChange={(e) => setSendForm(e.target.value)}
                placeholder='{"event": "user.created", "userId": "abc123"}'
                rows={5}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-brand-500 resize-none"
              />
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-zinc-800">
              <button
                onClick={() => setShowSend(false)}
                className="cursor-pointer px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => sendMessage(selectedQueue)}
                disabled={!sendForm.trim()}
                className="cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium transition-colors"
              >
                <Send size={13} />
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
