"use server";

import { revalidatePath } from "next/cache";
import { NOTE_STATUSES, type NoteStatus } from "../model/qaMark";
import { qaAccess } from "./qaAccess";
import { addNote, deleteNote, editNote, setNoteStatus } from "./qaNoteApi";
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
  id: string,
  what: string,
  expect: string,
  author: string | null,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!(await allowed())) return { ok: false, error: "Not authorised." };
  const w = what.trim();
  const e = expect.trim();
  if (!w || w.length > MAX_LINE) return { ok: false, error: "Say what the check does." };
  if (e.length > MAX_LINE) return { ok: false, error: "Expectation is too long." };

  const result = await addFieldCheck({ id, what: w, expect: e, author });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/qa");
  return { ok: true, id: result.id };
}

export async function editNoteAction(
  id: string,
  body: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!(await allowed())) return { ok: false, error: "Not authorised." };
  const text = body.trim();
  if (!text || text.length > MAX_BODY) return { ok: false, error: "Say something." };

  const done = await editNote(id, text);
  if (!done) {
    return {
      ok: false,
      error: "Someone has already picked this up — add a new note instead of changing this one.",
    };
  }
  revalidatePath("/qa");
  return { ok: true };
}

export async function deleteNoteAction(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await allowed())) return { ok: false, error: "Not authorised." };

  const done = await deleteNote(id);
  if (!done) {
    return { ok: false, error: "Someone has already picked this up — it can no longer be deleted." };
  }
  revalidatePath("/qa");
  return { ok: true };
}
