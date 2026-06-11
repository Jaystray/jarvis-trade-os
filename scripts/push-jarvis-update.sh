#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "Jarvis Trade OS update push"
echo "Repo: https://github.com/Jaystray/jarvis-trade-os"
echo

echo "Current changed files:"
git status --short
echo

git add .

if git diff --cached --quiet; then
  echo "No staged changes to commit."
else
  git commit -m "Add locked APEX analytics PnL state"
fi

git push

echo
echo "Push complete. Railway should redeploy from main automatically."
echo "Railway app: https://jarvis-trade-os-production.up.railway.app"
