#!/usr/bin/env bash
set -euo pipefail

RAW_BASE="https://raw.githubusercontent.com/a1667834841/mcps/main"
SKILL_DIR="${1:-./skills}"

echo "==========================================="
echo "  MCP Tools Installer for Codex CLI"
echo "==========================================="
echo ""

# 1. Check node/npm
if ! command -v node &>/dev/null || ! command -v npm &>/dev/null; then
  echo "[ERROR] node and npm are required."
  echo "  Install: https://nodejs.org/"
  exit 1
fi
echo "[OK] node $(node -v) / npm $(npm -v)"

# 2. Install npm packages globally
echo ""
echo "[1/2] Installing npm packages globally..."
npm i -g @ggball/mcp-database @ggball/mcp-ssh-log
echo "  -> @ggball/mcp-database"
echo "  -> @ggball/mcp-ssh-log"

# 3. Download skills
echo ""
echo "[2/2] Downloading skills -> ${SKILL_DIR}/"
mkdir -p "${SKILL_DIR}/mcp-database" "${SKILL_DIR}/mcp-ssh-log"

for f in SKILL.md reference.md; do
  curl -fsSL "${RAW_BASE}/scripts/skills/mcp-database/${f}" -o "${SKILL_DIR}/mcp-database/${f}"
  curl -fsSL "${RAW_BASE}/scripts/skills/mcp-ssh-log/${f}"   -o "${SKILL_DIR}/mcp-ssh-log/${f}"
done

echo ""
echo "==========================================="
echo "  Install complete!"
echo "==========================================="
echo ""
echo "Skills downloaded to: ${SKILL_DIR}/"
echo ""
echo "Codex CLI does not have a global skill directory."
echo "Merge the key points from SKILL.md files into your project's AGENTS.md,"
echo "or keep them as reference in ${SKILL_DIR}/."
echo ""
echo "Next step: configure MCP servers."
echo "Add the following to ~/.codex/config.toml:"
echo ""
echo '--- cut begin ---'
cat <<'CONFIG'
[mcp_servers.<your-db-id>]
command = "mcp-database"

[mcp_servers.<your-db-id>.env]
DB_TYPE = "oceanbase"
DB_HOST = "<your-host>"
DB_PORT = "2881"
DB_USER = "<user>"
DB_PASSWORD = "<password>"
DB_DATABASE = "<database>"
DB_CHARSET = "utf8mb4"
DB_READONLY = "true"
DB_MAX_ROWS = "1000"

[mcp_servers.ssh-log]
command = "mcp-ssh-log"

[mcp_servers.ssh-log.env]
SSH_LOG_CONFIG = "<absolute-path-to-config.yaml>"
CONFIG
echo '--- cut end ---'
echo ""
echo "Reference:"
echo "  Database MCP: ${RAW_BASE}/database/README.md"
echo "  SSH Log MCP:  ${RAW_BASE}/ssh_log/README.md"
echo "  config.yaml:  ${RAW_BASE}/ssh_log/config.example.yaml"
