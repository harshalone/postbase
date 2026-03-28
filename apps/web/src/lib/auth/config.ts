import { type NextAuthConfig } from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import Discord from "next-auth/providers/discord";
import Twitter from "next-auth/providers/twitter";
import Facebook from "next-auth/providers/facebook";
import LinkedIn from "next-auth/providers/linkedin";
import Apple from "next-auth/providers/apple";
import MicrosoftEntraId from "next-auth/providers/microsoft-entra-id";
import Slack from "next-auth/providers/slack";
import Twitch from "next-auth/providers/twitch";
import Spotify from "next-auth/providers/spotify";
import Notion from "next-auth/providers/notion";
import GitLab from "next-auth/providers/gitlab";
import Keycloak from "next-auth/providers/keycloak";
import Okta from "next-auth/providers/okta";
import Resend from "next-auth/providers/resend";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { providerConfigs } from "@/lib/db/schema";

export type ProviderConfig = {
  provider: string;
  clientId?: string;
  clientSecret?: string;
  config?: Record<string, string>;
};

/**
 * Build a NextAuth config dynamically based on enabled provider configs.
 * Called per-request so providers reflect the current DB state.
 */
export async function buildAuthConfig(
  projectId: string,
  enabledProviders: ProviderConfig[]
): Promise<NextAuthConfig> {
  const providerInstances = [];

  for (const p of enabledProviders) {
    const { provider, clientId, clientSecret, config: extra } = p;

    switch (provider) {
      case "github":
        if (clientId && clientSecret)
          providerInstances.push(GitHub({ clientId, clientSecret }));
        break;
      case "google":
        if (clientId && clientSecret)
          providerInstances.push(Google({ clientId, clientSecret }));
        break;
      case "discord":
        if (clientId && clientSecret)
          providerInstances.push(Discord({ clientId, clientSecret }));
        break;
      case "twitter":
        if (clientId && clientSecret)
          providerInstances.push(Twitter({ clientId, clientSecret }));
        break;
      case "facebook":
        if (clientId && clientSecret)
          providerInstances.push(Facebook({ clientId, clientSecret }));
        break;
      case "linkedin":
        if (clientId && clientSecret)
          providerInstances.push(LinkedIn({ clientId, clientSecret }));
        break;
      case "apple":
        if (clientId && clientSecret)
          providerInstances.push(Apple({ clientId, clientSecret }));
        break;
      case "microsoft-entra-id":
        if (clientId && clientSecret)
          providerInstances.push(
            MicrosoftEntraId({
              clientId,
              clientSecret,
              issuer: `https://login.microsoftonline.com/${extra?.tenantId ?? "common"}/v2.0`,
            })
          );
        break;
      case "slack":
        if (clientId && clientSecret)
          providerInstances.push(Slack({ clientId, clientSecret }));
        break;
      case "twitch":
        if (clientId && clientSecret)
          providerInstances.push(Twitch({ clientId, clientSecret }));
        break;
      case "spotify":
        if (clientId && clientSecret)
          providerInstances.push(Spotify({ clientId, clientSecret }));
        break;
      case "notion":
        if (clientId && clientSecret)
          providerInstances.push(
            Notion({
              clientId,
              clientSecret,
              redirectUri: `${process.env.NEXTAUTH_URL}/api/auth/${projectId}/callback/notion`,
            })
          );
        break;
      case "gitlab":
        if (clientId && clientSecret)
          providerInstances.push(GitLab({ clientId, clientSecret }));
        break;
      case "keycloak":
        if (clientId && clientSecret && extra?.issuer)
          providerInstances.push(
            Keycloak({ clientId, clientSecret, issuer: extra.issuer })
          );
        break;
      case "okta":
        if (clientId && clientSecret && extra?.issuer)
          providerInstances.push(
            Okta({ clientId, clientSecret, issuer: extra.issuer })
          );
        break;
      case "email":
        // Magic link via Resend
        if (extra?.apiKey)
          providerInstances.push(Resend({ apiKey: extra.apiKey, from: extra.from ?? "noreply@postbase.dev" }));
        break;
      case "credentials":
        // Email/password auth is handled by the custom /api/auth/v1/[projectId]/token route.
        // No NextAuth credentials provider needed — users now live in per-project schemas.
        break;
    }
  }

  return {
    providers: providerInstances,
    session: { strategy: "jwt" },
    callbacks: {
      async jwt({ token, user, account }) {
        if (user) {
          // Only store the minimal fields needed — never store OAuth tokens
          token.id = user.id;
          token.projectId = projectId;
        }
        // Drop access/refresh tokens from the JWT to prevent cookie bloat (HTTP 431)
        delete token.access_token;
        delete token.refresh_token;
        delete token.id_token;
        if (account) {
          // Store the provider name only, not the tokens
          token.provider = account.provider;
        }
        return token;
      },
      async session({ session, token }) {
        if (token && session.user) {
          session.user.id = token.id as string;
        }
        return session;
      },
    },
  };
}

/**
 * Fetch enabled provider configs for a project from the DB.
 */
export async function getEnabledProviders(
  projectId: string
): Promise<ProviderConfig[]> {
  const configs = await db
    .select()
    .from(providerConfigs)
    .where(
      and(
        eq(providerConfigs.projectId, projectId),
        eq(providerConfigs.enabled, true)
      )
    );

  return configs.map((c) => ({
    provider: c.provider,
    clientId: c.clientId ?? undefined,
    clientSecret: c.clientSecret ?? undefined,
    config: (c.config as Record<string, string>) ?? {},
  }));
}
