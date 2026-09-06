#!/usr/bin/env bash
# One-time provisioning for Postbase on Cloud Run + Cloud SQL.
# Run from Cloud Shell (or any shell with gcloud authenticated and a project set).
#
# Usage: ./gcp/setup.sh [region]
set -euo pipefail

REGION="${1:-us-central1}"
PROJECT_ID="$(gcloud config get-value project)"
REPO="postbase"
SERVICE="postbase"
SQL_INSTANCE="postbase-db"
DB_NAME="postbase"
DB_USER="postbase"

if [ -z "$PROJECT_ID" ]; then
  echo "ERROR: no gcloud project set. Run: gcloud config set project <PROJECT_ID>" >&2
  exit 1
fi

echo "==> Enabling required APIs..."
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com

echo "==> Creating Artifact Registry repo (if missing)..."
gcloud artifacts repositories describe "$REPO" --location="$REGION" >/dev/null 2>&1 || \
  gcloud artifacts repositories create "$REPO" \
    --repository-format=docker \
    --location="$REGION" \
    --description="Postbase images"

echo "==> Creating Cloud SQL Postgres instance (this can take several minutes)..."
gcloud sql instances describe "$SQL_INSTANCE" >/dev/null 2>&1 || \
  gcloud sql instances create "$SQL_INSTANCE" \
    --database-version=POSTGRES_16 \
    --tier=db-g1-small \
    --region="$REGION" \
    --storage-auto-increase

echo "==> Creating database and user..."
DB_PASSWORD="$(openssl rand -base64 24)"
gcloud sql databases describe "$DB_NAME" --instance="$SQL_INSTANCE" >/dev/null 2>&1 || \
  gcloud sql databases create "$DB_NAME" --instance="$SQL_INSTANCE"
gcloud sql users create "$DB_USER" --instance="$SQL_INSTANCE" --password="$DB_PASSWORD" 2>/dev/null || \
  gcloud sql users set-password "$DB_USER" --instance="$SQL_INSTANCE" --password="$DB_PASSWORD"

INSTANCE_CONNECTION_NAME="$(gcloud sql instances describe "$SQL_INSTANCE" --format='value(connectionName)')"
DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@localhost/${DB_NAME}?host=/cloudsql/${INSTANCE_CONNECTION_NAME}"

echo "==> Generating AUTH_SECRET and storing secrets in Secret Manager..."
AUTH_SECRET="$(openssl rand -base64 32)"

create_or_update_secret() {
  local name="$1" value="$2"
  if gcloud secrets describe "$name" >/dev/null 2>&1; then
    printf '%s' "$value" | gcloud secrets versions add "$name" --data-file=-
  else
    printf '%s' "$value" | gcloud secrets create "$name" --data-file=- --replication-policy=automatic
  fi
}
create_or_update_secret postbase-auth-secret "$AUTH_SECRET"
create_or_update_secret postbase-database-url "$DATABASE_URL"

echo "==> Granting the default compute service account access to secrets and Cloud SQL..."
# This same service account is used both by Cloud Build to deploy and by the
# Cloud Run service itself at runtime (no --service-account override below),
# so it needs both the secret accessor and Cloud SQL client roles.
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
for secret in postbase-auth-secret postbase-database-url; do
  gcloud secrets add-iam-policy-binding "$secret" \
    --member="serviceAccount:${RUNTIME_SA}" \
    --role="roles/secretmanager.secretAccessor" >/dev/null
done
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role="roles/cloudsql.client" >/dev/null

echo "==> Submitting build (builds image, deploys to Cloud Run, wires Cloud SQL)..."
gcloud builds submit \
  --config=gcp/cloudbuild.yaml \
  --substitutions="_REGION=${REGION},_SERVICE=${SERVICE},_REPO=${REPO},_INSTANCE_CONNECTION_NAME=${INSTANCE_CONNECTION_NAME}" \
  .

SERVICE_URL="$(gcloud run services describe "$SERVICE" --region="$REGION" --format='value(status.url)')"
echo ""
echo "==> Done. Postbase is live at: ${SERVICE_URL}"
echo "==> To redeploy after a code change, re-run: gcloud builds submit --config=gcp/cloudbuild.yaml --substitutions=_REGION=${REGION},_SERVICE=${SERVICE},_REPO=${REPO},_INSTANCE_CONNECTION_NAME=${INSTANCE_CONNECTION_NAME} ."
