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
import {
  getSubmission,
  assignSubmissionTranslator,
  assigneeFor,
  kindsForSet,
  listFilesByKinds,
  noteEmailSent,
  requiredDirection,
  updateSubmission,
  coversDirection,
  describeDirection,
} from "@/domains/submission";
import { listAssignable, getByRole } from "./operatorProfileApi";
import { directionsOf } from "../model/operatorProfile";
import { sendAssignmentEmail } from "./handoffEmail";
import {
  createProfiledOperatorAction,
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
  if (!submissionId) return { error: "No submission. Reload and try again." };
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
    return { error: "That translator isn't active. Reload and pick another." };
  }

  /*
    Direction guard — the filter is a convenience, this is the guard (QA 5.9.11).
    A stale tab from before a translator's direction was edited can post someone
    who no longer covers the leg; nothing downstream re-validates, and the wrong
    person gets the hand-off email for a file they can't read. Derive the leg's
    required direction the same way the gate and the picker do, and refuse a
    translator who doesn't cover it — naming the direction, because the admin's
    next question is always which way. Checked *after* active, since "paused" is
    the fact the admin can fix from the roster. When the direction can't be
    derived (no coach, a blank side) there is nothing to enforce.
  */
  const coachId = await assigneeFor(submissionId, "feedback");
  const coach = coachId ? await getByRole(coachId, "coach") : null;
  const translator = await getByRole(operatorId, "translator");
  if (coach && translator) {
    const direction =
      leg === "intake_translation"
        ? requiredDirection(submission.languages, coach.languages)
        : requiredDirection(coach.languages, submission.languages);
    if (direction && !coversDirection(directionsOf(translator.languages), direction)) {
      const theirs = translator.languages[0];
      return {
        error: `${translator.name} translates ${theirs ?? "no direction set"}. This leg needs ${describeDirection(direction)}.`,
      };
    }
  }

  await assignSubmissionTranslator(submissionId, operatorId, leg);
  revalidatePath("/admin");
  return { ok: true };
}

/**
 * Send the leg to the translator who was picked for it. Admin-only.
 *
 * **The mirror of `coachActions.handOffToCoachAction`**, and it belongs in this
 * file for the reason the file exists: picking a translator and sending to one
 * are the same role's verbs, and holding them apart is how they drifted. This
 * spent its first life in `app/admin/adminActions.ts` as three lines — update
 * the status, revalidate, return — and never sent anything at all.
 *
 * That stayed invisible for a while, which is the part worth understanding.
 * The rung it moves to is `sent_to_intake_translator`, which `submission.ts`
 * documents as "emailed to the translator, not yet picked up", and the stage
 * chain measured the line as met by *reaching that rung*. So the ladder
 * asserted a send, the chain confirmed the assertion from the ladder, and
 * nothing anywhere had to observe an email. Only an empty inbox could tell you
 * (Ben, QA 5.9.14). The chain now measures this line by the send itself, the
 * way the coach's ③ always did.
 *
 * The recipient is resolved from the assignment, never posted with the form:
 * the hand-off goes to whoever is recorded against this leg now, not to whoever
 * the admin's page believed was recorded when it rendered.
 */
export async function sendForTranslationAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireRole("admin");
  const submissionId = String(formData.get("submissionId") ?? "");
  if (!submissionId) return { error: "No submission. Reload and try again." };

  const submission = await getSubmission(submissionId);
  if (!submission) return { error: "That submission no longer exists." };

  /*
    Each leg is sent from the rung before it, and only once a translator has
    been picked — never straight from `assigned`, so no path emails a hand-off
    to nobody.

    Sending stops at `sent_to_*_translator`, not at `*_translating`: the
    translator's own download earns the second, the same split
    `sent_to_coach` → `in_review` makes on the coach side, and for the same
    reason — it is the only place a submission stalls on a person.

    The two legs carry different email labels because "sent to a translator"
    happens twice per submission, and a trail that can't tell them apart can't
    answer which leg stalled.
  */
  const leg =
    submission.status === "intake_translator_assigned"
      ? ({
          next: "sent_to_intake_translator",
          side: "intake",
          produces: "intake_translation",
          label: "⑩ hand-off → intake translator",
        } as const)
      : submission.status === "feedback_translator_assigned"
        ? ({
            next: "sent_to_feedback_translator",
            side: "feedback",
            produces: "feedback_translation",
            label: "⑪ hand-off → feedback translator",
          } as const)
        : null;
  if (!leg) {
    return {
      error:
        "Pick a translator first. Sending is only possible once one is chosen, and only from the rung before it.",
    };
  }

  const assignee = await assigneeFor(submissionId, leg.produces);
  if (!assignee) {
    return { error: "No translator is assigned to this leg. Pick one first." };
  }
  const translator = await getByRole(assignee, "translator");
  if (!translator) {
    return {
      error:
        "The operator assigned to this leg is no longer a translator. Pick another.",
    };
  }

  /*
    The originals of this side, which is the only set that makes sense to send:
    the intake translator works from what the customer uploaded, the feedback
    translator from what the coach wrote. The other half of each side is the
    thing they are being asked to produce.

    Refused rather than sent empty, for the reason the coach hand-off is: an
    email of download links to nothing reads as a broken system to whoever
    receives it, and they have no way to tell that it isn't one.
  */
  const files = await listFilesByKinds(
    submissionId,
    kindsForSet(leg.side, "original"),
  );
  if (files.length === 0) {
    return {
      error:
        "There is nothing for the translator to work from. That folder is empty.",
    };
  }

  /*
    Best-effort (ADR 004): a failure records itself and the hand-off still
    happens, because refusing to move the rung would strand the submission on a
    problem the admin can't fix from here.

    Awaited, unlike the coach path's fire-and-forget. The defect this function
    exists to fix was a send nobody could see, so the row that proves it
    happened is worth the millisecond — a floating insert in a serverless
    handler isn't guaranteed to outlive the response.
  */
  const result = await sendAssignmentEmail({
    to: translator.email,
    recipientName: translator.name,
    role: "translator",
    submission,
    files,
  });
  await noteEmailSent(submissionId, leg.label, result);

  await updateSubmission(submissionId, { status: leg.next });
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

