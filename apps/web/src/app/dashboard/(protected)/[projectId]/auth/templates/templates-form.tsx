"use client";

import { useState, useEffect } from "react";
import { Zap, Hash, CheckCircle2, Loader2, Code2, Eye } from "lucide-react";

type TemplateType = "magic_link" | "otp";

interface Template {
  subject: string;
  body: string;
}

const DEFAULTS: Record<TemplateType, Template> = {
  magic_link: {
    subject: "Your magic link to sign in",
    body: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f4f4f5; margin: 0; padding: 32px 16px; }
    .card { background: #fff; border-radius: 8px; max-width: 480px; margin: 0 auto; padding: 40px 36px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
    h2 { font-size: 20px; color: #18181b; margin: 0 0 12px; }
    p { font-size: 15px; color: #52525b; line-height: 1.6; margin: 0 0 20px; }
    .btn { display: inline-block; background: #6366f1; color: #fff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-size: 15px; font-weight: 600; }
    .footer { font-size: 12px; color: #a1a1aa; margin-top: 28px; }
  </style>
</head>
<body>
  <div class="card">
    <h2>Sign in to your account</h2>
    <p>Hi {{name}}, click the button below to sign in. This link expires in {{expires_in}}.</p>
    <a href="{{magic_link}}" class="btn">Sign in</a>
    <p class="footer">If you didn't request this, you can safely ignore this email.</p>
  </div>
</body>
</html>`,
  },
  otp: {
    subject: "Your verification code",
    body: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f4f4f5; margin: 0; padding: 32px 16px; }
    .card { background: #fff; border-radius: 8px; max-width: 480px; margin: 0 auto; padding: 40px 36px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
    h2 { font-size: 20px; color: #18181b; margin: 0 0 12px; }
    p { font-size: 15px; color: #52525b; line-height: 1.6; margin: 0 0 20px; }
    .code { font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #18181b; background: #f4f4f5; border-radius: 8px; padding: 16px 24px; display: inline-block; margin: 8px 0 24px; }
    .footer { font-size: 12px; color: #a1a1aa; margin-top: 28px; }
  </style>
</head>
<body>
  <div class="card">
    <h2>Your verification code</h2>
    <p>Hi {{name}}, use the code below to verify your identity. It expires in {{expires_in}}.</p>
    <div class="code">{{code}}</div>
    <p>Do not share this code with anyone.</p>
    <p class="footer">If you didn't request this, you can safely ignore this email.</p>
  </div>
</body>
</html>`,
  },
};

const TEMPLATE_VARS: Record<TemplateType, { var: string; description: string }[]> = {
  magic_link: [
    { var: "{{magic_link}}", description: "The sign-in URL (required)" },
    { var: "{{name}}", description: "User's display name" },
    { var: "{{email}}", description: "User's email address" },
    { var: "{{expires_in}}", description: "Link expiry (e.g. '15 minutes')" },
  ],
  otp: [
    { var: "{{code}}", description: "The 6-digit OTP code (required)" },
    { var: "{{name}}", description: "User's display name" },
    { var: "{{email}}", description: "User's email address" },
    { var: "{{expires_in}}", description: "Code expiry (e.g. '10 minutes')" },
  ],
};

const TABS = [
  {
    id: "magic_link" as const,
    label: "Magic Link",
    icon: Zap,
    description: "Passwordless email sign-in via a one-click link",
  },
  {
    id: "otp" as const,
    label: "6-Digit OTP",
    icon: Hash,
    description: "One-time password code sent to user's email",
  },
];

const SAMPLE_VARS: Record<string, string> = {
  "{{name}}": "Alex Johnson",
  "{{email}}": "alex@example.com",
  "{{magic_link}}": "https://yourapp.com/auth/verify?token=abc123",
  "{{code}}": "847291",
  "{{expires_in}}": "15 minutes",
};

function resolvePreview(html: string): string {
  let result = html;
  for (const [key, val] of Object.entries(SAMPLE_VARS)) {
    result = result.replaceAll(key, val);
  }
  return result;
}

function TemplateEditor({
  projectId,
  type,
}: {
  projectId: string;
  type: TemplateType;
}) {
  const [subject, setSubject] = useState(DEFAULTS[type].subject);
  const [body, setBody] = useState(DEFAULTS[type].body);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [mode, setMode] = useState<"edit" | "preview">("edit");

  useEffect(() => {
    setLoading(true);
    fetch(`/api/dashboard/email-templates?projectId=${projectId}`)
      .then((r) => r.json())
      .then(({ templates }) => {
        const t = templates?.find((t: { type: string }) => t.type === type);
        if (t) {
          setSubject(t.subject);
          setBody(t.body);
        }
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, type]);

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      await fetch("/api/dashboard/email-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, type, subject, body }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setSubject(DEFAULTS[type].subject);
    setBody(DEFAULTS[type].body);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 size={20} className="animate-spin text-zinc-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Subject */}
      <div>
        <label className="block text-xs text-zinc-500 mb-1.5">Email Subject</label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-brand-500"
        />
      </div>

      {/* Body editor with Edit / Preview tabs */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs text-zinc-500">Email Body (HTML)</label>
          <div className="flex items-center gap-0.5 bg-zinc-800 border border-zinc-700 rounded-md p-0.5">
            <button
              onClick={() => setMode("edit")}
              className={`cursor-pointer flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                mode === "edit"
                  ? "bg-zinc-700 text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Code2 size={11} />
              HTML
            </button>
            <button
              onClick={() => setMode("preview")}
              className={`cursor-pointer flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                mode === "preview"
                  ? "bg-zinc-700 text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Eye size={11} />
              Preview
            </button>
          </div>
        </div>

        {mode === "edit" ? (
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={18}
            spellCheck={false}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-brand-500 font-mono resize-y leading-relaxed"
          />
        ) : (
          <div className="rounded-md border border-zinc-700 overflow-hidden">
            <div className="bg-zinc-800/60 border-b border-zinc-700 px-3 py-1.5 flex items-center gap-2">
              <span className="text-[11px] text-zinc-500">
                Sample data applied —{" "}
                <span className="text-zinc-400">
                  {Object.keys(SAMPLE_VARS).join(", ")}
                </span>
              </span>
            </div>
            <iframe
              srcDoc={resolvePreview(body)}
              title="Email preview"
              className="w-full bg-white"
              style={{ height: 480, border: "none" }}
              sandbox="allow-same-origin"
            />
          </div>
        )}
      </div>

      {/* Variables reference */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
        <p className="text-xs text-zinc-500 font-medium mb-2">Available variables:</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {TEMPLATE_VARS[type].map((v) => (
            <div key={v.var} className="flex items-center gap-2">
              <code className="text-xs text-brand-400 bg-brand-950/30 px-1.5 py-0.5 rounded font-mono">
                {v.var}
              </code>
              <span className="text-xs text-zinc-600 truncate">{v.description}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
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
            "Save Template"
          )}
        </button>
        <button
          onClick={reset}
          className="cursor-pointer px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          Reset to default
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

export function TemplatesForm({ projectId }: { projectId: string }) {
  const [activeTab, setActiveTab] = useState<TemplateType>("magic_link");

  return (
    <div className="max-w-2xl">
      {/* Template type tabs */}
      <div className="flex gap-3 mb-6">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`cursor-pointer flex-1 flex items-start gap-3 p-4 rounded-lg border transition-colors text-left ${
                active
                  ? "border-brand-600/50 bg-brand-950/20 text-white"
                  : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
              }`}
            >
              <div
                className={`mt-0.5 p-1.5 rounded-md ${
                  active ? "bg-brand-600/20 text-brand-400" : "bg-zinc-800 text-zinc-500"
                }`}
              >
                <Icon size={14} />
              </div>
              <div>
                <p className="text-sm font-medium">{tab.label}</p>
                <p className="text-xs text-zinc-600 mt-0.5">{tab.description}</p>
              </div>
            </button>
          );
        })}
      </div>

      <TemplateEditor key={activeTab} projectId={projectId} type={activeTab} />
    </div>
  );
}
