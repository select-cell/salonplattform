#!/bin/bash
# pgTAP-Tests gegen die lokale Test-Datenbank (vorher reset_db.sh). Jede Datei läuft in einer Transaktion mit Rollback.
HIER="$(cd "$(dirname "$0")" && pwd)"
su postgres -c "psql -q -d salon_test -c 'create extension if not exists pgtap'" 2>&1 | grep -v NOTICE
for f in "$HIER"/../database/*.test.sql; do
  echo "##### $(basename "$f")"
  cat "$f" | su postgres -c "psql -X -q -t -A -d salon_test" 2>&1
done
