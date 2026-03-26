#!/usr/bin/env bash
set -euo pipefail

INITIAL_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
ORIGINAL_CWD="$(pwd)"
INSTALL_REPO_URL="https://github.com/thanhan92-f1/Nemo-Claw.git"
CANONICAL_INSTALL_URL="https://raw.githubusercontent.com/thanhan92-f1/Nemo-Claw/refs/heads/main/standalone-api/install.sh"
UPSTREAM_NEMOCLAW_INSTALL_URL="https://raw.githubusercontent.com/NVIDIA/NemoClaw/refs/heads/main/install.sh"
HOST="${NEMOCLAW_API_HOST:-127.0.0.1}"
PORT="${NEMOCLAW_API_PORT:-3100}"
DEFAULT_SANDBOX="${NEMOCLAW_DEFAULT_SANDBOX:-my-assistant}"

info() { printf '[standalone-api] %s\n' "$*"; }
fail() { printf '[standalone-api] ERROR: %s\n' "$*" >&2; exit 1; }

refresh_paths() {
  SCRIPT_DIR="${ROOT_DIR}/standalone-api"
  SERVER_FILE="${SCRIPT_DIR}/server.js"
  POSTMAN_DIR="${SCRIPT_DIR}/postman"
  ROOT_INSTALL_SCRIPT="${ROOT_DIR}/install.sh"
  ENV_FILE="${SCRIPT_DIR}/.env.local"
}

ensure_repo_present() {
  local target_root="$1"
  if [ -f "${target_root}/bin/nemoclaw.js" ] && [ -f "${target_root}/standalone-api/server.js" ]; then
    info "Using existing repo: ${target_root}"
    return 0
  fi

  command -v git >/dev/null 2>&1 || fail 'git is required to bootstrap the standalone repo.'

  if [ -e "$target_root" ] && [ ! -d "$target_root/.git" ] && [ -n "$(find "$target_root" -mindepth 1 -maxdepth 1 2>/dev/null | head -1)" ]; then
    fail "Target directory already exists and is not a git repo: ${target_root}"
  fi

  mkdir -p "$(dirname "$target_root")"
  if [ -d "$target_root/.git" ]; then
    info "Updating standalone repo: ${target_root}"
    git -C "$target_root" pull --ff-only
  else
    info "Cloning standalone repo: ${INSTALL_REPO_URL}"
    git clone "$INSTALL_REPO_URL" "$target_root"
  fi
}

if [ -f "${INITIAL_SCRIPT_DIR}/server.js" ] && [ -f "${INITIAL_SCRIPT_DIR}/../bin/nemoclaw.js" ]; then
  ROOT_DIR="$(cd "${INITIAL_SCRIPT_DIR}/.." && pwd)"
else
  ROOT_DIR="${NEMOCLAW_STANDALONE_DIR:-${ORIGINAL_CWD}/Nemo-Claw}"
  ensure_repo_present "$ROOT_DIR"
fi

refresh_paths

[ -f "$SERVER_FILE" ] || fail "Missing ${SERVER_FILE}"
[ -f "${ROOT_DIR}/bin/nemoclaw.js" ] || fail 'Missing NemoClaw CLI after bootstrap.'
[ -f "$ROOT_INSTALL_SCRIPT" ] || fail "Missing ROOT_INSTALL_SCRIPT: ${ROOT_INSTALL_SCRIPT}"

chmod +x "$SERVER_FILE" || true
chmod +x "$SCRIPT_DIR/install.sh" || true
chmod +x "$ROOT_INSTALL_SCRIPT" || true

if [ "${NEMOCLAW_SKIP_ROOT_INSTALL:-0}" != "1" ]; then
  info "Running local ROOT_INSTALL_SCRIPT: ${ROOT_INSTALL_SCRIPT}"
  bash "$ROOT_INSTALL_SCRIPT" "$@"
else
  info "Skipping local ROOT_INSTALL_SCRIPT because NEMOCLAW_SKIP_ROOT_INSTALL=1"
fi

command -v node >/dev/null 2>&1 || fail 'Node.js is required after installation.'
command -v npm >/dev/null 2>&1 || fail 'npm is required after installation.'

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "$NODE_MAJOR" -lt 20 ]; then
  fail 'Node.js >= 20 is required.'
fi

cat > "$ENV_FILE" <<EOF
NEMOCLAW_API_HOST=${HOST}
NEMOCLAW_API_PORT=${PORT}
NEMOCLAW_DEFAULT_SANDBOX=${DEFAULT_SANDBOX}
# Optional runtime secrets if needed by the wrapper:
# NVIDIA_API_KEY=
# OPENAI_API_KEY=
# ANTHROPIC_API_KEY=
# GEMINI_API_KEY=
# TELEGRAM_BOT_TOKEN=
EOF
chmod 600 "$ENV_FILE" || true

info "Standalone API bootstrap is ready."
info "One-command bootstrap URL: $CANONICAL_INSTALL_URL"
info "Standalone repo: $INSTALL_REPO_URL"
info "Upstream NemoClaw installer: $UPSTREAM_NEMOCLAW_INSTALL_URL"
info "ROOT_INSTALL_SCRIPT (local root install.sh): $ROOT_INSTALL_SCRIPT"
info "Server file: $SERVER_FILE"
info "Postman collection: ${POSTMAN_DIR}/nemoclaw-standalone-api.postman_collection.json"
info "Postman environment: ${POSTMAN_DIR}/nemoclaw-local.postman_environment.json"
info ""
info "Install flow:"
info "  1. Run one command: curl -fsSL ${CANONICAL_INSTALL_URL} | bash"
info "  2. Script clones or reuses repo: ${INSTALL_REPO_URL}"
info "  3. Script runs local ROOT_INSTALL_SCRIPT: ${ROOT_INSTALL_SCRIPT}"
info "  4. standalone-api/install.sh then prepares wrapper env"
info ""
info "Installer metadata available via API:"
info "  GET  http://${HOST}:${PORT}/api/install"
info "  GET  http://${HOST}:${PORT}/api/install/script"
info "  POST http://${HOST}:${PORT}/api/install/run"
info ""
info "Start server with:"
info "  export \
$(sed 's/^/  /' "$ENV_FILE")"
info "  node ${SERVER_FILE}"
info ""
info "Next steps:"
info "  1. Source env: source ${ENV_FILE}"
info "  2. Start API: node ${SERVER_FILE}"
info "  3. Test nhanh: GET http://${HOST}:${PORT}/health"
info "  4. Import Postman collection + environment để test full flow"
info ""
info "Web UI:"
info "  http://${HOST}:${PORT}/"
info "  http://${HOST}:${PORT}/chat?sandbox=${DEFAULT_SANDBOX}"
info "  http://${HOST}:${PORT}/terminal?sandbox=${DEFAULT_SANDBOX}"
