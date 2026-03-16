export default async function StoragePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  await params;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-white">Storage</h1>
        <button
          disabled
          className="cursor-not-allowed px-4 py-2 rounded-lg bg-brand-500 text-white text-sm font-medium opacity-50"
        >
          New Bucket
        </button>
      </div>
      <p className="text-zinc-400 mb-8">Manage file buckets and objects for this project.</p>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: "Total Buckets", value: "0" },
          { label: "Total Objects", value: "0" },
          { label: "Storage Used", value: "0 B" },
        ].map((s) => (
          <div key={s.label} className="p-6 rounded-xl border border-zinc-800 bg-zinc-900">
            <p className="text-3xl font-bold text-white">{s.value}</p>
            <p className="text-zinc-400 text-sm mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Buckets table */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <p className="text-sm font-semibold text-white">Buckets</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-500 text-xs uppercase tracking-wider">
              <th className="text-left px-6 py-3 font-medium">Name</th>
              <th className="text-left px-6 py-3 font-medium">Access</th>
              <th className="text-left px-6 py-3 font-medium">Objects</th>
              <th className="text-left px-6 py-3 font-medium">Size</th>
              <th className="text-left px-6 py-3 font-medium">Created</th>
              <th className="px-6 py-3" />
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={6} className="px-6 py-20 text-center text-zinc-500">
                <p className="text-base font-medium text-zinc-400 mb-1">No buckets yet</p>
                <p className="text-sm">Create a bucket to start storing files.</p>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-xs text-zinc-600 mt-4 text-center">
        S3-compatible file storage with access policies coming soon.
      </p>
    </div>
  );
}
