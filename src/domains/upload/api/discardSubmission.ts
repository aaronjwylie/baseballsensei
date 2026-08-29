/**
 * Throw away an unfinished submission — files and record together.
 *
 * **Only a completed payment earns retention** (the client, 2026-07-30). Until the
 * money clears, a submission is a scratch pad: a refresh, a timeout, or the
 * customer pressing "Start over" discards it outright.
 *
 * That is deliberately harsher than the retention sweep, and the difference is
 * worth holding onto:
 *
 * | | sweep | discard |
 * | --- | --- | --- |
 * | when | a schedule | the customer walked away |
 * | files | deleted | deleted |
 * | record | **kept**, locator cleared | **deleted** |
 *
 * The sweep keeps the record because a *paid* submission's history matters —
 * the receipt and the portal still need to say what was sent. Nothing here was
 * ever paid for, so there is no history to preserve and a kept row would just be
 * noise in the queue.
 *
 * **It refuses to touch a paid submission.** That is the whole safety property,
 * and it is checked here rather than trusted from the caller, because every
 * caller is a place a customer might have just been charged.
 *
 * **`spareStarted` closes the window before that check can see the money.**
 * `isPaid` only flips once the charge clears (`stripePaymentId` is written then,
 * not when the intent is created), so between a customer confirming and
 * `markSubmissionPaid` running, an `awaiting_payment` submission looks
 * abandonable but has a payment in flight. Deleting it there — a second tab, a
 * stray "Start over" — strips the files out from under a charge that then
 * succeeds with nothing to fulfil. The restart paths pass `spareStarted`, which
 * leaves anything past `draft` for the abandonment sweep instead; the sweep only
 * runs against rows whose last activity is `retainUnpaidHours` old, long after
 * any in-flight payment has settled one way or the other.
 */
import { storage } from "@/shared/storage";
import {
  deleteSubmission,
  getSubmission,
  isPaid,
  listSubmissionFiles,
} from "@/domains/submission";

export async function discardUnpaidSubmission(
  submissionId: string,
  opts: { spareStarted?: boolean } = {},
): Promise<boolean> {
  const submission = await getSubmission(submissionId);
  if (!submission) return false;

  // The one thing that makes this safe to call from anywhere.
  if (isPaid(submission)) return false;

  // A started submission may have a payment in flight the row can't show yet —
  // leave it for the sweep rather than racing the charge (see above).
  if (opts.spareStarted && submission.status !== "draft") return false;

  const files = await listSubmissionFiles(submissionId);
  for (const file of files) {
    if (!file.fileUrl) continue;
    try {
      await storage.remove(file.fileUrl);
    } catch (err) {
      // Keep going. A stray object is a rounding error on the storage bill; a
      // half-deleted submission that still shows up is a real problem.
      console.error(`[discard] could not delete ${file.fileUrl}:`, err);
    }
  }

  // The file rows go with it — `submissionFiles` cascades on the foreign key.
  await deleteSubmission(submissionId);
  return true;
}
