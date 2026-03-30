"use client";

import { Radio } from "lucide-react";

export default function PublicationsPage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="p-8">
        <h1 className="text-2xl font-semibold text-white mb-2">
          Publications
        </h1>
        <p className="text-sm text-zinc-400 mb-8">
          Manage PostgreSQL publications for logical replication.
        </p>
        <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
          <Radio size={48} className="mb-4 text-zinc-600" />
          <p className="text-sm">No publications found</p>
          <p className="text-xs text-zinc-600 mt-1">
            Publications will appear here once created.
          </p>
        </div>
      </div>
    </div>
  );
}
