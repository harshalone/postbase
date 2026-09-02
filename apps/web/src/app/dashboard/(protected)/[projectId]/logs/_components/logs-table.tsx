"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

const PER_PAGE = 50;

export interface AuditEvent {
  id: string;
  action: string;
  userId: string | null;
  userEmail: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

const ACTION_LABELS: Record<string, string> = {
  "auth.sign_up": "Sign up",
  "auth.sign_in": "Sign in",
  "auth.sign_out": "Sign out",
  "auth.token_refresh": "Token refresh",
  "auth.otp_request": "OTP request",
  "auth.otp_verify": "OTP verify",
};

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

function actionBadgeClass(action: string): string {
  if (action === "auth.sign_in" || action === "auth.sign_up") {
    return "bg-emerald-900/30 text-emerald-400 border-emerald-800/40";
  }
  if (action === "auth.sign_out") {
    return "bg-zinc-800 text-zinc-400 border-zinc-700";
  }
  return "bg-blue-900/30 text-blue-300 border-blue-800/40";
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

interface LogsTableProps {
  projectId: string;
  initialEvents: AuditEvent[];
  initialTotal: number;
}

export function LogsTable({ projectId, initialEvents, initialTotal }: LogsTableProps) {
  const [events, setEvents] = useState<AuditEvent[]>(initialEvents);
  const [total, setTotal] = useState(initialTotal);
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("");
  const [range, setRange] = useState<"24h" | "7d" | "30d" | "all">("all");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);

    const qs = new URLSearchParams({ page: String(page), perPage: String(PER_PAGE) });
    if (action) qs.set("action", action);
    if (search.trim()) qs.set("search", search.trim());
    if (range !== "all") {
      const now = new Date();
      const from = new Date(now);
      if (range === "24h") from.setHours(now.getHours() - 24);
      if (range === "7d") from.setDate(now.getDate() - 7);
      if (range === "30d") from.setDate(now.getDate() - 30);
      qs.set("from", from.toISOString());
    }

    fetch(`/api/dashboard/${projectId}/logs?${qs}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => {
        setEvents(data.events ?? []);
        setTotal(data.total ?? 0);
      })
      .catch((err) => {
        if (err.name !== "AbortError") console.error(err);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [projectId, page, action, search, range]);

  // Any filter change resets to page 1
  useEffect(() => {
    setPage(1);
  }, [action, search, range]);

  // The server matches `search` against the action name; also match user
  // email against the events already loaded on this page, since email lives
  // in a separate per-project database and can't be filtered in the same query.
  const visibleEvents = search.trim()
    ? events.filter(
        (e) =>
          e.action.toLowerCase().includes(search.trim().toLowerCase()) ||
          (e.userEmail ?? "").toLowerCase().includes(search.trim().toLowerCase())
      )
    : events;

  return (
    <>
      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by action, or user on this page…"
          className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
        />
        <select
          value={action}
          onChange={(e) => setAction(e.target.value)}
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-zinc-600"
        >
          <option value="">All actions</option>
          <option value="auth.sign_in">sign_in</option>
          <option value="auth.sign_up">sign_up</option>
          <option value="auth.sign_out">sign_out</option>
          <option value="auth.token_refresh">token_refresh</option>
        </select>
        <select
          value={range}
          onChange={(e) => setRange(e.target.value as typeof range)}
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-zinc-600"
        >
          <option value="all">All time</option>
          <option value="24h">Last 24 hours</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
        </select>
      </div>

      {/* Logs table */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-500 text-xs uppercase tracking-wider">
              <th className="text-left px-6 py-3 font-medium">Timestamp</th>
              <th className="text-left px-6 py-3 font-medium">Action</th>
              <th className="text-left px-6 py-3 font-medium">User</th>
              <th className="text-left px-6 py-3 font-medium">IP Address</th>
              <th className="text-left px-6 py-3 font-medium">User Agent</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-6 py-20 text-center text-zinc-500">
                  <Loader2 size={16} className="animate-spin inline mr-2" />
                  Loading…
                </td>
              </tr>
            ) : visibleEvents.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-20 text-center text-zinc-500">
                  <p className="text-base font-medium text-zinc-400 mb-1">No events recorded</p>
                  <p className="text-sm">
                    {search || action || range !== "all"
                      ? "No events match your filters."
                      : "Auth events like sign-ins and sign-ups will appear here."}
                  </p>
                </td>
              </tr>
            ) : (
              visibleEvents.map((event) => (
                <tr key={event.id} className="border-t border-zinc-800/60 hover:bg-zinc-800/30 transition-colors">
                  <td className="px-6 py-3 text-zinc-400 text-xs whitespace-nowrap">
                    {formatTimestamp(event.createdAt)}
                  </td>
                  <td className="px-6 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${actionBadgeClass(event.action)}`}>
                      {actionLabel(event.action)}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-zinc-300 text-xs">
                    {event.userEmail ?? <span className="text-zinc-600 italic">—</span>}
                  </td>
                  <td className="px-6 py-3 text-zinc-500 text-xs font-mono">
                    {event.ipAddress ?? "—"}
                  </td>
                  <td className="px-6 py-3 text-zinc-600 text-xs max-w-[240px] truncate" title={event.userAgent ?? ""}>
                    {event.userAgent ?? "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-zinc-600">
            Page {page} of {totalPages} · {total} event{total !== 1 ? "s" : ""}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || loading}
              className="cursor-pointer flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-300 text-xs transition-colors"
            >
              <ChevronLeft size={13} />
              Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || loading}
              className="cursor-pointer flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-300 text-xs transition-colors"
            >
              Next
              <ChevronRight size={13} />
            </button>
          </div>
        </div>
      )}

      <p className="text-xs text-zinc-600 mt-4 text-center">
        Real-time event streaming and log export coming soon.
      </p>
    </>
  );
}
