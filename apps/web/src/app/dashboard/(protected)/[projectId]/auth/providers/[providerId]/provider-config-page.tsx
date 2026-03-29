"use client";

import { useState } from "react";
import { ArrowLeft, Mail, Server, Zap, Copy, Check } from "lucide-react";
import Link from "next/link";
import { OAUTH_PROVIDERS } from "@/lib/auth/providers";

type Provider = (typeof OAUTH_PROVIDERS)[number];

interface ExistingConfig {
  enabled: boolean;
  clientId: string | null;
  clientSecret: string | null;
  config: Record<string, string>;
}

interface Props {
  provider: Provider;
  projectId: string;
  existing: ExistingConfig | null;
}

// Provider-specific metadata: extra fields + docs link
const PROVIDER_META: Record<
  string,
  {
    fields: { key: string; label: string; placeholder: string; type?: string; hint?: string }[];
    docsUrl?: string;
    description?: string;
  }
> = {
  github: {
    description: "Allow users to sign in with their GitHub account.",
    docsUrl: "https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app",
    fields: [],
  },
  google: {
    description: "Allow users to sign in with their Google account.",
    docsUrl: "https://console.cloud.google.com/apis/credentials",
    fields: [],
  },
  discord: {
    description: "Allow users to sign in with their Discord account.",
    docsUrl: "https://discord.com/developers/applications",
    fields: [],
  },
  twitter: {
    description: "Allow users to sign in with Twitter / X.",
    docsUrl: "https://developer.twitter.com/en/portal/dashboard",
    fields: [],
  },
  facebook: {
    description: "Allow users to sign in with their Facebook account.",
    docsUrl: "https://developers.facebook.com/apps",
    fields: [],
  },
  linkedin: {
    description: "Allow users to sign in with their LinkedIn account.",
    docsUrl: "https://www.linkedin.com/developers/apps",
    fields: [],
  },
  apple: {
    description: "Allow users to sign in with Apple.",
    docsUrl: "https://developer.apple.com/account/resources/identifiers/list/serviceId",
    fields: [],
  },
  slack: {
    description: "Allow users to sign in with their Slack account.",
    docsUrl: "https://api.slack.com/apps",
    fields: [],
  },
  twitch: {
    description: "Allow users to sign in with their Twitch account.",
    docsUrl: "https://dev.twitch.tv/console/apps",
    fields: [],
  },
  spotify: {
    description: "Allow users to sign in with their Spotify account.",
    docsUrl: "https://developer.spotify.com/dashboard",
    fields: [],
  },
  notion: {
    description: "Allow users to sign in with Notion.",
    docsUrl: "https://www.notion.so/my-integrations",
    fields: [
      { key: "config.redirectUri", label: "Redirect URI override", placeholder: "https://...", hint: "Optional. Notion requires an exact redirect URI registered in your integration." },
    ],
  },
  zoom: {
    description: "Allow users to sign in with their Zoom account.",
    docsUrl: "https://marketplace.zoom.us/develop/create",
    fields: [],
  },
  gitlab: {
    description: "Allow users to sign in with GitLab.",
    docsUrl: "https://gitlab.com/-/profile/applications",
    fields: [
      { key: "config.gitlabUrl", label: "GitLab URL", placeholder: "https://gitlab.com", hint: "Change this if you use a self-hosted GitLab instance." },
    ],
  },
  bitbucket: {
    description: "Allow users to sign in with their Bitbucket account.",
    docsUrl: "https://support.atlassian.com/bitbucket-cloud/docs/use-oauth-on-bitbucket-cloud/",
    fields: [],
  },
  dropbox: {
    description: "Allow users to sign in with their Dropbox account.",
    docsUrl: "https://www.dropbox.com/developers/apps",
    fields: [],
  },
  box: {
    description: "Allow users to sign in with their Box account.",
    docsUrl: "https://developer.box.com/guides/sso-identities-and-app-users/",
    fields: [],
  },
  "microsoft-entra-id": {
    description: "Allow users to sign in with their Microsoft account (Azure AD / Entra ID).",
    docsUrl: "https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade",
    fields: [
      { key: "config.tenantId", label: "Tenant ID", placeholder: "common", hint: 'Use "common" for multi-tenant or enter your Azure tenant UUID for single-tenant apps.' },
    ],
  },
  okta: {
    description: "Enterprise SSO via Okta.",
    docsUrl: "https://developer.okta.com/docs/guides/implement-oauth-for-okta/main/",
    fields: [
      { key: "config.issuer", label: "Okta Domain / Issuer URL", placeholder: "https://your-org.okta.com", hint: "Your Okta org URL, e.g. https://dev-123456.okta.com" },
    ],
  },
  auth0: {
    description: "Enterprise SSO via Auth0.",
    docsUrl: "https://manage.auth0.com/",
    fields: [
      { key: "config.issuer", label: "Auth0 Domain / Issuer URL", placeholder: "https://your-tenant.auth0.com", hint: "Your Auth0 domain, e.g. https://dev-xyz.us.auth0.com" },
    ],
  },
  keycloak: {
    description: "Enterprise SSO via Keycloak.",
    docsUrl: "https://www.keycloak.org/docs/latest/server_admin/",
    fields: [
      { key: "config.issuer", label: "Keycloak Issuer URL", placeholder: "https://keycloak.example.com/realms/myrealm", hint: "Full issuer URL including the realm path." },
    ],
  },
  // email (Magic Link) is handled separately below
  "email-otp": {
    description: "Send a 6-digit one-time password to the user's email. Uses your project email settings and the OTP template.",
    fields: [],
  },
  phone: {
    description: "Send one-time passwords via SMS. Requires a Twilio account.",
    docsUrl: "https://console.twilio.com/",
    fields: [
      { key: "config.twilioAccountSid", label: "Twilio Account SID", placeholder: "AC...", hint: "Found in your Twilio Console dashboard." },
      { key: "config.twilioAuthToken", label: "Twilio Auth Token", placeholder: "", type: "password", hint: "Found in your Twilio Console dashboard." },
      { key: "config.twilioPhoneNumber", label: "Twilio Phone Number", placeholder: "+15551234567", hint: "The verified Twilio number to send SMS from." },
    ],
  },
  credentials: {
    description: "Standard email + password login. Users sign up with an email and a hashed password stored in your database.",
    fields: [],
  },
  passkey: {
    description: "Passwordless login using WebAuthn / FIDO2 passkeys (fingerprint, Face ID, hardware key). No additional configuration required.",
    fields: [],
  },
  anonymous: {
    description: "Allow users to access your app without signing in. A temporary anonymous account is created automatically. No additional configuration required.",
    fields: [],
  },
};

// These providers have a standard Client ID + Secret pair
const OAUTH_CREDENTIAL_PROVIDERS = [
  "github", "google", "discord", "twitter", "facebook", "linkedin",
  "apple", "microsoft-entra-id", "slack", "twitch", "spotify", "notion",
  "zoom", "gitlab", "bitbucket", "dropbox", "box",
  "okta", "auth0", "keycloak",
];

type MagicLinkDelivery = "project" | "resend" | "smtp";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-zinc-300">{label}</label>
      {children}
      {hint && <p className="text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className="shrink-0 p-1 rounded text-zinc-500 hover:text-zinc-300 transition-colors"
      title="Copy to clipboard"
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
    </button>
  );
}

function CallbackUrlBox({ providerId }: { providerId: string }) {
  const templateUrl = `{YOUR_APP_URL}/api/auth/callback/${providerId}`;
  const domainUrl = typeof window !== "undefined"
    ? `${window.location.origin}/api/auth/callback/${providerId}`
    : null;

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900/50 px-4 py-3 space-y-2">
      <p className="text-xs text-zinc-500 font-medium">Callback URL</p>
      <div className="flex items-center gap-2">
        <p className="text-xs font-mono text-zinc-400 break-all flex-1">{templateUrl}</p>
        <CopyButton text={templateUrl} />
      </div>
      {domainUrl && (
        <div className="flex items-center gap-2">
          <p className="text-xs font-mono text-zinc-300 break-all flex-1">{domainUrl}</p>
          <CopyButton text={domainUrl} />
        </div>
      )}
      <p className="text-xs text-zinc-600">
        Add this URL as an authorized redirect URI in your OAuth app settings.
      </p>
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-brand-500 transition-colors"
    />
  );
}

function MagicLinkConfig({
  projectId,
  config,
  onChange,
}: {
  projectId: string;
  config: Record<string, string>;
  onChange: (config: Record<string, string>) => void;
}) {
  const savedDelivery = (config.delivery as MagicLinkDelivery) ?? "project";
  const [delivery, setDelivery] = useState<MagicLinkDelivery>(savedDelivery);

  function set(key: string, value: string) {
    onChange({ ...config, [key]: value });
  }

  function pickDelivery(mode: MagicLinkDelivery) {
    setDelivery(mode);
    onChange({ ...config, delivery: mode });
  }

  const DELIVERY_OPTIONS: {
    id: MagicLinkDelivery;
    label: string;
    description: string;
    icon: React.ElementType;
  }[] = [
    {
      id: "project",
      icon: Mail,
      label: "Use project email settings",
      description: "Send via SMTP or AWS SES already configured in the Email Settings tab.",
    },
    {
      id: "resend",
      icon: Zap,
      label: "Resend",
      description: "Send via Resend API. Fast setup with a free tier.",
    },
    {
      id: "smtp",
      icon: Server,
      label: "Custom SMTP",
      description: "Use a separate SMTP server just for magic link emails.",
    },
  ];

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 space-y-4">
      <h2 className="text-sm font-medium text-zinc-300">Email Delivery</h2>

      {/* Delivery mode selector */}
      <div className="space-y-2">
        {DELIVERY_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const active = delivery === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => pickDelivery(opt.id)}
              className={`cursor-pointer w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-md border transition-colors ${
                active
                  ? "border-brand-500 bg-brand-950/30"
                  : "border-zinc-700 hover:border-zinc-600"
              }`}
            >
              <Icon size={15} className={`mt-0.5 shrink-0 ${active ? "text-brand-400" : "text-zinc-500"}`} />
              <div>
                <p className={`text-sm font-medium ${active ? "text-white" : "text-zinc-300"}`}>
                  {opt.label}
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">{opt.description}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Per-mode fields */}
      {delivery === "project" && (
        <div className="rounded-md border border-zinc-700 bg-zinc-800/50 px-3 py-3 space-y-2">
          <p className="text-xs text-zinc-400">
            Magic link emails will use whichever delivery method is active in{" "}
            <Link
              href={`/dashboard/${projectId}/auth/email`}
              className="text-brand-400 hover:text-brand-300 underline underline-offset-2"
            >
              Email Settings
            </Link>
            .
          </p>
          <Field label="From Address" hint="Override the from address just for magic link emails. Leave blank to use the address from Email Settings.">
            <TextInput
              value={config.fromEmail ?? ""}
              onChange={(v) => set("fromEmail", v)}
              placeholder="auth@yourapp.com"
            />
          </Field>
        </div>
      )}

      {delivery === "resend" && (
        <div className="space-y-3">
          <Field label="Resend API Key" hint="Create a free API key at resend.com.">
            <TextInput
              value={config.resendApiKey ?? ""}
              onChange={(v) => set("resendApiKey", v)}
              placeholder="re_..."
              type="password"
            />
          </Field>
          <Field label="From Address" hint="Must be a verified domain or email in Resend.">
            <TextInput
              value={config.fromEmail ?? ""}
              onChange={(v) => set("fromEmail", v)}
              placeholder="auth@yourapp.com"
            />
          </Field>
        </div>
      )}

      {delivery === "smtp" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="SMTP Host">
              <TextInput
                value={config.smtpHost ?? ""}
                onChange={(v) => set("smtpHost", v)}
                placeholder="smtp.example.com"
              />
            </Field>
            <Field label="Port">
              <TextInput
                value={config.smtpPort ?? "587"}
                onChange={(v) => set("smtpPort", v)}
                placeholder="587"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Username">
              <TextInput
                value={config.smtpUser ?? ""}
                onChange={(v) => set("smtpUser", v)}
                placeholder="user@example.com"
              />
            </Field>
            <Field label="Password">
              <TextInput
                value={config.smtpPassword ?? ""}
                onChange={(v) => set("smtpPassword", v)}
                placeholder="••••••••"
                type="password"
              />
            </Field>
          </div>
          <Field label="From Address">
            <TextInput
              value={config.fromEmail ?? ""}
              onChange={(v) => set("fromEmail", v)}
              placeholder="auth@yourapp.com"
            />
          </Field>
        </div>
      )}
    </div>
  );
}

export function ProviderConfigPage({ provider, projectId, existing }: Props) {
  const backUrl = `/dashboard/${projectId}/auth`;

  const meta = PROVIDER_META[provider.id] ?? { fields: [] };
  const needsOAuthCreds = OAUTH_CREDENTIAL_PROVIDERS.includes(provider.id);
  const isMagicLink = provider.id === "email";
  const isEmailOtp = provider.id === "email-otp";

  const [enabled, setEnabled] = useState(existing?.enabled ?? false);
  const [clientId, setClientId] = useState(existing?.clientId ?? "");
  const [clientSecret, setClientSecret] = useState(existing?.clientSecret ?? "");
  const [extraConfig, setExtraConfig] = useState<Record<string, string>>(
    existing?.config ?? {}
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function getFieldValue(key: string) {
    if (key.startsWith("config.")) return extraConfig[key.slice(7)] ?? "";
    if (key === "clientId") return clientId;
    if (key === "clientSecret") return clientSecret;
    return "";
  }

  function setFieldValue(key: string, value: string) {
    if (key.startsWith("config.")) {
      setExtraConfig((prev) => ({ ...prev, [key.slice(7)]: value }));
    } else if (key === "clientId") {
      setClientId(value);
    } else if (key === "clientSecret") {
      setClientSecret(value);
    }
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      await fetch("/api/dashboard/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          provider: provider.id,
          enabled,
          clientId: clientId || undefined,
          clientSecret: clientSecret || undefined,
          config: extraConfig,
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-2xl">
      {/* Back link */}
      <Link
        href={backUrl}
        className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-6"
      >
        <ArrowLeft size={14} />
        Back to Providers
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-lg font-semibold text-white mb-1">{provider.name}</h1>
          {meta.description && (
            <p className="text-sm text-zinc-400 max-w-lg">{meta.description}</p>
          )}
          {isMagicLink && !meta.description && (
            <p className="text-sm text-zinc-400 max-w-lg">
              Send passwordless one-click sign-in links to users via email.
            </p>
          )}
        </div>
      </div>

      <div className="space-y-6">
        {/* Enable toggle */}
        <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-zinc-200">Enable {provider.name}</p>
            <p className="text-xs text-zinc-500 mt-0.5">
              {enabled ? "Users can sign in with this provider." : "Provider is disabled."}
            </p>
          </div>
          <button
            role="switch"
            aria-checked={enabled}
            onClick={() => setEnabled(!enabled)}
            className={`cursor-pointer relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              enabled ? "bg-brand-600" : "bg-zinc-700"
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                enabled ? "translate-x-4" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {/* OAuth credentials */}
        {needsOAuthCreds && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 space-y-4">
            <h2 className="text-sm font-medium text-zinc-300">OAuth Credentials</h2>
            <Field label="Client ID">
              <TextInput
                value={clientId}
                onChange={setClientId}
                placeholder="Enter your client ID"
              />
            </Field>
            <Field label="Client Secret">
              <TextInput
                value={clientSecret}
                onChange={setClientSecret}
                placeholder="Enter your client secret"
                type="password"
              />
            </Field>
          </div>
        )}

        {/* Magic Link: delivery mode selector */}
        {isMagicLink && (
          <MagicLinkConfig
            projectId={projectId}
            config={extraConfig}
            onChange={setExtraConfig}
          />
        )}

        {/* Email OTP: informational note */}
        {isEmailOtp && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 space-y-2">
            <p className="text-sm text-zinc-300 font-medium">Email delivery</p>
            <p className="text-xs text-zinc-500">
              OTP codes are sent using your project&apos;s email settings (SMTP or AWS SES). Configure delivery in the{" "}
              <Link
                href={`/dashboard/${projectId}/auth/email`}
                className="text-brand-400 hover:text-brand-300 underline underline-offset-2"
              >
                Email Settings
              </Link>{" "}
              tab, and customise the email body in the{" "}
              <Link
                href={`/dashboard/${projectId}/auth/templates`}
                className="text-brand-400 hover:text-brand-300 underline underline-offset-2"
              >
                Templates
              </Link>{" "}
              tab under <strong className="text-zinc-400">6-Digit OTP</strong>.
            </p>
          </div>
        )}

        {/* Provider-specific extra fields (non-magic-link, non-email-otp) */}
        {!isMagicLink && !isEmailOtp && meta.fields.length > 0 && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 space-y-4">
            <h2 className="text-sm font-medium text-zinc-300">
              {provider.id === "phone" ? "SMS Configuration" : "Additional Settings"}
            </h2>
            {meta.fields.map((field) => (
              <Field key={field.key} label={field.label} hint={field.hint}>
                <TextInput
                  value={getFieldValue(field.key)}
                  onChange={(v) => setFieldValue(field.key, v)}
                  placeholder={field.placeholder}
                  type={field.type}
                />
              </Field>
            ))}
          </div>
        )}

        {/* No-config providers */}
        {!needsOAuthCreds && !isMagicLink && !isEmailOtp && meta.fields.length === 0 &&
          !["credentials"].includes(provider.id) && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3">
            <p className="text-sm text-zinc-500">No additional configuration required.</p>
          </div>
        )}

        {/* Callback URL hint for OAuth providers */}
        {needsOAuthCreds && (
          <CallbackUrlBox providerId={provider.id} />
        )}

        {/* Save */}
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={save}
            disabled={saving}
            className="cursor-pointer px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-md transition-colors disabled:opacity-50 font-medium"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
          {saved && (
            <span className="text-sm text-green-400">Saved!</span>
          )}
        </div>
      </div>
    </div>
  );
}
