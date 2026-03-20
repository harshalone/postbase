import { PageHeader } from "../_components/page-header";

export default async function UsersPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  await params;

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Users">
        <button
          disabled
          className="cursor-not-allowed px-3 py-1.5 rounded-lg bg-brand-500 text-white text-xs font-medium opacity-50"
        >
          Invite User
        </button>
      </PageHeader>
      <div className="p-6 overflow-auto">
        {/* Search + filters bar */}
        <div className="flex gap-3 mb-6">
          <input
            disabled
            placeholder="Search by email or name…"
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-sm text-zinc-500 placeholder-zinc-600 cursor-not-allowed"
          />
          <select
            disabled
            className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-500 cursor-not-allowed"
          >
            <option>All providers</option>
          </select>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500 text-xs uppercase tracking-wider">
                <th className="text-left px-6 py-3 font-medium">User</th>
                <th className="text-left px-6 py-3 font-medium">Provider</th>
                <th className="text-left px-6 py-3 font-medium">Created</th>
                <th className="text-left px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody>
              {/* Empty state */}
              <tr>
                <td colSpan={5} className="px-6 py-20 text-center text-zinc-500">
                  <p className="text-base font-medium text-zinc-400 mb-1">No users yet</p>
                  <p className="text-sm">
                    Users will appear here once they sign up via your auth providers.
                  </p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Coming soon banner */}
        <p className="text-xs text-zinc-600 mt-4 text-center">
          Full user management — ban, delete, impersonate — coming soon.
        </p>
      </div>
    </div>
  );
}
