# Deploy and Host Postbase on AWS

> **Status: unverified.** This template was written to match Postbase's Docker/Railway/DigitalOcean deploy pattern but has not yet been deployed against a real AWS account. Review the CloudFormation template before relying on it in production, and please report issues.

Postbase is a self-hosted auth and database platform for Next.js. Drop it into your stack, configure 25+ auth providers from a dashboard, and connect your app with a single SDK call. Think self-hosted Supabase or Clerk — you own the data, you control the infra.

## About Hosting Postbase

On AWS, Postbase runs on **App Runner**, built from `Dockerfile.railway`, with a **CodeBuild** project that clones the repo and builds+pushes the image to a private **ECR** repository on first deploy, and an **RDS Postgres 16** instance for storage. This mirrors the same split-service model used on Railway and DigitalOcean: the app is stateless and can be rebuilt/redeployed at any time without touching your data.

Click **Deploy to AWS** in the [README](README.md), fill in `AuthSecret` and pick a VPC/subnets, and CloudFormation provisions everything. The first deploy takes several minutes longer than Railway/DO because the container image has to be built from source (App Runner can't build a Dockerfile directly from GitHub).

## Common Use Cases

- **Add auth to a Next.js app** — enable email/password, magic links, or any of 25+ OAuth providers (GitHub, Google, Discord, and more) from the dashboard without writing auth code
- **Self-host your user database** — store users, sessions, and OAuth accounts in your own Postgres instance with full SQL access via the built-in editor
- **Manage files and storage** — connect Amazon S3, Cloudflare R2, Backblaze B2, or any S3-compatible bucket per-project from the dashboard

## Dependencies for Postbase Hosting

- An AWS account with permission to create IAM roles, CloudFormation stacks, CodeBuild projects, ECR repos, RDS instances, and App Runner services
- An existing VPC with at least two subnets in different Availability Zones (your account's default VPC works)

### Implementation Details

The stack (`aws/cloudformation.yaml`) defines:

| Resource | Purpose |
|---|---|
| `EcrRepository` | Private ECR repo holding the built `postbase` image |
| `CodeBuildProject` | Clones the repo, runs `docker build -f Dockerfile.railway`, pushes to ECR |
| `TriggerBuildFunction` (Lambda) | Custom resource that starts the CodeBuild run once during stack creation and waits for it to finish |
| `Database` | RDS Postgres 16, private subnet, encrypted, 7-day backups |
| `AppRunnerService` | Runs the built image, port `3000`, health check at `/api/health` |
| `AppRunnerVpcConnector` | Lets App Runner reach RDS over the VPC |
| `AuthSecretParam` / `DatabaseUrlParam` | SSM `SecureString`-style parameters injected into App Runner as runtime secrets |

**Environment variables set by the stack:**

```
DATABASE_URL         (SSM parameter, from RDS endpoint)
NEXTAUTH_SECRET       (SSM parameter, from AuthSecret)
POSTBASE_JWT_SECRET   (SSM parameter, from AuthSecret)
HOSTNAME              = 0.0.0.0
```

`AuthSecret` is a required stack parameter with no default — generate a strong value with `openssl rand -base64 32`.

### Redeploying after a code change

`AutoDeploymentsEnabled` is `false` — App Runner won't auto-rebuild on every push (there's no CodeBuild webhook wired up in this template). To ship an update, either re-run the CodeBuild project manually and then trigger a new App Runner deployment, or update the stack, which re-runs the build via the custom resource.

## Why Deploy Postbase on AWS?

If your infrastructure already lives on AWS, App Runner + RDS keeps Postbase in the same account, VPC, and IAM boundary as the rest of your stack, with no cluster to manage.
