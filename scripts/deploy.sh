#!/usr/bin/env bash
# Ship the worker (Telegram + scheduler) and the Ollama gate to the Oracle box. Usage: scripts/deploy.sh [host]
# The web app is on Vercel (deploys on push to main); it no longer runs on the box.
# The bundle is architecture-independent (Prisma uses the wasm query compiler, pg is pure JS).
set -euo pipefail
HOST="${1:-hermes-oracle}"
APP=/home/opc/apps/liveimproved
cd "$(dirname "$0")/.."

echo "› bundling worker"
npx prisma generate >/dev/null
ESB="node_modules/.bin/esbuild --alias:node-fetch=./worker/native-fetch.cjs --alias:abort-controller=./worker/native-abort.cjs --bundle --platform=node --target=node22 --format=esm --tsconfig=tsconfig.json --log-level=warning"
BANNER="import { createRequire } from 'module'; const require = createRequire(import.meta.url);"
$ESB worker/index.ts --outfile=dist/worker.mjs --banner:js="$BANNER"
$ESB worker/run-job.ts --outfile=dist/run-job.mjs --banner:js="$BANNER"

echo "› syncing to $HOST"
ssh "$HOST" "mkdir -p $APP/dist"
rsync -az dist/ "$HOST:$APP/dist/"
rsync -az deploy/ollama-gate.mjs "$HOST:$APP/ollama-gate.mjs"
rsync -az deploy/backup.sh "$HOST:$APP/backup.sh"
rsync -az deploy/liveimproved-worker.service deploy/ollama-gate.service deploy/*.timer deploy/liveimproved-backup.service "$HOST:/tmp/"

echo "› restarting services"
ssh "$HOST" "sudo cp /tmp/liveimproved-*.service /tmp/ollama-gate.service /tmp/liveimproved-*.timer /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now liveimproved-backup.timer >/dev/null && sudo systemctl disable --now liveimproved-web >/dev/null 2>&1; sudo systemctl enable liveimproved-worker ollama-gate >/dev/null 2>&1 && sudo systemctl restart liveimproved-worker ollama-gate && sleep 4 && systemctl is-active liveimproved-worker ollama-gate"
echo "✓ deployed"
