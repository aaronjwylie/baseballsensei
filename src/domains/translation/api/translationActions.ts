"use server";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/shared/lib/actionResult";
import { requireRole } from "@/domains/account";
import { isAssignedTo } from "@/domains/submission";
import { handBackTranslation } from "./translationApi";
import { TRANSLATION_KINDS } from "../model/translationLeg";
import type { TranslationKind } from "../model/translationLeg";

/**
 * The translator hands a finished leg back — the mirror of
 * `sendFeedbackForApprovalAction`.
 *
 * **Both halves of the guard are here, and neither is redundant.** The role
 * says they are a translator; `isAssignedTo` says this leg is *theirs*. Without
 * the second, any translator who knew a submission id could hand back work
 * assigned to someone else — and the admin would see a leg close with no way to
 * tell it was the wrong person who closed it.
 *
 * The admin bypasses ownership, as everywhere: they are the one who has to be
 * able to unstick a translator who has gone quiet.
 */
export async function handBackTranslationAction(
  submissionId: string,
  produces: TranslationKind,
): Promise<ActionResult> {
  const session = await requireRole("translator", "admin");

  if (!TRANSLATION_KINDS.includes(produces)) {
    return { error: "That is not a translation leg." };
  }
  if (!submissionId) return { error: "No submission. Reload and try again." };

  if (
    !session.roles.includes("admin") &&
    !(await isAssignedTo(submissionId, session.operatorId, produces))
  ) {
    return { error: "That leg isn't assigned to you." };
  }

  const updated = await handBackTranslation(submissionId, produces);
  if (!updated) {
    return {
      error:
        "Nothing to hand back — either the folder is empty, or this leg has already moved on. Reload to see where it is.",
    };
  }

  revalidatePath("/translator");
  revalidatePath("/admin");
  return { ok: true };
}
