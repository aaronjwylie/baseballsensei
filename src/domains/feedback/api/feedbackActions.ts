"use server";
/**
 * The coach's action on their own feedback: hand the attached files to the admin for
 * approval. Operator-gated and ownership-checked here — a coach may only send
 * their own assignments, the admin may send anyone's — because a Server Action is
 * a public endpoint, not a trusted call from the page that rendered it.
 */
import { revalidatePath } from "next/cache";
import { getSession } from "@/domains/account";
import {
  deleteSubmissionFile,
  getSubmission,
  getSubmissionFile,
  isAssignedTo,
} from "@/domains/submission";
import { storage } from "@/shared/storage";
import { sendFeedbackForApproval } from "./feedbackApi";

export async function sendFeedbackForApprovalAction(
  submissionId: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Please sign in." };

  const submission = await getSubmission(submissionId);
  if (!submission) return { ok: false, error: "That submission doesn't exist." };

  if (!session.roles.includes("admin") && !(await isAssignedTo(submissionId, session.operatorId, "feedback"))) {
    return { ok: false, error: "That isn't your submission." };
  }

  const result = await sendFeedbackForApproval(submissionId);
  if (result === "no-files") {
    return { ok: false, error: "Attach at least one file before sending." };
  }
  if (result === "not-in-review") {
    // Names the rung rather than the files. A coach who has uploaded and is
    // being told to upload has no way to work out what is actually wrong.
    return {
      ok: false,
      error:
        "This isn't with you at the moment — it may have been sent back or already delivered. Reload to see where it is.",
    };
  }

  revalidatePath("/coach");
  return { ok: true };
}

/**
 * Take back a feedback file the coach uploaded by mistake.
 *
 * The mirror of `removeTranslationFileAction`, added when the coach's portal
 * was brought level with the translator's (Ben, 2026-08-31). Until then a coach
 * who attached the wrong take could only send it alongside the right one and
 * explain in an email.
 *
 * Scoped the same three ways, because a delete is the one action with nothing
 * left to inspect afterwards:
 *
 * - **A `feedback` file only.** Never the customer's `intake`, and never a
 *   translation. A coach must not be able to destroy the material they were
 *   given, and that is not a UI concern.
 * - **Their own submission**, by `isAssignedTo`, not merely a coach.
 * - **Only before it is sent.** `in_review` is the coach's turn; past
 *   `awaiting_approval` the file is what the admin is reviewing, and pulling it
 *   out from under them would leave a submission awaiting approval of nothing.
 *   Correcting that is an admin override, deliberately.
 *
 * Bytes first, then the row, so a failed storage delete can't strand a row
 * pointing at nothing.
 */
export async function removeFeedbackFileAction(
  fileId: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Please sign in." };
  if (!fileId) return { ok: false, error: "No file. Reload and try again." };

  const file = await getSubmissionFile(fileId);
  if (!file) return { ok: false, error: "That file is already gone." };
  if (file.kind !== "feedback") {
    return {
      ok: false,
      error:
        "That isn't one of your response files. The customer's uploads can't be removed here.",
    };
  }

  if (
    !session.roles.includes("admin") &&
    !(await isAssignedTo(file.submissionId, session.operatorId, "feedback"))
  ) {
    return { ok: false, error: "That isn't your submission." };
  }

  const submission = await getSubmission(file.submissionId);
  if (!submission) return { ok: false, error: "That submission doesn't exist." };
  if (submission.status !== "in_review") {
    return {
      ok: false,
      error:
        "This has already gone to the admin. Ask them if something needs changing.",
    };
  }

  if (file.fileUrl) await storage.remove(file.fileUrl);
  await deleteSubmissionFile(fileId);

  revalidatePath("/coach");
  revalidatePath("/admin");
  return { ok: true };
}
