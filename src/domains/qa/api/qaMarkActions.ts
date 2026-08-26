"use server";

import { revalidatePath } from "next/cache";
import { type MarkValue } from "../model/qaMark";
import { qaAccess } from "./qaAccess";
import { setMark } from "./qaMarkApi";

/**
 * Record one verdict.
 *
 * Gated by `qaAccess`, exactly as the page is — see it for why the rule
 * follows whatever protection the site actually has rather than adding one.
 */
export async function setMarkAction(
  checkId: string,
  value: MarkValue | null,
  note: string | null,
  actor: string | null,
): Promise<{ ok: boolean }> {
  /* The same rule the page uses. Two different answers to "may you write
     this?" is how a page lets someone tick a box that then does nothing. */
  if ((await qaAccess()) !== "granted") return { ok: false };

  await setMark(checkId, value, note, actor);
  revalidatePath("/qa");
  return { ok: true };
}
