import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";

/**
 * A finding written against one check, during a pass.
 *
 * **Editable only while pending.** The rule it started with was append-only —
 * a correction is a new note — and the reason was sound: a fix made against
 * wording that later changed leaves nobody able to say what was actually read.
 * But that risk begins when somebody acts on a note, and while it is pending
 * nobody has. Forcing a second note to fix a typo made the record harder to
 * read for no protection at all.
 *
 * So the window is the narrow one: edit and delete while `pending`, refused
 * the moment the status moves. And because pending does not mean *unread* —
 * a fixer may have listed the queue and started work before marking anything —
 * an edit keeps the previous wording in `revisions` rather than discarding it.
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
    /**
     * Previous wordings, oldest first, as JSON — `[{ body, at }]`.
     *
     * Null until the first edit, which is most notes. Kept as text rather than
     * a second table: it is read only with its note, never queried across
     * notes, and this whole domain is torn down when the pass ends.
     */
    revisions: text(),
    at: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("qa_note_check_idx").on(table.checkId)],
);
