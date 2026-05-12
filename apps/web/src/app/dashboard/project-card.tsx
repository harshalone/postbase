"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreVertical, Trash2, AlertTriangle } from "lucide-react";

function DeleteModal({
  projectId,
  projectName,
  onClose,
}: {
  projectId: string;
  projectName: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<"warn" | "confirm">("warn");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/dashboard/projects/${projectId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to delete project");
        return;
      }
      router.refresh();
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-md mx-4 shadow-2xl">
        {step === "warn" ? (
          <>
            <div className="flex items-start gap-4 p-6">
              <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center shrink-0 mt-0.5">
                <AlertTriangle size={18} className="text-red-400" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white mb-1">
                  Delete &ldquo;{projectName}&rdquo;?
                </h2>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  This will permanently wipe the entire project including:
                </p>
                <ul className="mt-2 space-y-1 text-sm text-zinc-500">
                  <li className="flex items-center gap-2">
                    <span className="w-1 h-1 rounded-full bg-red-500 shrink-0" />
                    All database tables and data in the project schema
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1 h-1 rounded-full bg-red-500 shrink-0" />
                    All users and authentication records
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1 h-1 rounded-full bg-red-500 shrink-0" />
                    Storage buckets, files, and connections
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1 h-1 rounded-full bg-red-500 shrink-0" />
                    Cron jobs, email settings, and API keys
                  </li>
                </ul>
                <p className="text-sm text-red-400 font-medium mt-3">
                  This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 pb-6">
              <button
                onClick={onClose}
                className="cursor-pointer px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => setStep("confirm")}
                className="cursor-pointer px-4 py-2 text-sm bg-red-700 hover:bg-red-800 text-white rounded-lg transition-colors"
              >
                I understand, continue
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="p-6">
              <h2 className="text-base font-semibold text-white mb-1">
                Confirm deletion
              </h2>
              <p className="text-sm text-zinc-400 mb-4">
                Type{" "}
                <span className="font-mono text-zinc-200 bg-zinc-800 px-1 py-0.5 rounded">
                  {projectName}
                </span>{" "}
                to permanently delete this project and all its data.
              </p>
              <input
                autoFocus
                type="text"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && confirmation === projectName) handleDelete();
                }}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-red-700 placeholder-zinc-600"
                placeholder={projectName}
              />
              {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
            </div>
            <div className="flex justify-end gap-2 px-6 pb-6">
              <button
                onClick={onClose}
                className="cursor-pointer px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={loading || confirmation !== projectName}
                className="cursor-pointer px-4 py-2 text-sm bg-red-700 hover:bg-red-800 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Deleting…" : "Delete Project"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function ProjectCard({
  projectId,
  name,
  slug,
}: {
  projectId: string;
  name: string;
  slug: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  return (
    <>
      <div className="relative group rounded-lg border border-zinc-800 bg-zinc-950 hover:border-zinc-600 hover:bg-zinc-800/50 transition-all">
        <Link
          href={`/dashboard/${projectId}`}
          className="block p-4"
        >
          <p className="font-medium text-zinc-100 group-hover:text-white text-sm pr-6">
            {name}
          </p>
          <p className="text-xs text-zinc-500 mt-1">{slug}</p>
          <p className="text-xs text-zinc-600 mt-3 group-hover:text-zinc-500 transition-colors">
            Open project →
          </p>
        </Link>

        {/* 3-dots menu */}
        <div ref={menuRef} className="absolute top-3 right-3">
          <button
            onClick={(e) => { e.preventDefault(); setMenuOpen((v) => !v); }}
            className="cursor-pointer p-1 rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors opacity-0 group-hover:opacity-100"
            aria-label="Project options"
          >
            <MoreVertical size={14} />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 z-20 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl py-1 w-36">
              <button
                onClick={(e) => { e.preventDefault(); setMenuOpen(false); setDeleteOpen(true); }}
                className="cursor-pointer w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-zinc-800 transition-colors"
              >
                <Trash2 size={13} />
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {deleteOpen && (
        <DeleteModal
          projectId={projectId}
          projectName={name}
          onClose={() => { setDeleteOpen(false); }}
        />
      )}
    </>
  );
}
