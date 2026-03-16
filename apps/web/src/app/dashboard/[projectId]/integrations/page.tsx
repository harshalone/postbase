"use client";

import { useState, useEffect, useCallback, use } from "react";
import {
  Clock,
  Layers,
  Plus,
  Trash2,
  RefreshCw,
  Play,
  Pause,
  Send,
  Inbox,
  X,
  PackagePlus,
  AlertTriangle,
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

// ─── Cron schedule presets ────────────────────────────────────────────────────

const CRON_PRESETS = [
  { label: "Every minute",  value: "* * * * *"     },
  { label: "Every 5 min",   value: "*/5 * * * *"   },
  { label: "Every hour",    value: "0 * * * *"      },
  { label: "Daily midnight",value: "0 0 * * *"      },
  { label: "Weekly Sunday", value: "0 0 * * 0"      },
];

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

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function IntegrationsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  const [tab, setTab] = useState<Tab>("cron");

  // ── Cron state ──────────────────────────────────────────────────────────────
  const [cronInstalled, setCronInstalled] = useState<boolean | null>(null);
  const [cronJobs, setCronJobs] = useState<CronJob[]>([]);
  const [cronLoading, setCronLoading] = useState(true);
  const [installingCron, setInstallingCron] = useState(false);
  const [showNewJob, setShowNewJob] = useState(false);
  const [expandedJob, setExpandedJob] = useState<number | null>(null);
  const [newJob, setNewJob] = useState({ name: "", schedule: "* * * * *", command: "" });
  const [creatingJob, setCreatingJob] = useState(false);

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
      await fetch(`/api/dashboard/${projectId}/cron`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "install" }),
      });
      fetchCron();
    } finally {
      setInstallingCron(false);
    }
  }

  async function createJob() {
    if (!newJob.name || !newJob.command) return;
    setCreatingJob(true);
    try {
      const res = await fetch(`/api/dashboard/${projectId}/cron`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", ...newJob }),
      });
      const data = await res.json();
      if (data.error) { alert(data.error); return; }
      setShowNewJob(false);
      setNewJob({ name: "", schedule: "* * * * *", command: "" });
      fetchCron();
    } finally {
      setCreatingJob(false);
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
    // Strip prefix to get user-visible name
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
      fetchQueues();
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
      if (data.error) { alert(data.error); return; }
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
      alert("Message must be valid JSON");
      return;
    }
    const res = await fetch(`/api/dashboard/${projectId}/queues`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "send", queueName: q.name, message: parsed }),
    });
    const data = await res.json();
    if (data.error) { alert(data.error); return; }
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

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-8 pt-8 pb-4 border-b border-zinc-800 shrink-0">
        <h1 className="text-2xl font-bold text-white mb-1">Integrations</h1>
        <p className="text-zinc-400 text-sm">
          Manage PostgreSQL extensions — cron jobs and message queues.
        </p>
        <div className="flex gap-1 mt-5">
          {(
            [
              { id: "cron",   label: "Cron Jobs",       icon: Clock  },
              { id: "queues", label: "Message Queues",   icon: Layers },
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
          <div className="p-6 h-full">
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
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-base font-semibold text-white">Scheduled Jobs</h2>
                    <p className="text-xs text-zinc-500 mt-0.5">{cronJobs.length} job{cronJobs.length !== 1 ? "s" : ""}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={fetchCron}
                      className="cursor-pointer p-2 rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
                    >
                      <RefreshCw size={14} />
                    </button>
                    <button
                      onClick={() => setShowNewJob(true)}
                      className="cursor-pointer flex items-center gap-2 px-3 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium transition-colors"
                    >
                      <Plus size={14} />
                      New Job
                    </button>
                  </div>
                </div>

                {cronJobs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <Clock size={32} className="text-zinc-700 mb-3" />
                    <p className="text-zinc-500 text-sm">No cron jobs yet.</p>
                    <button
                      onClick={() => setShowNewJob(true)}
                      className="cursor-pointer mt-3 text-brand-400 hover:text-brand-300 text-sm"
                    >
                      Create your first job
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {cronJobs.map((job) => {
                      const displayName = job.jobname.startsWith(prefix)
                        ? job.jobname.slice(prefix.length)
                        : job.jobname;
                      const isExpanded = expandedJob === job.jobid;
                      return (
                        <div
                          key={job.jobid}
                          className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden"
                        >
                          <div className="flex items-center gap-4 px-5 py-4">
                            {/* Active indicator */}
                            <div
                              className={`w-2 h-2 rounded-full shrink-0 ${
                                job.active ? "bg-green-400" : "bg-zinc-600"
                              }`}
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-white truncate">{displayName}</p>
                              <p className="text-xs text-zinc-500 font-mono mt-0.5">{job.schedule}</p>
                            </div>
                            <code className="hidden md:block text-xs text-zinc-500 bg-zinc-800 px-3 py-1.5 rounded-lg max-w-xs truncate">
                              {job.command}
                            </code>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => setExpandedJob(isExpanded ? null : job.jobid)}
                                className="cursor-pointer px-2 py-1.5 rounded text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
                              >
                                {isExpanded ? "Hide" : "History"}
                              </button>
                              <button
                                onClick={() => toggleJob(job)}
                                title={job.active ? "Pause" : "Resume"}
                                className="cursor-pointer p-1.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                              >
                                {job.active ? <Pause size={14} /> : <Play size={14} />}
                              </button>
                              <button
                                onClick={() => deleteJob(job)}
                                className="cursor-pointer p-1.5 rounded text-zinc-600 hover:text-red-400 hover:bg-zinc-800 transition-colors"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>

                          {/* Run history */}
                          {isExpanded && (
                            <div className="border-t border-zinc-800 px-5 py-3">
                              <p className="text-xs text-zinc-500 mb-2 font-medium">Last 5 runs</p>
                              {job.runs.length === 0 ? (
                                <p className="text-xs text-zinc-700">No run history yet.</p>
                              ) : (
                                <div className="space-y-1">
                                  {job.runs.map((run, i) => (
                                    <div key={i} className="flex items-center gap-3 text-xs">
                                      <span
                                        className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                                          run.status === "succeeded"
                                            ? "bg-green-900/40 text-green-400"
                                            : "bg-red-900/40 text-red-400"
                                        }`}
                                      >
                                        {run.status}
                                      </span>
                                      <span className="text-zinc-500">
                                        {new Date(run.start_time).toLocaleString()}
                                      </span>
                                      {run.return_message && (
                                        <span className="text-zinc-600 truncate">{run.return_message}</span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
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
                      {/* Queue header */}
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

                      {/* Messages list */}
                      <div className="flex-1 overflow-auto">
                        {loadingMessages ? (
                          <div className="flex items-center justify-center h-32 text-zinc-600 text-sm">
                            Loading…
                          </div>
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

      {/* ── New Cron Job Dialog ── */}
      {showNewJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-lg mx-4 shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
              <h2 className="text-lg font-semibold text-white">New Cron Job</h2>
              <button
                onClick={() => setShowNewJob(false)}
                className="cursor-pointer p-1.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Job name</label>
                <input
                  value={newJob.name}
                  onChange={(e) => setNewJob((j) => ({ ...j, name: e.target.value.replace(/\s+/g, "_") }))}
                  placeholder="cleanup_old_records"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-brand-500"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Schedule (cron expression)</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {CRON_PRESETS.map((p) => (
                    <button
                      key={p.value}
                      onClick={() => setNewJob((j) => ({ ...j, schedule: p.value }))}
                      className={`cursor-pointer px-2.5 py-1 rounded text-xs transition-colors ${
                        newJob.schedule === p.value
                          ? "bg-brand-500 text-white"
                          : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <input
                  value={newJob.schedule}
                  onChange={(e) => setNewJob((j) => ({ ...j, schedule: e.target.value }))}
                  placeholder="* * * * *"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-brand-500"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">SQL command</label>
                <textarea
                  value={newJob.command}
                  onChange={(e) => setNewJob((j) => ({ ...j, command: e.target.value }))}
                  placeholder="DELETE FROM logs WHERE created_at < now() - interval '30 days';"
                  rows={4}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-brand-500 resize-none"
                />
                <p className="text-xs text-zinc-600 mt-1">
                  Use unqualified table names — search_path is set to your project schema automatically.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-zinc-800">
              <button
                onClick={() => setShowNewJob(false)}
                className="cursor-pointer px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createJob}
                disabled={!newJob.name || !newJob.command || creatingJob}
                className="cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium transition-colors"
              >
                {creatingJob ? "Scheduling…" : "Schedule Job"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── New Queue Dialog ── */}
      {showNewQueue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-sm mx-4 shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
              <h2 className="text-lg font-semibold text-white">New Queue</h2>
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
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-brand-500"
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
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-sm mx-4 shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
              <h2 className="text-lg font-semibold text-white">
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
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-brand-500 resize-none"
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
