/**
 * The projection of a Submission that is safe to hand to a customer.
 *
 * ── The premise changed on 2026-08-31, and this comment with it ─────────────
 *
 * This used to open "the status lookup identifies customers by an **unverified**
 * email, so anyone who guesses an address sees whatever this type exposes."
 * That is no longer true, and leaving the sentence up would have frozen the
 * shape around a risk that had already been closed.
 *
 * Both producers now sit behind proof of inbox control:
 *
 *   - `verifyFeedbackViewCode` builds it only after a mailed code matched
 *   - `/status/[token]` reads the email out of a link we signed and mailed
 *
 * There is no path left that hands this to someone who merely typed an address.
 *
 * ── What that does and does not license ─────────────────────────────────────
 *
 * It licenses showing the customer **their own submission back**: what they
 * wrote, who it was for, when it moved. Those were withheld from a stranger,
 * not from them, and a page that cannot say which review it is describing is
 * not much of a record (Ben, 2026-09-03).
 *
 * It licenses nothing about **us**. The assigned coach, internal notes, the
 * Stripe id and amount, and every storage locator stay out — they are not the
 * customer's to see whoever is asking, so no amount of proof makes them
 * appropriate here.
 *
 * **Adding a field here is still a security decision**, not a convenience one.
 * The bar moved; it did not disappear. Ask whose fact it is before adding it.
 */
import { isReleased, type Submission, type SubmissionStatus } from "./submission";

export interface PublicSubmission {
  playerName: string;
  playerAge?: number;
  focus?: string;
  /** The customer's own words from step 1 — theirs, handed back. */
  customerNotes?: string;
  status: SubmissionStatus;
  submittedAt?: string;
  /** When the review was released to them, so a card can date itself. */
  completedAt?: string;
  /**
   * Whether the review is finished. The customer downloads it from the link in
   * their email — never from here — so this is a flag, not a location.
   */
  hasFeedback: boolean;
}

export function toPublicSubmission(submission: Submission): PublicSubmission {
  return {
    playerName: submission.playerName || "Player",
    playerAge: submission.playerAge,
    focus: submission.focus,
    customerNotes: submission.customerNotes,
    status: submission.status,
    submittedAt: submission.submittedAt,
    completedAt: submission.completedAt,
    // Not `status === "complete"`: collecting moves the submission to
    // `collected`, so a literal comparison would revoke the customer's access
    // the moment they used it.
    hasFeedback: isReleased(submission),
  };
}
