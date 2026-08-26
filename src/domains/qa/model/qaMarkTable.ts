import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * One verdict on one check — the shared record's current state.
 *
 * **The check id is the primary key.** A check has exactly one verdict at a
 * time; marking it again is a correction, not a second opinion. That is what
 * makes two people ticking the same row a last-writer-wins update rather than
 * a conflict anybody has to resolve.
 *
 * Separate from `qa_event`, which is the trail: this says where the run *is*,
 * that says how it got there. The same split the law draws between a record's
 * two jobs, one table each.
 *
 * **Temporary, like the rest of this domain.** Dropped with `qa_event` when the
 * pass is over.
 */
export const qaMarkTable = pgTable("qa_mark", {
  /** The itinerary id — "1.1.6", "5.13.10". */
  checkId: text().primaryKey(),
  /** pass · fail · skip. Absent rows are simply un-run. */
  value: text().notNull(),
  /** Why it failed, in the tester's words. */
  note: text(),
  /** Which browser session set it, so the page can say who. */
  actor: text(),
  updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
});
