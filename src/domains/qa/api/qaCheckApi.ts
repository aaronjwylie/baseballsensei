import "server-only";
import { asc } from "drizzle-orm";
import { db } from "@/shared/db";
import { qaCheckTable } from "../model/qaCheckTable";
import { itinerary } from "../model/itinerary";
import { compareCheckIds } from "../model/qaMark";

/** Every field-added check, including withdrawn ones — ids stay spent. */
export async function readFieldChecks() {
  return db.select().from(qaCheckTable).orderBy(asc(qaCheckTable.at));
}

/** Every id the board currently knows about, from either source. */
async function spentIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  for (const phase of itinerary)
    for (const group of phase.groups)
      for (const check of group.checks) ids.add(check.id);
  for (const row of await db.select().from(qaCheckTable)) ids.add(row.id);
  return ids;
}

/**
 * Issue the next id under `afterId` — "1.1.3" yields "1.1.3.1", then "1.1.3.2".
 *
 * **The server assigns it, never the tester.** Two people clicking add at the
 * same moment, each typing the number they can see is free, both write
 * "1.1.3.1" — and one finding then silently wears the other's id.
 *
 * It counts past withdrawn rows because those ids are spent too. Reissuing one
 * would re-point whatever was recorded under it, which is the failure the
 * ledger's no-reuse rule exists to prevent.
 */
export async function nextIdAfter(afterId: string): Promise<string> {
  const spent = await spentIds();
  if (!spent.has(afterId)) throw new Error(`unknown check ${afterId}`);
  for (let n = 1; n < 1000; n++) {
    const candidate = `${afterId}.${n}`;
    if (!spent.has(candidate)) return candidate;
  }
  throw new Error(`no free id under ${afterId}`);
}

export async function addFieldCheck(input: {
  afterId: string;
  what: string;
  expect: string;
  author: string | null;
}) {
  const id = await nextIdAfter(input.afterId);
  const [row] = await db
    .insert(qaCheckTable)
    .values({ ...input, id })
    .returning();
  return row;
}

export { compareCheckIds };
