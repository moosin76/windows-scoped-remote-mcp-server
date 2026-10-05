#!/usr/bin/env bash
set -u

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

printf '%s\n' "============================================================"
printf '%s\n' "  Starting Windows Scoped Remote MCP Server"
printf '%s\n' "============================================================"

# This launcher targets Git Bash / MSYS on Windows.
case "$(uname -s 2>/dev/null || true)" in
  MINGW*|MSYS*|CYGWIN*) ;;
  *)
    echo "[!] start.sh is intended for Git Bash/MSYS on Windows." >&2
    echo "    Current shell: $(uname -s 2>/dev/null || echo unknown)" >&2
    exit 1
    ;;
esac

# 1. Check if node_modules exists, install if missing.
if [[ ! -d "node_modules" ]]; then
  echo "[*] Installing dependencies..."
  if ! npm install; then
    echo "[!] Failed to install dependencies." >&2
    exit 1
  fi
fi

# 2. Require a configured .env file before starting.
if [[ ! -f ".env" ]]; then
  echo "[!] .env file not found."
  echo
  echo "    Please create .env from .env.example and configure it first:"
  echo
  echo "    cp .env.example .env"
  echo
  echo "    Then edit .env and run start.sh again."
  echo
  exit 1
fi

# 3. Ensure uvx is available for local stdio MCP providers such as Godot AI.
UV_BIN_DIR=""
if command -v cygpath >/dev/null 2>&1 && [[ -n "${USERPROFILE:-}" ]]; then
  UV_BIN_DIR="$(cygpath -u "$USERPROFILE")/.local/bin"
  if [[ -d "$UV_BIN_DIR" ]]; then
    export PATH="$UV_BIN_DIR:$PATH"
  fi
fi

if ! command -v uvx >/dev/null 2>&1; then
  echo "[*] uvx not found. Installing Astral uv..."
  if command -v powershell.exe >/dev/null 2>&1; then
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command '$ErrorActionPreference = "Stop"; [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; irm https://astral.sh/uv/install.ps1 | iex'
  elif command -v pwsh >/dev/null 2>&1; then
    pwsh -NoProfile -Command '$ErrorActionPreference = "Stop"; irm https://astral.sh/uv/install.ps1 | iex'
  else
    echo "[!] PowerShell is required to install Astral uv automatically." >&2
    exit 1
  fi

  if [[ -n "$UV_BIN_DIR" && -d "$UV_BIN_DIR" ]]; then
    export PATH="$UV_BIN_DIR:$PATH"
  fi
fi

if ! command -v uvx >/dev/null 2>&1; then
  echo "[!] uvx is still unavailable after installation." >&2
  echo "    Restart the terminal or add %USERPROFILE%\\.local\\bin to PATH." >&2
  exit 1
fi

echo "[OK] uvx is available:"
uvx --version

# 4. Sync Remote Desktop Commander allowlist from WSR workspaces.
echo "[*] Syncing Desktop Commander allowed directories from WSR workspace configuration..."
if npx --no-install tsx scripts/sync-desktop-commander-workspaces.ts; then
  echo "[OK] Desktop Commander workspace allowlist synced."
else
  echo "[!] Desktop Commander workspace sync failed. Continuing WSR startup." >&2
fi

# 5. Check if bin/cloudflared.exe exists, download automatically if missing.
CLOUDFLARED="bin/cloudflared.exe"
CLOUDFLARED_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"

if [[ ! -f "$CLOUDFLARED" ]]; then
  echo "[*] bin/cloudflared.exe not found. Downloading latest Cloudflare Tunnel binary..."
  mkdir -p bin

  if command -v curl >/dev/null 2>&1; then
    if ! curl -fL --retry 3 --retry-delay 1 -o "$CLOUDFLARED" "$CLOUDFLARED_URL"; then
      rm -f "$CLOUDFLARED"
    fi
  elif command -v pwsh >/dev/null 2>&1; then
    if ! pwsh -NoProfile -Command "Invoke-WebRequest -Uri '$CLOUDFLARED_URL' -OutFile '$CLOUDFLARED'"; then
      rm -f "$CLOUDFLARED"
    fi
  elif command -v powershell.exe >/dev/null 2>&1; then
    if ! powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '$CLOUDFLARED_URL' -OutFile '$CLOUDFLARED'"; then
      rm -f "$CLOUDFLARED"
    fi
  else
    echo "[!] curl/PowerShell downloader not found." >&2
  fi

  if [[ -f "$CLOUDFLARED" ]]; then
    echo "[OK] cloudflared.exe downloaded successfully."
  else
    echo "[!] Download failed or skipped. You can manually download cloudflared.exe and place it in bin/." >&2
  fi
fi

# 6. Show installed cloudflared version and check for updates.
if [[ -f "$CLOUDFLARED" ]]; then
  echo "[*] Installed cloudflared version:"
  "$CLOUDFLARED" version || true

  echo "[*] Checking for cloudflared updates..."
  if "$CLOUDFLARED" update; then
    echo "[OK] cloudflared update check completed."
  else
    echo "[!] cloudflared update check failed. Continuing with the installed version."
  fi

  echo "[*] cloudflared version to use:"
  "$CLOUDFLARED" version || true
fi

# 7. Give the long-running WSR process extra V8 heap headroom.
# Respect an explicit user-provided max-old-space-size when present.
if [[ "${NODE_OPTIONS:-}" != *"--max-old-space-size="* ]]; then
  export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--max-old-space-size=8192"
fi

# 8. Run the server using tsx dev mode.
echo "[*] Starting MCP Server..."
echo "[*] NODE_OPTIONS: ${NODE_OPTIONS:-<none>}"
exec npx tsx src/server.ts
