"use client";

import { GitBranch } from "lucide-react";

export default function IndexesPage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="p-8">
        <h1 className="text-2xl font-semibold text-white mb-2">
          Database Indexes
        </h1>
        <p className="text-sm text-zinc-400 mb-8">
          Manage indexes to improve query performance on your database tables.
        </p>
        <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
          <GitBranch size={48} className="mb-4 text-zinc-600" />
          <p className="text-sm">No indexes found</p>
          <p className="text-xs text-zinc-600 mt-1">
            Indexes will appear here once created.
          </p>
        </div>
      </div>
    </div>
  );
}
