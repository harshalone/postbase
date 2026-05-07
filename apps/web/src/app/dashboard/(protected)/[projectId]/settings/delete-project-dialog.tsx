"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteProjectDialog({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    setLoading(true);
    setError("");
    const res = await fetch(`/api/dashboard/projects/${projectId}`, {
      method: "DELETE",
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to delete project");
      return;
    }
    router.push("/dashboard");
  }

  function handleClose() {
    setOpen(false);
    setConfirmation("");
    setError("");
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="cursor-pointer px-4 py-2 rounded-lg border border-red-800 text-red-400 text-sm font-medium hover:bg-red-950 transition-colors shrink-0 ml-6"
      >
        Delete Project
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 w-full max-w-md shadow-xl">
            <h2 className="text-lg font-semibold text-white mb-2">
              Delete Project
            </h2>
            <p className="text-sm text-zinc-400 mb-4">
              This will permanently delete{" "}
              <span className="text-white font-medium">{projectName}</span> and
              all its data including users, tables, and storage. This cannot be
              undone.
            </p>
            <div className="mb-4">
              <label className="block text-xs text-zinc-400 mb-1.5">
                Type{" "}
                <span className="font-mono text-zinc-200">{projectName}</span>{" "}
                to confirm
              </label>
              <input
                autoFocus
                type="text"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-red-700"
                placeholder={projectName}
              />
            </div>
            {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleClose}
                className="cursor-pointer px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={loading || confirmation !== projectName}
                className="cursor-pointer px-4 py-2 text-sm bg-red-700 hover:bg-red-800 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Deleting..." : "Delete Project"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
