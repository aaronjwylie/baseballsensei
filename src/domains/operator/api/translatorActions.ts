"use server";
/**
 * Translator actions — the admin choosing who carries a leg.
 *
 * Split from `coachActions.ts`, where this lived for a day. A file named for
 * one role holding another role's verbs is the one-stem violation
 * `_NomenclatureLaw.md` §2 exists to catch, and it is worth more here than
 * usual: the two roles are genuinely similar, which is exactly when a reader
 * needs the filename to tell them which one they are looking at.
 */
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/shared/lib/actionResult";
import { requireRole } from "@/domains/account";
import { getSubmission, assignSubmissionTranslator } from "@/domains/submission";
import { listAssignable } from "./operatorProfileApi";
import {
  createProfiledOperatorAction,
  updateProfiledOperatorAction,
  type OperatorProfileFormState,
} from "./operatorProfileActions";

/**
 * Pick who translates one leg. Admin-only.
 *
 * Guarded on the rung as well as the role, for the same reason
 * `assignCoachAction` is: the UI hides the control once the work has gone out,
 * but a stale tab can still post — and pulling a submission out from under a
 * translator who has already been emailed it is exactly what the UI guard
 * cannot cover.
 */
export async function assignTranslatorAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireRole("admin");
  const submissionId = String(formData.get("submissionId") ?? "");
  const operatorId = String(formData.get("operatorId") ?? "");
  const leg = String(formData.get("leg") ?? "");
  if (!submissionId) return { error: "No submission — reload and try again." };
  if (!operatorId) return { error: "Pick a translator first." };
  if (leg !== "intake_translation" && leg !== "feedback_translation") {
    return { error: "That is not a translation leg." };
  }

  const submission = await getSubmission(submissionId);
  if (!submission) return { error: "That submission no longer exists." };

  // Each leg is staffed from the rung before it, or re-staffed from its own —
  // a second look at the dropdown before sending is ordinary.
  const allowed =
    leg === "intake_translation"
      ? submission.status === "assigned" ||
        submission.status === "intake_translator_assigned"
      : submission.status === "awaiting_approval" ||
        submission.status === "feedback_translator_assigned";
  if (!allowed) {
    return {
      error:
        "This leg has already been sent out. Move the status back first if you need to change who has it.",
    };
  }

  /*
    Active-translator re-check, the mirror of `assignCoachAction`. A paused
    translator lingers in a stale dropdown, and nothing downstream re-validates
    the grant — so the guard is membership in the current active set.
  */
  const assignable = await listAssignable("translator");
  if (!assignable.some((operator) => operator.id === operatorId)) {
    return { error: "That translator isn't active — reload and pick another." };
  }

  await assignSubmissionTranslator(submissionId, operatorId, leg);
  revalidatePath("/admin");
  return { ok: true };
}

/**
 * The two form verbs, deferring to the shared pair — the mirror of
 * `coachActions`. Both files are thin for the same reason: creating a coach and
 * creating a translator are one act with a different `role`.
 */
export async function createTranslatorAction(
  prev: OperatorProfileFormState,
  formData: FormData,
): Promise<OperatorProfileFormState> {
  return createProfiledOperatorAction("translator", prev, formData);
}

export async function updateTranslatorAction(
  prev: OperatorProfileFormState,
  formData: FormData,
): Promise<OperatorProfileFormState> {
  return updateProfiledOperatorAction("translator", prev, formData);
}
