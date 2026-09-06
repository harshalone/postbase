#!/usr/bin/env bash
# One-time provisioning for Postbase on Fly.io.
# Run after `fly launch --no-deploy` (or after clicking "Deploy to Fly", which
# runs launch for you) — this script creates the Postgres cluster, attaches it,
# sets the remaining secrets, and deploys.
#
# Usage: ./fly/setup.sh [app-name] [region]
set -euo pipefail

APP_NAME="${1:-postbase}"
REGION="${2:-iad}"
DB_APP_NAME="${APP_NAME}-db"

echo "==> Creating Fly Postgres cluster (${DB_APP_NAME})..."
fly postgres create --name "$DB_APP_NAME" --region "$REGION" --initial-cluster-size 1 --vm-size shared-cpu-1x --volume-size 10

echo "==> Attaching Postgres to ${APP_NAME} (sets DATABASE_URL automatically)..."
fly postgres attach "$DB_APP_NAME" --app "$APP_NAME"

echo "==> Generating AUTH_SECRET and setting secrets..."
AUTH_SECRET="$(openssl rand -base64 32)"
fly secrets set \
  NEXTAUTH_SECRET="$AUTH_SECRET" \
  POSTBASE_JWT_SECRET="$AUTH_SECRET" \
  --app "$APP_NAME"

echo "==> Deploying..."
fly deploy --app "$APP_NAME"

APP_URL="https://${APP_NAME}.fly.dev"
fly secrets set NEXTAUTH_URL="$APP_URL" --app "$APP_NAME"

echo ""
echo "==> Done. Postbase is live at: ${APP_URL}"
echo "==> To redeploy after a code change: fly deploy --app ${APP_NAME}"
