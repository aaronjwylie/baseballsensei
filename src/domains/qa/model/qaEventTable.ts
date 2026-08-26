import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";

/**
 * One recorded moment from a QA run — a click, a navigation, a submit, an error.
 *
 * **Temporary.** This table exists to instrument a manual QA pass and is meant
 * to be dropped when that pass is over; `0020_drop_qa_event.sql.pending` is written and
 * waiting for the day it is. It is a table rather than a file because
 * production runs on serverless, where nothing written to local disk survives
 * the next request.
 *
 * **It stores no values a person typed.** `target` is a description of the
 * element, `field` is a form field's *name*. What was entered into that field
 * is never sent by the probe and has nowhere to go here. That is not politeness
 * — this is a production database holding real customers, and a QA log that
 * quietly accumulated their details would be a second copy of the data with
 * none of the retention rules that govern the first.
 *
 * No foreign keys. A QA event is an observation *about* the app, not a fact
 * within it, and pointing it at a submission would invite reading it as one.
 */
export const qaEventTable = pgTable(
  "qa_event",
  {
    id: uuid().defaultRandom().primaryKey(),
    /** Groups one run together, so several passes don't interleave. */
    session: text().notNull(),
    /** Monotonic within a session — the browser's own ordering, kept because
        two events in the same millisecond are common and `at` cannot separate
        them. */
    seq: integer().notNull(),
    /** click · nav · submit · error · console · fetch */
    kind: text().notNull(),
    /** Where it happened. */
    path: text().notNull(),
    /** A description of the element or the message — never a typed value. */
    target: text(),
    /** A form field's name, when the event is about one. */
    field: text(),
    /** Anything else worth keeping, as JSON text. Never values. */
    detail: text(),
    at: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("qa_event_session_seq_idx").on(table.session, table.seq)],
);
