CREATE TABLE "qa_note" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"check_id" text NOT NULL,
	"body" text NOT NULL,
	"browser" text,
	"author" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"status_by" text,
	"status_at" timestamp with time zone,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qa_check" (
	"id" text PRIMARY KEY NOT NULL,
	"after_id" text NOT NULL,
	"what" text NOT NULL,
	"expect" text NOT NULL,
	"author" text,
	"reconciled_at" timestamp with time zone,
	"withdrawn_at" timestamp with time zone,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "qa_note_check_idx" ON "qa_note" USING btree ("check_id");