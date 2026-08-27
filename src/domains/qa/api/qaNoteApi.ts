import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/shared/db";
import { qaNoteTable } from "../model/qaNoteTable";
import { EDITABLE_STATUS, type NoteStatus } from "../model/qaMark";

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

/**
 * Reword a note, keeping what it said before.
 *
 * **Refused unless the note is still pending**, and the check is a condition on
 * the UPDATE rather than a read followed by a write — the two people using this
 * board are polling each other every four seconds, and a status that changed
 * between the read and the write would slip straight through a check-then-act.
 * Returns whether it applied, so the caller can say why nothing happened.
 */
export async function editNote(id: string, body: string) {
  const [current] = await db
    .select()
    .from(qaNoteTable)
    .where(eq(qaNoteTable.id, id));
  if (!current || current.status !== EDITABLE_STATUS) return false;

  const revisions: { body: string; at: string }[] = current.revisions
    ? (JSON.parse(current.revisions) as { body: string; at: string }[])
    : [];
  revisions.push({ body: current.body, at: current.at.toISOString() });

  const done = await db
    .update(qaNoteTable)
    .set({ body, revisions: JSON.stringify(revisions) })
    .where(and(eq(qaNoteTable.id, id), eq(qaNoteTable.status, EDITABLE_STATUS)))
    .returning({ id: qaNoteTable.id });
  return done.length > 0;
}

/**
 * Remove a note that nobody has acted on.
 *
 * A real delete, not a tombstone. The case this exists for is a note written
 * into the wrong check or abandoned half-typed, and a board littered with
 * struck-through mistakes is harder to read than one without them. A note
 * anybody has acted on is a different thing and is not deletable at all.
 */
export async function deleteNote(id: string) {
  const done = await db
    .delete(qaNoteTable)
    .where(and(eq(qaNoteTable.id, id), eq(qaNoteTable.status, EDITABLE_STATUS)))
    .returning({ id: qaNoteTable.id });
  return done.length > 0;
}
