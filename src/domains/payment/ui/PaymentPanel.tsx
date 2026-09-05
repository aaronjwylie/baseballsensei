"use client";

import { useState } from "react";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { Button } from "@/shared/ui";
import { site } from "@/shared/config/site";
import { stripePublishableKey } from "@/shared/config/publicEnv";
import type { CreatedIntent } from "../api/paymentApi";

/**
 * Step four — paying, on our own page, once everything else is done.
 *
 * `loadStripe` is called once at module scope, not per render: it injects a
 * script tag, and re-invoking it per mount would add another.
 */
const stripePromise = stripePublishableKey
  ? loadStripe(stripePublishableKey)
  : null;

export function PaymentPanel({
  intent,
  playerName,
  fileCount,
  onPaid,
  onDeclined,
  onBack,
}: {
  intent: CreatedIntent;
  playerName: string;
  fileCount: number;
  onPaid: (paymentIntentId: string) => Promise<void>;
  onDeclined?: (paymentIntentId: string) => void;
  onBack: () => void;
}) {
  // A missing publishable key is a deployment mistake, not a customer error.
  // Say so plainly rather than rendering an empty box.
  if (!stripePromise) {
    return (
      <p
        role="alert"
        className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
      >
        Payments aren&apos;t configured. NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is
        missing. This is a setup problem on our side, not yours.
      </p>
    );
  }

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret: intent.clientSecret,
        // Match the site rather than accepting Stripe's defaults — the whole
        // reason for Elements over hosted Checkout (ADR 005). The values track
        // the tokens in `app/globals.css`; Stripe can't read CSS variables, so
        // this is the one other place the palette is written down.
        appearance: {
          theme: "stripe",
          variables: {
            colorPrimary: "#161616",
            colorText: "#161616",
            colorDanger: "#b4232c",
            borderRadius: "12px",
            fontFamily: "inherit",
          },
        },
      }}
    >
      <PaymentFields
        intent={intent}
        playerName={playerName}
        fileCount={fileCount}
        onPaid={onPaid}
        onDeclined={onDeclined}
        onBack={onBack}
      />
    </Elements>
  );
}

/** Inside the Elements provider, so the Stripe hooks are available. */
function PaymentFields({
  intent,
  playerName,
  fileCount,
  onPaid,
  onDeclined,
  onBack,
}: {
  intent: CreatedIntent;
  playerName: string;
  fileCount: number;
  onPaid: (paymentIntentId: string) => Promise<void>;
  onDeclined?: (paymentIntentId: string) => void;
  onBack: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!stripe || !elements) return;

    setBusy(true);
    setError(null);

    const { error: stripeError, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        // Only used when the method needs a redirect (3-D Secure, wallets).
        // Stripe appends payment_intent to it; that route confirms server-side
        // and forwards to /start, so the customer comes back to a finished
        // page rather than one that has to catch up in an effect.
        return_url: `${window.location.origin}/api/payment/return`,
      },
      // Stay on the page for plain cards; redirect only when the method demands
      // it. Without this, every payment would bounce through a return trip.
      redirect: "if_required",
    });

    if (stripeError) {
      // Card declines and validation problems are the customer's to fix, and
      // Stripe's messages are already written for them.
      setError(stripeError.message ?? "That payment didn't go through.");
      setBusy(false);
      // Tell the server too, so the "way back in" email fires even if the webhook
      // is down (ADR 003, QA 2.4.3). Fire-and-forget: the message above is what
      // the customer needs; the report is a background nudge, verified and
      // deduped server-side. Only a genuine card error — a validation slip like a
      // blank field carries no payment_intent to decline, so it's skipped there.
      if (stripeError.type === "card_error") onDeclined?.(intent.paymentIntentId);
      return;
    }

    if (paymentIntent?.status === "succeeded") {
      await onPaid(paymentIntent.id);
      return;
    }

    // Anything else — `processing`, `requires_action` without a redirect — is
    // not a failure and not a success. Don't claim either.
    setError(
      "Your payment is still processing. We'll email you as soon as it clears.",
    );
    setBusy(false);
  }

  const amount = (intent.amountCents / 100).toLocaleString(undefined, {
    style: "currency",
    currency: intent.currency.toUpperCase(),
  });

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* The order summary a hosted checkout page wouldn't let us write. */}
      <div className="rounded-2xl bg-paper-alt p-5">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-ink-soft">
            Video review: {playerName}
          </span>
          <span className="font-semibold text-ink">{amount}</span>
        </div>
        <p className="mt-1 text-xs text-ink-muted">
          {`${fileCount} file${fileCount === 1 ? "" : "s"} attached · one-time payment · feedback in ${site.turnaround}`}
        </p>
      </div>

      <PaymentElement />

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          {error}
        </p>
      )}

      <Button
        type="submit"
        variant="primaryLime"
        size="lg"
        disabled={busy || !stripe || !elements}
        className="w-full"
      >
        {busy ? "Processing…" : `Pay ${amount}`}
      </Button>

      <button
        type="button"
        onClick={onBack}
        disabled={busy}
        className="w-full text-center text-sm text-ink-muted underline hover:text-ink disabled:opacity-50"
      >
        Back to your files
      </button>
      {/*
        The card reassurance belongs to the step that asks for a card, and only
        that one — it used to also print under the whole flow, where it rode along
        on steps 1–3 that never mention payment (QA 2.4.1.1). In the band grey,
        matching where it sat before.
      */}
      <p className="text-center text-xs text-band">
        Payments are handled securely by Stripe. We never see your card details.
      </p>
    </form>
  );
}
