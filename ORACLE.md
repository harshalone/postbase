# Deploy and Host Postbase on Oracle Cloud

> **Status: unverified, and not fully one-click.** This Resource Manager stack was written to match Postbase's Docker/Railway/DigitalOcean deploy pattern but has not been deployed against a real OCI tenancy. Of the four cloud templates in this repo, this is the least standardized path — Oracle has no container-native "build from a public GitHub Dockerfile" service comparable to AWS CodeBuild, GCP Cloud Build, or Azure ACR Tasks that just works without extra input. Two things need attention before/after using it:
>
> 1. **A GitHub personal access token is required** even though `harshalone/postbase` is public — OCI DevOps's GitHub connection type doesn't support anonymous access. Create a token with `repo:read` (or `public_repo`) scope and supply it via `TF_VAR_github_access_token` when applying, or fill it into the Resource Manager job's variables.
> 2. **`NEXTAUTH_URL` is not set automatically.** OCI Container Instances don't support in-place environment variable updates, and the container needs its own public IP before that URL is known. After the stack finishes, manually recreate the container instance with `NEXTAUTH_URL` added (see below), or accept that OAuth-based auth providers won't have a correct callback URL until you do.

Postbase is a self-hosted auth and database platform for Next.js. Drop it into your stack, configure 25+ auth providers from a dashboard, and connect your app with a single SDK call. Think self-hosted Supabase or Clerk — you own the data, you control the infra.

## About Hosting Postbase

On Oracle Cloud, Postbase runs as an **OCI Container Instance**, built from `Dockerfile.railway` via an **OCI DevOps build pipeline** (OCI's managed CI/CD service) that pushes to a private **OCI Registry (OCIR)** repo, with an **OCI Database with PostgreSQL** instance for storage. Same split-service model as the other three providers: the app is stateless and rebuildable independently of the database.

## Common Use Cases

- **Add auth to a Next.js app** — enable email/password, magic links, or any of 25+ OAuth providers (GitHub, Google, Discord, and more) from the dashboard without writing auth code
- **Self-host your user database** — store users, sessions, and OAuth accounts in your own Postgres instance with full SQL access via the built-in editor
- **Manage files and storage** — connect Amazon S3, Cloudflare R2, Backblaze B2, or any S3-compatible bucket per-project from the dashboard

## Dependencies for Postbase Hosting

- An OCI tenancy with permission to create VCNs, OCI Database with PostgreSQL systems, Container Instances, OCIR repos, and OCI DevOps projects/pipelines
- A GitHub personal access token (`repo:read` scope) for the OCI DevOps GitHub connection

### Implementation Details

The stack (`oracle/main.tf`) defines:

| Resource | Purpose |
|---|---|
| `oci_core_vcn` + subnet/security list/route table | Minimal networking: public subnet, port 3000 open, Postgres confined to the VCN |
| `oci_psql_db_system` | OCI Database with PostgreSQL 16 |
| `oci_artifacts_container_repository` | Private OCIR repo holding the built image |
| `oci_devops_project` / `build_pipeline` / stages | Clones the repo, runs `oracle/build_spec.yaml` (`docker build -f Dockerfile.railway`), pushes to OCIR |
| `null_resource.run_build` | Triggers the build pipeline once during `terraform apply` |
| `oci_container_instances_container_instance` | Runs the built image, port `3000` |

**Environment variables set on the container:**

```
DATABASE_URL         (from the OCI Database with PostgreSQL connection details)
NEXTAUTH_SECRET       (from auth_secret variable)
POSTBASE_JWT_SECRET   (from auth_secret variable)
HOSTNAME               = 0.0.0.0
```

`auth_secret` is a required, sensitive Terraform variable — generate a strong value with `openssl rand -base64 32`.

### Finishing setup: setting NEXTAUTH_URL

```sh
terraform output service_url   # e.g. http://140.x.x.x:3000
```

Recreate the container instance with `NEXTAUTH_URL` added to its environment (Container Instances require a full replace for env var changes — there is no in-place update):

```sh
oci container-instances container-instance update \
  --container-instance-id <id-from-terraform-output> \
  --containers '[{"environmentVariables": {"NEXTAUTH_URL": "http://<ip>:3000", ...}}]' \
  --force
```

Or edit `oracle/main.tf` to add the value once you know it and re-apply.

### Redeploying after a code change

```sh
oci devops build-run create-build-run-source-github \
  --build-pipeline-id <id-from-terraform-state> \
  --wait-for-state SUCCEEDED --wait-for-state FAILED
oci container-instances container-instance restart --container-instance-id <id>
```

## Why Deploy Postbase on Oracle Cloud?

OCI's Always Free tier includes Autonomous Database and compute credits that can offset the cost of running Postbase here, if your infra already lives on Oracle Cloud.
