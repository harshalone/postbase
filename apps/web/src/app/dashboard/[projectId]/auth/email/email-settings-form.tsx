"use client";

import { useState, useEffect } from "react";
import { Server, Cloud, CheckCircle2, Loader2 } from "lucide-react";

type EmailProvider = "smtp" | "ses";

interface Settings {
  provider: EmailProvider;
  smtpHost: string;
  smtpPort: string;
  smtpUser: string;
  smtpPassword: string;
  smtpSecure: boolean;
  smtpFrom: string;
  sesRegion: string;
  sesAccessKeyId: string;
  sesSecretAccessKey: string;
  sesFrom: string;
}

const DEFAULT: Settings = {
  provider: "smtp",
  smtpHost: "",
  smtpPort: "587",
  smtpUser: "",
  smtpPassword: "",
  smtpSecure: true,
  smtpFrom: "",
  sesRegion: "us-east-1",
  sesAccessKeyId: "",
  sesSecretAccessKey: "",
  sesFrom: "",
};

export function EmailSettingsForm({ projectId }: { projectId: string }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT);
  const [activeTab, setActiveTab] = useState<EmailProvider>("smtp");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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
            sesRegion: s.sesRegion ?? "us-east-1",
            sesAccessKeyId: s.sesAccessKeyId ?? "",
            sesSecretAccessKey: s.sesSecretAccessKey ?? "",
            sesFrom: s.sesFrom ?? "",
          });
          setActiveTab(s.provider ?? "smtp");
        }
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
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
          sesRegion: settings.sesRegion || undefined,
          sesAccessKeyId: settings.sesAccessKeyId || undefined,
          sesSecretAccessKey: settings.sesSecretAccessKey || undefined,
          sesFrom: settings.sesFrom || undefined,
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
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-zinc-300">AWS SES Configuration</h3>
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
            </div>
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
          </div>

          <div className="rounded-lg border border-amber-900/40 bg-amber-950/20 p-4">
            <p className="text-xs text-amber-400/80 leading-relaxed">
              <span className="text-amber-400 font-medium">Note:</span> Your AWS IAM user must have the <code className="bg-amber-950/40 px-1 rounded">ses:SendEmail</code> and <code className="bg-amber-950/40 px-1 rounded">ses:SendRawEmail</code> permissions. Your sending domain or email address must be verified in AWS SES.
            </p>
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
        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-green-400">
            <CheckCircle2 size={14} /> Saved successfully
          </span>
        )}
      </div>
    </div>
  );
}
