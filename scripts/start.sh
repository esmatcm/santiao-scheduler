#!/bin/bash
# 三条定时发送工具 - Mac/Linux 启动脚本
set -e

# Navigate to project root (parent of scripts/)
cd "$(dirname "$0")/.."
echo "==============================="
echo "  三条定时发送工具"
echo "==============================="
echo ""

# Check Node.js
if ! command -v node &>/dev/null; then
  echo "[ERROR] Node.js 未安装！"
  echo ""
  echo "请先安装 Node.js："
  echo "  官网下载: https://nodejs.org/"
  echo "  Homebrew: brew install node"
  echo ""
  if [[ "$OSTYPE" == "darwin"* ]]; then
    open "https://nodejs.org/en/download/" 2>/dev/null || true
  fi
  exit 1
fi

echo "[OK] Node.js $(node -v)"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "[...] 正在安装依赖..."
  npm install --production
  echo "[OK] 依赖安装完成"
fi

# Check if port is already in use
if lsof -i :3456 -P -n 2>/dev/null | grep -q LISTEN; then
  echo ""
  echo "[!] 端口 3456 已被占用，可能已经在运行中"
  echo "    打开浏览器访问: http://localhost:3456"
  if [[ "$OSTYPE" == "darwin"* ]]; then
    open "http://localhost:3456" 2>/dev/null || true
  fi
  exit 0
fi

echo ""
echo "[...] 正在启动服务器..."

# Start server in background
node server.js &
SERVER_PID=$!

# Wait for server to be ready
for i in {1..10}; do
  if curl -s -o /dev/null http://localhost:3456 2>/dev/null; then
    break
  fi
  sleep 1
done

echo "[OK] 服务器已启动 (PID: $SERVER_PID)"
echo ""
echo "  访问地址: http://localhost:3456"
echo "  按 Ctrl+C 停止服务器"
echo ""

# Open browser
if [[ "$OSTYPE" == "darwin"* ]]; then
  open "http://localhost:3456"
elif command -v xdg-open &>/dev/null; then
  xdg-open "http://localhost:3456"
fi

# Wait for server process
wait $SERVER_PID
