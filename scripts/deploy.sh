#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

echo "[deploy] Pulling latest main..."
GIT_SSH_COMMAND="ssh -i ~/.ssh/blog_deploy -o StrictHostKeyChecking=accept-new" git fetch origin main
git reset --hard origin/main

echo "[deploy] Installing dependencies..."
npm install --production

echo "[deploy] Restarting PM2 process..."
pm2 restart blog

echo "[deploy] Done at $(date)"
