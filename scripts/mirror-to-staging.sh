#!/usr/bin/env bash
# mirror-to-staging — restore a scrubbed copy of production into staging.
#
#   PROD_DATABASE_URL="<prod direct url>" STAGING_DATABASE_URL="<staging direct url>" \
#     npm run mirror:staging -- --yes
#
# A mirror is a copy, never a connection (_ReleaseLaw P7). Four steps, and
# the third is the one that makes this an environment rather than a leak:
#
#   1. pg_dump production (schema + data, no owners, no grants)
#   2. drop and restore into staging
#   3. scrub — scripts/scrub-mirror.sql: every address unreachable, every
#      file locator nulled, every login dropped, QA scaffolding truncated
#   4. migrate to the candidate's journal head, then re-seed staging's admin
#
# Both URLs are read under names the app never reads (P6): a production URL
# pasted into a local env under PROD_* cannot become the app's connection.
# Refuses without --yes (it drops staging), refuses if the two URLs are the
# same (that would drop production), and stops at the first error.
set -euo pipefail

if [[ "${1:-}" != "--yes" ]]; then
  echo "[mirror] this DROPS staging and restores a scrubbed copy of production into it. Pass --yes." >&2
  exit 2
fi
: "${PROD_DATABASE_URL:?set PROD_DATABASE_URL to the production DIRECT (non-pooling) url}"
: "${STAGING_DATABASE_URL:?set STAGING_DATABASE_URL to the staging DIRECT (non-pooling) url}"
if [[ "$PROD_DATABASE_URL" == "$STAGING_DATABASE_URL" ]]; then
  echo "[mirror] PROD_DATABASE_URL and STAGING_DATABASE_URL are the same — refusing (that would drop production)" >&2
  exit 2
fi
# Client tools. PGBIN points at a directory holding pg_dump/pg_restore/psql
# when the ones on PATH are the wrong major — pg_dump refuses a server newer
# than itself, and Supabase runs a newer Postgres than most laptops' Homebrew.
PGBIN="${PGBIN:-}"
tool() { if [[ -n "$PGBIN" ]]; then echo "$PGBIN/$1"; else command -v "$1" || true; fi; }
for t in pg_dump pg_restore psql; do
  [[ -x "$(tool $t)" ]] || { echo "[mirror] $t not found — install the Postgres client tools, or set PGBIN=/path/to/bin" >&2; exit 2; }
done
server_major="$("$(tool psql)" "$PROD_DATABASE_URL" -At -c 'show server_version_num' | cut -c1-2)"
client_major="$("$(tool pg_dump)" --version | grep -oE '[0-9]+' | head -1)"
if (( client_major < server_major )); then
  echo "[mirror] pg_dump is v$client_major but production is Postgres $server_major — pg_dump must be at least the server's major. Install postgresql@$server_major and set PGBIN to its bin." >&2
  exit 2
fi

dump="$(mktemp -t baseball-mirror.XXXXXX)"
trap 'rm -f "$dump"' EXIT

echo "[mirror] 1/4 dumping production…"
"$(tool pg_dump)" "$PROD_DATABASE_URL" --format=custom --no-owner --no-privileges --schema=public --schema=drizzle > "$dump"

echo "[mirror] 2/4 dropping staging and restoring…"
# The dump usually carries its own `CREATE SCHEMA public`; pre-create it only when it does not.
if "$(tool pg_restore)" --list < "$dump" | grep -q " SCHEMA - public "; then create_public=""; else create_public="CREATE SCHEMA public;"; fi
"$(tool psql)" "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -q <<SQL
DROP SCHEMA IF EXISTS public CASCADE;
DROP SCHEMA IF EXISTS drizzle CASCADE;
$create_public
SQL
"$(tool pg_restore)" --dbname="$STAGING_DATABASE_URL" --no-owner --no-privileges --exit-on-error < "$dump"

echo "[mirror] 3/4 scrubbing…"
"$(tool psql)" "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 < "$(dirname "$0")/scrub-mirror.sql"

echo "[mirror] 4/4 migrating to the candidate's schema and re-seeding staging's admin…"
POSTGRES_URL_NON_POOLING="$STAGING_DATABASE_URL" DATABASE_URL="$STAGING_DATABASE_URL" npm run -s db:migrate
# SEED_SAMPLES is forced empty: a developer's .env.local may say 1, and sample coaches on a
# production mirror would be exactly the confusion staging exists to avoid.
SEED_SAMPLES= DATABASE_URL="$STAGING_DATABASE_URL" npm run -s db:seed

echo "[mirror] done — staging carries a scrubbed copy of production at the current journal head"
