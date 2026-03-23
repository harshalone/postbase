"use client";

import { useState, useEffect, useCallback, use } from "react";
import {
  Plus,
  Trash2,
  RefreshCw,
  X,
  CheckCircle2,
  XCircle,
  Loader2,
  Star,
  Pencil,
  HardDrive,
  Eye,
  EyeOff,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Provider = "s3" | "r2" | "backblaze" | "gcs" | "other";

type StorageConnection = {
  id: string;
  name: string;
  provider: Provider;
  bucket: string;
  region: string | null;
  endpoint: string | null;
  accessKeyId: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

type FormState = {
  name: string;
  provider: Provider;
  bucket: string;
  region: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  isDefault: boolean;
};

const BLANK_FORM: FormState = {
  name: "",
  provider: "s3",
  bucket: "",
  region: "",
  endpoint: "",
  accessKeyId: "",
  secretAccessKey: "",
  isDefault: false,
};

// ─── Provider metadata ────────────────────────────────────────────────────────

const PROVIDERS: { id: Provider; label: string; logo: string; needsEndpoint: boolean; regionPlaceholder?: string; endpointPlaceholder?: string }[] = [
  {
    id: "s3",
    label: "Amazon S3",
    logo: "https://upload.wikimedia.org/wikipedia/commons/b/bc/Amazon-S3-Logo.svg",
    needsEndpoint: false,
    regionPlaceholder: "us-east-1",
  },
  {
    id: "r2",
    label: "Cloudflare R2",
    logo: "https://upload.wikimedia.org/wikipedia/commons/4/4b/Cloudflare_Logo.svg",
    needsEndpoint: true,
    endpointPlaceholder: "https://<account-id>.r2.cloudflarestorage.com",
  },
  {
    id: "backblaze",
    label: "Backblaze B2",
    logo: "https://upload.wikimedia.org/wikipedia/commons/6/69/Backblaze_logo.svg",
    needsEndpoint: true,
    regionPlaceholder: "us-west-001",
    endpointPlaceholder: "https://s3.us-west-001.backblazeb2.com",
  },
  {
    id: "gcs",
    label: "Google Cloud Storage",
    logo: "https://upload.wikimedia.org/wikipedia/commons/5/51/Google_Cloud_Storage_logo.svg",
    needsEndpoint: false,
    regionPlaceholder: "us-central1",
  },
  {
    id: "other",
    label: "S3-Compatible",
    logo: "",
    needsEndpoint: true,
    endpointPlaceholder: "https://your-s3-endpoint.example.com",
  },
];

function providerMeta(id: Provider) {
  return PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[PROVIDERS.length - 1];
}

// ─── Provider icon ─────────────────────────────────────────────────────────────

function ProviderBadge({ provider, size = "sm" }: { provider: Provider; size?: "sm" | "lg" }) {
  const meta = providerMeta(provider);
  const cls = size === "lg" ? "w-8 h-8" : "w-5 h-5";
  const labelMap: Record<Provider, string> = {
    s3: "S3",
    r2: "R2",
    backblaze: "B2",
    gcs: "GCS",
    other: "S3",
  };

  if (!meta.logo) {
    return (
      <span className={`${cls} flex items-center justify-center rounded bg-zinc-700 text-zinc-300 text-[9px] font-bold`}>
        {labelMap[provider]}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={meta.logo}
      alt={meta.label}
      className={`${cls} object-contain`}
      onError={(e) => {
        (e.target as HTMLImageElement).style.display = "none";
      }}
    />
  );
}

// ─── Connection row ────────────────────────────────────────────────────────────

function ConnectionRow({
  conn,
  onEdit,
  onDelete,
  onTest,
  onSetDefault,
}: {
  conn: StorageConnection;
  onEdit: (c: StorageConnection) => void;
  onDelete: (c: StorageConnection) => void;
  onTest: (c: StorageConnection) => void;
  onSetDefault: (c: StorageConnection) => void;
}) {
  const meta = providerMeta(conn.provider);

  return (
    <tr className="border-b border-zinc-800 hover:bg-zinc-800/40 transition-colors group">
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <ProviderBadge provider={conn.provider} />
          <div>
            <p className="text-sm font-medium text-white flex items-center gap-2">
              {conn.name}
              {conn.isDefault && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-500/20 text-brand-400 font-semibold uppercase tracking-wider">
                  Default
                </span>
              )}
            </p>
            <p className="text-xs text-zinc-500 mt-0.5">{meta.label}</p>
          </div>
        </div>
      </td>
      <td className="px-6 py-4">
        <span className="text-sm font-mono text-zinc-300">{conn.bucket}</span>
      </td>
      <td className="px-6 py-4">
        <span className="text-sm text-zinc-400">
          {conn.endpoint
            ? new URL(conn.endpoint).hostname
            : conn.region || "—"}
        </span>
      </td>
      <td className="px-6 py-4">
        <span className="text-xs font-mono text-zinc-500">{conn.accessKeyId}</span>
      </td>
      <td className="px-6 py-4 text-right">
        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {!conn.isDefault && (
            <button
              onClick={() => onSetDefault(conn)}
              title="Set as default"
              className="cursor-pointer p-1.5 rounded text-zinc-600 hover:text-yellow-400 hover:bg-zinc-800 transition-colors"
            >
              <Star size={13} />
            </button>
          )}
          <button
            onClick={() => onTest(conn)}
            title="Test connection"
            className="cursor-pointer px-2.5 py-1.5 rounded text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          >
            Test
          </button>
          <button
            onClick={() => onEdit(conn)}
            className="cursor-pointer p-1.5 rounded text-zinc-600 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={() => onDelete(conn)}
            className="cursor-pointer p-1.5 rounded text-zinc-600 hover:text-red-400 hover:bg-zinc-800 transition-colors"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── Connection form ──────────────────────────────────────────────────────────

function ConnectionForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial: FormState;
  onSave: (f: FormState) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<FormState>(initial);
  const [showSecret, setShowSecret] = useState(false);
  const meta = providerMeta(form.provider);

  function set(key: keyof FormState, value: string | boolean) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const isEdit = !!initial.accessKeyId && initial.accessKeyId !== "";

  return (
    <div className="space-y-5">
      {/* Provider selector */}
      <div>
        <label className="block text-xs text-zinc-400 mb-2">Provider</label>
        <div className="grid grid-cols-3 gap-2">
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                set("provider", p.id);
                set("endpoint", "");
                set("region", "");
              }}
              className={`cursor-pointer flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                form.provider === p.id
                  ? "border-brand-500 bg-brand-500/10 text-white"
                  : "border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
              }`}
            >
              <ProviderBadge provider={p.id} />
              <span className="truncate text-xs">{p.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Name */}
      <div>
        <label className="block text-xs text-zinc-400 mb-1.5">Connection name</label>
        <input
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="My S3 bucket"
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-brand-500"
        />
      </div>

      {/* Bucket + Region */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-zinc-400 mb-1.5">Bucket name</label>
          <input
            value={form.bucket}
            onChange={(e) => set("bucket", e.target.value)}
            placeholder="my-bucket"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-brand-500"
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1.5">
            Region
            {!meta.needsEndpoint && <span className="text-zinc-600 ml-1">(required)</span>}
          </label>
          <input
            value={form.region}
            onChange={(e) => set("region", e.target.value)}
            placeholder={meta.regionPlaceholder ?? "us-east-1"}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-brand-500"
          />
        </div>
      </div>

      {/* Endpoint (for R2, Backblaze, other) */}
      {meta.needsEndpoint && (
        <div>
          <label className="block text-xs text-zinc-400 mb-1.5">
            Endpoint URL
            <span className="text-zinc-600 ml-1">(required for {meta.label})</span>
          </label>
          <input
            value={form.endpoint}
            onChange={(e) => set("endpoint", e.target.value)}
            placeholder={meta.endpointPlaceholder}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-brand-500"
          />
        </div>
      )}

      {/* Credentials */}
      <div>
        <label className="block text-xs text-zinc-400 mb-1.5">Access Key ID</label>
        <input
          value={form.accessKeyId}
          onChange={(e) => set("accessKeyId", e.target.value)}
          placeholder="AKIAIOSFODNN7EXAMPLE"
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-brand-500"
        />
      </div>

      <div>
        <label className="block text-xs text-zinc-400 mb-1.5">
          Secret Access Key
          {isEdit && <span className="text-zinc-600 ml-1">(leave blank to keep existing)</span>}
        </label>
        <div className="relative">
          <input
            type={showSecret ? "text" : "password"}
            value={form.secretAccessKey}
            onChange={(e) => set("secretAccessKey", e.target.value)}
            placeholder={isEdit ? "••••••••••••••••" : "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 pr-10 text-sm font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-brand-500"
          />
          <button
            type="button"
            onClick={() => setShowSecret((v) => !v)}
            className="cursor-pointer absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-300"
          >
            {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>

      {/* Default toggle */}
      <label className="flex items-center gap-3 cursor-pointer select-none">
        <div
          onClick={() => set("isDefault", !form.isDefault)}
          className={`relative w-9 h-5 rounded-full transition-colors ${
            form.isDefault ? "bg-brand-500" : "bg-zinc-700"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
              form.isDefault ? "translate-x-4" : "translate-x-0"
            }`}
          />
        </div>
        <span className="text-sm text-zinc-300">Set as default storage connection</span>
      </label>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-2 border-t border-zinc-800">
        <button
          onClick={onCancel}
          className="cursor-pointer px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={() => onSave(form)}
          disabled={saving || !form.name || !form.bucket || !form.accessKeyId}
          className="cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium transition-colors"
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          {saving ? "Saving…" : isEdit ? "Save Changes" : "Add Connection"}
        </button>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function StoragePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);

  const [connections, setConnections] = useState<StorageConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<StorageConnection | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null); // connectionId being tested
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; message: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<StorageConnection | null>(null);

  const fetchConnections = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard/${projectId}/storage`);
      const data = await res.json();
      setConnections(data.connections ?? []);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  async function handleSave(form: FormState) {
    setSaving(true);
    try {
      if (editTarget) {
        // PATCH existing
        const body: Record<string, unknown> = {
          name: form.name,
          bucket: form.bucket,
          region: form.region || undefined,
          endpoint: form.endpoint || undefined,
          accessKeyId: form.accessKeyId,
          isDefault: form.isDefault,
        };
        if (form.secretAccessKey) body.secretAccessKey = form.secretAccessKey;

        const res = await fetch(
          `/api/dashboard/${projectId}/storage/${editTarget.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        );
        const data = await res.json();
        if (data.error) { alert(JSON.stringify(data.error)); return; }
      } else {
        // POST new
        const res = await fetch(`/api/dashboard/${projectId}/storage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...form,
            region: form.region || undefined,
            endpoint: form.endpoint || undefined,
          }),
        });
        const data = await res.json();
        if (data.error) { alert(JSON.stringify(data.error)); return; }
      }

      setShowForm(false);
      setEditTarget(null);
      fetchConnections();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(conn: StorageConnection) {
    const res = await fetch(
      `/api/dashboard/${projectId}/storage/${conn.id}`,
      { method: "DELETE" }
    );
    const data = await res.json();
    if (data.error) { alert(data.error); return; }
    setDeleteConfirm(null);
    fetchConnections();
  }

  async function handleTest(conn: StorageConnection) {
    setTesting(conn.id);
    setTestResult(null);
    try {
      const res = await fetch(
        `/api/dashboard/${projectId}/storage/${conn.id}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "test" }),
        }
      );
      const data = await res.json();
      setTestResult({ id: conn.id, ...data });
    } finally {
      setTesting(null);
    }
  }

  async function handleSetDefault(conn: StorageConnection) {
    await fetch(`/api/dashboard/${projectId}/storage/${conn.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDefault: true }),
    });
    fetchConnections();
  }

  function openAdd() {
    setEditTarget(null);
    setShowForm(true);
    setTestResult(null);
  }

  function openEdit(conn: StorageConnection) {
    setEditTarget(conn);
    setShowForm(true);
    setTestResult(null);
  }

  const formInitial: FormState = editTarget
    ? {
        name: editTarget.name,
        provider: editTarget.provider,
        bucket: editTarget.bucket,
        region: editTarget.region ?? "",
        endpoint: editTarget.endpoint ?? "",
        accessKeyId: editTarget.accessKeyId,
        secretAccessKey: "",
        isDefault: editTarget.isDefault,
      }
    : BLANK_FORM;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 h-14 border-b border-zinc-800 shrink-0">
        <h1 className="text-sm font-semibold text-white">Storage</h1>
        <div className="flex gap-2">
          <button
            onClick={fetchConnections}
            className="cursor-pointer p-2 rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            <RefreshCw size={14} />
          </button>
          <button
            onClick={openAdd}
            className="cursor-pointer flex items-center gap-2 px-3 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-xs font-medium transition-colors"
          >
            <Plus size={13} />
            Add Connection
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-zinc-600 text-sm">
            <Loader2 size={18} className="animate-spin mr-2" />
            Loading…
          </div>
        ) : connections.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-2xl bg-zinc-800 flex items-center justify-center mb-4">
              <HardDrive size={24} className="text-zinc-500" />
            </div>
            <p className="text-base font-semibold text-zinc-300 mb-1">No storage connections</p>
            <p className="text-sm text-zinc-500 max-w-sm">
              Connect AWS S3, Cloudflare R2, Backblaze B2, or any S3-compatible provider.
            </p>
            <button
              onClick={openAdd}
              className="cursor-pointer mt-5 flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium transition-colors"
            >
              <Plus size={14} />
              Add your first connection
            </button>
          </div>
        ) : (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500 text-xs uppercase tracking-wider">
                  <th className="text-left px-6 py-3 font-medium">Name</th>
                  <th className="text-left px-6 py-3 font-medium">Bucket</th>
                  <th className="text-left px-6 py-3 font-medium">Endpoint / Region</th>
                  <th className="text-left px-6 py-3 font-medium">Access Key</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody>
                {connections.map((conn) => (
                  <ConnectionRow
                    key={conn.id}
                    conn={conn}
                    onEdit={openEdit}
                    onDelete={(c) => setDeleteConfirm(c)}
                    onTest={handleTest}
                    onSetDefault={handleSetDefault}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Test result toast */}
        {testResult && (
          <div
            className={`fixed bottom-6 right-6 flex items-start gap-3 px-4 py-3 rounded-xl border shadow-2xl max-w-sm z-50 ${
              testResult.success
                ? "bg-zinc-900 border-green-700 text-green-300"
                : "bg-zinc-900 border-red-700 text-red-300"
            }`}
          >
            {testResult.success ? (
              <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
            ) : (
              <XCircle size={18} className="shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">
                {testResult.success ? "Connection successful" : "Connection failed"}
              </p>
              <p className="text-xs mt-0.5 opacity-75">{testResult.message}</p>
            </div>
            <button
              onClick={() => setTestResult(null)}
              className="cursor-pointer shrink-0 text-zinc-600 hover:text-zinc-300"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Testing indicator */}
        {testing && (
          <div className="fixed bottom-6 right-6 flex items-center gap-3 px-4 py-3 rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl z-50">
            <Loader2 size={16} className="animate-spin text-zinc-400" />
            <span className="text-sm text-zinc-400">Testing connection…</span>
          </div>
        )}
      </div>

      {/* ── Add / Edit dialog ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-xl mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 sticky top-0 bg-zinc-900 z-10">
              <h2 className="text-lg font-semibold text-white">
                {editTarget ? "Edit Connection" : "Add Storage Connection"}
              </h2>
              <button
                onClick={() => { setShowForm(false); setEditTarget(null); }}
                className="cursor-pointer p-1.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            <div className="px-6 py-5">
              <ConnectionForm
                initial={formInitial}
                onSave={handleSave}
                onCancel={() => { setShowForm(false); setEditTarget(null); }}
                saving={saving}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirm dialog ── */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-sm mx-4 shadow-2xl">
            <div className="px-6 py-5">
              <h2 className="text-base font-semibold text-white mb-2">Delete connection?</h2>
              <p className="text-sm text-zinc-400">
                This will permanently remove{" "}
                <span className="text-white font-medium">{deleteConfirm.name}</span>. This
                action cannot be undone.
              </p>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-zinc-800">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="cursor-pointer px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="cursor-pointer px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
