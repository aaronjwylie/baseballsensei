import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * A check added from the board mid-pass, before it reaches the itinerary.
 *
 * **This is a staging area, not a second source.** `docs/qa/itinerary.md` is
 * the source and the board is generated from it; a row here is a check that
 * exists only in the database, and it is deliberately badged as provisional on
 * screen until it is folded into the markdown at a phase boundary. Two places
 * holding checks that agree only on the day they were made is exactly the
 * drift that made the itinerary generated in the first place — the lifecycle
 * is what keeps this from becoming that.
 *
 * **Rows are never deleted.** A check withdrawn before reconciliation keeps
 * its row and its id, because an id that could be handed out twice would
 * quietly re-point every verdict recorded under the first one — the precise
 * lie the ledger exists to prevent, arriving through a new door.
 */
export const qaCheckTable = pgTable("qa_check", {
  /**
   * The dotted id, chosen by whoever added it — "1.1.3.1", "4.2.9".
   *
   * **The id is the placement.** It says which phase, which group and where in
   * the order, so nothing else needs to record that. An earlier version stored
   * the check this was added *after*, which was a second, weaker statement of
   * the same fact — and one that would disagree with the id the moment either
   * was edited.
   */
  id: text().primaryKey(),
  what: text().notNull(),
  expect: text().notNull(),
  author: text(),
  /** Set when it is folded into the markdown; it is an ordinary check after. */
  reconciledAt: timestamp({ withTimezone: true }),
  /** Set if it is taken back. The row and its id stay spent regardless. */
  withdrawnAt: timestamp({ withTimezone: true }),
  at: timestamp({ withTimezone: true }).defaultNow().notNull(),
});
