"use client";

import { useState, useEffect, useRef } from "react";
import { Server, Cloud, CheckCircle2, Loader2, Upload, KeyRound, FlaskConical } from "lucide-react";
import { TestEmailPanel } from "./test-email-panel";

type EmailProvider = "smtp" | "ses";
type SesInputMode = "iam" | "smtp";

interface Settings {
  provider: EmailProvider;
  smtpHost: string;
  smtpPort: string;
  smtpUser: string;
  smtpPassword: string;
  smtpSecure: boolean;
  smtpFrom: string;
  smtpFromName: string;
  sesRegion: string;
  sesAccessKeyId: string;
  sesSecretAccessKey: string;
  sesFrom: string;
  sesFromName: string;
  sesSmtpUsername: string;
  sesSmtpPassword: string;
}

const DEFAULT: Settings = {
  provider: "smtp",
  smtpHost: "",
  smtpPort: "587",
  smtpUser: "",
  smtpPassword: "",
  smtpSecure: true,
  smtpFrom: "",
  smtpFromName: "",
  sesRegion: "us-east-1",
  sesAccessKeyId: "",
  sesSecretAccessKey: "",
  sesFrom: "",
  sesFromName: "",
  sesSmtpUsername: "",
  sesSmtpPassword: "",
};

// Parse an AWS SES SMTP credentials CSV.
// AWS exports a CSV (with optional BOM) with headers on row 1 and values on row 2.
// Known formats:
//   "IAM user name,SMTP user name,SMTP password"
//   "IAM User Arn,SMTP endpoint,SMTP username,SMTP password"
function parseSesCsv(text: string): { smtpUsername: string; smtpPassword: string } | null {
  // Strip UTF-8 BOM if present
  const clean = text.replace(/^\uFEFF/, "").trim();
  const lines = clean.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return null;

  const headers = lines[0].split(",").map((h) => h.replace(/"/g, "").trim().toLowerCase());
  const values = lines[1].split(",").map((v) => v.replace(/"/g, "").trim());

  const get = (key: string) => {
    const idx = headers.findIndex((h) => h.includes(key));
    return idx >= 0 ? (values[idx] ?? "") : "";
  };

  // "SMTP user name" (new format) or "SMTP username" (old format)
  const smtpUsername = get("smtp user name") || get("smtp username") || get("username");
  const smtpPassword = get("smtp password") || get("password");

  if (!smtpUsername || !smtpPassword) return null;
  return { smtpUsername, smtpPassword };
}

export function EmailSettingsForm({ projectId }: { projectId: string }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT);
  const [activeTab, setActiveTab] = useState<EmailProvider>("smtp");
  const [sesInputMode, setSesInputMode] = useState<SesInputMode>("iam");
  const [csvError, setCsvError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testPanelOpen, setTestPanelOpen] = useState(false);
  const [testPanelClosing, setTestPanelClosing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function openTestPanel() {
    setTestPanelOpen(true);
    setTestPanelClosing(false);
  }

  function closeTestPanel() {
    setTestPanelClosing(true);
    setTimeout(() => {
      setTestPanelOpen(false);
      setTestPanelClosing(false);
    }, 250);
  }

  useEffect(() => {
    fetch(`/api/dashboard/email-settings?projectId=${projectId}`)
      .then((r) => r.json())
      .then(({ settings: s }) => {
        if (s) {
          setSettings({
            provider: s.provider ?? "smtp",
            smtpHost: s.smtpHost ?? "",
            smtpPort: s.smtpPort ? String(s.smtpPort) : "587",
            smtpUser: s.smtpUser ?? "",
            smtpPassword: s.smtpPassword ?? "",
            smtpSecure: s.smtpSecure ?? true,
            smtpFrom: s.smtpFrom ?? "",
            smtpFromName: s.smtpFromName ?? "",
            sesRegion: s.sesRegion ?? "us-east-1",
            sesAccessKeyId: s.sesAccessKeyId ?? "",
            sesSecretAccessKey: s.sesSecretAccessKey ?? "",
            sesFrom: s.sesFrom ?? "",
            sesFromName: s.sesFromName ?? "",
            sesSmtpUsername: s.sesSmtpUsername ?? "",
            sesSmtpPassword: s.sesSmtpPassword ?? "",
          });
          setActiveTab(s.provider ?? "smtp");
          // If SMTP credentials exist but no IAM keys, default to SMTP mode
          if (s.sesSmtpUsername && !s.sesAccessKeyId) {
            setSesInputMode("smtp");
          }
        }
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  function handleCsvFile(file: File) {
    setCsvError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseSesCsv(text);
      if (!parsed) {
        setCsvError("Could not parse the CSV. Make sure it's the file downloaded from AWS SES.");
        return;
      }
      setSettings((prev) => ({
        ...prev,
        sesSmtpUsername: parsed.smtpUsername,
        sesSmtpPassword: parsed.smtpPassword,
      }));
    };
    reader.readAsText(file);
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      await fetch("/api/dashboard/email-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          provider: activeTab,
          smtpHost: settings.smtpHost || undefined,
          smtpPort: settings.smtpPort ? parseInt(settings.smtpPort) : undefined,
          smtpUser: settings.smtpUser || undefined,
          smtpPassword: settings.smtpPassword || undefined,
          smtpSecure: settings.smtpSecure,
          smtpFrom: settings.smtpFrom || undefined,
          smtpFromName: settings.smtpFromName || undefined,
          sesRegion: settings.sesRegion || undefined,
          sesAccessKeyId: settings.sesAccessKeyId || undefined,
          sesSecretAccessKey: settings.sesSecretAccessKey || undefined,
          sesFrom: settings.sesFrom || undefined,
          sesFromName: settings.sesFromName || undefined,
          sesSmtpUsername: settings.sesSmtpUsername || undefined,
          sesSmtpPassword: settings.sesSmtpPassword || undefined,
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 size={20} className="animate-spin text-zinc-500" />
      </div>
    );
  }

  const SUB_TABS = [
    { id: "smtp" as const, label: "SMTP", icon: Server },
    { id: "ses" as const, label: "AWS SES", icon: Cloud },
  ];

  const SES_INPUT_MODES = [
    { id: "iam" as const, label: "IAM Access Keys", icon: KeyRound },
    { id: "smtp" as const, label: "SMTP Credentials", icon: Upload },
  ];

  return (
    <div className="max-w-2xl">
      {/* Provider sub-tabs */}
      <div className="flex items-center gap-1 mb-6 border border-zinc-800 rounded-lg p-1 inline-flex bg-zinc-900">
        {SUB_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`cursor-pointer flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                active
                  ? "bg-zinc-800 text-white shadow-sm"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Icon size={14} className="shrink-0" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* SMTP Form */}
      {activeTab === "smtp" && (
        <div className="space-y-5">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-zinc-300">SMTP Configuration</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-zinc-500 mb-1.5">SMTP Host</label>
                <input
                  type="text"
                  value={settings.smtpHost}
                  onChange={(e) => set("smtpHost", e.target.value)}
                  placeholder="smtp.example.com"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-brand-500 placeholder:text-zinc-600"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1.5">Port</label>
                <input
                  type="number"
                  value={settings.smtpPort}
                  onChange={(e) => set("smtpPort", e.target.value)}
                  placeholder="587"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-brand-500 placeholder:text-zinc-600"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-zinc-500 mb-1.5">Username</label>
                <input
                  type="text"
                  value={settings.smtpUser}
                  onChange={(e) => set("smtpUser", e.target.value)}
                  placeholder="user@example.com"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-brand-500 placeholder:text-zinc-600"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1.5">Password</label>
                <input
                  type="password"
                  value={settings.smtpPassword}
                  onChange={(e) => set("smtpPassword", e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-brand-500 placeholder:text-zinc-600"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-zinc-500 mb-1.5">From Address</label>
                <input
                  type="email"
                  value={settings.smtpFrom}
                  onChange={(e) => set("smtpFrom", e.target.value)}
                  placeholder="noreply@yourapp.com"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-brand-500 placeholder:text-zinc-600"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1.5">Sender Name</label>
                <input
                  type="text"
                  value={settings.smtpFromName}
                  onChange={(e) => set("smtpFromName", e.target.value)}
                  placeholder="My App"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-brand-500 placeholder:text-zinc-600"
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                role="switch"
                aria-checked={settings.smtpSecure}
                onClick={() => set("smtpSecure", !settings.smtpSecure)}
                className={`cursor-pointer relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  settings.smtpSecure ? "bg-brand-600" : "bg-zinc-700"
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                    settings.smtpSecure ? "translate-x-4" : "translate-x-1"
                  }`}
                />
              </button>
              <span className="text-sm text-zinc-400">Use TLS/SSL</span>
            </div>
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
            <p className="text-xs text-zinc-500 leading-relaxed">
              <span className="text-zinc-400 font-medium">Tip:</span> Common SMTP providers: Gmail (smtp.gmail.com:587), Mailgun (smtp.mailgun.org:587), SendGrid (smtp.sendgrid.net:587), Resend (smtp.resend.com:465).
            </p>
          </div>
        </div>
      )}

      {/* AWS SES Form */}
      {activeTab === "ses" && (
        <div className="space-y-5">
          {/* Credential type toggle */}
          <div className="flex items-center gap-1 border border-zinc-800 rounded-lg p-1 inline-flex bg-zinc-900">
            {SES_INPUT_MODES.map((mode) => {
              const Icon = mode.icon;
              const active = sesInputMode === mode.id;
              return (
                <button
                  key={mode.id}
                  onClick={() => { setSesInputMode(mode.id); setCsvError(null); }}
                  className={`cursor-pointer flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    active
                      ? "bg-zinc-800 text-white shadow-sm"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  <Icon size={12} className="shrink-0" />
                  {mode.label}
                </button>
              );
            })}
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-zinc-300">AWS SES Configuration</h3>

            {/* Region — shared by both modes */}
            <div>
              <label className="block text-xs text-zinc-500 mb-1.5">AWS Region</label>
              <select
                value={settings.sesRegion}
                onChange={(e) => set("sesRegion", e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-brand-500"
              >
                <option value="us-east-1">US East (N. Virginia) — us-east-1</option>
                <option value="us-east-2">US East (Ohio) — us-east-2</option>
                <option value="us-west-1">US West (N. California) — us-west-1</option>
                <option value="us-west-2">US West (Oregon) — us-west-2</option>
                <option value="eu-west-1">EU (Ireland) — eu-west-1</option>
                <option value="eu-west-2">EU (London) — eu-west-2</option>
                <option value="eu-central-1">EU (Frankfurt) — eu-central-1</option>
                <option value="ap-southeast-1">Asia Pacific (Singapore) — ap-southeast-1</option>
                <option value="ap-southeast-2">Asia Pacific (Sydney) — ap-southeast-2</option>
                <option value="ap-northeast-1">Asia Pacific (Tokyo) — ap-northeast-1</option>
                <option value="sa-east-1">South America (São Paulo) — sa-east-1</option>
              </select>
              {sesInputMode === "smtp" && (
                <p className="mt-1.5 text-xs text-zinc-600">
                  Must match the region where you created your SMTP credentials in AWS SES. Used to build the SMTP endpoint: <span className="font-mono text-zinc-500">email-smtp.{settings.sesRegion}.amazonaws.com</span>
                </p>
              )}
            </div>

            {/* IAM Access Keys mode */}
            {sesInputMode === "iam" && (
              <>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1.5">Access Key ID</label>
                  <input
                    type="text"
                    value={settings.sesAccessKeyId}
                    onChange={(e) => set("sesAccessKeyId", e.target.value)}
                    placeholder="AKIAIOSFODNN7EXAMPLE"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-brand-500 placeholder:text-zinc-600 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1.5">Secret Access Key</label>
                  <input
                    type="password"
                    value={settings.sesSecretAccessKey}
                    onChange={(e) => set("sesSecretAccessKey", e.target.value)}
                    placeholder="••••••••••••••••••••••••••••••••••••••••"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-brand-500 placeholder:text-zinc-600"
                  />
                </div>
              </>
            )}

            {/* SMTP Credentials mode */}
            {sesInputMode === "smtp" && (
              <>
                {/* CSV upload area */}
                <div>
                  <label className="block text-xs text-zinc-500 mb-1.5">Upload Credentials CSV</label>
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const file = e.dataTransfer.files[0];
                      if (file) handleCsvFile(file);
                    }}
                    className="cursor-pointer flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-zinc-700 bg-zinc-800/50 px-4 py-5 text-center hover:border-zinc-500 transition-colors"
                  >
                    <Upload size={16} className="text-zinc-500" />
                    <p className="text-xs text-zinc-500">
                      Drop the <span className="text-zinc-300 font-medium">smtp_credentials.csv</span> file here, or{" "}
                      <span className="text-brand-400">click to browse</span>
                    </p>
                    <p className="text-xs text-zinc-600">Downloaded from AWS SES → SMTP settings → Create SMTP credentials</p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleCsvFile(file);
                    }}
                  />
                  {csvError && (
                    <p className="mt-1.5 text-xs text-red-400">{csvError}</p>
                  )}
                  {settings.sesSmtpUsername && !csvError && (
                    <p className="mt-1.5 text-xs text-green-400 flex items-center gap-1">
                      <CheckCircle2 size={12} /> Credentials loaded from CSV
                    </p>
                  )}
                </div>

                {/* Manual entry fields (also populated by CSV) */}
                <div>
                  <label className="block text-xs text-zinc-500 mb-1.5">SMTP Username</label>
                  <input
                    type="text"
                    value={settings.sesSmtpUsername}
                    onChange={(e) => set("sesSmtpUsername", e.target.value)}
                    placeholder="AKIAIOSFODNN7EXAMPLE"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-brand-500 placeholder:text-zinc-600 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1.5">SMTP Password</label>
                  <input
                    type="password"
                    value={settings.sesSmtpPassword}
                    onChange={(e) => set("sesSmtpPassword", e.target.value)}
                    placeholder="••••••••••••••••••••••••••••••••••••••••"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-brand-500 placeholder:text-zinc-600"
                  />
                </div>
              </>
            )}

            {/* From address — shared by both modes */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-zinc-500 mb-1.5">From Address</label>
                <input
                  type="email"
                  value={settings.sesFrom}
                  onChange={(e) => set("sesFrom", e.target.value)}
                  placeholder="noreply@yourverifieddomain.com"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-brand-500 placeholder:text-zinc-600"
                />
                <p className="mt-1.5 text-xs text-zinc-600">Must be a verified identity in AWS SES.</p>
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1.5">Sender Name</label>
                <input
                  type="text"
                  value={settings.sesFromName}
                  onChange={(e) => set("sesFromName", e.target.value)}
                  placeholder="My App"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-brand-500 placeholder:text-zinc-600"
                />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-amber-900/40 bg-amber-950/20 p-4">
            {sesInputMode === "iam" ? (
              <p className="text-xs text-amber-400/80 leading-relaxed">
                <span className="text-amber-400 font-medium">Note:</span> Your AWS IAM user must have the <code className="bg-amber-950/40 px-1 rounded">ses:SendEmail</code> and <code className="bg-amber-950/40 px-1 rounded">ses:SendRawEmail</code> permissions. Your sending domain or email address must be verified in AWS SES.
              </p>
            ) : (
              <p className="text-xs text-amber-400/80 leading-relaxed">
                <span className="text-amber-400 font-medium">Note:</span> Generate SMTP credentials in the AWS SES console under <span className="text-amber-400">SMTP settings → Create SMTP credentials</span>. Download the CSV and upload it above, or paste the values manually.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Save button */}
      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="cursor-pointer px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors disabled:opacity-50 font-medium"
        >
          {saving ? (
            <span className="flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" /> Saving...
            </span>
          ) : (
            "Save Settings"
          )}
        </button>
        <button
          type="button"
          onClick={openTestPanel}
          className="cursor-pointer flex items-center gap-2 px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors font-medium"
        >
          <FlaskConical size={14} />
          Test
        </button>
        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-green-400">
            <CheckCircle2 size={14} /> Saved successfully
          </span>
        )}
      </div>

      {testPanelOpen && (
        <TestEmailPanel
          projectId={projectId}
          onClose={closeTestPanel}
          closing={testPanelClosing}
        />
      )}
    </div>
  );
}
