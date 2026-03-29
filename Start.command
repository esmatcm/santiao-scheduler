#!/bin/bash
# ====================================
#  Santiao Scheduler - Double-click to start
# ====================================
set -e

cd "$(dirname "$0")"
ROOT="$(pwd)"

echo ""
echo "  =========================================="
echo "    Santiao Scheduler — Starting..."
echo "  =========================================="
echo ""

# --- Resolve Node.js ---
NODE_BIN=""
NPM_BIN=""
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

# --- Launch via Node.js ---
echo ""
"$NODE_BIN" "$ROOT/scripts/launch.js"
