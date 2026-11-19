#!/usr/bin/env bash
# Valida migraciones + seed en un Postgres local: tests/sql/run.sh [host] [port]
set -euo pipefail
H=${1:-/tmp/pgsock}; P=${2:-5499}; DIR=$(cd "$(dirname "$0")/../.." && pwd)
psql -h "$H" -p "$P" -U postgres -qc "drop database if exists nexo_test" -c "create database nexo_test"
run() { psql -h "$H" -p "$P" -U postgres -d nexo_test -v ON_ERROR_STOP=1 -q -f "$1"; }
run "$DIR/tests/sql/supabase_stub.sql"
for f in "$DIR"/supabase/migrations/*.sql; do echo "→ $f"; run "$f"; done
[ -f "$DIR/supabase/seed.sql" ] && { echo "→ seed"; run "$DIR/supabase/seed.sql"; }
[ -f "$DIR/tests/sql/smoke.sql" ] && { echo "→ smoke"; run "$DIR/tests/sql/smoke.sql"; }
echo "OK"
