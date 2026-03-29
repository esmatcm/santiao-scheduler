@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>nul
title 三条定时发送工具

cd /d "%~dp0\.."
set "ROOT=%cd%"

:: --- Resolve Node.js ---
set "NODE_BIN="
set "NPM_BIN="

if exist "%ROOT%\runtime\node\node.exe" (
    set "NODE_BIN=%ROOT%\runtime\node\node.exe"
    set "NPM_BIN=%ROOT%\runtime\node\npm.cmd"
    set "PATH=%ROOT%\runtime\node;%PATH%"
    goto :node_ok
)

where node >nul 2>nul
if !ERRORLEVEL! equ 0 (
    set "NODE_BIN=node"
    set "NPM_BIN=npm"
    goto :node_ok
)

echo [ERROR] Node.js not found!
pause
exit /b 1

:node_ok

:: --- Install dependencies ---
if not exist "%ROOT%\node_modules" (
    echo [...] Installing dependencies...
    call "!NPM_BIN!" install --production 2>&1
)

:: --- Launch ---
"!NODE_BIN!" "%ROOT%\scripts\launch.js"
pause
