/**
 * Delivering feedback — a two-step hand-off, now multi-file.
 *
 * A coach attaches **one or more** response files to a submission (each a row in
 * `submission_files` with `kind = "feedback"`), then hands the set to the admin:
 *
 * 1. Files arrive one at a time — `saveFeedbackFile` (dev proxy) or
 *    `recordFeedbackFile` (prod direct-to-Blob). Attaching a file does **not**
 *    move the submission on its own.
 * 2. `sendFeedbackForApproval` (coach): with at least one file attached, park the
 *    submission at `awaiting_approval`. The customer is **not** emailed yet.
 * 3. `approveAndComplete` (admin): mark it `complete`, stamp `completedAt`, and
 *    email the customer that their feedback is ready. Best-effort email
 *    ([ADR 004]) so a mail hiccup never blocks completion.
 */
import { storage, feedbackFileKey } from "@/shared/storage";
import {
  addSubmissionFile,
  getSubmission,
  kindsForSet,
  listFeedbackFiles,
  listFilesByKinds,
  markCustomerCollected,
  noteEmailSent,
  updateSubmission,
  type FileSet,
  type Submission,
  type SubmissionFile,
  assigneeFor,
} from "@/domains/submission";
import { getCoach } from "@/domains/operator";
import { listAdminEmails } from "@/domains/operator";
import { getSettings } from "@/domains/settings";
import { env } from "@/shared/config/env";
import {
  sendCustomerCollectedEmail,
  sendFeedbackReady,
  sendThankYouEmail,
  sendResponseSubmittedEmail,
} from "./feedbackEmail";
import { signFeedbackToken } from "./feedbackToken";

/**
 * Save a feedback file the bytes of which came through us — the dev proxy path,
 * where there's no Blob store. Records a `feedback` row; leaves the status alone.
 */
export async function saveFeedbackFile(
  submissionId: string,
  filename: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<SubmissionFile> {
  const key = feedbackFileKey(submissionId, filename);
  const fileUrl = await storage.save(key, bytes, contentType);
  return addSubmissionFile(
    { submissionId, filename, contentType, sizeBytes: bytes.byteLength, fileUrl },
    "feedback",
  );
}

/**
 * Record a feedback file the browser uploaded straight to Blob — the prod path.
 * The object already landed; this only writes the `response` row.
 */
export async function recordFeedbackFile(
  submissionId: string,
  input: { filename: string; contentType: string; sizeBytes: number; fileUrl: string },
): Promise<SubmissionFile> {
  return addSubmissionFile({ submissionId, ...input }, "feedback");
}

/**
 * Coach hands their breakdown to the admin. Requires at least one feedback file, so a
 * stray click can't park an empty review for approval. No customer email here.
 */
export async function sendFeedbackForApproval(
  submissionId: string,
): Promise<Submission | null> {
  const files = await listFeedbackFiles(submissionId);
  if (files.length === 0) return null;

  /*
    Only a submission actually in review can be delivered.

    The coach's ownership was already checked by the caller; the *status* wasn't,
    which meant a stale tab could deliver twice, or deliver work on a submission
    the admin had already approved — walking it backwards over its own completion.
    Unreachable by clicking, which is exactly why it was worth closing.
  */
  const current = await getSubmission(submissionId);
  if (!current || current.status !== "in_review") return null;

  const updated = await updateSubmission(submissionId, {
    status: "awaiting_approval",
  });

  // ⑤ — tell the admin it's waiting, and the coach that it arrived. Best-effort: the
  // work is delivered either way, and a webhook must never fail on mail.
  const assignee = await assigneeFor(updated.id, "feedback");
  const coach = assignee ? await getCoach(assignee) : null;
  const admins = await listAdminEmails();
  const submitted = await sendResponseSubmittedEmail({
    to: [...admins, ...(coach?.email ? [coach.email] : [])],
    coachName: coach?.name ?? "The coach",
    playerName: updated.playerName,
    fileCount: files.length,
    reviewUrl: `${env.siteUrl}/admin`,
  });
  await noteEmailSent(submissionId, "⑤ response submitted → Admin + coach", submitted);

  return updated;
}

/**
 * Step 15 — the admin closes the job, and thanks the customer.
 *
 * **Deliberately manual.** The objection was always "he'll forget, and the
 * thank-you never goes" — which is answered not by automating it but by step 14
 * setting a `collected` status he can filter on. The work he has to do is a list
 * he can pull up, not something he has to remember to look for. Automating it
 * later stays cheap; guessing that he wanted it automated does not.
 *
 * Only a collected submission can be resolved: resolving one the customer never
 * downloaded would send a thank-you for something they haven't seen.
 */
export async function resolveSubmission(
  submissionId: string,
  retentionDays: number,
): Promise<Submission | null> {
  const submission = await getSubmission(submissionId);
  if (!submission || submission.status !== "collected") return null;

  const updated = await updateSubmission(submissionId, { status: "resolved" });

  if (updated.customerEmail) {
    const result = await sendThankYouEmail({
      to: updated.customerEmail,
      playerName: updated.playerName,
      retentionDays,
      startUrl: `${env.siteUrl}/start`,
    });
    await noteEmailSent(submissionId, "⑧ thank you → customer", result);
  }

  return updated;
}

/**
 * The customer collected their feedback — stamp it, and tell the admin.
 *
 * Called from every route that hands a response file over. **Idempotent**: only
 * the first collection moves the status, so a re-download can't restart the
 * retention clock or send a second notification.
 *
 * Deliberately not awaited on the download path's critical section — see the
 * routes. A notification must never be the reason a file fails to arrive.
 */
export async function noteCustomerCollected(
  submissionId: string,
): Promise<void> {
  /*
    Wrapped, like `noteCoachCollected` and unlike its own first version. The
    status moves on the first line; anything that throws after that leaves a
    submission marked collected with nobody told and no record of the attempt.
    Swallowing here is right because the caller is a download that must not fail
    over a notification — but swallowing *silently* is not, hence the log.
  */
  try {
    const collected = await markCustomerCollected(submissionId);
    if (!collected) return;

    const result = await sendCustomerCollectedEmail({
      to: await listAdminEmails(),
      playerName: collected.playerName,
      submissionUrl: `${env.siteUrl}/admin`,
    });
    await noteEmailSent(submissionId, "⑦ collected → Admin", result);
  } catch (err) {
    console.error("[feedback] recording a customer collection failed:", err);
  }
}

/**
 * the admin approves the coach's work: complete the submission and tell the customer
 * their feedback is ready. Only acts on a submission that's actually awaiting
 * approval and has at least one feedback file, so a stray click can't email an
 * empty review.
 */
export async function approveAndComplete(
  submissionId: string,
  fileSet: FileSet = "original",
): Promise<Submission | null> {
  const submission = await getSubmission(submissionId);
  /*
    Two rungs can be approved, not one — the mirror of the hand-off.

    A translated response sits at `feedback_translated`, so a guard that only
    accepted `awaiting_approval` meant a review could be translated and then
    never sent. Silently: the action returned null and the click did nothing.
  */
  const approvable =
    submission?.status === "awaiting_approval" ||
    submission?.status === "feedback_translated";
  if (!submission || !approvable) return null;

  /*
    Step 13's curation — the mirror of step 8, and the same fallback logic.

    The chosen set must be non-empty: approving into an empty download would tell
    a customer their feedback is ready and hand them nothing, which is worse than
    the click doing nothing at all.
  */
  const files = await listFilesByKinds(
    submissionId,
    kindsForSet("feedback", fileSet),
  );
  if (files.length === 0) return null;

  const now = new Date().toISOString();
  const updated = await updateSubmission(submissionId, {
    status: "complete",
    customerFileSet: fileSet,
    feedbackEmailedAt: now,
    // `completedAt` is what the retention sweep counts from. Setting the status
    // without it would leave the submission complete but immortal — its uploads
    // never due, because the clock never started.
    completedAt: now,
  });

  if (updated.customerEmail) {
    // An unguessable, signed capability link — not the email-lookup page, which
    // anyone who guessed an address could use to collect a stranger's feedback.
    // The link lands on a page that lists every file for this one submission.
    const token = await signFeedbackToken(updated.id);
    const settings = await getSettings();
    const ready = await sendFeedbackReady(
      updated.customerEmail,
      `${env.siteUrl}/feedback/${token}`,
      updated.playerName,
      settings.retainCollectedDays,
    );
    await noteEmailSent(submissionId, "⑥ feedback ready → customer", ready);
  }

  return updated;
}
