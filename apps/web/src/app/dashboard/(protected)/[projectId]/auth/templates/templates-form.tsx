"use client";

import { useState, useEffect } from "react";
import { Zap, Hash, CheckCircle2, Loader2, Eye, EyeOff } from "lucide-react";

type TemplateType = "magic_link" | "otp";

interface Template {
  subject: string;
  body: string;
}

const DEFAULTS: Record<TemplateType, Template> = {
  magic_link: {
    subject: "Your magic link to sign in",
    body: `Hi {{name}},

Click the link below to sign in to your account. This link expires in 15 minutes.

{{magic_link}}

If you did not request this link, you can safely ignore this email.

— The Team`,
  },
  otp: {
    subject: "Your verification code",
    body: `Hi {{name}},

Your verification code is:

{{code}}

This code expires in 10 minutes. Do not share this code with anyone.

If you did not request this code, you can safely ignore this email.

— The Team`,
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
  const [preview, setPreview] = useState(false);

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

  function renderPreview(text: string) {
    const sampleVars: Record<string, string> = {
      "{{name}}": "Alex Johnson",
      "{{email}}": "alex@example.com",
      "{{magic_link}}": "https://yourapp.com/auth/verify?token=abc123...",
      "{{code}}": "847 291",
      "{{expires_in}}": type === "magic_link" ? "15 minutes" : "10 minutes",
    };
    let result = text;
    for (const [key, val] of Object.entries(sampleVars)) {
      result = result.replaceAll(key, val);
    }
    return result;
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

      {/* Body */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs text-zinc-500">Email Body</label>
          <button
            onClick={() => setPreview(!preview)}
            className="cursor-pointer flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            {preview ? <EyeOff size={12} /> : <Eye size={12} />}
            {preview ? "Edit" : "Preview"}
          </button>
        </div>

        {preview ? (
          <div className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-4 py-3 text-sm text-zinc-300 whitespace-pre-wrap font-mono min-h-[220px] leading-relaxed">
            {renderPreview(body)}
          </div>
        ) : (
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={10}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-brand-500 font-mono resize-y"
          />
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
