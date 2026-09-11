#!/usr/bin/env bash
# reset-qa — wipe the qa database and rebuild it from migrations + seed.
#
# The known cost of one shared qa database is two open PRs carrying
# conflicting migrations. The answer is to reset it, and this is what makes
# that a thirty-second act instead of an afternoon (_ReleaseDocumentation §4,
# Phase 1).
#
#   QA_DATABASE_URL="<qa direct url>" npm run reset:qa -- --yes
#
# Reads QA_DATABASE_URL — a name the app never reads (_ReleaseLaw P6), so a
# production URL pasted here by mistake still cannot become the app's
# connection. Refuses without --yes, because it drops everything.
set -euo pipefail

if [[ "${1:-}" != "--yes" ]]; then
  echo "[reset-qa] this drops every table in QA_DATABASE_URL and rebuilds it. Pass --yes." >&2
  exit 2
fi
: "${QA_DATABASE_URL:?set QA_DATABASE_URL to the qa project DIRECT (non-pooling) url}"

echo "[reset-qa] dropping schema…"
psql "$QA_DATABASE_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
DROP SCHEMA IF EXISTS public CASCADE;
DROP SCHEMA IF EXISTS drizzle CASCADE;
CREATE SCHEMA public;
SQL

echo "[reset-qa] migrating…"
POSTGRES_URL_NON_POOLING="$QA_DATABASE_URL" DATABASE_URL="$QA_DATABASE_URL" npm run -s db:migrate

echo "[reset-qa] seeding (admin + samples + the ladder)…"
DATABASE_URL="$QA_DATABASE_URL" SEED_SAMPLES=1 npm run -s db:seed
DATABASE_URL="$QA_DATABASE_URL" npm run -s db:ladder

echo "[reset-qa] done — qa is at the current journal head with fresh synthetic rows"
