@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>nul
title 三条定时发送工具

:: Navigate to project root
cd /d "%~dp0\.."
set "ROOT=%cd%"

echo ===============================
echo   三条定时发送工具
echo ===============================
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

echo [ERROR] Node.js not found!
echo.
pause
exit /b 1

:node_ok

:: --- Resolve ADB ---
if exist "%ROOT%\platform-tools\adb.exe" (
    set "PATH=%ROOT%\platform-tools;%PATH%"
    echo [OK] ADB ^(bundled^)
    goto :adb_ok
)

where adb >nul 2>nul
if !ERRORLEVEL! equ 0 (
    echo [OK] ADB ^(system^)
    goto :adb_ok
)

echo [WARN] ADB not found — setup wizard will guide you
:adb_ok

:: --- Install dependencies ---
if not exist "%ROOT%\node_modules" (
    echo.
    echo [...] Installing dependencies ^(first time only^)...
    call "!NPM_BIN!" install --production 2>&1
    if !ERRORLEVEL! neq 0 (
        echo [ERROR] npm install failed!
        echo.
        pause
        exit /b 1
    )
    echo [OK] Dependencies installed
)

:: --- Check port ---
netstat -an 2>nul | findstr ":3456 " | findstr "LISTENING" >nul 2>nul
if !ERRORLEVEL! equ 0 (
    echo.
    echo [!] Port 3456 already in use — opening existing instance...
    start "" "http://localhost:3456"
    pause
    exit /b 0
)

echo.
echo [...] Starting server...

:: Start server in background
start "" /b "!NODE_BIN!" "%ROOT%\server.js"

:: Wait for server ready (poll up to 30s)
set "READY=0"
for /L %%i in (1,1,30) do (
    if !READY! equ 0 (
        >nul 2>nul (
            powershell -Command "(New-Object Net.WebClient).DownloadString('http://localhost:3456/api/health')" && set "READY=1"
        )
        if !READY! equ 0 >nul timeout /t 1 /nobreak
    )
)

echo.
echo   [OK] http://localhost:3456
echo   Close this window to stop
echo.

start "" "http://localhost:3456"

:wait_loop
>nul timeout /t 3600 /nobreak
goto :wait_loop
