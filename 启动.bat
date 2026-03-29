@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>nul
title 三条定时发送工具

cd /d "%~dp0"
set "ROOT=%cd%"

echo.
echo   ==========================================
echo     三条定时发送工具 — Starting...
echo   ==========================================
echo.

:: --- Resolve Node.js ---
set "NODE_BIN="
set "NPM_BIN="

if exist "%ROOT%\runtime\node\node.exe" (
    set "NODE_BIN=%ROOT%\runtime\node\node.exe"
    set "NPM_BIN=%ROOT%\runtime\node\npm.cmd"
    set "PATH=%ROOT%\runtime\node;%PATH%"
    echo [OK] Node.js ^(bundled^)
    goto :node_ok
)

where node >nul 2>nul
if !ERRORLEVEL! equ 0 (
    set "NODE_BIN=node"
    set "NPM_BIN=npm"
    for /f "tokens=*" %%i in ('node -v') do echo [OK] Node.js ^(system^) %%i
    goto :node_ok
)

echo.
echo [ERROR] Node.js not found!
echo   Bundled runtime missing at: runtime\node\node.exe
echo   Please install Node.js from https://nodejs.org/
echo.
pause
exit /b 1

:node_ok

:: --- Resolve ADB ---
if exist "%ROOT%\platform-tools\adb.exe" (
    set "PATH=%ROOT%\platform-tools;%PATH%"
    echo [OK] ADB ^(bundled^)
) else (
    echo [WARN] ADB not found — setup wizard will guide you
)

:: --- Install dependencies (first time) ---
if not exist "%ROOT%\node_modules" (
    echo.
    echo [...] Installing dependencies ^(first time only, please wait^)...
    call "!NPM_BIN!" install --production 2>&1
    if !ERRORLEVEL! neq 0 (
        echo [ERROR] npm install failed!
        echo.
        pause
        exit /b 1
    )
    echo [OK] Dependencies installed
)

:: --- Launch via Node.js (handles server start + wait + open browser) ---
echo.
"!NODE_BIN!" "%ROOT%\scripts\launch.js"

:: If we get here, server has stopped
echo.
echo [INFO] Server has stopped.
echo.
pause
