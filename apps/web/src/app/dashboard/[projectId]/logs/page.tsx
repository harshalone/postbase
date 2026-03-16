export default async function AuditLogsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  await params;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-white mb-2">Audit Logs</h1>
      <p className="text-zinc-400 mb-8">Track user and system events across your project.</p>

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <input
          disabled
          placeholder="Search by action or user…"
          className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-sm text-zinc-500 placeholder-zinc-600 cursor-not-allowed"
        />
        <select
          disabled
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-500 cursor-not-allowed"
        >
          <option>All actions</option>
          <option>sign_in</option>
          <option>sign_out</option>
          <option>sign_up</option>
          <option>token_refresh</option>
        </select>
        <select
          disabled
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-500 cursor-not-allowed"
        >
          <option>Last 24 hours</option>
          <option>Last 7 days</option>
          <option>Last 30 days</option>
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
            <tr>
              <td colSpan={5} className="px-6 py-20 text-center text-zinc-500">
                <p className="text-base font-medium text-zinc-400 mb-1">No events recorded</p>
                <p className="text-sm">
                  Auth events like sign-ins and sign-ups will appear here.
                </p>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-xs text-zinc-600 mt-4 text-center">
        Real-time event streaming and log export coming soon.
      </p>
    </div>
  );
}
