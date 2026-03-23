#!/usr/bin/env bash
# =============================================================================
# dev.sh — Postbase developer convenience script
# =============================================================================
# Usage:
#   ./dev.sh              → start infra + run migrations + open app (default)
#   ./dev.sh --rebuild    → rebuild Docker images first, then start everything
#   ./dev.sh --infra      → start infra only (no app, no migrations)
#   ./dev.sh --migrate    → run migrations only (infra must already be running)
#   ./dev.sh --reset      → nuke volumes + rebuild images + start fresh
#   ./dev.sh --down       → stop all services
#   ./dev.sh --logs       → tail infra logs
# =============================================================================

set -euo pipefail

# ── Colours ──────────────────────────────────────────────────────────────────
RESET="\033[0m"
BOLD="\033[1m"
DIM="\033[2m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
CYAN="\033[0;36m"
RED="\033[0;31m"

# ── Helpers ───────────────────────────────────────────────────────────────────
info()    { echo -e "${CYAN}${BOLD}▶${RESET} $*"; }
success() { echo -e "${GREEN}${BOLD}✔${RESET} $*"; }
warn()    { echo -e "${YELLOW}${BOLD}⚠${RESET}  $*"; }
error()   { echo -e "${RED}${BOLD}✖${RESET} $*" >&2; exit 1; }
dim()     { echo -e "${DIM}$*${RESET}"; }
divider() { echo -e "${DIM}────────────────────────────────────────${RESET}"; }

# ── Root directory (wherever this script lives) ───────────────────────────────
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_DIR="$ROOT_DIR/apps/web"
ENV_FILE="$WEB_DIR/.env"

# ── Flag parsing ──────────────────────────────────────────────────────────────
MODE="default"
case "${1:-}" in
  --rebuild) MODE="rebuild" ;;
  --infra)   MODE="infra"   ;;
  --migrate) MODE="migrate" ;;
  --reset)   MODE="reset"   ;;
  --down)    MODE="down"    ;;
  --logs)    MODE="logs"    ;;
  "")        MODE="default" ;;
  *) error "Unknown option: ${1}. Run with no args or one of: --rebuild --infra --migrate --reset --down --logs" ;;
esac

# ── Prereq checks ─────────────────────────────────────────────────────────────
check_prereqs() {
  command -v docker  >/dev/null 2>&1 || error "docker is not installed"
  command -v pnpm    >/dev/null 2>&1 || error "pnpm is not installed"
  docker info        >/dev/null 2>&1 || error "Docker daemon is not running — please start Docker Desktop"

  if [ ! -f "$ENV_FILE" ]; then
    warn ".env not found at apps/web/.env"
    if [ -f "$WEB_DIR/.env.example" ]; then
      cp "$WEB_DIR/.env.example" "$ENV_FILE"
      warn "Copied .env.example → apps/web/.env. Please review it, then re-run."
      dim "  Tip: generate a secret with: openssl rand -base64 32"
      exit 1
    elif [ -f "$ROOT_DIR/.env.example" ]; then
      cp "$ROOT_DIR/.env.example" "$ENV_FILE"
      warn "Copied .env.example → apps/web/.env. Please review it, then re-run."
      exit 1
    else
      error "No .env found. Please create apps/web/.env — see README for required variables."
    fi
  fi
}

# ── Wait for postgres to be healthy ──────────────────────────────────────────
wait_for_postgres() {
  info "Waiting for PostgreSQL to be ready..."
  local retries=60
  until docker compose -f "$ROOT_DIR/docker-compose.yml" exec -T postgres \
        pg_isready -U "${POSTGRES_USER:-postbase}" >/dev/null 2>&1; do
    retries=$((retries - 1))
    if [ "$retries" -le 0 ]; then
      echo ""
      error "PostgreSQL did not become healthy in time. Last logs:\n$(docker compose -f "$ROOT_DIR/docker-compose.yml" logs postgres --tail=15 2>&1)"
    fi
    # Check if the container crashed (not just slow to start)
    local state
    state=$(docker compose -f "$ROOT_DIR/docker-compose.yml" ps postgres --format '{{.Status}}' 2>/dev/null || true)
    if echo "$state" | grep -qi "restarting\|exited\|exit"; then
      echo ""
      warn "PostgreSQL container is restarting/crashed. This is often caused by a data volume"
      warn "created with an older Postgres version. Run: ./dev.sh --reset"
      echo ""
      dim "Last container logs:"
      docker compose -f "$ROOT_DIR/docker-compose.yml" logs postgres --tail=10 2>&1 | sed 's/^/  /'
      exit 1
    fi
    printf "."
    sleep 1
  done
  echo ""
  success "PostgreSQL is ready"
}

# ── Install node deps if needed ───────────────────────────────────────────────
ensure_deps() {
  if [ ! -d "$ROOT_DIR/node_modules" ] || [ ! -d "$WEB_DIR/node_modules" ]; then
    info "Installing dependencies..."
    (cd "$ROOT_DIR" && pnpm install)
    success "Dependencies installed"
  fi
}

# ── Modes ─────────────────────────────────────────────────────────────────────

do_down() {
  divider
  info "Stopping all services..."
  (cd "$ROOT_DIR" && docker compose down)
  success "All services stopped"
}

do_logs() {
  info "Tailing infra logs (Ctrl+C to exit)..."
  (cd "$ROOT_DIR" && docker compose logs -f postgres minio)
}

do_infra() {
  local rebuild="${1:-false}"
  divider
  info "Starting infrastructure (PostgreSQL + MinIO)..."
  if [ "$rebuild" = "true" ]; then
    info "Rebuilding Docker images..."
    (cd "$ROOT_DIR" && docker compose build postgres)
    success "Images rebuilt"
  fi
  (cd "$ROOT_DIR" && docker compose up -d postgres minio)
  wait_for_postgres
}

do_migrate() {
  divider
  info "Running database migrations (db:push)..."
  ensure_deps
  (cd "$ROOT_DIR" && pnpm db:push)
  success "Migrations complete"
}

do_seed() {
  divider
  info "Seeding default admin user..."
  (cd "$ROOT_DIR" && pnpm db:seed)
}

do_app() {
  divider
  info "Starting Next.js dev server..."
  dim "  App will be available at → http://localhost:3000"
  dim "  Dashboard              → http://localhost:3000/dashboard"
  dim "  MinIO console          → http://localhost:9001"
  divider
  (cd "$ROOT_DIR" && pnpm dev)
}

do_reset() {
  divider
  warn "RESET MODE — this will delete all local data volumes!"
  read -rp "  Are you sure? Type 'yes' to continue: " confirm
  [ "$confirm" = "yes" ] || { info "Aborted."; exit 0; }

  info "Stopping services and removing volumes..."
  (cd "$ROOT_DIR" && docker compose down -v)
  success "Volumes cleared"

  info "Rebuilding Docker images..."
  (cd "$ROOT_DIR" && docker compose build postgres)
  success "Images rebuilt"
}

# ── Banner ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}${BOLD}  ╔═══════════════════════════╗${RESET}"
echo -e "${CYAN}${BOLD}  ║      Postbase Dev          ║${RESET}"
echo -e "${CYAN}${BOLD}  ╚═══════════════════════════╝${RESET}"
echo ""

# ── Main ───────────────────────────────────────────────────────────────────────
cd "$ROOT_DIR"
check_prereqs

case "$MODE" in
  default)
    # Start infra → migrate → seed → run app
    do_infra false
    do_migrate
    do_seed
    do_app
    ;;
  rebuild)
    # Rebuild postgres image → start infra → migrate → seed → run app
    do_infra true
    do_migrate
    do_seed
    do_app
    ;;
  infra)
    # Infra only, no app
    do_infra false
    success "Infrastructure is running. Start the app with: pnpm dev"
    ;;
  migrate)
    # Migrations only
    do_migrate
    ;;
  reset)
    # Nuke everything → rebuild → start fresh → migrate → seed → run app
    do_reset
    do_infra false
    do_migrate
    do_seed
    do_app
    ;;
  down)
    do_down
    ;;
  logs)
    do_logs
    ;;
esac
