/**
 * Turns a succeeded PaymentIntent into a paid submission.
 *
 * **This inverted with the flow.** It used to *create* the row from metadata,
 * because payment was the first thing that happened; now the row already exists
 * — the customer filled it in at step 1 and attached files at step 3 — and this
 * marks it paid.
 *
 * ADR 003 still holds, retargeted: two callers race to do this, the Stripe
 * webhook and the browser coming back from a successful confirmation. Whichever
 * arrives first does the work and the other finds it done, so `justPaid` is what
 * gates the receipt email and nothing sends twice.
 */
import type Stripe from "stripe";
import { markPaidIfUnpaid, type Submission } from "@/domains/submission";

/**
 * The submission this payment is for.
 *
 * The id travels on `metadata.submissionId`, written when the intent was
 * created. Metadata is echoed back from an external system, so the value is
 * looked up rather than trusted to describe anything — a bad id simply finds
 * nothing.
 */
export function submissionIdFromIntent(
  intent: Stripe.PaymentIntent,
): string | null {
  const id = intent.metadata?.submissionId?.trim();
  return id ? id : null;
}

export interface PaidResult {
  submission: Submission;
  /** True only for the caller that actually flipped it — gates the receipt. */
  justPaid: boolean;
}

export async function markSubmissionPaid(
  intent: Stripe.PaymentIntent,
): Promise<PaidResult | null> {
  const submissionId = submissionIdFromIntent(intent);
  if (!submissionId) {
    console.error(`[payment] intent ${intent.id} carries no submissionId`);
    return null;
  }

  // One atomic conditional flip does the idempotency guard *and* the race guard:
  // `markPaidIfUnpaid` only flips a not-yet-paid row, so a redelivered webhook
  // and the browser confirming can't both win and both send a receipt. A `null`
  // means the id names no submission at all.
  const result = await markPaidIfUnpaid(submissionId, {
    stripePaymentId: intent.id,
    // `amount_received` is what actually cleared; `amount` is what was asked
    // for. They differ on a partial capture — we want the truth.
    stripeAmount: intent.amount_received ?? intent.amount,
    paidAt: new Date().toISOString(),
  });
  if (!result) {
    console.error(`[payment] intent ${intent.id} names unknown submission ${submissionId}`);
    return null;
  }

  return result;
}
