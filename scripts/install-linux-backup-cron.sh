#!/usr/bin/env bash

set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Please run this script with sudo on the Linux server."
  exit 1
fi

APP_DIR="${APP_DIR:-/srv/kaiyan-managament}"
APP_USER="${APP_USER:-ubuntu}"
BACKUP_SCHEDULE="${BACKUP_SCHEDULE:-17 3 * * *}"
LOG_FILE="${LOG_FILE:-/var/log/kaiyan-db-backup.log}"
CRON_FILE="/etc/cron.d/kaiyan-db-backup"

if [ ! -d "$APP_DIR" ]; then
  echo "Application directory not found: $APP_DIR"
  exit 1
fi

cat > "$CRON_FILE" <<EOF
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
$BACKUP_SCHEDULE $APP_USER cd $APP_DIR && /bin/bash -lc 'export NVM_DIR="\$HOME/.nvm"; [ -s "\$NVM_DIR/nvm.sh" ] && . "\$NVM_DIR/nvm.sh"; npm run db:backup -- --label cron' >> $LOG_FILE 2>&1
EOF

chmod 0644 "$CRON_FILE"
touch "$LOG_FILE"
chown "$APP_USER":"$APP_USER" "$LOG_FILE"

echo "Installed SQLite backup cron:"
echo "  schedule : $BACKUP_SCHEDULE"
echo "  app dir  : $APP_DIR"
echo "  log file : $LOG_FILE"
echo "  cron file: $CRON_FILE"
