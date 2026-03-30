"use client";

import { List } from "lucide-react";

export default function EnumsPage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="p-8">
        <h1 className="text-2xl font-semibold text-white mb-2">
          Enumerated Types
        </h1>
        <p className="text-sm text-zinc-400 mb-8">
          Manage PostgreSQL enum types used across your database tables.
        </p>
        <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
          <List size={48} className="mb-4 text-zinc-600" />
          <p className="text-sm">No enumerated types found</p>
          <p className="text-xs text-zinc-600 mt-1">
            Enum types will appear here once created.
          </p>
        </div>
      </div>
    </div>
  );
}
