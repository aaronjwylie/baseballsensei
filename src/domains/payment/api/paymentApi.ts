/**
 * Stripe PaymentIntents — the payment domain's outbound I/O.
 *
 * We use **Elements, not hosted Checkout** (ADR 005): the customer never leaves
 * our domain, so what we create here is a PaymentIntent whose `clientSecret` the
 * browser confirms in place.
 *
 * The route handler owns HTTP; this owns what it means to charge for a review.
 */
import type Stripe from "stripe";
import { stripe } from "@/shared/stripe/client";
import { env } from "@/shared/config/env";
import { site } from "@/shared/config/site";
import { getSettings } from "@/domains/settings";
import type { Submission } from "@/domains/submission";

export interface CreatedIntent {
  clientSecret: string;
  paymentIntentId: string;
  /** Echoed back so the payment step can show what's being charged. */
  amountCents: number;
  currency: string;
}

/**
 * Resolve what to charge.
 *
 * A pre-created Stripe Price is supported for the client's convenience, but a
 * PaymentIntent takes a raw amount rather than a price — so when one is
 * configured we read the amount off it instead of hardcoding. That keeps
 * "what it costs" answerable in one place per environment.
 */
async function resolveAmount(): Promise<{ amount: number; currency: string }> {
  // A configured Stripe Price still wins, for when the amount must live in
  // Stripe; otherwise the operator's setting is the source of truth.
  if (env.stripePriceId) {
    const price = await stripe().prices.retrieve(env.stripePriceId);
    if (typeof price.unit_amount !== "number") {
      throw new Error(
        `Stripe price ${env.stripePriceId} has no unit_amount — it may be a tiered or metered price, which this flow can't charge.`,
      );
    }
    /*
      The charge and the receipt must agree on currency. The receipt template
      formats in `site.price.currency` (it has no per-submission currency to
      read), so a Stripe price in a different currency would charge in one and
      bill in another — a silent mislabel and a dispute waiting to happen.
      Refuse loudly at checkout instead of shipping the mismatch.
    */
    if (price.currency !== site.price.currency) {
      throw new Error(
        `Stripe price ${env.stripePriceId} is in ${price.currency.toUpperCase()}, but the site is configured for ${site.price.currency.toUpperCase()}. Point STRIPE_PRICE_ID at a ${site.price.currency.toUpperCase()} price, or change site.price.currency — the charge and the receipt have to match.`,
      );
    }
    return { amount: price.unit_amount, currency: price.currency };
  }

  const settings = await getSettings();
  return { amount: settings.priceCents, currency: site.price.currency };
}

/**
 * Create a PaymentIntent for one review.
 *
 * **Metadata carries only the submission id now.** It used to carry the whole
 * player record, because the row didn't exist yet and fulfillment had to rebuild
 * it from what Stripe echoed back. With the row created at step 1 that's no
 * longer true, and one id is both smaller and safer — Stripe never holds the
 * customer's notes, and there is nothing to re-validate on the way back.
 *
 * `receipt_email` is still set so Stripe can issue its own card receipt.
 */
export async function createPaymentIntent(
  submission: Submission,
): Promise<CreatedIntent> {
  const { amount, currency } = await resolveAmount();

  const intent = await stripe().paymentIntents.create({
    amount,
    currency,
    receipt_email: submission.customerEmail,
    description: `${site.name}: video review for ${submission.playerName}`,
    // Let the Stripe dashboard decide which methods are offered, so enabling
    // Apple/Google Pay later is a dashboard toggle rather than a deploy.
    automatic_payment_methods: { enabled: true },
    metadata: { submissionId: submission.id },
  });

  if (!intent.client_secret) {
    throw new Error("Stripe did not return a client secret");
  }

  return {
    clientSecret: intent.client_secret,
    paymentIntentId: intent.id,
    amountCents: amount,
    currency,
  };
}

/**
 * Retrieve an intent and confirm it actually succeeded.
 *
 * Verified against Stripe rather than our own row: the row could be stale, and
 * the id arrives from the browser. `null` means no such intent (404 territory);
 * `"unpaid"` means it exists but hasn't succeeded (402).
 */
export async function getSucceededPaymentIntent(
  paymentIntentId: string,
): Promise<Stripe.PaymentIntent | null | "unpaid"> {
  let intent: Stripe.PaymentIntent;
  try {
    intent = await stripe().paymentIntents.retrieve(paymentIntentId);
  } catch {
    return null;
  }
  return intent.status === "succeeded" ? intent : "unpaid";
}

/**
 * Retrieve an intent and confirm it actually *failed* — the mirror of
 * `getSucceededPaymentIntent`, for the browser reporting its own decline so the
 * recovery email survives a dead webhook (ADR 003, QA 2.4.3).
 *
 * Returns `null` unless the intent genuinely declined: a succeeded or still-
 * processing intent, or one with no recorded error, is not something to email a
 * "your card was declined" notice about. A real decline sits at
 * `requires_payment_method` carrying a `last_payment_error`. Verified against
 * Stripe, never the caller's word, since the id arrives from the browser.
 */
export async function getFailedPaymentIntent(
  paymentIntentId: string,
): Promise<Stripe.PaymentIntent | null> {
  let intent: Stripe.PaymentIntent;
  try {
    intent = await stripe().paymentIntents.retrieve(paymentIntentId);
  } catch {
    return null;
  }
  if (intent.status === "succeeded" || intent.status === "processing") return null;
  if (!intent.last_payment_error) return null;
  return intent;
}
