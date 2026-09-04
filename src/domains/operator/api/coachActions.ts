"use server";
/**
 * Admin verbs that are a **coach's alone** — putting one on a submission, and
 * handing them the work.
 *
 * Creating and editing live in `operatorProfileActions`, shared with the
 * translator, because they are the same act with a different `role`
 * (`_StructureLaw.md` §3b). Read this beside `translatorActions.ts`: both are
 * thin, and both defer for what they share.
 *
 * Admin-only — the guard is re-checked here, not trusted from the UI.
 */
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/shared/lib/actionResult";
import { requireRole } from "@/domains/account";
import {
  FILE_SETS,
  assignSubmissionCoach,
  getSubmission,
  kindsForSet,
  listFilesByKinds,
  markSubmissionSentToCoach,
  noteEmailSent,
  updateSubmission,
  type FileSet,
  assigneeFor,
} from "@/domains/submission";
import { getCoach } from "./coachApi";
import { listAssignable } from "./operatorProfileApi";
import { sendAssignmentEmail } from "./handoffEmail";
import {
  createProfiledOperatorAction,
  type OperatorProfileFormState,
} from "./operatorProfileActions";

/**
 * The two form verbs live in `operatorProfileActions` — creating and editing a
 * coach is the same act as creating and editing a translator, with a different
 * `role`. What stays here is what only a *coach* has: being put on a
 * submission, and being handed one.
 */
export async function createCoachAction(
  prev: OperatorProfileFormState,
  formData: FormData,
): Promise<OperatorProfileFormState> {
  return createProfiledOperatorAction("coach", prev, formData);
}


export async function assignCoachAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireRole("admin");
  const submissionId = String(formData.get("submissionId") ?? "");
  const coachId = String(formData.get("coachId") ?? "");
  if (!submissionId) return { error: "No submission. Reload and try again." };
  if (!coachId) return { error: "Pick a coach first." };

  /*
    Reassignment stops once the work has been handed over.

    The UI already hides the dropdown from that point, but the guard was UI-only:
    a stale tab could pull a submission out from under a coach who had already
    been emailed it — or reassign one the customer has since received. The role
    was checked here and the status wasn't, which is the weaker half of the pair.
  */
  const submission = await getSubmission(submissionId);
  if (!submission) return { error: "That submission no longer exists." };
  if (submission.status !== "new" && submission.status !== "assigned") {
    return {
      error:
        "This has already gone out to a coach. Move the status back first if you need to reassign it.",
    };
  }

  /*
    The target must be an active coach *now*, not just when the dropdown
    rendered. A paused coach still shows in a stale tab (deactivating hides them
    on the next load, not retroactively), and nothing downstream re-checks the
    grant — `getCoach` at hand-off doesn't filter on `isActive`. So a stale post
    could put a paused coach on the work and email them. `listAssignable` is the
    active set; membership is the guard.
  */
  const assignable = await listAssignable("coach");
  if (!assignable.some((coach) => coach.id === coachId)) {
    return { error: "That coach isn't active. Reload and pick another." };
  }

  await assignSubmissionCoach(submissionId, coachId);
  revalidatePath("/admin");
  return { ok: true };
}


/**
 * Hand a submission to its assigned coach: email them the customer's details and
 * a download link per file, then move `assigned` → `sent_to_coach`. Only acts on
 * an `assigned` row, so a double-click can't re-notify or skip a step.
 *
 * It stops at "sent". `in_review` is earned when the coach actually downloads
 * something — see `noteCoachCollected`.
 */
export async function notifyCoachAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireRole("admin");
  const submissionId = String(formData.get("submissionId") ?? "");
  if (!submissionId) return { error: "No submission. Reload and try again." };

  const submission = await getSubmission(submissionId);
  /*
    Two rungs can hand off, not one.

    A submission whose intake has been translated sits at `intake_translated`,
    not `assigned` — so a guard that only accepted `assigned` made the hand-off
    **impossible for exactly the submissions that needed translating**. The
    button appeared, the action returned, and nothing happened. Found by
    simulating the translation path, which no browser test had walked.
  */
  const handOffable =
    submission?.status === "assigned" || submission?.status === "intake_translated";
  if (!submission) return { error: "That submission no longer exists." };
  if (!handOffable) {
    return {
      error:
        "It is not at a rung the coach can be handed it from. Move the status back to Assigned first.",
    };
  }

  const assignee = await assigneeFor(submissionId, "feedback");
  if (!assignee) return { error: "Assign a coach before handing it over." };

  const coach = await getCoach(assignee);
  if (!coach) {
    return { error: "The assigned operator is no longer a coach. Reassign it." };
  }

  /*
    Step 8's curation, and the reason the radio can't live on assignment: at
    assignment the translation doesn't exist yet to choose.

    Falls back to the originals rather than to nothing. A missing or unparseable
    choice must not hand a coach an empty download — the originals are the set
    that always exists, so they're the safe default.
  */
  const requested = String(formData.get("fileSet") ?? "original");
  const fileSet: FileSet = FILE_SETS.includes(requested as FileSet)
    ? (requested as FileSet)
    : "original";

  const files = await listFilesByKinds(
    submissionId,
    kindsForSet("intake", fileSet),
  );
  if (files.length === 0) {
    return { error: "There are no files in that set to send." };
  }

  // Best-effort mail (ADR 004) — the hand-off proceeds even if it fails, but
  // the trail records whether it actually landed.
  const result = await sendAssignmentEmail({
    to: coach.email,
    recipientName: coach.name,
    role: "coach",
    submission,
    files,
  });
  await noteEmailSent(submissionId, "③ hand-off → coach", result);

  // Record what they were actually sent. "What did we give them?" is asked
  // later, and by then the folders may hold more than they did today.
  await updateSubmission(submissionId, { coachFileSet: fileSet });
  await markSubmissionSentToCoach(submissionId);
  revalidatePath("/admin");
  return { ok: true };
}
