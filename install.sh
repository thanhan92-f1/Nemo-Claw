#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SERVER_FILE="${SCRIPT_DIR}/server.js"
POSTMAN_DIR="${SCRIPT_DIR}/postman"
ROOT_INSTALL_SCRIPT="${ROOT_DIR}/install.sh"
INSTALL_REPO_URL="https://github.com/NVIDIA/NemoClaw.git"
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

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "$NODE_MAJOR" -lt 20 ]; then
  fail 'Node.js >= 20 is required.'
fi

chmod +x "$SERVER_FILE" || true
chmod +x "$SCRIPT_DIR/install.sh" || true
[ -f "$ROOT_INSTALL_SCRIPT" ] && chmod +x "$ROOT_INSTALL_SCRIPT" || true

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
info "Bootstrap installer URL: $CANONICAL_INSTALL_URL"
info "Root install repo: $INSTALL_REPO_URL"
[ -f "$ROOT_INSTALL_SCRIPT" ] && info "ROOT_INSTALL_SCRIPT (local root install.sh): $ROOT_INSTALL_SCRIPT" || info "ROOT_INSTALL_SCRIPT (local root install.sh): not found yet"
info "Postman collection: ${POSTMAN_DIR}/nemoclaw-standalone-api.postman_collection.json"
info "Postman environment: ${POSTMAN_DIR}/nemoclaw-local.postman_environment.json"
info ""
info "Install flow:"
info "  1. Run bootstrap installer from CANONICAL_INSTALL_URL"
info "  2. ROOT_INSTALL_SCRIPT means local file: ${ROOT_INSTALL_SCRIPT}"
info "  3. Root install source repo: ${INSTALL_REPO_URL}"
info "  3. standalone-api/install.sh is only an additional helper"
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
info "  1. Chạy bootstrap installer: curl -fsSL ${CANONICAL_INSTALL_URL} | bash"
info "  2. Kiểm tra ROOT_INSTALL_SCRIPT local: ${ROOT_INSTALL_SCRIPT}"
info "  3. Kiểm tra repo root install từ: ${INSTALL_REPO_URL}"
info "  4. Source env: source ${ENV_FILE}"
info "  5. Start API: node ${SERVER_FILE}"
info "  6. Test nhanh: GET http://${HOST}:${PORT}/health"
info "  7. Import Postman collection + environment để test full flow"
info ""
info "Web UI:"
info "  http://${HOST}:${PORT}/"
info "  http://${HOST}:${PORT}/chat?sandbox=${DEFAULT_SANDBOX}"
info "  http://${HOST}:${PORT}/terminal?sandbox=${DEFAULT_SANDBOX}"
