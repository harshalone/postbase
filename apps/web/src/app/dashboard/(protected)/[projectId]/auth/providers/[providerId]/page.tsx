import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { providerConfigs } from "@/lib/db/schema";
import { PROVIDER_MAP } from "@/lib/auth/providers";
import { and, eq } from "drizzle-orm";
import { getBaseUrl } from "@/lib/get-base-url";
import { ProviderConfigPage } from "./provider-config-page";

export default async function ProviderSettingsPage({
  params,
}: {
  params: Promise<{ projectId: string; providerId: string }>;
}) {
  const { projectId, providerId } = await params;
  const baseUrl = getBaseUrl();

  const provider = PROVIDER_MAP[providerId as keyof typeof PROVIDER_MAP];
  if (!provider) notFound();

  const rows = await db
    .select()
    .from(providerConfigs)
    .where(
      and(
        eq(providerConfigs.projectId, projectId),
        eq(providerConfigs.provider, providerId)
      )
    )
    .limit(1);

  const existing = rows[0] ?? null;

  return (
    <ProviderConfigPage
      provider={provider}
      projectId={projectId}
      baseUrl={baseUrl}
      existing={
        existing
          ? {
              enabled: existing.enabled,
              clientId: existing.clientId,
              clientSecret: existing.clientSecret,
              config: (existing.config as Record<string, string>) ?? {},
            }
          : null
      }
    />
  );
}
