#!/bin/bash
# ====================================
#  三条定时发送工具 - 双击启动
# ====================================
set -e

# Navigate to this file's directory (project root)
cd "$(dirname "$0")"
ROOT="$(pwd)"

echo "==============================="
echo "  三条定时发送工具"
echo "==============================="
echo ""

# --- Resolve Node.js ---
NODE_BIN=""
if [ -x "$ROOT/runtime/node/bin/node" ]; then
  NODE_BIN="$ROOT/runtime/node/bin/node"
  NPM_BIN="$ROOT/runtime/node/bin/npm"
  export PATH="$ROOT/runtime/node/bin:$PATH"
  echo "[OK] Node.js (bundled)"
elif command -v node &>/dev/null; then
  NODE_BIN="$(which node)"
  NPM_BIN="$(which npm)"
  echo "[OK] Node.js (system) $($NODE_BIN -v)"
else
  echo "[ERROR] Node.js not found!"
  echo "  This should not happen — the bundled runtime is missing."
  read -p "Press Enter to exit..."
  exit 1
fi

# --- Resolve ADB ---
if [ -x "$ROOT/platform-tools/adb" ]; then
  export PATH="$ROOT/platform-tools:$PATH"
  echo "[OK] ADB (bundled)"
elif command -v adb &>/dev/null; then
  echo "[OK] ADB (system)"
else
  echo "[WARN] ADB not found — setup wizard will guide you"
fi

# --- Install dependencies ---
if [ ! -d "$ROOT/node_modules" ]; then
  echo ""
  echo "[...] Installing dependencies (first time only)..."
  "$NPM_BIN" install --production 2>&1 | tail -3
  echo "[OK] Done"
fi

# --- Check port ---
if lsof -i :3456 -P -n 2>/dev/null | grep -q LISTEN; then
  echo ""
  echo "[!] Port 3456 is already in use"
  echo "    Opening: http://localhost:3456"
  open "http://localhost:3456" 2>/dev/null || true
  read -p "Press Enter to exit..."
  exit 0
fi

echo ""
echo "[...] Starting server..."

# Start server
"$NODE_BIN" "$ROOT/server.js" &
SERVER_PID=$!

# Wait for server ready
for i in {1..15}; do
  if curl -s -o /dev/null http://localhost:3456 2>/dev/null; then break; fi
  sleep 1
done

echo "[OK] Server started"
echo ""
echo "  ➜  http://localhost:3456"
echo ""
echo "  Close this window or press Ctrl+C to stop"
echo ""

# Open browser
open "http://localhost:3456" 2>/dev/null || true

wait $SERVER_PID
