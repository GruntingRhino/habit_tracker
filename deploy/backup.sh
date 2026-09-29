#!/usr/bin/env bash
# Nightly pg_dump of the LiveImproved database; keeps 14 days.
set -euo pipefail
dir="$HOME/liveimproved-backups"
mkdir -p "$dir"
# Neon runs Postgres 17: use the matching client when the box has it (the default pg_dump is 16).
PG_DUMP=$(command -v /usr/pgsql-17/bin/pg_dump || command -v pg_dump)
"$PG_DUMP" --dbname="$DATABASE_URL" --format=custom --file="$dir/liveimproved-$(date +%F).dump"
find "$dir" -name 'liveimproved-*.dump' -mtime +14 -delete
