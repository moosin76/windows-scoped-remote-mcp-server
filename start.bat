@echo off
setlocal
title Windows Scoped Remote MCP Server
cd /d "%~dp0"

echo ============================================================
echo   Starting Windows Scoped Remote MCP Server
echo ============================================================

:: 1. Check if node_modules exists, install if missing
if not exist "node_modules" (
    echo [*] Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo [!] Failed to install dependencies.
        pause
        exit /b 1
    )
)

:: 2. Require a configured .env file before starting
if not exist ".env" (
    echo [!] .env file not found.
    echo.
    echo     Please create .env from .env.example and configure it first:
    echo.
    echo     copy .env.example .env
    echo.
    echo     Then edit .env and set the required values before running start.bat again.
    echo.
    pause
    exit /b 1
)

:: 3. Check if bin\cloudflared.exe exists, download automatically if missing
if not exist "bin\cloudflared.exe" (
    echo [*] bin\cloudflared.exe not found. Downloading latest Cloudflare Tunnel binary...
    if not exist "bin" mkdir "bin"
    powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Write-Host 'Downloading cloudflared.exe from GitHub...'; Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile 'bin\cloudflared.exe'"
    if exist "bin\cloudflared.exe" (
        echo [OK] cloudflared.exe downloaded successfully.
    ) else (
        echo [!] Download failed or skipped. You can manually download cloudflared.exe and place it in the bin\ folder.
    )
)

:: 4. Show installed cloudflared version and check for updates
if exist "bin\cloudflared.exe" (
    echo [*] Installed cloudflared version:
    "bin\cloudflared.exe" version
    echo [*] Checking for cloudflared updates...
    "bin\cloudflared.exe" update
    if errorlevel 1 (
        echo [!] cloudflared update check failed. Continuing with the installed version.
    ) else (
        echo [OK] cloudflared update check completed.
    )
    echo [*] cloudflared version to use:
    "bin\cloudflared.exe" version
)

:: 5. Run Server using tsx dev mode
echo [*] Starting MCP Server...
call npx tsx src/server.ts

pause
