# Deploy and Host Postbase on Azure

> **Status: unverified, and one manual step required before the README button works.** This template was written to match Postbase's Docker/Railway/DigitalOcean deploy pattern but has not yet been deployed against a real Azure subscription. Review `azure/main.bicep` before relying on it in production, and please report issues.
>
> The "Deploy to Azure" button needs a **compiled ARM JSON template**, not the Bicep source — Bicep tooling wasn't available in the environment this was authored in. Before the README button will work, run:
>
> ```sh
> az bicep build --file azure/main.bicep --outfile azure/azuredeploy.json
> ```
>
> and commit the resulting `azure/azuredeploy.json`. Until then, deploy manually with `az deployment group create --template-file azure/main.bicep ...` (see below).

Postbase is a self-hosted auth and database platform for Next.js. Drop it into your stack, configure 25+ auth providers from a dashboard, and connect your app with a single SDK call. Think self-hosted Supabase or Clerk — you own the data, you control the infra.

## About Hosting Postbase

On Azure, Postbase runs as an **Azure Container App**, built from `Dockerfile.railway` via an **ACR Task** (Azure Container Registry's built-in build service), with an **Azure Database for PostgreSQL Flexible Server** for storage. Same split-service model as Railway/DigitalOcean/AWS/GCP: the app is stateless and rebuildable without touching the database.

## Common Use Cases

- **Add auth to a Next.js app** — enable email/password, magic links, or any of 25+ OAuth providers (GitHub, Google, Discord, and more) from the dashboard without writing auth code
- **Self-host your user database** — store users, sessions, and OAuth accounts in your own Postgres instance with full SQL access via the built-in editor
- **Manage files and storage** — connect Amazon S3, Cloudflare R2, Backblaze B2, or any S3-compatible bucket per-project from the dashboard

## Dependencies for Postbase Hosting

- An Azure subscription with permission to create resource groups, Container Registries, Container Apps, PostgreSQL Flexible Servers, and Managed Identities

### Implementation Details

The template (`azure/main.bicep`) defines:

| Resource | Purpose |
|---|---|
| `acr` (Container Registry) | Holds the built `postbase` image |
| `acrBuild` (ACR Task) | Builds `Dockerfile.railway` from the GitHub repo |
| `deployScriptIdentity` | User-assigned managed identity used by the deployment scripts below to run `az` commands |
| `triggerBuild` (deployment script) | Runs the ACR task once during deployment and waits for it to finish |
| `postgres` | PostgreSQL Flexible Server 16, `Standard_B1ms` by default |
| `containerAppEnv` / `containerApp` | Runs the built image, port `3000`, readiness probe at `/api/health` |
| `setNextAuthUrl` (deployment script) | Patches `NEXTAUTH_URL` onto the Container App once its FQDN is known |

**Environment variables set on the Container App:**

```
DATABASE_URL         (secret, built from the Flexible Server connection details)
NEXTAUTH_SECRET       (secret, from authSecret parameter)
POSTBASE_JWT_SECRET   (secret, from authSecret parameter)
NEXTAUTH_URL           (set by the setNextAuthUrl deployment script, after first deploy)
HOSTNAME               = 0.0.0.0
```

`authSecret` is a required, secure-string parameter — generate a strong value with `openssl rand -base64 32`.

### Manual deploy (until `azuredeploy.json` is committed)

```sh
az group create --name postbase-rg --location eastus

az deployment group create \
  --resource-group postbase-rg \
  --template-file azure/main.bicep \
  --parameters authSecret="$(openssl rand -base64 32)"
```

### Redeploying after a code change

Re-run the ACR task and restart the revision:

```sh
az acr task run --registry <acrName> --name postbase-build --resource-group postbase-rg
az containerapp update --name <containerAppName> --resource-group postbase-rg --image <acrLoginServer>/postbase:latest
```

## Why Deploy Postbase on Azure?

Container Apps keeps Postbase serverless (scale-to-zero-capable) while staying in the same subscription/resource-group/IAM boundary as the rest of an Azure-based stack.
