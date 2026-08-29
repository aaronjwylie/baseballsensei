/**
 * Confirming a payment, for both ways a customer can arrive at one.
 *
 * A plain module rather than a Server Action, because it has **two callers with
 * two shapes**: the action the browser calls when a card clears inline, and the
 * route handler Stripe redirects to when the method needed a detour (3-D
 * Secure, a wallet). Writing it once is what keeps those two paths from drifting
 * into different notions of "paid".
 *
 * The status is re-read **from Stripe**, never from the caller's claim — the id
 * arrives from the browser either way, and a forged one must not be able to mark
 * a submission paid.
 */
import {
  completePayment,
  getSucceededPaymentIntent,
  markSubmissionPaid,
} from "@/domains/payment";
import { clearFlowSession, readFlowSession } from "@/domains/submission";

export type ConfirmOutcome = { ok: true } | { ok: false; error: string };

export async function confirmPaymentForFlow(
  paymentIntentId: string,
): Promise<ConfirmOutcome> {
  const cookieSubmissionId = await readFlowSession();

  const intent = await getSucceededPaymentIntent(paymentIntentId);
  if (intent === null) return { ok: false, error: "We couldn't find that payment." };
  if (intent === "unpaid") {
    return { ok: false, error: "That payment hasn't completed yet." };
  }

  /*
    The intent names the submission it paid for — `createPaymentIntent` always
    writes `metadata.submissionId` — and `markSubmissionPaid` re-reads the intent
    from Stripe, so the intent's own reference is the trustworthy anchor even
    when the browser's flow cookie is not.

    When the cookie is present — the inline card path, and a 3-D Secure return
    whose window survived — we still insist it matches, so a forged intent id
    can't fulfil a submission this browser was never working on. When it's absent
    we fall back to the intent's reference rather than reporting a *cleared*
    charge as failed: the flow cookie is host-only, so a www/non-www hop or a
    window that lapsed during the bank detour (CLAUDE.md §10) drops it, and the
    old code then bounced a paid customer to a failure screen and told them to
    try again. Fulfilling the submission the intent already names is safe —
    `markSubmissionPaid` is idempotent with the webhook that will (or already
    did) the same thing (ADR 003).
  */
  const paidSubmissionId = intent.metadata?.submissionId;
  if (!paidSubmissionId) {
    return { ok: false, error: "That payment is missing its reference." };
  }
  if (cookieSubmissionId && paidSubmissionId !== cookieSubmissionId) {
    return { ok: false, error: "That payment doesn't match this submission." };
  }

  const result = await markSubmissionPaid(intent);
  if (!result) return { ok: false, error: "We couldn't confirm that payment." };

  // Best-effort receipt, gated on `justPaid` inside — the webhook may already
  // have sent it.
  await completePayment(result);

  // Let go of the submission if this browser still held it. The confirmation the
  // customer sees next is either client state (inline card) or `/start?paid=1`
  // (redirect); neither reads this cookie, and leaving it set would mean a later
  // reload landed on a finished submission.
  await clearFlowSession();

  return { ok: true };
}
