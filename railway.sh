#!/usr/bin/env bash
# =============================================================================
# railway.sh — Postbase Railway deployment helper
# =============================================================================
# Usage:
#   ./railway.sh              → show status of current Railway deployment
#   ./railway.sh --setup      → first-time: link project + set required variables
#   ./railway.sh --deploy     → push latest code and trigger a redeploy
#   ./railway.sh --vars       → print current Railway environment variables
#   ./railway.sh --logs       → tail live deployment logs
#   ./railway.sh --open       → open the deployed app in browser
# =============================================================================

set -euo pipefail

# ── Colours ───────────────────────────────────────────────────────────────────
RESET="\033[0m"
BOLD="\033[1m"
DIM="\033[2m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
CYAN="\033[0;36m"
RED="\033[0;31m"

info()    { echo -e "${CYAN}${BOLD}▶${RESET} $*"; }
success() { echo -e "${GREEN}${BOLD}✔${RESET} $*"; }
warn()    { echo -e "${YELLOW}${BOLD}⚠${RESET}  $*"; }
error()   { echo -e "${RED}${BOLD}✖${RESET} $*" >&2; exit 1; }
dim()     { echo -e "${DIM}$*${RESET}"; }
divider() { echo -e "${DIM}────────────────────────────────────────${RESET}"; }

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Flag parsing ──────────────────────────────────────────────────────────────
MODE="status"
case "${1:-}" in
  --setup)  MODE="setup"  ;;
  --deploy) MODE="deploy" ;;
  --vars)   MODE="vars"   ;;
  --logs)   MODE="logs"   ;;
  --open)   MODE="open"   ;;
  "")       MODE="status" ;;
  *) error "Unknown option: ${1}. Use: --setup --deploy --vars --logs --open" ;;
esac

# ── Prereq checks ─────────────────────────────────────────────────────────────
check_prereqs() {
  command -v git     >/dev/null 2>&1 || error "git is not installed"
  command -v railway >/dev/null 2>&1 || {
    warn "Railway CLI not found. Install it with:"
    dim "  npm install -g @railway/cli"
    dim "  or: brew install railway"
    exit 1
  }
}

# ── Ensure logged in to Railway ───────────────────────────────────────────────
check_auth() {
  if ! railway whoami >/dev/null 2>&1; then
    info "Not logged in to Railway. Running login..."
    railway login
  fi
}

# ── Generate a random secret ──────────────────────────────────────────────────
gen_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 32
  else
    # fallback: use /dev/urandom
    head -c 32 /dev/urandom | base64 | tr -d '\n/'
  fi
}

# ── Setup mode ────────────────────────────────────────────────────────────────
do_setup() {
  divider
  info "Railway first-time setup"
  divider

  check_auth

  # Link to Railway project
  if ! railway status >/dev/null 2>&1; then
    info "Linking to a Railway project..."
    dim "  Select an existing project or create a new one."
    railway link
  else
    success "Already linked to a Railway project"
    railway status
  fi

  divider
  info "Checking required environment variables..."

  # Check if AUTH_SECRET is set; if not, generate and set one
  local existing_secret
  existing_secret=$(railway variables get AUTH_SECRET 2>/dev/null || true)

  if [ -z "$existing_secret" ]; then
    info "AUTH_SECRET not set — generating one..."
    local secret
    secret=$(gen_secret)
    railway variables set AUTH_SECRET="$secret"
    success "AUTH_SECRET set"
  else
    success "AUTH_SECRET already set"
  fi

  # Remind about Postgres link
  divider
  warn "Make sure you have:"
  dim "  1. Added a PostgreSQL service in your Railway project"
  dim "  2. Linked it to this service so DATABASE_URL is auto-injected"
  dim ""
  dim "  In Railway dashboard: your web service → Variables tab"
  dim "  You should see DATABASE_URL from the Postgres service."
  dim ""
  dim "  If not: open your Railway project → Add Service → Database → PostgreSQL"
  dim "  Then in your web service → Variables → Add Reference → Postgres.DATABASE_URL"

  divider
  success "Setup complete. Run ./railway.sh --deploy to push your first deployment."
}

# ── Deploy mode ───────────────────────────────────────────────────────────────
do_deploy() {
  divider
  info "Deploying to Railway..."

  check_auth

  # Ensure working directory is clean (warn if not)
  if ! git -C "$ROOT_DIR" diff --quiet || ! git -C "$ROOT_DIR" diff --cached --quiet; then
    warn "You have uncommitted changes. Commit them first or they won't be deployed."
    git -C "$ROOT_DIR" status --short
    echo ""
    read -rp "  Continue anyway with last committed state? [y/N] " confirm
    [[ "$confirm" =~ ^[Yy]$ ]] || { info "Aborted."; exit 0; }
  fi

  # Push to git remote (Railway deploys from git)
  local branch
  branch=$(git -C "$ROOT_DIR" rev-parse --abbrev-ref HEAD)
  info "Pushing branch '${branch}' to origin..."
  git -C "$ROOT_DIR" push origin "$branch"
  success "Pushed to origin/${branch}"

  # Trigger Railway redeploy
  info "Triggering Railway deployment..."
  railway up --detach
  success "Deployment triggered"

  divider
  info "Tailing deployment logs (Ctrl+C to stop watching)..."
  railway logs
}

# ── Vars mode ─────────────────────────────────────────────────────────────────
do_vars() {
  divider
  info "Railway environment variables"
  divider
  check_auth
  railway variables
}

# ── Logs mode ─────────────────────────────────────────────────────────────────
do_logs() {
  check_auth
  info "Tailing Railway deployment logs (Ctrl+C to exit)..."
  railway logs --tail
}

# ── Open mode ─────────────────────────────────────────────────────────────────
do_open() {
  check_auth
  info "Opening deployed app..."
  railway open
}

# ── Status mode ───────────────────────────────────────────────────────────────
do_status() {
  check_auth
  divider
  info "Railway project status"
  divider
  railway status
  echo ""
  dim "  Run ./railway.sh --logs  to tail live logs"
  dim "  Run ./railway.sh --vars  to inspect environment variables"
  dim "  Run ./railway.sh --open  to open the deployed app"
  dim "  Run ./railway.sh --deploy to push a new deployment"
}

# ── Banner ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}${BOLD}  ╔═══════════════════════════╗${RESET}"
echo -e "${CYAN}${BOLD}  ║    Postbase → Railway      ║${RESET}"
echo -e "${CYAN}${BOLD}  ╚═══════════════════════════╝${RESET}"
echo ""

# ── Main ───────────────────────────────────────────────────────────────────────
cd "$ROOT_DIR"
check_prereqs

case "$MODE" in
  setup)  do_setup  ;;
  deploy) do_deploy ;;
  vars)   do_vars   ;;
  logs)   do_logs   ;;
  open)   do_open   ;;
  status) do_status ;;
esac
