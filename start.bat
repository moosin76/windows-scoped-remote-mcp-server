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

:: 3. Ensure uvx is available for local stdio MCP providers such as Godot AI.
:: The official uv installer places uv/uvx in %%USERPROFILE%%\.local\bin by default.
if exist "%USERPROFILE%\.local\bin\uvx.exe" set "PATH=%USERPROFILE%\.local\bin;%PATH%"

where uvx >nul 2>&1
if errorlevel 1 (
    echo [*] uvx not found. Installing Astral uv...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; irm https://astral.sh/uv/install.ps1 | iex"
    if errorlevel 1 (
        echo [!] Failed to install Astral uv/uvx.
        pause
        exit /b 1
    )
    if exist "%USERPROFILE%\.local\bin\uvx.exe" set "PATH=%USERPROFILE%\.local\bin;%PATH%"
)

where uvx >nul 2>&1
if errorlevel 1 (
    echo [!] uvx is still unavailable after installation.
    echo     Restart the terminal or add %%USERPROFILE%%\.local\bin to PATH.
    pause
    exit /b 1
)
echo [OK] uvx is available:
uvx --version

:: 4. Sync Remote Desktop Commander allowlist from WSR workspace configuration.
echo [*] Syncing Desktop Commander allowed directories from WSR workspace configuration...
call npx --no-install tsx scripts/sync-desktop-commander-workspaces.ts
if errorlevel 1 (
    echo [!] Desktop Commander workspace sync failed. Continuing WSR startup.
) else (
    echo [OK] Desktop Commander workspace allowlist synced.
)

:: 5. Check if bin\cloudflared.exe exists, download automatically if missing
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

:: 6. Show installed cloudflared version and check for updates
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

:: 7. Give the long-running WSR process extra V8 heap headroom.
:: Respect an explicit user-provided max-old-space-size when present.
echo %NODE_OPTIONS% | findstr /C:"--max-old-space-size=" >nul
if errorlevel 1 set "NODE_OPTIONS=%NODE_OPTIONS% --max-old-space-size=8192"

:: 8. Run Server using tsx dev mode
echo [*] Starting MCP Server...
echo [*] NODE_OPTIONS: %NODE_OPTIONS%
call npx tsx src/server.ts

pause
