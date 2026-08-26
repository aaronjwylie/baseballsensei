-- Repair operators who have no login rows.
--
-- 0013 moved the password hash to `operator_credential` and 0015 moved the role
-- to `operator_role_grant`. Each backfilled the operators that existed when it
-- ran, so everybody already in the database kept working.
--
-- `scripts/seed.ts` was not updated with them. It went on writing a single
-- `operator` row carrying `password_hash` and `role` — columns the login path
-- stopped reading. Any operator seeded after those migrations therefore has a
-- row that looks complete and cannot sign in: `verifyCredentials` finds no
-- credential and returns null, which the login page reports as an invalid
-- password. Resetting the password did not help either, because
-- `setOperatorPassword` was an UPDATE, and an UPDATE matching no row succeeds
-- having changed nothing.
--
-- The seed and that UPDATE are both fixed in code. This repairs the rows those
-- two already produced, which is the half no deploy of new code can reach.
--
-- Both statements are re-runs of the original backfills, restricted to what is
-- still missing, and both are idempotent — an operator whose rows are already
-- right is untouched.

-- The credential. Only operators that still carry the legacy hash can be
-- repaired from it; one seeded with no hash at all has no password to recover
-- and needs an explicit reset, which is a different and visible problem.
INSERT INTO "operator_credential" ("operator_id", "password_hash")
SELECT o."id", o."password_hash"
FROM "operator" o
LEFT JOIN "operator_credential" c ON c."operator_id" = o."id"
WHERE c."operator_id" IS NULL
  AND o."password_hash" IS NOT NULL
ON CONFLICT ("operator_id") DO NOTHING;
--> statement-breakpoint
-- The role grant. Without one an operator can authenticate and enter nothing,
-- which reads as a broken portal rather than a missing grant.
INSERT INTO "operator_role_grant" ("operator_id", "role", "is_active")
SELECT o."id", o."role", o."is_active"
FROM "operator" o
LEFT JOIN "operator_role_grant" g ON g."operator_id" = o."id"
WHERE g."operator_id" IS NULL
  AND o."role" IS NOT NULL
ON CONFLICT ("operator_id", "role") DO NOTHING;
