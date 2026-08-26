import "server-only";
import { desc, gt } from "drizzle-orm";
import { db } from "@/shared/db";
import { qaEventTable } from "../model/qaEventTable";
import { MAX_BATCH, type QaEventInput } from "../model/qaEvent";

/** Longest string kept for any one field — a description, never a value. */
const MAX_LEN = 400;

const trim = (v: string | undefined): string | null =>
  v == null ? null : v.slice(0, MAX_LEN);

/**
 * Record a batch. Silently drops anything past `MAX_BATCH` rather than
 * rejecting the request: a QA probe that starts failing loudly mid-run becomes
 * the thing being tested.
 */
export async function recordEvents(events: QaEventInput[]): Promise<number> {
  const batch = events.slice(0, MAX_BATCH);
  if (batch.length === 0) return 0;

  await db.insert(qaEventTable).values(
    batch.map((e) => ({
      session: e.session.slice(0, 64),
      seq: e.seq,
      kind: e.kind.slice(0, 24),
      path: e.path.slice(0, MAX_LEN),
      target: trim(e.target),
      field: trim(e.field),
      detail: trim(e.detail),
    })),
  );
  return batch.length;
}

/**
 * Read the tail of a run, oldest first, for following along.
 *
 * Ordered by `at` **and** `seq`, because a batch of events posted together
 * lands with identical timestamps — a click and the navigation it caused are
 * routinely in the same millisecond — and ordering on time alone returned them
 * shuffled. `seq` is the browser's own counter and is the only thing that knows
 * what happened first.
 */
export async function readEvents(since: Date | null, limit = 200) {
  const rows = await db
    .select()
    .from(qaEventTable)
    .where(since ? gt(qaEventTable.at, since) : undefined)
    .orderBy(desc(qaEventTable.at), desc(qaEventTable.seq))
    .limit(Math.min(limit, 500));
  return rows.reverse();
}

/**
 * Wipe the log. Called between phases so a run reads cleanly.
 *
 * A plain delete rather than `TRUNCATE`: the table is small by construction,
 * and writing the raw statement meant naming the Drizzle export inside a
 * string, which `check:names` rightly refuses — a table export is not a word.
 */
export async function clearEvents(): Promise<void> {
  await db.delete(qaEventTable);
}
