/**
 * All supported OAuth providers.
 * Each entry maps provider slug → NextAuth provider factory.
 * Credentials are loaded dynamically from the DB per-project.
 */

export const OAUTH_PROVIDERS = [
  { id: "github", name: "GitHub", category: "social" },
  { id: "google", name: "Google", category: "social" },
  { id: "discord", name: "Discord", category: "social" },
  { id: "twitter", name: "Twitter / X", category: "social" },
  { id: "facebook", name: "Facebook", category: "social" },
  { id: "linkedin", name: "LinkedIn", category: "social" },
  { id: "apple", name: "Apple", category: "social" },
  { id: "microsoft-entra-id", name: "Microsoft", category: "social" },
  { id: "slack", name: "Slack", category: "social" },
  { id: "twitch", name: "Twitch", category: "social" },
  { id: "spotify", name: "Spotify", category: "social" },
  { id: "notion", name: "Notion", category: "social" },
  { id: "zoom", name: "Zoom", category: "social" },
  { id: "gitlab", name: "GitLab", category: "social" },
  { id: "bitbucket", name: "Bitbucket", category: "social" },
  { id: "dropbox", name: "Dropbox", category: "social" },
  { id: "box", name: "Box", category: "social" },
  { id: "okta", name: "Okta", category: "enterprise" },
  { id: "auth0", name: "Auth0", category: "enterprise" },
  { id: "keycloak", name: "Keycloak", category: "enterprise" },
  { id: "credentials", name: "Email + Password", category: "credentials" },
  { id: "email", name: "Magic Link", category: "credentials" },
  { id: "email-otp", name: "Email OTP", category: "credentials" },
  { id: "phone", name: "Phone / SMS OTP", category: "credentials" },
  { id: "passkey", name: "Passkey (WebAuthn)", category: "credentials" },
  { id: "anonymous", name: "Anonymous / Guest", category: "credentials" },
] as const;

export type ProviderId = (typeof OAUTH_PROVIDERS)[number]["id"];

export const PROVIDER_MAP = Object.fromEntries(
  OAUTH_PROVIDERS.map((p) => [p.id, p])
) as Record<ProviderId, (typeof OAUTH_PROVIDERS)[number]>;
