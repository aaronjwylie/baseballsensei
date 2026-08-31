import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/shared/db";
import { qaCheckTable } from "../model/qaCheckTable";
import { itinerary } from "../model/itinerary";
import { compareCheckIds, isCheckId } from "../model/qaMark";

/** Every field-added check, including withdrawn ones — ids stay spent. */
export async function readFieldChecks() {
  return db.select().from(qaCheckTable).orderBy(asc(qaCheckTable.at));
}

/** Every id the board knows about, from either source. */
export async function spentIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  for (const phase of itinerary)
    for (const group of phase.groups)
      for (const check of group.checks) ids.add(check.id);
  for (const row of await db.select().from(qaCheckTable)) ids.add(row.id);
  return ids;
}

export type AddCheckResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

/**
 * Add a check at the id its author chose.
 *
 * **The tester proposes, the server refuses.** Letting the id be typed is what
 * makes this a general tool rather than one that can only append beneath an
 * existing check — but it hands back the collision that a server-issued number
 * prevented. So the guarantee moves rather than disappearing: an id already
 * spent is rejected outright, with the reason, and nothing is written.
 *
 * That rejection covers withdrawn rows too. An id handed out twice re-points
 * every verdict and note recorded under the first one, and does it silently —
 * the precise failure the ledger's no-reuse rule exists to prevent.
 */
export async function addFieldCheck(input: {
  id: string;
  what: string;
  expect: string;
  author: string | null;
}): Promise<AddCheckResult> {
  const id = input.id.trim();
  if (!isCheckId(id)) {
    return { ok: false, error: `"${id}" is not an id. Use digits and dots, like 1.1.15 or 3.4.2.1.` };
  }
  const spent = await spentIds();
  if (spent.has(id)) {
    return { ok: false, error: `${id} is taken. Ids are never reused, even by a check that was withdrawn. Pick another.` };
  }

  try {
    const [row] = await db
      .insert(qaCheckTable)
      .values({ id, what: input.what, expect: input.expect, author: input.author })
      .returning();
    return { ok: true, id: row.id };
  } catch {
    /* Two people posting the same new id inside the same second get past the
       read above; the primary key is what actually decides it. */
    return { ok: false, error: `${id} was taken a moment ago. Pick another.` };
  }
}

export { compareCheckIds };

/**
 * Take back a check added from the board.
 *
 * **Not a delete.** The row stays and its id stays spent, which is the whole
 * reason this is a timestamp rather than a `DELETE` — an id handed out twice
 * would silently re-point every verdict and note recorded under the first one.
 * Whatever was marked or noted against it stays attached, unreachable but not
 * rewritten.
 *
 * Refused once reconciled: by then the check lives in the markdown, and the way
 * to remove it there is to retire it — struck through, keeping its verdicts —
 * which the build enforces.
 */
export async function withdrawFieldCheck(id: string) {
  const done = await db
    .update(qaCheckTable)
    .set({ withdrawnAt: new Date() })
    .where(and(eq(qaCheckTable.id, id), isNull(qaCheckTable.reconciledAt)))
    .returning({ id: qaCheckTable.id });
  return done.length > 0;
}
