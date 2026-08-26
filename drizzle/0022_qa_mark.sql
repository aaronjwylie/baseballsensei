-- The shared QA record's current state, one row per check.
--
-- Temporary, and paired with `qa_event`: that one is the trail, this one is
-- where the run has got to. Both go when the pass is over — the teardown in
-- `0020_drop_qa_event.sql.pending` covers this table too.
--
-- Built after an artifact-hosted record failed at exactly this: two people
-- ticking one list needs shared authenticated state, and a document that
-- republishes itself is the wrong shape for it.
CREATE TABLE "qa_mark" (
	"check_id" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"note" text,
	"actor" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
