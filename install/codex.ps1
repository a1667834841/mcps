$ErrorActionPreference = "Stop"

$RawBase = "https://raw.githubusercontent.com/a1667834841/mcps/main"
$SkillDir = if ($args[0]) { $args[0] } else { Join-Path (Get-Location) "skills" }

Write-Host "==========================================="
Write-Host "  MCP Tools Installer for Codex CLI"
Write-Host "==========================================="
Write-Host ""

# 1. Check node/npm
try {
    $nodeVer = & node -v 2>$null
    $npmVer  = & npm -v 2>$null
    Write-Host "[OK] node $nodeVer / npm $npmVer"
} catch {
    Write-Host "[ERROR] node and npm are required."
    Write-Host "  Install: https://nodejs.org/"
    exit 1
}

# 2. Install npm packages globally
Write-Host ""
Write-Host "[1/2] Installing npm packages globally..."
& npm i -g @ggball/mcp-database @ggball/mcp-ssh-log
Write-Host "  -> @ggball/mcp-database"
Write-Host "  -> @ggball/mcp-ssh-log"

# 3. Download skills
Write-Host ""
Write-Host "[2/2] Downloading skills -> $SkillDir\"

$dbDir  = Join-Path $SkillDir "mcp-database"
$sshDir = Join-Path $SkillDir "mcp-ssh-log"
New-Item -ItemType Directory -Force -Path $dbDir  | Out-Null
New-Item -ItemType Directory -Force -Path $sshDir | Out-Null

$files = @("SKILL.md", "reference.md")
foreach ($f in $files) {
    Invoke-WebRequest -Uri "$RawBase/skills/mcp-database/$f" -OutFile (Join-Path $dbDir $f)
    Invoke-WebRequest -Uri "$RawBase/skills/mcp-ssh-log/$f"   -OutFile (Join-Path $sshDir $f)
}

Write-Host ""
Write-Host "==========================================="
Write-Host "  Install complete!"
Write-Host "==========================================="
Write-Host ""
Write-Host "Skills downloaded to: $SkillDir\"
Write-Host ""
Write-Host "Codex CLI does not have a global skill directory."
Write-Host "Merge the key points from SKILL.md files into your project's AGENTS.md,"
Write-Host "or keep them as reference in $SkillDir\."
Write-Host ""
Write-Host "Next step: configure MCP servers."
Write-Host "Add the following to $env:USERPROFILE\.codex\config.toml:"
Write-Host ""
Write-Host "--- cut begin ---"
Write-Host @'
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
'@
Write-Host "--- cut end ---"
Write-Host ""
Write-Host "Reference:"
Write-Host "  Database MCP: $RawBase/database/README.md"
Write-Host "  SSH Log MCP:  $RawBase/ssh_log/README.md"
Write-Host "  config.yaml:  $RawBase/ssh_log/config.example.yaml"
