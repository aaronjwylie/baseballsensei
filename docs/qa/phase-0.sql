-- Phase 0 — run this in the Supabase SQL editor before the QA pass.
--
-- Everything here is idempotent: running it twice changes nothing the second
-- time. Read the output of each block; they report rather than assume.
--
-- What this does NOT do: closing the Data API is a dashboard setting, not SQL.
-- Do that first — Settings → API → Exposed schemas → remove `public`.

-- ─────────────────────────────────────────────────────────────────────────
-- 1 · Who can currently sign in, and who cannot
--
-- Run this first and keep the output. `has_credential = false` means that
-- person cannot sign in at all; an empty `grants` means they can sign in and
-- reach nothing; `is_active = false` means login refuses them with the same
-- "invalid password" everyone else gets.
-- ─────────────────────────────────────────────────────────────────────────
SELECT o.email,
       o.is_active,
       (c.operator_id IS NOT NULL)                      AS has_credential,
       COALESCE(string_agg(g.role::text, ',' ORDER BY g.role), '(none)') AS grants
FROM operator o
LEFT JOIN operator_credential c ON c.operator_id = o.id
LEFT JOIN operator_role_grant g ON g.operator_id = o.id
GROUP BY o.email, o.is_active, c.operator_id
ORDER BY o.email;

-- ─────────────────────────────────────────────────────────────────────────
-- 2 · Reactivate Ben's admin account
--
-- It reads `is_active = false` because saving an operator through the edit
-- form used to write that on every save: the form has no active toggle, and an
-- absent checkbox was read as `=== "on"` → false. Aaron fixed the cause in
-- `0d6bbf0`; this repairs the row it already wrote.
--
-- Change the address if you want a different admin.
-- ─────────────────────────────────────────────────────────────────────────
UPDATE operator
SET is_active = true
WHERE email = 'ben.j.wylie@gmail.com'
RETURNING email, is_active;

-- Make sure that account actually holds the admin kind. Harmless if it already
-- does — the primary key is (operator_id, role).
INSERT INTO operator_role_grant (operator_id, role, is_active)
SELECT o.id, 'admin', true
FROM operator o
WHERE o.email = 'ben.j.wylie@gmail.com'
ON CONFLICT (operator_id, role) DO UPDATE SET is_active = true;

-- Anyone else the edit form deactivated. Review the list from step 1 before
-- running this — it reactivates *every* operator, which is only what you want
-- if nobody was suspended deliberately.
-- UPDATE operator SET is_active = true WHERE is_active = false;

-- ─────────────────────────────────────────────────────────────────────────
-- 3 · Confirm the Data API is actually closed
--
-- After removing `public` from the exposed schemas, this should return no rows.
-- Any row is a grant PostgREST can still use.
-- ─────────────────────────────────────────────────────────────────────────
SELECT grantee, table_name, string_agg(privilege_type, ',') AS privileges
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'authenticated')
GROUP BY grantee, table_name
ORDER BY grantee, table_name;

-- Migration `0021_revoke_data_api_access.sql` performs the revoke automatically
-- on deploy, so this should already be empty once that ships. It is defence in
-- depth, not the fix — the dashboard setting is the fix.

-- ─────────────────────────────────────────────────────────────────────────
-- 4 · Optional: Row Level Security, the thorough version
--
-- Left commented deliberately. RLS is the more complete answer, but if the role
-- the app connects as does not bypass it, enabling it with no policies fails
-- every query and the site goes down on the next request. That cannot be
-- verified from outside production.
--
-- To check first — the app is safe if this returns your app's role as `owner`:
--
--   SELECT tablename, tableowner FROM pg_tables WHERE schemaname = 'public';
--
-- A table's owner bypasses RLS unless FORCE ROW LEVEL SECURITY is set, and the
-- owner is whichever role ran the migrations. If that matches the role in
-- DATABASE_URL, this is safe:
--
--   DO $$
--   DECLARE t text;
--   BEGIN
--     FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
--     LOOP
--       EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
--     END LOOP;
--   END $$;
--
-- Rollback is the same loop with DISABLE.
