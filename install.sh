#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SERVER_FILE="${SCRIPT_DIR}/server.js"
POSTMAN_DIR="${SCRIPT_DIR}/postman"
ROOT_INSTALL_SCRIPT="${ROOT_DIR}/install.sh"
CANONICAL_INSTALL_URL="https://raw.githubusercontent.com/NVIDIA/NemoClaw/refs/heads/main/install.sh"
HOST="${NEMOCLAW_API_HOST:-127.0.0.1}"
PORT="${NEMOCLAW_API_PORT:-3100}"
DEFAULT_SANDBOX="${NEMOCLAW_DEFAULT_SANDBOX:-my-assistant}"

info() { printf '[standalone-api] %s\n' "$*"; }
fail() { printf '[standalone-api] ERROR: %s\n' "$*" >&2; exit 1; }

command -v node >/dev/null 2>&1 || fail 'Node.js is required.'
command -v npm >/dev/null 2>&1 || fail 'npm is required.'
[ -f "$SERVER_FILE" ] || fail "Missing ${SERVER_FILE}"
[ -f "${ROOT_DIR}/bin/nemoclaw.js" ] || fail 'This script must run inside the NemoClaw repository.'
[ -f "$ROOT_INSTALL_SCRIPT" ] || fail "Missing ${ROOT_INSTALL_SCRIPT}"

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "$NODE_MAJOR" -lt 20 ]; then
  fail 'Node.js >= 20 is required.'
fi

chmod +x "$SERVER_FILE" || true
chmod +x "$SCRIPT_DIR/install.sh" || true
chmod +x "$ROOT_INSTALL_SCRIPT" || true

ENV_FILE="${SCRIPT_DIR}/.env.local"
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

info "Standalone API is ready."
info "Server file: $SERVER_FILE"
info "Canonical installer: $CANONICAL_INSTALL_URL"
info "Local repo install copy: $ROOT_INSTALL_SCRIPT"
info "Postman collection: ${POSTMAN_DIR}/nemoclaw-standalone-api.postman_collection.json"
info "Postman environment: ${POSTMAN_DIR}/nemoclaw-local.postman_environment.json"
info ""
info "Main installer is the raw GitHub install.sh."
info "This install.sh inside standalone-api is only an additional helper."
info ""
info "Canonical installer available via API:"
info "  GET  http://${HOST}:${PORT}/api/install"
info "  GET  http://${HOST}:${PORT}/api/install/script"
info "  POST http://${HOST}:${PORT}/api/install/run"
info ""
info "Start server with:"
info "  export \
$(sed 's/^/  /' "$ENV_FILE")"
info "  node ${SERVER_FILE}"
info ""
info "Web UI:"
info "  http://${HOST}:${PORT}/"
info "  http://${HOST}:${PORT}/chat?sandbox=${DEFAULT_SANDBOX}"
info "  http://${HOST}:${PORT}/terminal?sandbox=${DEFAULT_SANDBOX}"
