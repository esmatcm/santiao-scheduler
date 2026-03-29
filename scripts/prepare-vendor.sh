#!/bin/bash
# Prepare vendor/ directory from downloaded archives.
# Run this once after downloading platform-tools and Node.js.
set -e
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
VENDOR="$ROOT/vendor"

mkdir -p "$VENDOR"

echo "Preparing vendor dependencies..."

# --- platform-tools macOS ---
if [ -f /tmp/platform-tools-darwin.zip ]; then
  echo "  Extracting platform-tools (macOS)..."
  rm -rf "$VENDOR/platform-tools-darwin"
  unzip -q /tmp/platform-tools-darwin.zip -d /tmp/_pt_darwin
  mv /tmp/_pt_darwin/platform-tools "$VENDOR/platform-tools-darwin"
  rm -rf /tmp/_pt_darwin
  echo "  OK"
fi

# --- platform-tools Windows ---
if [ -f /tmp/platform-tools-windows.zip ]; then
  echo "  Extracting platform-tools (Windows)..."
  rm -rf "$VENDOR/platform-tools-windows"
  unzip -q /tmp/platform-tools-windows.zip -d /tmp/_pt_windows
  mv /tmp/_pt_windows/platform-tools "$VENDOR/platform-tools-windows"
  rm -rf /tmp/_pt_windows
  echo "  OK"
fi

# --- Node.js macOS arm64 ---
if [ -f /tmp/node-darwin-arm64.tar.gz ]; then
  echo "  Extracting Node.js (macOS arm64)..."
  rm -rf "$VENDOR/node-darwin-arm64"
  mkdir -p /tmp/_node_darwin
  tar -xzf /tmp/node-darwin-arm64.tar.gz -C /tmp/_node_darwin
  # The extracted dir has a versioned name like node-v22.15.0-darwin-arm64
  mv /tmp/_node_darwin/node-v* "$VENDOR/node-darwin-arm64"
  rm -rf /tmp/_node_darwin
  echo "  OK"
fi

# --- Node.js Windows x64 ---
if [ -f /tmp/node-windows-x64.zip ]; then
  echo "  Extracting Node.js (Windows x64)..."
  rm -rf "$VENDOR/node-windows-x64"
  unzip -q /tmp/node-windows-x64.zip -d /tmp/_node_windows
  mv /tmp/_node_windows/node-v* "$VENDOR/node-windows-x64"
  rm -rf /tmp/_node_windows
  echo "  OK"
fi

echo ""
echo "Vendor contents:"
ls -d "$VENDOR"/*/ 2>/dev/null | sed "s|$VENDOR/|  |"
echo ""
echo "Done! Now run: npm run package"
