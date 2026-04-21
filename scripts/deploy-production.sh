#!/usr/bin/env bash

set -euo pipefail

APP_DIR="${APP_DIR:-/srv/kaiyan-managament}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-http://127.0.0.1:3000/health}"
BACKUP_DIR_RELATIVE="${BACKUP_DIR_RELATIVE:-prisma/backups}"

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  . "$NVM_DIR/nvm.sh"
fi

mkdir -p "$APP_DIR"
cd "$APP_DIR"

if [ ! -d .git ]; then
  git init
  git remote add origin https://github.com/zhelinz8108-sys/kaiyan-managament.git
fi

PREVIOUS_COMMIT=""
if git rev-parse --verify HEAD >/dev/null 2>&1; then
  PREVIOUS_COMMIT="$(git rev-parse HEAD)"
fi

rollback() {
  local exit_code="$1"

  if [ "$exit_code" -eq 0 ]; then
    return
  fi

  if [ -n "$PREVIOUS_COMMIT" ]; then
    echo "Deployment failed, rolling back to ${PREVIOUS_COMMIT}"
    git reset --hard "$PREVIOUS_COMMIT"
    npm ci
    npm run db:init
    npm run prisma:generate
    npm run build
    pm2 restart kaiyan --update-env || pm2 start npm --name kaiyan -- start
    pm2 save
  fi
}

trap 'rollback $?' EXIT

if [ -f prisma/dev.db ]; then
  mkdir -p "$BACKUP_DIR_RELATIVE"
  if npm run db:backup -- --label predeploy; then
    echo "SQLite predeploy backup completed"
  else
    echo "SQLite backup script failed, using raw file copy fallback"
    cp "prisma/dev.db" "$BACKUP_DIR_RELATIVE/dev-predeploy-$(date +%Y%m%d-%H%M%S).db"
  fi
fi

git fetch origin "$DEPLOY_BRANCH"
TARGET_COMMIT="$(git rev-parse "origin/${DEPLOY_BRANCH}")"
git reset --hard "$TARGET_COMMIT"

npm ci
npm run db:init
npm run prisma:generate
npm run build

pm2 restart kaiyan --update-env || pm2 start npm --name kaiyan -- start
sleep 2
curl -fsS "$HEALTHCHECK_URL" >/dev/null
pm2 save

trap - EXIT
echo "Deployment succeeded at commit ${TARGET_COMMIT}"
