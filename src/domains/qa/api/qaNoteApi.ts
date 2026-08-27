import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/shared/db";
import { qaNoteTable } from "../model/qaNoteTable";
import type { NoteStatus } from "../model/qaMark";

/** Every note, oldest first — a check's notes read as the story they are. */
export async function readNotes() {
  return db.select().from(qaNoteTable).orderBy(asc(qaNoteTable.at));
}

/** Add one. There is no update: a correction is another note. */
export async function addNote(input: {
  checkId: string;
  body: string;
  browser: string | null;
  author: string | null;
}) {
  const [row] = await db.insert(qaNoteTable).values(input).returning();
  return row;
}

/**
 * Move a note along `pending → fixed → resolved`.
 *
 * The status is the one mutable thing about a note, and it is mutable because
 * it describes the note's *fate* rather than what was observed. The observation
 * itself never changes.
 */
export async function setNoteStatus(
  id: string,
  status: NoteStatus,
  statusBy: string | null,
) {
  await db
    .update(qaNoteTable)
    .set({ status, statusBy, statusAt: new Date() })
    .where(eq(qaNoteTable.id, id));
}
