/**
 * What happens once a payment has actually cleared.
 *
 * Written once because **two callers reach this point**: the Stripe webhook, and
 * the browser confirming its own PaymentIntent on the way to the success screen.
 * Whichever wins the race does the work; the other finds `justPaid` false and
 * does nothing (ADR 003).
 *
 * Best-effort, like every send in the app: a failing email never throws into a
 * webhook, because Stripe retries any non-2xx and a degraded mail provider would
 * become a retry storm against a payment that already succeeded (ADR 004).
 */
import type Stripe from "stripe";
import { env } from "@/shared/config/env";
import {
  getSubmission,
  isPaid,
  listSubmissionFiles,
  noteEmailSent,
  signStatusToken,
  updateSubmission,
} from "@/domains/submission";
import { site } from "@/shared/config/site";
import { getSettings } from "@/domains/settings";
import type { PaidResult } from "../model/fulfillment";
import { listAdminEmails } from "@/domains/operator";
import {
  sendPaymentFailed,
  sendPaymentReceivedEmail,
  sendSubmissionReceipt,
} from "./paymentEmail";

export async function completePayment({
  submission,
  justPaid,
}: PaidResult): Promise<void> {
  if (!justPaid) return;
  if (!submission.customerEmail) return;

  const files = await listSubmissionFiles(submission.id);

  /*
    The operator's price, not the constant in `site.ts`, as the last resort.

    `stripeAmount` is what Stripe actually took, so it wins whenever we have
    it. But it is written during fulfillment, and if that write ever fails
    the receipt still has to name a figure — and the figure it named was the
    $80 default, which stopped being true the moment the operator changed the
    price at /admin/settings. A receipt understating the charge is a dispute;
    the current setting is at least the price the customer was quoted.
  */
  const settings = await getSettings();

  const receipt = await sendSubmissionReceipt(submission.customerEmail, {
    playerName: submission.playerName,
    amountCents: submission.stripeAmount ?? settings.priceCents,
    currency: site.price.currency,
    files,
    /*
      The capability link, not the bare `/status` page.

      It was mailed to an address that verified itself at step 2 and paid at
      step 4, so it goes straight in — asking them to prove themselves a third
      time would be friction that buys nothing. The typed-email door still asks
      for a code, because typing proves nothing.
    */
    statusUrl: `${env.siteUrl}/status/${await signStatusToken(submission.customerEmail)}`,
  });

  void noteEmailSent(submission.id, "② receipt → customer", receipt);

  // The other half of ②. Gated on `justPaid` above, so a redelivered webhook
  // announces the same sale twice to nobody.
  const arrival = await sendPaymentReceivedEmail({
    to: await listAdminEmails(),
    playerName: submission.playerName,
    focus: submission.focus,
    fileCount: files.length,
    queueUrl: `${env.siteUrl}/admin`,
  });
  void noteEmailSent(submission.id, "② arrival → Admin", arrival);
}

/**
 * What happens when a card is declined.
 *
 * Two jobs, and the second is the one that isn't obvious.
 *
 * **Tell them.** A decline is someone trying, not someone leaving, and their
 * files are already uploaded — but nothing on their screen says so once they've
 * closed the tab, and a customer who assumes the whole submission failed does
 * not come back.
 *
 * **Buy them time.** The abandonment sweep reaps unpaid submissions on a clock,
 * and a failed payment is the strongest possible evidence that someone is still
 * working on this one. Touching the row restarts that clock, so a customer who
 * goes to find another card doesn't return to find their upload deleted. This is
 * why the note is written rather than only logged: the write *is* the extension.
 *
 * Idempotent by construction — a redelivered failure writes the same note and
 * pushes the clock again, which is harmless. Guarded on paid-ness so a decline
 * arriving after a successful retry can't disturb a submission that has since
 * gone through.
 */
export async function handleFailedPayment(
  intent: Stripe.PaymentIntent,
): Promise<void> {
  const submissionId = intent.metadata?.submissionId;
  if (!submissionId) return;

  const submission = await getSubmission(submissionId);
  if (!submission) return;
  // A later attempt already succeeded; leave it alone.
  if (isPaid(submission)) return;

  const reason = intent.last_payment_error?.message ?? "unknown reason";
  const stamp = new Date().toISOString();
  const note = `[system ${stamp}] payment failed — ${reason}`;

  await updateSubmission(submission.id, {
    internalNotes: submission.internalNotes
      ? `${submission.internalNotes}\n${note}`
      : note,
  });

  if (!submission.customerEmail) return;
  const result = await sendPaymentFailed(submission.customerEmail, {
    playerName: submission.playerName,
    startUrl: `${env.siteUrl}/start`,
  });
  void noteEmailSent(submission.id, "card declined → customer", result);
}
