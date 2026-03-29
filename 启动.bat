@echo off
setlocal enabledelayedexpansion
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
echo   Please install Node.js from https://nodejs.org/
echo   Or ensure the bundled runtime is present at: runtime\node\node.exe
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

:: --- Verify Node can run ---
echo.
echo [...] Verifying Node.js...
"!NODE_BIN!" -e "console.log('[OK] Node.js ' + process.version + ' verified')" 2>nul
if !ERRORLEVEL! neq 0 (
    echo [ERROR] Node.js verification failed!
    echo   File: !NODE_BIN!
    echo   Please check if the file is corrupted or blocked by antivirus.
    echo.
    pause
    exit /b 1
)

:: --- Install dependencies ---
if not exist "%ROOT%\node_modules" (
    echo.
    echo [...] Installing dependencies ^(first time only, please wait^)...
    call "!NPM_BIN!" install --production 2>&1
    if !ERRORLEVEL! neq 0 (
        echo [ERROR] npm install failed!
        echo   Try running manually: npm install --production
        echo.
        pause
        exit /b 1
    )
    echo [OK] Dependencies installed
)

:: --- Check port availability ---
netstat -an 2>nul | findstr ":3456 " | findstr "LISTENING" >nul 2>nul
if !ERRORLEVEL! equ 0 (
    echo.
    echo [!] Port 3456 is already in use — opening existing instance...
    start "" "http://localhost:3456"
    echo.
    pause
    exit /b 0
)

echo.
echo [...] Starting server...
echo.

:: Start server in background
start "" /b "!NODE_BIN!" "%ROOT%\server.js"

:: Wait for server to be ready (poll up to 30 seconds)
echo [...] Waiting for server to start...
set "READY=0"
for /L %%i in (1,1,30) do (
    if !READY! equ 0 (
        >nul 2>nul (
            powershell -Command "(New-Object Net.WebClient).DownloadString('http://localhost:3456/api/health')" && set "READY=1"
        )
        if !READY! equ 0 (
            >nul timeout /t 1 /nobreak
        )
    )
)

if !READY! equ 0 (
    echo [WARN] Server may not have started properly.
    echo   Attempting to open browser anyway...
)

echo.
echo   ==========================================
echo     [OK] Server started!
echo.
echo     Browser will open automatically...
echo     If not, visit: http://localhost:3456
echo.
echo     Close this window to stop the server
echo   ==========================================
echo.

:: Open browser
start "" "http://localhost:3456"

:: Keep window open — wait for user to close it
echo Press Ctrl+C or close this window to stop the server.
echo.

:wait_loop
>nul timeout /t 3600 /nobreak
goto :wait_loop
