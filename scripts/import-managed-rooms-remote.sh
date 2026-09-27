#!/usr/bin/env bash

set -euo pipefail

expected_active="${1:?Expected prior active-room count is required}"
[[ "$expected_active" =~ ^[0-9]+$ ]]

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  . "$NVM_DIR/nvm.sh"
fi

umask 077
snapshot_file="$(mktemp /tmp/kaiyan-managed-rooms.XXXXXX)"
trap 'rm -f "$snapshot_file"' EXIT
cat > "$snapshot_file"

npm run db:import-managed -- --file "$snapshot_file" --expected-active "$expected_active"
npm run db:import-managed -- --file "$snapshot_file" --expected-active "$expected_active" --apply
