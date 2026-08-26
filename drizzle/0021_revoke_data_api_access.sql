-- Close the Supabase Data API's access to this schema.
--
-- On 2026-08-15 a GET against production PostgREST with the **publishable**
-- (anon) key returned rows from every table — including `operator_credential`,
-- which is the bcrypt hashes, and `submission`, which is customer emails and
-- the names and ages of children. A publishable key is designed to be public;
-- that is what the word means.
--
-- ── Why REVOKE and not ENABLE ROW LEVEL SECURITY ──────────────────────────
-- RLS is the usual Supabase answer, and it is the more thorough one, but it
-- carries a risk this does not: if the role the app connects as does not in
-- fact bypass RLS, enabling it with no policies fails *every query in the
-- application* and the site goes down on the next request. That cannot be
-- verified from here against production.
--
-- Revoking the grants held by `anon` and `authenticated` removes PostgREST's
-- access directly and **cannot** affect the application's own role, which is
-- the role that owns these tables — it is the role that created them, because
-- it is the role migrations run as. Strictly smaller blast radius for the same
-- outcome on this particular exposure.
--
-- This is defence in depth, not the fix. The fix is turning the Data API off in
-- the dashboard (Settings → API → Exposed schemas → remove `public`), which
-- only a human with dashboard access can do. This migration means that if it is
-- ever switched back on, it comes back closed.
--
-- ── Guarded, because these roles are Supabase's ───────────────────────────
-- Local Postgres and CI have no `anon` or `authenticated` role, and a REVOKE
-- naming a role that does not exist is an error, not a no-op. The DO block
-- skips cleanly there so this is the same migration everywhere.
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE USAGE ON SCHEMA public FROM %I', r);
      -- Future tables too: without this, the next migration's CREATE TABLE
      -- hands the same access straight back.
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', r);
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', r);
      RAISE NOTICE 'revoked public-schema access from %', r;
    ELSE
      RAISE NOTICE 'role % does not exist here — skipping', r;
    END IF;
  END LOOP;
END $$;
