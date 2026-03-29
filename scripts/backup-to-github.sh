#!/bin/bash
# ============================================================
# 三条定时发送工具 — 自动备份到 GitHub
# Santiao Scheduler — Auto Backup to GitHub
#
# 用法 / Usage:
#   ./scripts/backup-to-github.sh              # 手动备份
#   配合 crontab 定时运行 (每天凌晨3点)
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

REMOTE_NAME="origin"
BRANCH="main"
TIMESTAMP=$(date +"%Y-%m-%d %H:%M:%S")
LOG_FILE="$PROJECT_DIR/backup.log"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "========== 开始备份 =========="

# 检查 git 是否初始化
if [ ! -d ".git" ]; then
  log "初始化 Git 仓库..."
  git init
  git branch -M main
fi

# 检查远程仓库
if ! git remote get-url "$REMOTE_NAME" &>/dev/null; then
  log "错误: 远程仓库 '$REMOTE_NAME' 未配置"
  log "请先运行: git remote add origin https://github.com/esmatcm/santiao-scheduler.git"
  exit 1
fi

# 检查是否有变更
if git diff --quiet HEAD 2>/dev/null && git diff --cached --quiet 2>/dev/null && [ -z "$(git ls-files --others --exclude-standard)" ]; then
  log "没有变更需要备份"
  log "========== 备份完成 (无变更) =========="
  exit 0
fi

# 暂存所有变更
git add -A

# 生成变更摘要
CHANGES=$(git diff --cached --stat | tail -1)
FILES_CHANGED=$(git diff --cached --name-only | wc -l | tr -d ' ')

# 创建备份提交
COMMIT_MSG="backup: 自动备份 ${TIMESTAMP}

变更: ${FILES_CHANGED} 个文件
${CHANGES}"

git commit -m "$COMMIT_MSG" || {
  log "提交失败或无变更"
  exit 0
}

# 推送到远程
log "推送到 GitHub..."
git push "$REMOTE_NAME" "$BRANCH" 2>&1 | tee -a "$LOG_FILE"

log "✅ 备份成功: ${FILES_CHANGED} 个文件已推送"
log "========== 备份完成 =========="
