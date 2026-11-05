#!/bin/bash
# Frische Test-Datenbank mit Stub und allen Migrationen (Dateien per stdin, da der Benutzer postgres das Repo nicht lesen darf)
set -e
HIER="$(cd "$(dirname "$0")" && pwd)"
MIG="$HIER/../../migrations"
P="su postgres -c"
$P "psql -q -v ON_ERROR_STOP=1 -c 'drop database if exists salon_test' -c 'create database salon_test'" 2>&1 | grep -v NOTICE || true
cat "$HIER/supabase_stub.sql" | $P "psql -q -v ON_ERROR_STOP=1 -d salon_test"
for f in "$MIG"/*.sql; do
  echo "== $(basename "$f")"
  cat "$f" | $P "psql -q -v ON_ERROR_STOP=1 -d salon_test -1"
done
