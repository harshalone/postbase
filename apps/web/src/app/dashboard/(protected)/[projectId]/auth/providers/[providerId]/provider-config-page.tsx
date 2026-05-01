"use client";

import { useState } from "react";
import { ArrowLeft, Copy, Check, Mail, Server, Zap } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
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
  baseUrl: string;
}

const PROVIDER_META: Record<
  string,
  {
    fields: { key: string; label: string; placeholder: string; type?: string; hint?: string }[];
    docsUrl?: string;
    description?: string;
    toggleHint?: string;
    clientIdHint?: string;
    clientSecretHint?: string;
    callbackHint?: string;
  }
> = {
  github: {
    description: "Allow users to sign in with their GitHub account.",
    docsUrl: "https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app",
    fields: [],
    toggleHint: "Enables Sign in with GitHub for your application users.",
    clientIdHint: "Your GitHub OAuth app's Client ID (also called Client Token). Learn more",
    clientSecretHint: "Your GitHub OAuth app's Client Secret. Learn more",
    callbackHint: "Enter this URL as the Authorization callback URL in your GitHub OAuth App settings. Learn more",
  },
  google: {
    description: "Allow users to sign in with their Google account.",
    docsUrl: "https://console.cloud.google.com/apis/credentials",
    fields: [],
    toggleHint: "Enables Sign in with Google for your application users.",
    clientIdHint: "Your Google OAuth app's Client ID. Learn more",
    clientSecretHint: "Your Google OAuth app's Client Secret. Learn more",
    callbackHint: "Enter this URL as the Authorized redirect URI in your Google Cloud Console. Learn more",
  },
  apple: {
    description: "Allow users to sign in with Apple.",
    docsUrl: "https://developer.apple.com/account/resources/identifiers/list/serviceId",
    fields: [],
    toggleHint: "Enables Sign in with Apple on the web using OAuth or natively within iOS, macOS, watchOS or tvOS apps.",
    clientIdHint: "Comma separated list of allowed Apple app (Web, OAuth, iOS, macOS, watchOS, or tvOS) bundle IDs for native sign in, or service IDs for Sign in with Apple JS. Learn more",
    clientSecretHint: "Secret key used in the OAuth flow. Learn more",
    callbackHint: "Register this callback URL when using Sign in with Apple on the web in the Apple Developer Center. Learn more",
  },
  slack: {
    description: "Allow users to sign in with their Slack account.",
    docsUrl: "https://api.slack.com/apps",
    fields: [],
    toggleHint: "Enables Sign in with Slack for your application users.",
    clientIdHint: "Your Slack app's Client ID (also known as Application ID). Learn more",
    clientSecretHint: "Your Slack app's Client Secret. Learn more",
    callbackHint: "Enter this URL as the Redirect URL in your Slack app settings. Learn more",
  },
  discord: {
    description: "Allow users to sign in with their Discord account.",
    docsUrl: "https://discord.com/developers/applications",
    fields: [],
    toggleHint: "Enables Sign in with Discord for your application users.",
    clientIdHint: "Your Discord application's Client ID. Learn more",
    clientSecretHint: "Your Discord application's Client Secret. Learn more",
    callbackHint: "Enter this URL as the Redirect URI in your Discord application settings. Learn more",
  },
  twitter: {
    description: "Allow users to sign in with Twitter / X.",
    docsUrl: "https://developer.twitter.com/en/portal/dashboard",
    fields: [],
    toggleHint: "Enables Sign in with Twitter / X for your application users.",
    clientIdHint: "Your Twitter app's Client ID (also known as API Key). Learn more",
    clientSecretHint: "Your Twitter app's Client Secret (also known as API Secret). Learn more",
    callbackHint: "Enter this URL as the Callback URL in your Twitter app settings. Learn more",
  },
  facebook: {
    description: "Allow users to sign in with their Facebook account.",
    docsUrl: "https://developers.facebook.com/apps",
    fields: [],
    toggleHint: "Enables Sign in with Facebook for your application users.",
    clientIdHint: "Your Facebook app's App ID. Learn more",
    clientSecretHint: "Your Facebook app's App Secret. Learn more",
    callbackHint: "Enter this URL as the Valid OAuth Redirect URI in your Facebook app settings. Learn more",
  },
  linkedin: {
    description: "Allow users to sign in with their LinkedIn account.",
    docsUrl: "https://www.linkedin.com/developers/apps",
    fields: [],
    toggleHint: "Enables Sign in with LinkedIn for your application users.",
    clientIdHint: "Your LinkedIn app's Client ID. Learn more",
    clientSecretHint: "Your LinkedIn app's Client Secret. Learn more",
    callbackHint: "Enter this URL as the Authorized redirect URL in your LinkedIn app settings. Learn more",
  },
  twitch: {
    description: "Allow users to sign in with their Twitch account.",
    docsUrl: "https://dev.twitch.tv/console/apps",
    fields: [],
    toggleHint: "Enables Sign in with Twitch for your application users.",
    clientIdHint: "Your Twitch app's Client ID. Learn more",
    clientSecretHint: "Your Twitch app's Client Secret. Learn more",
    callbackHint: "Enter this URL as the Redirect URI in your Twitch app settings. Learn more",
  },
  spotify: {
    description: "Allow users to sign in with their Spotify account.",
    docsUrl: "https://developer.spotify.com/dashboard",
    fields: [],
    toggleHint: "Enables Sign in with Spotify for your application users.",
    clientIdHint: "Your Spotify app's Client ID. Learn more",
    clientSecretHint: "Your Spotify app's Client Secret. Learn more",
    callbackHint: "Enter this URL as the Redirect URI in your Spotify app settings. Learn more",
  },
  notion: {
    description: "Allow users to sign in with Notion.",
    docsUrl: "https://www.notion.so/my-integrations",
    fields: [
      { key: "config.redirectUri", label: "Redirect URI override", placeholder: "https://...", hint: "Optional. Notion requires an exact redirect URI registered in your integration." },
    ],
    toggleHint: "Enables Sign in with Notion for your application users.",
    clientIdHint: "Your Notion integration's Client ID (also called Integration ID). Learn more",
    clientSecretHint: "Your Notion integration's Client Secret (also called Internal Integration Token). Learn more",
    callbackHint: "Enter this URL as the Redirect URI in your Notion integration settings. Learn more",
  },
  zoom: {
    description: "Allow users to sign in with their Zoom account.",
    docsUrl: "https://marketplace.zoom.us/develop/create",
    fields: [],
    toggleHint: "Enables Sign in with Zoom for your application users.",
    clientIdHint: "Your Zoom app's Client ID. Learn more",
    clientSecretHint: "Your Zoom app's Client Secret. Learn more",
    callbackHint: "Enter this URL as the Redirect URL in your Zoom app settings. Learn more",
  },
  gitlab: {
    description: "Allow users to sign in with GitLab.",
    docsUrl: "https://gitlab.com/-/profile/applications",
    fields: [
      { key: "config.gitlabUrl", label: "GitLab URL", placeholder: "https://gitlab.com", hint: "Change this if you use a self-hosted GitLab instance." },
    ],
    toggleHint: "Enables Sign in with GitLab for your application users.",
    clientIdHint: "Your GitLab application's Application ID. Learn more",
    clientSecretHint: "Your GitLab application's Secret. Learn more",
    callbackHint: "Enter this URL as the Redirect URI in your GitLab application settings. Learn more",
  },
  bitbucket: {
    description: "Allow users to sign in with their Bitbucket account.",
    docsUrl: "https://support.atlassian.com/bitbucket-cloud/docs/use-oauth-on-bitbucket-cloud/",
    fields: [],
    toggleHint: "Enables Sign in with Bitbucket for your application users.",
    clientIdHint: "Your BitbucketOAuth consumer's Key. Learn more",
    clientSecretHint: "Your Bitbucket OAuth consumer's Secret. Learn more",
    callbackHint: "Enter this URL as the Authorization callback URL in your Bitbucket OAuth consumer settings. Learn more",
  },
  dropbox: {
    description: "Allow users to sign in with their Dropbox account.",
    docsUrl: "https://www.dropbox.com/developers/apps",
    fields: [],
    toggleHint: "Enables Sign in with Dropbox for your application users.",
    clientIdHint: "Your Dropbox app's App Key. Learn more",
    clientSecretHint: "Your Dropbox app's App Secret. Learn more",
    callbackHint: "Enter this URL as the Redirect URI in your Dropbox app Console. Learn more",
  },
  box: {
    description: "Allow users to sign in with their Box account.",
    docsUrl: "https://developer.box.com/guides/sso-identities-and-app-users/",
    fields: [],
    toggleHint: "Enables Sign in with Box for your application users.",
    clientIdHint: "Your Box application's Client ID. Learn more",
    clientSecretHint: "Your Box application's Client Secret. Learn more",
    callbackHint: "Enter this URL as the Redirect URI in your Box enterprise app settings. Learn more",
  },
  "microsoft-entra-id": {
    description: "Allow users to sign in with their Microsoft account (Azure AD / Entra ID).",
    docsUrl: "https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade",
    fields: [
      { key: "config.tenantId", label: "Tenant ID", placeholder: "common", hint: 'Use "common" for multi-tenant or enter your Azure tenant UUID for single-tenant apps.' },
    ],
    toggleHint: "Enables Sign in with Microsoft / Entra ID for your application users.",
    clientIdHint: "Your Azure app's Application (client) ID. Learn more",
    clientSecretHint: "Your Azure app's Client Secret (also called Secret Value). Learn more",
    callbackHint: "Enter this URL as the Redirect URI in your Azure app registration. Learn more",
  },
  okta: {
    description: "Enterprise SSO via Okta.",
    docsUrl: "https://developer.okta.com/docs/guides/implement-oauth-for-okta/main/",
    fields: [
      { key: "config.issuer", label: "Okta Domain / Issuer URL", placeholder: "https://your-org.okta.com", hint: "Your Okta org URL, e.g. https://dev-123456.okta.com" },
    ],
    toggleHint: "Enables Sign in with Okta for your application users.",
    clientIdHint: "Your Okta application's Client ID. Learn more",
    clientSecretHint: "Your Okta application's Client Secret. Learn more",
    callbackHint: "Enter this URL as the Sign-in redirect URI in your Okta app settings. Learn more",
  },
  auth0: {
    description: "Enterprise SSO via Auth0.",
    docsUrl: "https://manage.auth0.com/",
    fields: [
      { key: "config.issuer", label: "Auth0 Domain / Issuer URL", placeholder: "https://your-tenant.auth0.com", hint: "Your Auth0 domain, e.g. https://dev-xyz.us.auth0.com" },
    ],
    toggleHint: "Enables Sign in with Auth0 for your application users.",
    clientIdHint: "Your Auth0 application's Client ID. Learn more",
    clientSecretHint: "Your Auth0 application's Client Secret. Learn more",
    callbackHint: "Enter this URL as the Allowed Callback URLs in your Auth0 application settings. Learn more",
  },
  keycloak: {
    description: "Enterprise SSO via Keycloak.",
    docsUrl: "https://www.keycloak.org/docs/latest/server_admin/",
    fields: [
      { key: "config.issuer", label: "Keycloak Issuer URL", placeholder: "https://keycloak.example.com/realms/myrealm", hint: "Full issuer URL including the realm path." },
    ],
    toggleHint: "Enables Sign in with Keycloak for your application users.",
    clientIdHint: "Your Keycloak client's Client ID. Learn more",
    clientSecretHint: "Your Keycloak client's Client Secret. Learn more",
    callbackHint: "Enter this URL as the Valid Redirect URIs in your Keycloak client settings. Learn more",
  },
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

const OAUTH_CREDENTIAL_PROVIDERS = [
  "github", "google", "discord", "twitter", "facebook", "linkedin",
  "apple", "microsoft-entra-id", "slack", "twitch", "spotify", "notion",
  "zoom", "gitlab", "bitbucket", "dropbox", "box",
  "okta", "auth0", "keycloak",
];

const PROVIDER_ICONS: Record<string, string> = {
  google: "https://authjs.dev/img/providers/google.svg",
  github: "https://authjs.dev/img/providers/github.svg",
  apple: "https://authjs.dev/img/providers/apple.svg",
  slack: "https://authjs.dev/img/providers/slack.svg",
  discord: "https://authjs.dev/img/providers/discord.svg",
  twitter: "https://authjs.dev/img/providers/twitter.svg",
  facebook: "https://authjs.dev/img/providers/facebook.svg",
  linkedin: "https://authjs.dev/img/providers/linkedin.svg",
  twitch: "https://authjs.dev/img/providers/twitch.svg",
  spotify: "https://authjs.dev/img/providers/spotify.svg",
  notion: "https://authjs.dev/img/providers/notion.svg",
  zoom: "https://authjs.dev/img/providers/zoom.svg",
  gitlab: "https://authjs.dev/img/providers/gitlab.svg",
  bitbucket: "https://authjs.dev/img/providers/bitbucket.svg",
  dropbox: "https://authjs.dev/img/providers/dropbox.svg",
  box: "https://authjs.dev/img/providers/box.svg",
  "microsoft-entra-id": "https://authjs.dev/img/providers/microsoft.svg",
};

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
    <div className="space-y-2">
      <label className="block text-sm font-medium text-zinc-200">{label}</label>
      {children}
      {hint && <p className="text-xs text-zinc-400 leading-relaxed">{hint}</p>}
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

function CallbackUrlBox({ providerId, projectId, baseUrl, hint }: { providerId: string; projectId: string; baseUrl: string; hint?: string }) {
  const callbackUrl = `${baseUrl}/api/auth/v1/${projectId}/oauth/callback/${providerId}`;

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3 space-y-2">
      <p className="text-xs text-zinc-500 font-medium">Callback URL</p>
      <p className="text-xs text-zinc-500">
        {hint ?? "Copy this URL and paste it as the authorized redirect URI in your OAuth app settings."}
      </p>
      <div className="flex items-center gap-2 rounded-md bg-zinc-800 px-3 py-2">
        <p className="text-xs font-mono text-zinc-200 break-all flex-1">{callbackUrl}</p>
        <CopyButton text={callbackUrl} />
      </div>
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
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 space-y-4">
      <h2 className="text-base font-medium text-white">Email Delivery</h2>

      <div className="space-y-2">
        {DELIVERY_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const active = delivery === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => pickDelivery(opt.id)}
              className={`cursor-pointer w-full text-left flex items-start gap-3 px-4 py-3 rounded-lg border transition-all ${
                active
                  ? "border-brand-500 bg-brand-500/10"
                  : "border-zinc-700 hover:border-zinc-600 bg-zinc-800/50"
              }`}
            >
              <Icon size={18} className={`mt-0.5 shrink-0 ${active ? "text-brand-400" : "text-zinc-500"}`} />
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

      {delivery === "project" && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-800/30 px-4 py-3 space-y-3">
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

function SignInPreview({ providerId, enabled }: { providerId: string; enabled: boolean }) {
  const providerIcon = PROVIDER_ICONS[providerId];
  const providerName = OAUTH_PROVIDERS.find(p => p.id === providerId)?.name ?? providerId;

  const previewProviders = [
    { id: "google", name: "Google" },
    { id: "github", name: "GitHub" },
    { id: "slack", name: "Slack" },
  ].filter(p => p.id !== providerId);

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
      <div className="bg-zinc-950 px-6 py-8 text-center">
        {providerIcon && (
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-white flex items-center justify-center">
            <Image
              src={providerIcon}
              alt={providerId}
              width={24}
              height={24}
              className="w-6 h-6"
              unoptimized
            />
          </div>
        )}
        <h2 className="text-lg font-semibold text-white mb-1">Sign in to your account</h2>
        <p className="text-sm text-zinc-400">
          Enter your details below or continue with a provider
        </p>
      </div>

      <div className="px-6 pb-6 space-y-4">
        <button
          disabled={!enabled}
          className={`cursor-pointer w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg border text-sm font-medium transition-all ${
            enabled
              ? "border-zinc-600 hover:border-zinc-500 bg-zinc-800 text-white"
              : "border-zinc-700 bg-zinc-800/50 text-zinc-500 cursor-not-allowed"
          }`}
        >
          {providerIcon && (
            <Image
              src={providerIcon}
              alt=""
              width={18}
              height={18}
              className="w-[18px] h-[18px]"
              unoptimized
            />
          )}
          Sign in with {providerName}
        </button>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-zinc-800" />
          <span className="text-xs text-zinc-500">or continue with</span>
          <div className="flex-1 h-px bg-zinc-800" />
        </div>

        <div className="flex gap-2">
          {previewProviders.map((p) => (
            <button
              key={p.id}
              className="flex-1 cursor-pointer py-2 px-3 rounded-lg border border-zinc-700 hover:border-zinc-600 bg-zinc-800/50 transition-colors flex items-center justify-center"
            >
              {PROVIDER_ICONS[p.id] && (
                <Image
                  src={PROVIDER_ICONS[p.id]}
                  alt=""
                  width={18}
                  height={18}
                  className="w-[18px] h-[18px]"
                  unoptimized
                />
              )}
            </button>
          ))}
        </div>

        <p className="text-center text-xs text-zinc-500">
          {"Don't have an account? "}
          <button className="text-brand-400 hover:text-brand-300">Sign up</button>
        </p>
      </div>

      <div className="border-t border-zinc-800 px-4 py-3 bg-zinc-900/50">
        <p className="text-xs text-zinc-600 text-center">
          Powered by <span className="text-zinc-400 font-medium">Postbase</span>
        </p>
      </div>
    </div>
  );
}

export function ProviderConfigPage({ provider, projectId, existing, baseUrl }: Props) {
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
    <div className="p-6 max-w-xl">
      <Link
        href={backUrl}
        className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-6"
      >
        <ArrowLeft size={14} />
        Back to Providers
      </Link>

      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-white mb-1">{provider.name}</h1>
          {meta.description && (
            <p className="text-sm text-zinc-400">{meta.description}</p>
          )}
          {isMagicLink && !meta.description && (
            <p className="text-sm text-zinc-400">
              Send passwordless one-click sign-in links to users via email.
            </p>
          )}
        </div>

        <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-4">
          <div className="flex-1 pr-4">
            <p className="text-sm font-medium text-white">Enable {provider.name}</p>
            <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
              {enabled 
                ? (meta.toggleHint ?? "Enables Sign in with this provider.")
                : "Provider is disabled."}
            </p>
          </div>
          <button
            role="switch"
            aria-checked={enabled}
            onClick={() => setEnabled(!enabled)}
            className={`cursor-pointer relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
              enabled ? "bg-brand-600" : "bg-zinc-700"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                enabled ? "translate-x-6" : "translate-x-1.5"
              }`}
            />
          </button>
        </div>

        {needsOAuthCreds && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
            <h2 className="text-sm font-medium text-zinc-300">OAuth Credentials</h2>
            <div className="space-y-4">
              <Field 
                label="Client ID" 
                hint={meta.clientIdHint ?? "Your OAuth app's Client ID"}
              >
                <TextInput
                  value={clientId}
                  onChange={setClientId}
                  placeholder="Enter your client ID"
                />
              </Field>
              <Field 
                label="Client Secret" 
                hint={meta.clientSecretHint ?? "Your OAuth app's Client Secret"}
              >
                <TextInput
                  value={clientSecret}
                  onChange={setClientSecret}
                  placeholder="Enter your client secret"
                  type="password"
                />
              </Field>
            </div>
          </div>
        )}

        {isMagicLink && (
          <MagicLinkConfig
            projectId={projectId}
            config={extraConfig}
            onChange={setExtraConfig}
          />
        )}

        {isEmailOtp && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-4 space-y-2">
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

        {!isMagicLink && !isEmailOtp && meta.fields.length > 0 && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
            <h2 className="text-sm font-medium text-zinc-300">
              {provider.id === "phone" ? "SMS Configuration" : "Additional Settings"}
            </h2>
            <div className="space-y-4">
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
          </div>
        )}

        {!needsOAuthCreds && !isMagicLink && !isEmailOtp && meta.fields.length === 0 &&
          !["credentials", "passkey", "anonymous"].includes(provider.id) && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-4">
            <p className="text-sm text-zinc-500">No additional configuration required.</p>
          </div>
        )}

        {needsOAuthCreds && (
          <CallbackUrlBox providerId={provider.id} projectId={projectId} baseUrl={baseUrl} hint={meta.callbackHint} />
        )}

        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={save}
            disabled={saving}
            className="cursor-pointer px-5 py-2.5 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors disabled:opacity-50 font-medium"
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