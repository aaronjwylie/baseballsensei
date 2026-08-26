"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { env } from "@/shared/config/env";
import { QA_AUTH_COOKIE, type MarkValue } from "../model/qaMark";
import { setMark } from "./qaMarkApi";

/**
 * Record one verdict.
 *
 * **Gated on the same cookie the probe is.** There is no second door: whoever
 * armed their browser for the pass can write the record, and nobody else can.
 * With `QA_TOKEN` unset the whole subsystem is off and this refuses too.
 */
export async function setMarkAction(
  checkId: string,
  value: MarkValue | null,
  note: string | null,
  actor: string | null,
): Promise<{ ok: boolean }> {
  const expected = env.qaToken;
  if (!expected) return { ok: false };

  const jar = await cookies();
  if (jar.get(QA_AUTH_COOKIE)?.value !== expected) return { ok: false };

  await setMark(checkId, value, note, actor);
  revalidatePath("/qa");
  return { ok: true };
}
