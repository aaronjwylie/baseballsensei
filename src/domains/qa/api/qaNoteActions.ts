"use server";

import { revalidatePath } from "next/cache";
import { NOTE_STATUSES, type NoteStatus } from "../model/qaMark";
import { qaAccess } from "./qaAccess";
import { addNote, setNoteStatus } from "./qaNoteApi";
import { addFieldCheck } from "./qaCheckApi";

/** The same gate the page uses — see `qaAccess`. */
async function allowed() {
  return (await qaAccess()) === "granted";
}

/**
 * Notes and check text are the one place a person's prose reaches this
 * database, so they are bounded here rather than trusted from the form. Long
 * enough for a real finding, short enough that a paste accident is refused
 * instead of stored.
 */
const MAX_BODY = 4000;
const MAX_LINE = 400;

export async function addNoteAction(
  checkId: string,
  body: string,
  browser: string | null,
  author: string | null,
): Promise<{ ok: boolean }> {
  if (!(await allowed())) return { ok: false };
  const text = body.trim();
  if (!text || text.length > MAX_BODY) return { ok: false };

  await addNote({ checkId, body: text, browser, author });
  revalidatePath("/qa");
  return { ok: true };
}

export async function setNoteStatusAction(
  id: string,
  status: NoteStatus,
  statusBy: string | null,
): Promise<{ ok: boolean }> {
  if (!(await allowed())) return { ok: false };
  if (!NOTE_STATUSES.includes(status)) return { ok: false };

  await setNoteStatus(id, status, statusBy);
  revalidatePath("/qa");
  return { ok: true };
}

export async function addFieldCheckAction(
  afterId: string,
  what: string,
  expect: string,
  author: string | null,
): Promise<{ ok: boolean; id?: string }> {
  if (!(await allowed())) return { ok: false };
  const w = what.trim();
  const e = expect.trim();
  if (!w || w.length > MAX_LINE || e.length > MAX_LINE) return { ok: false };

  try {
    const row = await addFieldCheck({ afterId, what: w, expect: e, author });
    revalidatePath("/qa");
    return { ok: true, id: row.id };
  } catch {
    /* An unknown parent, or a thousand siblings. Either is the caller's
       problem to see, not a 500 in the middle of a pass. */
    return { ok: false };
  }
}
