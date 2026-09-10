-- Drop the two columns that stopped being the record and were left behind.
--
--   password_hash  → operator_credential  (migration 0013)
--   role           → operator_role_grant  (migration 0015)
--
-- Both were kept nullable so the deploy that stopped writing them could go out
-- first, which is the safe order and also how they came to sit here for a
-- month. Nothing in src/ reads either; `scripts/simulate.ts` was the last
-- writer of password_hash and stopped in the same commit as this.
--
-- Checked against production before generating: no operator holds a
-- password_hash without an operator_credential row, and none holds a `role`
-- without a matching operator_role_grant. So neither drop loses a fact.
--
-- Leaving them was not free. `operator.password_hash` reads as authoritative
-- to anyone auditing access from the schema, and on 2026-09-09 it briefly
-- looked like five operators — two of them admins — could not sign in.
ALTER TABLE "operator" DROP COLUMN "password_hash";--> statement-breakpoint
ALTER TABLE "operator" DROP COLUMN "role";