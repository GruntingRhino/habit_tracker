#!/usr/bin/env bash
# Nightly pg_dump of the LiveImproved database; keeps 14 days.
set -euo pipefail
dir="$HOME/liveimproved-backups"
mkdir -p "$dir"
pg_dump --dbname="$DATABASE_URL" --format=custom --file="$dir/liveimproved-$(date +%F).dump"
find "$dir" -name 'liveimproved-*.dump' -mtime +14 -delete
