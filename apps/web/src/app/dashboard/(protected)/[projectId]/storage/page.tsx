"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { useSlidePanel } from "@/hooks/use-slide-panel";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Trash2,
  RefreshCw,
  X,
  Loader2,
  Star,
  Pencil,
  HardDrive,
  Eye,
  EyeOff,
  Info,
  Copy,
  Check,
  FolderOpen,
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

const PROVIDERS: {
  id: Provider;
  label: string;
  logo: string;
  needsEndpoint: boolean;
  regionPlaceholder?: string;
  endpointPlaceholder?: string;
}[] = [
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
    endpointPlaceholder: "https://<ACCOUNT_ID>.r2.cloudflarestorage.com",
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

function ProviderBadge({
  provider,
  size = "sm",
}: {
  provider: Provider;
  size?: "sm" | "lg";
}) {
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
      <span
        className={`${cls} flex items-center justify-center rounded bg-zinc-700 text-zinc-300 text-[9px] font-bold`}
      >
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

// ─── Inline copy button ───────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="cursor-pointer ml-1 text-zinc-600 hover:text-zinc-300 transition-colors"
      title="Copy"
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
    </button>
  );
}

// ─── Cloudflare R2 setup guide ─────────────────────────────────────────────────

function R2SetupGuide({ bucket }: { bucket: string }) {
  const corsJson = JSON.stringify(
    [
      {
        AllowedOrigins: ["https://your-domain.com", "http://localhost:3000"],
        AllowedMethods: ["GET", "PUT", "DELETE"],
      },
    ],
    null,
    2
  );

  return (
    <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-4 space-y-3">
      <div className="flex items-center gap-2 text-orange-400">
        <Info size={14} />
        <span className="text-xs font-semibold uppercase tracking-wider">
          Cloudflare R2 Setup Guide
        </span>
      </div>

      <div className="space-y-2.5 text-xs text-zinc-400">
        <p>
          Follow these steps in your{" "}
          <span className="text-zinc-300 font-medium">
            Cloudflare Dashboard → R2 Object Storage
          </span>
          :
        </p>

        <ol className="space-y-2 list-decimal list-inside marker:text-zinc-600">
          <li>
            <span className="text-zinc-300">Find your Account ID</span> — top
            right of any Cloudflare dashboard page. Paste it into{" "}
            <em>Account ID</em> below and it will build the S3 API URL for you.
          </li>
          <li>
            <span className="text-zinc-300">Create an API Token</span> — go to{" "}
            <span className="font-medium text-zinc-300">
              R2 → Manage API tokens → Create API token
            </span>
            . Choose{" "}
            <span className="font-medium text-zinc-300">
              Object Read &amp; Write
            </span>{" "}
            permissions scoped to your bucket.
            <div className="mt-1.5 rounded bg-zinc-800/60 px-3 py-2 space-y-1">
              <p>
                <span className="text-zinc-500">Access Key ID</span> → paste
                into <em>Access Key ID</em> below
              </p>
              <p>
                <span className="text-zinc-500">Secret Access Key</span> →
                paste into <em>Secret Access Key</em> below
              </p>
            </div>
            <p className="mt-1 text-zinc-600">
              Note: these are S3-compatible token credentials, not your
              Cloudflare Account API Token or User API Token.
            </p>
          </li>
          {bucket && (
            <li>
              <span className="text-zinc-300">Set CORS policy</span> on bucket{" "}
              <span className="font-mono text-brand-400">{bucket}</span> — go to{" "}
              <span className="text-zinc-300">
                R2 → {bucket} → Settings → CORS Policy
              </span>{" "}
              and add your allowed origins:
              <div className="relative mt-1.5">
                <pre className="rounded bg-zinc-800/60 px-3 py-2 text-[10px] text-zinc-300 overflow-x-auto whitespace-pre-wrap break-all">
                  {corsJson}
                </pre>
                <span className="absolute top-1.5 right-2">
                  <CopyButton text={corsJson} />
                </span>
              </div>
              <p className="mt-1 text-zinc-600">
                Replace{" "}
                <code className="text-zinc-400">https://your-domain.com</code>{" "}
                with your actual domain(s).
              </p>
            </li>
          )}
          {!bucket && (
            <li>
              <span className="text-zinc-300">Set CORS policy</span> on your
              bucket — go to{" "}
              <span className="text-zinc-300">
                R2 → [your bucket] → Settings → CORS Policy
              </span>
              . Add your app&apos;s origin(s) to{" "}
              <code className="text-zinc-400">AllowedOrigins</code> with methods{" "}
              <code className="text-zinc-400">GET, PUT, DELETE</code>.
            </li>
          )}
        </ol>
      </div>
    </div>
  );
}

// ─── Account ID helper for R2 ─────────────────────────────────────────────────

function R2AccountIdField({
  accountId,
  onChange,
  onEndpointChange,
}: {
  accountId: string;
  onChange: (v: string) => void;
  onEndpointChange: (v: string) => void;
}) {
  function handleChange(v: string) {
    onChange(v);
    if (v.trim()) {
      onEndpointChange(`https://${v.trim()}.r2.cloudflarestorage.com`);
    } else {
      onEndpointChange("");
    }
  }

  return (
    <div>
      <label className="block text-xs text-zinc-400 mb-1.5">
        Account ID
        <span className="text-zinc-600 ml-1">(required)</span>
      </label>
      <input
        value={accountId}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="abc123def456..."
        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-brand-500"
      />
      <p className="mt-1 text-[11px] text-zinc-600">
        Found on your Cloudflare dashboard (top-right corner).
      </p>
    </div>
  );
}

// ─── Connection row ────────────────────────────────────────────────────────────

function ConnectionRow({
  conn,
  onBrowse,
  onEdit,
  onDelete,
  onTest,
  onSetDefault,
}: {
  conn: StorageConnection;
  onBrowse: (c: StorageConnection) => void;
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
            <button
              onClick={() => onBrowse(conn)}
              className="cursor-pointer text-left hover:text-brand-400 transition-colors"
            >
              <p className="text-sm font-medium text-white flex items-center gap-2">
                {conn.name}
                {conn.isDefault && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-500/20 text-brand-400 font-semibold uppercase tracking-wider">
                    Default
                  </span>
                )}
              </p>
            </button>
            <p className="text-xs text-zinc-500 mt-0.5">{meta.label}</p>
          </div>
        </div>
      </td>
      <td className="px-6 py-4">
        <span className="text-sm font-mono text-zinc-300">{conn.bucket}</span>
      </td>
      <td className="px-6 py-4">
        <span className="text-sm text-zinc-400">
          {conn.endpoint ? new URL(conn.endpoint).hostname : conn.region || "—"}
        </span>
      </td>
      <td className="px-6 py-4">
        <span className="text-xs font-mono text-zinc-500">
          {conn.accessKeyId}
        </span>
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
            onClick={() => onBrowse(conn)}
            title="Browse files"
            className="cursor-pointer flex items-center gap-1 px-2.5 py-1.5 rounded text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          >
            <FolderOpen size={12} />
            Browse
          </button>
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
  onChange,
}: {
  initial: FormState;
  onChange: (f: FormState) => void;
}) {
  const [form, setForm] = useState<FormState>(initial);
  const [showSecret, setShowSecret] = useState(false);
  // For R2 we track account ID separately to auto-build the endpoint URL
  const [r2AccountId, setR2AccountId] = useState(() => {
    if (initial.provider === "r2" && initial.endpoint) {
      const match = initial.endpoint.match(
        /^https:\/\/([^.]+)\.r2\.cloudflarestorage\.com/
      );
      return match ? match[1] : "";
    }
    return "";
  });

  const meta = providerMeta(form.provider);

  useEffect(() => {
    onChange(form);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  function set(key: keyof FormState, value: string | boolean) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const isEdit = !!initial.accessKeyId && initial.accessKeyId !== "";

  function handleProviderChange(id: Provider) {
    set("provider", id);
    set("endpoint", "");
    set("region", "");
    setR2AccountId("");
  }

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
              onClick={() => handleProviderChange(p.id)}
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

      {/* R2 setup guide */}
      {form.provider === "r2" && <R2SetupGuide bucket={form.bucket} />}

      {/* Name */}
      <div>
        <label className="block text-xs text-zinc-400 mb-1.5">
          Connection name
        </label>
        <input
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder={
            form.provider === "r2" ? "My R2 Bucket" : "My S3 bucket"
          }
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-brand-500"
        />
      </div>

      {/* Bucket + Region */}
      <div className={form.provider === "r2" ? "" : "grid grid-cols-2 gap-3"}>
        <div>
          <label className="block text-xs text-zinc-400 mb-1.5">
            Bucket name
          </label>
          <input
            value={form.bucket}
            onChange={(e) => set("bucket", e.target.value)}
            placeholder="my-bucket"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-brand-500"
          />
          {form.provider === "r2" && (
            <p className="mt-1 text-[11px] text-zinc-600">
              The name of your R2 bucket in Cloudflare dashboard.
            </p>
          )}
        </div>
        {form.provider !== "r2" && (
          <div>
            <label className="block text-xs text-zinc-400 mb-1.5">
              Region
              {!meta.needsEndpoint && (
                <span className="text-zinc-600 ml-1">(required)</span>
              )}
            </label>
            <input
              value={form.region}
              onChange={(e) => set("region", e.target.value)}
              placeholder={meta.regionPlaceholder ?? "us-east-1"}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-brand-500"
            />
          </div>
        )}
      </div>

      {/* R2-specific: Account ID + derived S3 API URL */}
      {form.provider === "r2" && (
        <>
          <R2AccountIdField
            accountId={r2AccountId}
            onChange={setR2AccountId}
            onEndpointChange={(v) => set("endpoint", v)}
          />

          <div>
            <label className="block text-xs text-zinc-400 mb-1.5">
              S3 API URL
              <span className="text-zinc-600 ml-1">(auto-generated)</span>
            </label>
            <input
              value={form.endpoint}
              onChange={(e) => set("endpoint", e.target.value)}
              placeholder="https://<ACCOUNT_ID>.r2.cloudflarestorage.com"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-brand-500"
            />
            <p className="mt-1 text-[11px] text-zinc-600">
              Auto-filled from Account ID above. You can also find this under{" "}
              <span className="text-zinc-500">
                R2 → [bucket] → Settings → S3 API
              </span>
              .
            </p>
          </div>
        </>
      )}

      {/* Endpoint for non-R2 providers that need it */}
      {meta.needsEndpoint && form.provider !== "r2" && (
        <div>
          <label className="block text-xs text-zinc-400 mb-1.5">
            Endpoint URL
            <span className="text-zinc-600 ml-1">
              (required for {meta.label})
            </span>
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
        <label className="block text-xs text-zinc-400 mb-1.5">
          {form.provider === "r2" ? "Access Key ID" : "Access Key ID"}
        </label>
        <input
          value={form.accessKeyId}
          onChange={(e) => set("accessKeyId", e.target.value)}
          placeholder={
            form.provider === "r2"
              ? "From R2 API token → Access Key ID"
              : "AKIAIOSFODNN7EXAMPLE"
          }
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-brand-500"
        />
        {form.provider === "r2" && (
          <p className="mt-1 text-[11px] text-zinc-600">
            From{" "}
            <span className="text-zinc-500">
              R2 → Manage API tokens → Create API token → Access Key ID
            </span>
            . This is the S3-compatible token, not your Cloudflare Account or
            User API Token.
          </p>
        )}
      </div>

      <div>
        <label className="block text-xs text-zinc-400 mb-1.5">
          {form.provider === "r2" ? "Secret Access Key" : "Secret Access Key"}
          {isEdit && (
            <span className="text-zinc-600 ml-1">
              (leave blank to keep existing)
            </span>
          )}
        </label>
        <div className="relative">
          <input
            type={showSecret ? "text" : "password"}
            value={form.secretAccessKey}
            onChange={(e) => set("secretAccessKey", e.target.value)}
            placeholder={
              isEdit
                ? "••••••••••••••••"
                : form.provider === "r2"
                  ? "From R2 API token → Secret Access Key"
                  : "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
            }
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
        {form.provider === "r2" && (
          <p className="mt-1 text-[11px] text-zinc-600">
            From{" "}
            <span className="text-zinc-500">
              R2 → Manage API tokens → Create API token → Secret Access Key
            </span>
            .
          </p>
        )}
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
        <span className="text-sm text-zinc-300">
          Set as default storage connection
        </span>
      </label>
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
  const router = useRouter();
  const toast = useToast();
  const formPanel = useSlidePanel();

  const [connections, setConnections] = useState<StorageConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [editTarget, setEditTarget] = useState<StorageConnection | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<StorageConnection | null>(
    null
  );
  const [formKey, setFormKey] = useState(0);

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

  // We hold form state at the page level so the footer Save button can trigger it
  const [pendingForm, setPendingForm] = useState<FormState>(BLANK_FORM);

  async function handleSave(form: FormState) {
    setSaving(true);
    try {
      if (editTarget) {
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
        if (data.error) {
          toast.error(
            typeof data.error === "string"
              ? data.error
              : JSON.stringify(data.error)
          );
          return;
        }
      } else {
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
        if (data.error) {
          toast.error(
            typeof data.error === "string"
              ? data.error
              : JSON.stringify(data.error)
          );
          return;
        }
      }

      formPanel.close();
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
    if (data.error) {
      toast.error(data.error);
      return;
    }
    setDeleteConfirm(null);
    fetchConnections();
  }

  async function handleTest(conn: StorageConnection) {
    setTesting(conn.id);
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
      if (data.success) {
        toast.success("Connection successful", data.message);
      } else {
        toast.error("Connection failed", data.message);
      }
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
    setPendingForm(BLANK_FORM);
    setFormKey((k) => k + 1);
    formPanel.open();
  }

  function openEdit(conn: StorageConnection) {
    setEditTarget(conn);
    const initial: FormState = {
      name: conn.name,
      provider: conn.provider,
      bucket: conn.bucket,
      region: conn.region ?? "",
      endpoint: conn.endpoint ?? "",
      accessKeyId: conn.accessKeyId,
      secretAccessKey: "",
      isDefault: conn.isDefault,
    };
    setPendingForm(initial);
    setFormKey((k) => k + 1);
    formPanel.open();
  }

  function closePanel() {
    formPanel.close();
    setEditTarget(null);
  }

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
            <p className="text-base font-semibold text-zinc-300 mb-1">
              No storage connections
            </p>
            <p className="text-sm text-zinc-500 max-w-sm">
              Connect AWS S3, Cloudflare R2, Backblaze B2, or any
              S3-compatible provider.
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
                  <th className="text-left px-6 py-3 font-medium">
                    Endpoint / Region
                  </th>
                  <th className="text-left px-6 py-3 font-medium">
                    Access Key
                  </th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody>
                {connections.map((conn) => (
                  <ConnectionRow
                    key={conn.id}
                    conn={conn}
                    onBrowse={(c) => router.push(`/dashboard/${projectId}/storage/${c.id}`)}
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

        {/* Testing indicator */}
        {testing && (
          <div className="fixed bottom-6 right-6 flex items-center gap-3 px-4 py-3 rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl z-50">
            <Loader2 size={16} className="animate-spin text-zinc-400" />
            <span className="text-sm text-zinc-400">Testing connection…</span>
          </div>
        )}
      </div>

      {/* ── Add / Edit slide panel ── */}
      {formPanel.visible && (
        <>
          <div
            className={`slide-panel-backdrop fixed inset-0 z-40 bg-black/50 ${formPanel.closing ? "closing" : ""}`}
            onClick={closePanel}
          />
          <div
            className={`slide-panel fixed inset-y-0 right-0 z-50 w-[560px] bg-zinc-950 border-l border-zinc-800 flex flex-col shadow-2xl ${formPanel.closing ? "closing" : ""}`}
          >
            {/* Panel header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-800 shrink-0">
              <div>
                <h2 className="text-base font-semibold text-white">
                  {editTarget ? "Edit Connection" : "Add Storage Connection"}
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {editTarget
                    ? "Update your storage connection settings"
                    : "Connect a cloud storage bucket to your project"}
                </p>
              </div>
              <button
                onClick={closePanel}
                className="cursor-pointer p-1.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Scrollable form body */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <ConnectionForm
                key={formKey}
                initial={pendingForm}
                onChange={setPendingForm}
              />
            </div>

            {/* Panel footer actions */}
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-zinc-800 shrink-0">
              <button
                onClick={closePanel}
                className="cursor-pointer px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSave(pendingForm)}
                disabled={
                  saving ||
                  !pendingForm.name ||
                  !pendingForm.bucket ||
                  !pendingForm.accessKeyId
                }
                className="cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium transition-colors"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                {saving
                  ? "Saving…"
                  : editTarget
                    ? "Save Changes"
                    : "Add Connection"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Delete confirm dialog ── */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-sm mx-4 shadow-2xl">
            <div className="px-6 py-5">
              <h2 className="text-base font-semibold text-white mb-2">
                Delete connection?
              </h2>
              <p className="text-sm text-zinc-400">
                This will permanently remove{" "}
                <span className="text-white font-medium">
                  {deleteConfirm.name}
                </span>
                . This action cannot be undone.
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
