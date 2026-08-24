# Windows Scoped Remote MCP Server Startup Script (PowerShell)
$Host.UI.RawUI.WindowTitle = "Windows Scoped Remote MCP Server"
Set-Location -Path $PSScriptRoot

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Starting Windows Scoped Remote MCP Server" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# 1. Check if node_modules exists
if (-not (Test-Path "node_modules")) {
    Write-Host "[*] Installing dependencies..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Error "[!] Failed to install dependencies."
        Read-Host "Press Enter to exit..."
        exit 1
    }
}

# 2. Check if .env exists
if (-not (Test-Path ".env")) {
    Write-Host "[*] Creating .env from .env.example..." -ForegroundColor Yellow
    Copy-Item ".env.example" ".env"
    Write-Host "[!] Please configure your .env file with your settings." -ForegroundColor Magenta
}

# 3. Check if bin/cloudflared.exe exists
$binPath = Join-Path $PSScriptRoot "bin"
$cloudflaredPath = Join-Path $binPath "cloudflared.exe"

if (-not (Test-Path $cloudflaredPath)) {
    Write-Host "[*] bin/cloudflared.exe not found. Downloading Cloudflare Tunnel binary..." -ForegroundColor Yellow
    if (-not (Test-Path $binPath)) {
        New-Item -ItemType Directory -Path $binPath -Force | Out-Null
    }
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile $cloudflaredPath
    if (Test-Path $cloudflaredPath) {
        Write-Host "[OK] cloudflared.exe downloaded successfully." -ForegroundColor Green
    } else {
        Write-Host "[!] Download failed. You can manually place cloudflared.exe in bin/ directory." -ForegroundColor Red
    }
}

# 4. Start Server
Write-Host "[*] Starting MCP Server..." -ForegroundColor Green
npx tsx src/server.ts
