-- Roles own their own settings.
--
-- `operator_profile` held one set of languages, specialties, bio and photo per
-- PERSON. Every one of those is a fact about a ROLE: a coach's languages decide
-- whether a submission needs translating, a translator's decide which legs they
-- can take, and someone can coach in one language and translate between two
-- others. One row per person could not say that — it made a coach who reads
-- English and Japanese necessarily a translator who works between them.
--
-- With all four moved, `operator_profile` held nothing but its own foreign key,
-- so it goes. What is left is three tables and three concerns: `operator` is
-- who they are, `operator_credential` is how they sign in, and
-- `operator_role_grant` is what they are — one row per role, carrying
-- everything that role needs.
--
-- Idempotent (IF NOT EXISTS / IF EXISTS) so it converges whether or not a
-- half-applied attempt got there first, which is worth more in a migration than
-- the terseness it costs.
--
-- HAND-ORDERED. drizzle-kit emitted the DROP first, which would have discarded
-- the data before there was anywhere to put it. Add, copy, then drop.

ALTER TABLE "operator_role_grant" ADD COLUMN IF NOT EXISTS "languages" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "operator_role_grant" ADD COLUMN IF NOT EXISTS "specialties" "focus"[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "operator_role_grant" ADD COLUMN IF NOT EXISTS "bio" text;--> statement-breakpoint
ALTER TABLE "operator_role_grant" ADD COLUMN IF NOT EXISTS "image_url" text;--> statement-breakpoint

-- Every coach and translator grant inherits the one list the person had, so the
-- move costs nobody their settings. From here the two diverge as they are
-- edited, which is the point.
--
-- Admin grants are left empty on purpose: languages and specialties do not
-- apply to running the platform, and copying a coach's onto their admin role
-- would invent a fact nobody stated.
UPDATE "operator_role_grant" g
SET "languages"   = COALESCE(p."languages", '{}'),
    "specialties" = COALESCE(p."specialties", '{}')
FROM "operator_profile" p
WHERE p."operator_id" = g."operator_id"
  AND g."role" IN ('coach', 'translator');--> statement-breakpoint

-- Bio and photo are the public site's, and only a coach is shown there.
UPDATE "operator_role_grant" g
SET "bio" = p."bio", "image_url" = p."image_url"
FROM "operator_profile" p
WHERE p."operator_id" = g."operator_id"
  AND g."role" = 'coach';--> statement-breakpoint

DROP TABLE IF EXISTS "operator_profile" CASCADE;
