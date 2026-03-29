"use client";

import { useState, useEffect, useCallback, use, useRef } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Folder,
  File,
  Upload,
  Trash2,
  RefreshCw,
  Plus,
  ChevronRight,
  Loader2,
  X,
  Image,
  FileText,
  FileCode,
  FileArchive,
  Film,
  Music,
  Search,
  MoreHorizontal,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type StorageObject = {
  key: string;
  size: number;
  lastModified: string;
  isFolder: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function fileBaseName(key: string): string {
  return key.split("/").filter(Boolean).pop() ?? key;
}

function getFileExt(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function FileIcon({ name, size = 16, className = "" }: { name: string; size?: number; className?: string }) {
  const ext = getFileExt(name);
  const imageExts = ["jpg", "jpeg", "png", "gif", "webp", "svg", "avif", "ico"];
  const videoExts = ["mp4", "mov", "avi", "webm", "mkv"];
  const audioExts = ["mp3", "wav", "ogg", "flac", "aac"];
  const codeExts = ["js", "ts", "tsx", "jsx", "json", "html", "css", "py", "go", "rs", "rb", "php", "sh", "yaml", "yml", "toml", "xml"];
  const archiveExts = ["zip", "tar", "gz", "rar", "7z"];
  const docExts = ["pdf", "doc", "docx", "txt", "md", "csv", "xls", "xlsx"];

  if (imageExts.includes(ext)) return <Image size={size} className={className || "text-purple-400"} />;
  if (videoExts.includes(ext)) return <Film size={size} className={className || "text-blue-400"} />;
  if (audioExts.includes(ext)) return <Music size={size} className={className || "text-green-400"} />;
  if (codeExts.includes(ext)) return <FileCode size={size} className={className || "text-yellow-400"} />;
  if (archiveExts.includes(ext)) return <FileArchive size={size} className={className || "text-orange-400"} />;
  if (docExts.includes(ext)) return <FileText size={size} className={className || "text-zinc-300"} />;
  return <File size={size} className={className || "text-zinc-500"} />;
}

function isImageFile(name: string): boolean {
  const imageExts = ["jpg", "jpeg", "png", "gif", "webp", "svg", "avif", "ico"];
  return imageExts.includes(getFileExt(name));
}

// ─── New folder modal ─────────────────────────────────────────────────────────

function NewFolderModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-sm mx-4 shadow-2xl">
        <div className="px-6 py-5">
          <h2 className="text-base font-semibold text-white mb-3">New folder</h2>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim()) onConfirm(name.trim());
              if (e.key === "Escape") onCancel();
            }}
            placeholder="Folder name"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-brand-500"
          />
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-zinc-800">
          <button
            onClick={onCancel}
            className="cursor-pointer px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => name.trim() && onConfirm(name.trim())}
            disabled={!name.trim()}
            className="cursor-pointer disabled:opacity-50 px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium transition-colors"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Left sidebar panel ───────────────────────────────────────────────────────

function LeftPanel({
  connectionName,
  bucketName,
  prefix,
  folders,
  onNavigate,
  onBack,
  projectId,
}: {
  connectionName: string;
  bucketName: string;
  prefix: string;
  folders: StorageObject[];
  onNavigate: (p: string) => void;
  onBack: () => void;
  projectId: string;
}) {
  const router = useRouter();

  return (
    <div className="w-52 shrink-0 border-r border-zinc-800 flex flex-col overflow-hidden">
      {/* Top nav */}
      <div className="px-3 py-3 border-b border-zinc-800 flex items-center gap-2">
        <button
          onClick={() => router.push(`/dashboard/${projectId}/storage`)}
          className="cursor-pointer p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
        >
          <ArrowLeft size={13} />
        </button>
        <span className="text-xs text-zinc-500 truncate">Storage</span>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {/* Root / bucket */}
        <button
          onClick={() => onNavigate("")}
          className={`cursor-pointer w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-sm transition-colors ${
            prefix === ""
              ? "bg-zinc-800 text-white"
              : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
          }`}
        >
          <Folder size={13} className="shrink-0 text-zinc-400" />
          <span className="truncate font-medium">{connectionName || bucketName || "Bucket"}</span>
        </button>

        {/* Folders visible at current level */}
        {folders.map((f) => {
          const name = fileBaseName(f.key) || f.key;
          const isActive = prefix.startsWith(f.key);
          return (
            <button
              key={f.key}
              onClick={() => onNavigate(f.key)}
              className={`cursor-pointer w-full flex items-center gap-2 pl-5 pr-2.5 py-1.5 rounded-lg text-left text-sm transition-colors ${
                isActive
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
              }`}
            >
              <Folder size={12} className={`shrink-0 ${isActive ? "text-yellow-400" : "text-zinc-600"}`} />
              <span className="truncate text-xs">{name}</span>
            </button>
          );
        })}
      </div>

      {/* Footer actions */}
      <div className="p-2 border-t border-zinc-800">
        <button
          onClick={onBack}
          className="cursor-pointer w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800/50 transition-colors"
        >
          <ArrowLeft size={11} />
          Back to connections
        </button>
      </div>
    </div>
  );
}

// ─── File detail panel ────────────────────────────────────────────────────────

function DetailPanel({
  object,
  projectId,
  connectionId,
  onClose,
  onDelete,
}: {
  object: StorageObject;
  projectId: string;
  connectionId: string;
  onClose: () => void;
  onDelete: (key: string) => void;
}) {
  const toast = useToast();
  const name = fileBaseName(object.key);
  const [presignedUrl, setPresignedUrl] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(false);

  useEffect(() => {
    setPresignedUrl(null);
    setLoadingUrl(true);
    fetch(
      `/api/dashboard/${projectId}/storage/${connectionId}/browse?action=url&key=${encodeURIComponent(object.key)}`
    )
      .then((r) => r.json())
      .then((d) => { if (d.url) setPresignedUrl(d.url); })
      .finally(() => setLoadingUrl(false));
  }, [object.key, projectId, connectionId]);

  async function handleCopyUrl() {
    if (!presignedUrl) return;
    await navigator.clipboard.writeText(presignedUrl);
    toast.success("URL copied to clipboard", "");
  }

  async function handleDownload() {
    if (!presignedUrl) return;
    const a = document.createElement("a");
    a.href = presignedUrl;
    a.download = name;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.click();
  }

  // Guess mime type from extension for display
  const ext = getFileExt(name);
  const mimeGuess: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
    webp: "image/webp", svg: "image/svg+xml", avif: "image/avif",
    mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm",
    mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg",
    pdf: "application/pdf", json: "application/json",
    txt: "text/plain", md: "text/markdown", csv: "text/csv",
    html: "text/html", css: "text/css", js: "text/javascript",
    ts: "text/typescript", zip: "application/zip",
  };
  const mimeType = mimeGuess[ext] ?? "application/octet-stream";

  const lastModified = object.lastModified
    ? new Date(object.lastModified).toLocaleString()
    : "—";

  return (
    <div className="w-80 shrink-0 border-l border-zinc-800 flex flex-col overflow-hidden bg-zinc-950">
      {/* Header — just the X button, no title */}
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
        <span className="text-xs text-zinc-600 truncate">{name}</span>
        <button
          onClick={onClose}
          className="cursor-pointer p-1 rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors shrink-0 ml-2"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Preview area */}
        <div className="border-b border-zinc-800 bg-zinc-900/40 flex items-center justify-center min-h-[220px]">
          {loadingUrl ? (
            <Loader2 size={20} className="text-zinc-700 animate-spin" />
          ) : presignedUrl && isImageFile(name) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={presignedUrl}
              alt={name}
              className="max-w-full max-h-64 object-contain"
            />
          ) : (
            <div className="flex flex-col items-center gap-3 py-10">
              <div className="w-16 h-16 rounded-2xl bg-zinc-800 flex items-center justify-center">
                <FileIcon name={name} size={28} />
              </div>
              {ext && (
                <span className="text-xs text-zinc-600 font-mono uppercase">.{ext}</span>
              )}
            </div>
          )}
        </div>

        {/* File info */}
        <div className="p-5 space-y-1">
          <h3 className="text-sm font-semibold text-white break-all leading-snug mb-1">{name}</h3>
          <p className="text-xs text-zinc-500">
            {mimeType} &middot; {formatBytes(object.size)}
          </p>
        </div>

        <div className="px-5 pb-4 space-y-3 border-t border-zinc-800/60 pt-4">
          <div>
            <p className="text-xs text-zinc-600 mb-0.5">Added on</p>
            <p className="text-xs text-zinc-300">{lastModified}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-600 mb-0.5">Last modified</p>
            <p className="text-xs text-zinc-300">{lastModified}</p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="px-4 pb-4 pt-2 space-y-2">
          <div className="flex gap-2">
            <button
              onClick={handleDownload}
              disabled={!presignedUrl}
              className="cursor-pointer flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 transition-colors disabled:opacity-40"
            >
              <Upload size={11} className="rotate-180" />
              Download
            </button>
            <button
              onClick={handleCopyUrl}
              disabled={!presignedUrl}
              className="cursor-pointer flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 transition-colors disabled:opacity-40"
            >
              <FileText size={11} />
              Get URL
            </button>
          </div>
          <button
            onClick={() => onDelete(object.key)}
            className="cursor-pointer w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs text-zinc-400 hover:text-red-300 hover:bg-red-500/10 border border-zinc-700 hover:border-red-500/30 transition-colors"
          >
            <Trash2 size={11} />
            Delete file
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function StorageBrowserPage({
  params,
}: {
  params: Promise<{ projectId: string; connectionId: string }>;
}) {
  const { projectId, connectionId } = use(params);
  const router = useRouter();
  const toast = useToast();
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const [objects, setObjects] = useState<StorageObject[]>([]);
  const [rootFolders, setRootFolders] = useState<StorageObject[]>([]);
  const [loading, setLoading] = useState(true);
  const [prefix, setPrefix] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [connectionName, setConnectionName] = useState<string>("");
  const [bucketName, setBucketName] = useState<string>("");
  const [activeFile, setActiveFile] = useState<StorageObject | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [search, setSearch] = useState("");

  const fetchObjects = useCallback(
    async (p = prefix) => {
      setLoading(true);
      setSelected(new Set());
      setActiveFile(null);
      try {
        const res = await fetch(
          `/api/dashboard/${projectId}/storage/${connectionId}/browse?prefix=${encodeURIComponent(p)}`
        );
        const data = await res.json();
        if (data.error) {
          toast.error("Failed to list objects", data.error);
          return;
        }
        const fetched: StorageObject[] = data.objects ?? [];
        setObjects(fetched);
        if (data.bucket) setBucketName(data.bucket);
        // Keep root-level folders in sync so the sidebar always shows them
        if (p === "") setRootFolders(fetched.filter((o) => o.isFolder));
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId, connectionId, prefix]
  );

  useEffect(() => {
    fetch(`/api/dashboard/${projectId}/storage`)
      .then((r) => r.json())
      .then((d) => {
        const conn = (d.connections ?? []).find(
          (c: { id: string; name: string }) => c.id === connectionId
        );
        if (conn) setConnectionName(conn.name);
      });
  }, [projectId, connectionId]);

  useEffect(() => {
    fetchObjects(prefix);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefix]);

  function navigate(newPrefix: string) {
    setPrefix(newPrefix);
    setSearch("");
  }

  function toggleSelect(key: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleUpload(files: FileList) {
    setUploading(true);
    let successCount = 0;
    for (const file of Array.from(files)) {
      const path = prefix + file.name;
      const form = new FormData();
      form.append("file", file);
      form.append("path", path);

      const res = await fetch(
        `/api/dashboard/${projectId}/storage/${connectionId}/browse`,
        { method: "POST", body: form }
      );
      const data = await res.json();
      if (data.error) {
        toast.error(`Failed to upload ${file.name}`, data.error);
      } else {
        successCount++;
      }
    }
    setUploading(false);
    if (successCount > 0) {
      toast.success(`Uploaded ${successCount} file${successCount > 1 ? "s" : ""}`, "");
      fetchObjects(prefix);
    }
  }

  async function handleDelete(keys: string[]) {
    const res = await fetch(
      `/api/dashboard/${projectId}/storage/${connectionId}/browse`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", keys }),
      }
    );
    const data = await res.json();
    if (data.error) {
      toast.error("Delete failed", data.error);
      return;
    }
    toast.success(`Deleted ${keys.length} item${keys.length > 1 ? "s" : ""}`, "");
    setSelected(new Set());
    if (activeFile && keys.includes(activeFile.key)) setActiveFile(null);
    fetchObjects(prefix);
  }

  async function handleMkdir(name: string) {
    const folderPath = prefix + name;
    const res = await fetch(
      `/api/dashboard/${projectId}/storage/${connectionId}/browse`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mkdir", folderPath }),
      }
    );
    const data = await res.json();
    if (data.error) {
      toast.error("Failed to create folder", data.error);
    } else {
      toast.success("Folder created", "");
      fetchObjects(prefix);
    }
    setShowNewFolder(false);
  }

  const folders = objects.filter((o) => o.isFolder);
  const files = objects.filter((o) => !o.isFolder);
  const selectedKeys = [...selected];
  const hasSelection = selectedKeys.length > 0;

  // Filter by search
  const filteredFolders = search
    ? folders.filter((f) => fileBaseName(f.key).toLowerCase().includes(search.toLowerCase()))
    : folders;
  const filteredFiles = search
    ? files.filter((f) => fileBaseName(f.key).toLowerCase().includes(search.toLowerCase()))
    : files;

  // Breadcrumbs
  const breadcrumbs = [{ label: bucketName || connectionName || "Bucket", prefix: "" }];
  if (prefix) {
    const parts = prefix.replace(/\/$/, "").split("/");
    let acc = "";
    for (const part of parts) {
      acc += part + "/";
      breadcrumbs.push({ label: part, prefix: acc });
    }
  }

  return (
    <div
      className="flex h-full overflow-hidden"
      onDragEnter={() => setDragOver(true)}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files.length) handleUpload(e.dataTransfer.files);
      }}
    >
      {/* Drag overlay */}
      {dragOver && (
        <div className="absolute inset-0 z-40 bg-brand-500/10 border-2 border-dashed border-brand-500 rounded-xl flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <Upload size={32} className="text-brand-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-brand-300">Drop files to upload</p>
          </div>
        </div>
      )}

      {/* Left sidebar */}
      <LeftPanel
        connectionName={connectionName}
        bucketName={bucketName}
        prefix={prefix}
        folders={rootFolders}
        onNavigate={navigate}
        onBack={() => router.push(`/dashboard/${projectId}/storage`)}
        projectId={projectId}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 h-12 border-b border-zinc-800 shrink-0 gap-3">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1 text-sm min-w-0">
            {breadcrumbs.map((crumb, i) => (
              <span key={crumb.prefix} className="flex items-center gap-1 shrink-0">
                {i > 0 && <ChevronRight size={12} className="text-zinc-700" />}
                <button
                  onClick={() => navigate(crumb.prefix)}
                  className={`cursor-pointer transition-colors rounded px-1 py-0.5 text-xs ${
                    i === breadcrumbs.length - 1
                      ? "text-white font-medium"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {crumb.label}
                </button>
              </span>
            ))}
          </nav>

          {/* Right actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            {hasSelection && (
              <button
                onClick={() => handleDelete(selectedKeys)}
                className="cursor-pointer flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/20 transition-colors"
              >
                <Trash2 size={11} />
                Delete ({selectedKeys.length})
              </button>
            )}
            <button
              onClick={() => setShowNewFolder(true)}
              className="cursor-pointer flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-zinc-700 transition-colors"
            >
              <Plus size={11} />
              Create folder
            </button>
            <button
              onClick={() => uploadInputRef.current?.click()}
              disabled={uploading}
              className="cursor-pointer flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-white bg-brand-500 hover:bg-brand-600 transition-colors disabled:opacity-50"
            >
              {uploading ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
              Upload files
            </button>
            <input
              ref={uploadInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => e.target.files?.length && handleUpload(e.target.files)}
            />
            <button
              onClick={() => fetchObjects(prefix)}
              className="cursor-pointer p-1.5 rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
            >
              <RefreshCw size={12} />
            </button>
          </div>
        </div>

        {/* Search bar */}
        <div className="px-4 py-2 border-b border-zinc-800 shrink-0">
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search files and folders…"
              className="w-full pl-7 pr-3 py-1.5 text-xs bg-zinc-800/50 border border-zinc-700/50 rounded-lg text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
            />
          </div>
        </div>

        {/* File list */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-full text-zinc-600 text-sm">
              <Loader2 size={16} className="animate-spin mr-2" />
              Loading…
            </div>
          ) : filteredFolders.length === 0 && filteredFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              {search ? (
                <>
                  <Search size={24} className="text-zinc-700 mb-3" />
                  <p className="text-sm text-zinc-500">No results for &ldquo;{search}&rdquo;</p>
                </>
              ) : (
                <>
                  <div className="w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center mb-3">
                    <Upload size={18} className="text-zinc-600" />
                  </div>
                  <p className="text-sm font-medium text-zinc-400 mb-1">This folder is empty</p>
                  <p className="text-xs text-zinc-600 mb-4">Drop files here or click Upload files to get started</p>
                  <button
                    onClick={() => uploadInputRef.current?.click()}
                    className="cursor-pointer flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-white bg-brand-500 hover:bg-brand-600 transition-colors"
                  >
                    <Upload size={11} />
                    Upload files
                  </button>
                </>
              )}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-zinc-950">
                <tr className="border-b border-zinc-800 text-zinc-600 text-xs">
                  <th className="px-4 py-2.5 w-8 text-left">
                    <input
                      type="checkbox"
                      checked={selected.size === objects.length && objects.length > 0}
                      onChange={() => {
                        if (selected.size === objects.length) setSelected(new Set());
                        else setSelected(new Set(objects.map((o) => o.key)));
                      }}
                      className="accent-brand-500 cursor-pointer"
                    />
                  </th>
                  <th className="text-left px-2 py-2.5 font-medium">Name</th>
                  <th className="text-right px-4 py-2.5 font-medium w-24">Size</th>
                  <th className="text-right px-4 py-2.5 font-medium w-32">Last modified</th>
                  <th className="px-4 py-2.5 w-10" />
                </tr>
              </thead>
              <tbody>
                {filteredFolders.map((obj) => {
                  const name = fileBaseName(obj.key) || obj.key;
                  const isActive = activeFile?.key === obj.key;
                  return (
                    <tr
                      key={obj.key}
                      onClick={() => navigate(obj.key)}
                      className={`border-b border-zinc-800/40 hover:bg-zinc-800/30 transition-colors cursor-pointer group ${isActive ? "bg-zinc-800/40" : ""}`}
                    >
                      <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(obj.key)}
                          onChange={() => toggleSelect(obj.key)}
                          className="accent-brand-500 cursor-pointer"
                        />
                      </td>
                      <td className="px-2 py-2.5">
                        <span className="flex items-center gap-2">
                          <Folder size={14} className="text-yellow-400 shrink-0" />
                          <span className="text-xs text-zinc-300 font-medium">{name}</span>
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-zinc-700 text-xs">—</td>
                      <td className="px-4 py-2.5 text-right text-zinc-700 text-xs">—</td>
                      <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleDelete([obj.key])}
                          className="cursor-pointer opacity-0 group-hover:opacity-100 p-1 rounded text-zinc-600 hover:text-red-400 transition-all"
                          title="Delete"
                        >
                          <MoreHorizontal size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {filteredFiles.map((obj) => {
                  const name = fileBaseName(obj.key);
                  const isActive = activeFile?.key === obj.key;
                  return (
                    <tr
                      key={obj.key}
                      onClick={() => setActiveFile(isActive ? null : obj)}
                      className={`border-b border-zinc-800/40 last:border-0 hover:bg-zinc-800/30 transition-colors cursor-pointer group ${isActive ? "bg-zinc-800/40" : ""}`}
                    >
                      <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(obj.key)}
                          onChange={() => toggleSelect(obj.key)}
                          className="accent-brand-500 cursor-pointer"
                        />
                      </td>
                      <td className="px-2 py-2.5">
                        <span className="flex items-center gap-2">
                          <FileIcon name={name} size={14} />
                          <span className="text-xs text-zinc-300">{name}</span>
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-zinc-500 text-xs font-mono">
                        {formatBytes(obj.size)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-zinc-500 text-xs">
                        {formatDate(obj.lastModified)}
                      </td>
                      <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleDelete([obj.key])}
                          className="cursor-pointer opacity-0 group-hover:opacity-100 p-1 rounded text-zinc-600 hover:text-red-400 transition-all"
                          title="Delete"
                        >
                          <MoreHorizontal size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Right detail panel */}
      {activeFile && (
        <DetailPanel
          object={activeFile}
          projectId={projectId}
          connectionId={connectionId}
          onClose={() => setActiveFile(null)}
          onDelete={(key) => handleDelete([key])}
        />
      )}

      {/* New folder modal */}
      {showNewFolder && (
        <NewFolderModal
          onConfirm={handleMkdir}
          onCancel={() => setShowNewFolder(false)}
        />
      )}
    </div>
  );
}
