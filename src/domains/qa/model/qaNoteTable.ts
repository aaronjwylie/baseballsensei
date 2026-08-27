import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";

/**
 * A finding written against one check, during a pass.
 *
 * **Append-only.** A note is never rewritten; a correction is a new note under
 * the same check. Editing in place would mean a fix could be made against
 * wording that no longer exists, and nobody could tell afterwards what was
 * actually read — the same reason the submission trail appends delivery
 * outcomes rather than overwriting them.
 *
 * **Temporary**, like everything else in this domain: dropped with the pass.
 *
 * **Unlike `qa_event`, this one holds prose a person typed**, which is the
 * point — a click says a box was ticked, only a sentence says what was wrong.
 * That prose is the tester's own. It sits in the production database beside
 * real customer records and outside the retention rules that govern them, so
 * a customer's address or a child's name does not belong in it.
 */
export const qaNoteTable = pgTable(
  "qa_note",
  {
    id: uuid().defaultRandom().primaryKey(),
    /** The itinerary id this is about — "1.1.6", "1.1.3.1". */
    checkId: text().notNull(),
    /** What happened, in the tester's words. */
    body: text().notNull(),
    /** Which browser it was seen in, from the roster the probe reports. */
    browser: text(),
    /** Who wrote it. */
    author: text(),
    /**
     * pending · fixed · resolved.
     *
     * Three rather than two, and the distinction is the whole value: `fixed` is
     * claimed by whoever wrote the patch, `resolved` only by a tester who
     * re-ran the check. Collapsing them would let the board go green on one
     * person's say-so — the same conflation the submission ladder already
     * separates into `complete` and `collected`.
     */
    status: text().notNull().default("pending"),
    statusBy: text(),
    statusAt: timestamp({ withTimezone: true }),
    at: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("qa_note_check_idx").on(table.checkId)],
);
