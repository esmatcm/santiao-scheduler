@echo off
chcp 65001 >nul 2>nul
title 三条定时发送工具

:: Navigate to this file's directory (project root)
cd /d "%~dp0"
set "ROOT=%cd%"

echo ===============================
echo   三条定时发送工具
echo ===============================
echo.

:: --- Resolve Node.js ---
set "NODE_BIN="
if exist "%ROOT%\runtime\node\node.exe" (
    set "NODE_BIN=%ROOT%\runtime\node\node.exe"
    set "NPM_BIN=%ROOT%\runtime\node\npm.cmd"
    set "PATH=%ROOT%\runtime\node;%PATH%"
    echo [OK] Node.js (bundled)
) else (
    where node >nul 2>nul
    if %ERRORLEVEL% equ 0 (
        set "NODE_BIN=node"
        set "NPM_BIN=npm"
        for /f "tokens=*" %%i in ('node -v') do echo [OK] Node.js (system) %%i
    ) else (
        echo [ERROR] Node.js not found!
        echo   This should not happen — the bundled runtime is missing.
        pause
        exit /b 1
    )
)

:: --- Resolve ADB ---
if exist "%ROOT%\platform-tools\adb.exe" (
    set "PATH=%ROOT%\platform-tools;%PATH%"
    echo [OK] ADB (bundled)
) else (
    where adb >nul 2>nul
    if %ERRORLEVEL% equ 0 (
        echo [OK] ADB (system)
    ) else (
        echo [WARN] ADB not found — setup wizard will guide you
    )
)

:: --- Install dependencies ---
if not exist "%ROOT%\node_modules" (
    echo.
    echo [...] Installing dependencies (first time only)...
    call %NPM_BIN% install --production
    echo [OK] Done
)

echo.
echo [...] Starting server...
echo.
echo   Open in browser: http://localhost:3456
echo   Close this window to stop
echo.

:: Open browser then start server (server blocks)
timeout /t 2 /nobreak >nul
start http://localhost:3456
%NODE_BIN% "%ROOT%\server.js"
