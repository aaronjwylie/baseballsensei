"use server";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/shared/lib/actionResult";
import { requireRole } from "@/domains/account";
import {
  deleteSubmissionFile,
  getSubmission,
  getSubmissionFile,
  isAssignedTo,
} from "@/domains/submission";
import { storage } from "@/shared/storage";
import { isLegOpen, legFor } from "../model/translationLeg";
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

/**
 * Take back a file the translator uploaded by mistake.
 *
 * Wanted the moment the portal existed: the previous version had no way to undo
 * an upload, so a wrong file could only be handed back alongside the right one
 * and explained in an email (Ben, 2026-08-31).
 *
 * Scoped the same way `removeFlowFileAction` is, and for the same reason — a
 * delete is the one action with nothing to inspect afterwards:
 *
 * - **A translation only.** Never `intake` or `feedback`, which are the
 *   customer's and the coach's own uploads. A translator must not be able to
 *   destroy the material they were given, and that is not a UI concern.
 * - **Their own leg.** `isAssignedTo` for that exact kind, not merely a
 *   translator, and not merely assigned somewhere on the submission.
 * - **Only while the leg is open.** Once handed back, the file is what the
 *   admin is acting on, and pulling it out from under them would leave a leg
 *   marked delivered with an empty folder. Correcting that is an admin
 *   override, deliberately.
 *
 * Bytes first, then the row, so a failed storage delete can't strand a row
 * pointing at nothing. The reverse order can leave an orphaned object, which is
 * the cheaper failure — the sweep collects it and nobody is shown a broken link.
 */
export async function removeTranslationFileAction(
  fileId: string,
): Promise<ActionResult> {
  const session = await requireRole("translator", "admin");
  if (!fileId) return { error: "No file. Reload and try again." };

  const file = await getSubmissionFile(fileId);
  if (!file) return { error: "That file is already gone." };

  // `legFor` returns null for `intake` and `feedback`, which is the gate.
  const leg = legFor(file.kind);
  if (!leg) {
    return {
      error:
        "That file isn't a translation — the customer's and the coach's own uploads can't be removed here.",
    };
  }

  if (
    !session.roles.includes("admin") &&
    !(await isAssignedTo(file.submissionId, session.operatorId, leg.produces))
  ) {
    return { error: "That leg isn't assigned to you." };
  }

  const submission = await getSubmission(file.submissionId);
  if (!submission) return { error: "That submission no longer exists." };
  if (!isLegOpen(leg, submission.status)) {
    return {
      error:
        "This leg has already been handed back. Ask the admin if something needs changing.",
    };
  }

  if (file.fileUrl) await storage.remove(file.fileUrl);
  await deleteSubmissionFile(fileId);

  revalidatePath("/translator");
  revalidatePath("/admin");
  return { ok: true };
}
