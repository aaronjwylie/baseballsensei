-- scrub-mirror — make a copy of production safe to be an environment.
--
-- Run by scripts/mirror-to-staging.sh after the restore and before anything
-- else touches the copy (_ReleaseLaw P7; _ReleaseDocumentation §1f). A mirror
-- and a connection are different things only because of this file: after it
-- runs there is no address a staging email can reach a customer at, and no
-- locator a staging download can fetch a customer's file from.
--
-- Every statement is idempotent; running it twice is harmless.

BEGIN;

-- Customers: every address becomes unreachable and unique, the verification
-- secret goes, and the legacy single-file locator goes with it.
UPDATE submission
   SET customer_email         = 'staging+' || left(id::text, 8) || '@baseball-sensei.com',
       verification_code_hash = NULL,
       feedback_url           = NULL;

-- Files: the locators point into production's Blob store, which staging must
-- not read. The rows survive so the portal shows what was sent — as swept,
-- 410 rather than a leak. Testers upload fresh files for download checks.
UPDATE submission_file SET file_url = NULL;

-- Operators: addresses become unreachable; logins are dropped and re-seeded
-- by db:seed (staging's SEED_ADMIN_* are staging's own). Coach photographs
-- point into production's store too.
UPDATE operator
   SET email = 'staging+' || left(id::text, 8) || '@baseball-sensei.com';
DELETE FROM operator_credential;
UPDATE operator_role_grant SET image_url = NULL WHERE image_url IS NOT NULL;

-- QA scaffolding from a production pass is noise on staging, not evidence.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['qa_event', 'qa_mark', 'qa_note', 'qa_check'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('TRUNCATE TABLE %I', t);
    END IF;
  END LOOP;
END $$;

COMMIT;

-- Prove it: nothing reachable, nothing fetchable.
SELECT
  (SELECT count(*) FROM submission      WHERE customer_email NOT LIKE 'staging+%@baseball-sensei.com') AS reachable_customers,
  (SELECT count(*) FROM operator        WHERE email          NOT LIKE 'staging+%@baseball-sensei.com') AS reachable_operators,
  (SELECT count(*) FROM submission_file WHERE file_url IS NOT NULL)                                     AS fetchable_files,
  (SELECT count(*) FROM operator_credential)                                                            AS live_logins;
