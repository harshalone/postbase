"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";

export function ResetButton({
  projectId,
  type,
  onReset,
}: {
  projectId: string;
  type: "anon" | "service_role";
  onReset: (newKey: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);

  async function reset() {
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard/projects/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, type }),
      });
      const data = await res.json();
      if (data.key) onReset(data.key);
    } finally {
      setLoading(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-zinc-400">Sure?</span>
        <button
          onClick={reset}
          disabled={loading}
          className="cursor-pointer px-2.5 py-1.5 text-xs bg-red-900/60 hover:bg-red-900 border border-red-800 text-red-300 rounded transition-colors disabled:opacity-50"
        >
          {loading ? "Resetting…" : "Yes, reset"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="cursor-pointer px-2.5 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-400 rounded transition-colors"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 rounded transition-colors whitespace-nowrap"
    >
      <RefreshCw size={12} />
      Reset
    </button>
  );
}
