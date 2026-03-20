import { db } from "@/lib/db";
import { providerConfigs } from "@/lib/db/schema";
import { OAUTH_PROVIDERS } from "@/lib/auth/providers";
import { eq } from "drizzle-orm";
import { ProviderToggle } from "./provider-toggle";
import { PageHeader } from "../_components/page-header";

export default async function AuthProvidersPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  const configs = await db
    .select()
    .from(providerConfigs)
    .where(eq(providerConfigs.projectId, projectId));

  const configMap = Object.fromEntries(configs.map((c) => [c.provider, c]));

  const categories = [
    { id: "credentials", label: "Credentials" },
    { id: "social", label: "Social OAuth" },
    { id: "enterprise", label: "Enterprise / SSO" },
  ];

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Auth Providers" />
      <div className="p-6 overflow-auto">
        {categories.map((cat) => (
          <div key={cat.id} className="mb-8">
            <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-4">
              {cat.label}
            </h2>
            <div className="space-y-2">
              {OAUTH_PROVIDERS.filter((p) => p.category === cat.id).map(
                (provider) => (
                  <ProviderToggle
                    key={provider.id}
                    provider={provider}
                    projectId={projectId}
                    existing={configMap[provider.id]}
                  />
                )
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
