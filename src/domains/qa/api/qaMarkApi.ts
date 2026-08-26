import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/shared/db";
import { qaMarkTable } from "../model/qaMarkTable";
import type { MarkValue } from "../model/qaMark";

/** Every verdict, newest first — the whole record is small by construction. */
export async function readMarks() {
  return db.select().from(qaMarkTable).orderBy(desc(qaMarkTable.updatedAt));
}

/**
 * Set or clear one verdict.
 *
 * Last writer wins, deliberately. Two people ticking the same row is a
 * correction, not a conflict — and a record that asked someone to resolve a
 * merge mid-pass would be worse than one that occasionally needs a second
 * click.
 */
export async function setMark(
  checkId: string,
  value: MarkValue | null,
  note: string | null,
  actor: string | null,
) {
  if (value === null) {
    await db.delete(qaMarkTable).where(eq(qaMarkTable.checkId, checkId));
    return;
  }
  await db
    .insert(qaMarkTable)
    .values({ checkId, value, note, actor })
    .onConflictDoUpdate({
      target: qaMarkTable.checkId,
      set: { value, note, actor, updatedAt: new Date() },
    });
}
