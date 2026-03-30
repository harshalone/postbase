"use client";

import { Blocks } from "lucide-react";

export default function ExtensionsPage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="p-8">
        <h1 className="text-2xl font-semibold text-white mb-2">
          Database Extensions
        </h1>
        <p className="text-sm text-zinc-400 mb-8">
          Manage PostgreSQL extensions to add extra functionality to your
          database.
        </p>
        <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
          <Blocks size={48} className="mb-4 text-zinc-600" />
          <p className="text-sm">No extensions found</p>
          <p className="text-xs text-zinc-600 mt-1">
            Extensions will appear here once enabled.
          </p>
        </div>
      </div>
    </div>
  );
}
