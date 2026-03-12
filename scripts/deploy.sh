#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

# Backup SQLite DB before deploy (respect DB_PATH env var)
DB_FILE="${DB_PATH:-blog.db}"
if [ -f "$DB_FILE" ]; then
  echo "[deploy] Backing up database ($DB_FILE)..."
  cp "$DB_FILE" "${DB_FILE}.bak-$(date +%Y%m%d-%H%M%S)"
fi

echo "[deploy] Pulling latest main..."
GIT_SSH_COMMAND="ssh -i ~/.ssh/blog_deploy -o StrictHostKeyChecking=accept-new" git fetch origin main
git pull --ff-only origin main

echo "[deploy] Installing dependencies..."
npm ci --production

echo "[deploy] Restarting PM2 process..."
pm2 restart blog

echo "[deploy] Done at $(date)"
