#!/usr/bin/env bash
# Build locally and ship to the Oracle box. Usage: scripts/deploy.sh [host]
# The build is architecture-independent (Prisma uses the wasm query compiler, pg is pure JS).
set -euo pipefail
HOST="${1:-hermes-oracle}"
APP=/home/opc/apps/liveimproved
cd "$(dirname "$0")/.."

echo "› building web"
npm run build >/dev/null
echo "› bundling worker"
ESB="node_modules/.bin/esbuild --alias:node-fetch=./worker/native-fetch.cjs --alias:abort-controller=./worker/native-abort.cjs --bundle --platform=node --target=node22 --format=esm --tsconfig=tsconfig.json --log-level=warning"
BANNER="import { createRequire } from 'module'; const require = createRequire(import.meta.url);"
$ESB worker/index.ts --outfile=dist/worker.mjs --banner:js="$BANNER"
$ESB worker/run-job.ts --outfile=dist/run-job.mjs --banner:js="$BANNER"

echo "› syncing to $HOST"
ssh "$HOST" "mkdir -p $APP/web $APP/dist"
rsync -az --delete --exclude '.env*' .next/standalone/ "$HOST:$APP/web/"
rsync -az --delete .next/static/ "$HOST:$APP/web/.next/static/"
rsync -az --delete public/ "$HOST:$APP/web/public/"
rsync -az dist/ "$HOST:$APP/dist/"
rsync -az deploy/backup.sh "$HOST:$APP/backup.sh"
rsync -az deploy/*.service deploy/*.timer "$HOST:/tmp/"

echo "› restarting services"
ssh "$HOST" "sudo cp /tmp/liveimproved-*.service /tmp/liveimproved-*.timer /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now liveimproved-backup.timer >/dev/null && sudo systemctl enable liveimproved-web liveimproved-worker >/dev/null 2>&1 && sudo systemctl restart liveimproved-web liveimproved-worker && sleep 4 && systemctl is-active liveimproved-web liveimproved-worker"
echo "✓ deployed"
