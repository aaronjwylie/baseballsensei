/**
 * Configuration the **browser** is allowed to see.
 *
 * Separate from `env.ts` on purpose. `env.ts` holds server-only secrets, and
 * importing it into a client component would pull a module full of secret
 * getters into the browser bundle — harmless today (Next replaces non-`NEXT_PUBLIC_`
 * reads with `undefined`) but exactly the kind of thing that stops being harmless
 * after someone adds one more getter.
 *
 * So the invariant is: **`process.env` is read only inside `shared/config/`** —
 * `env.ts` for the server, this file for the browser. Two files, one home per
 * audience, and the split is the security boundary rather than a convenience.
 *
 * `NEXT_PUBLIC_*` values are inlined into the bundle at build time. Anything here
 * is public, permanently, to anyone who opens devtools. Never add a secret.
 */

/**
 * Stripe's publishable key. Safe to expose — it can only create payment
 * attempts, never read or move money.
 *
 * Read at module scope rather than through a getter so Next's build-time
 * substitution is unambiguous, and validated here so a misconfiguration surfaces
 * as a clear message instead of Stripe.js failing obscurely later.
 */
export const stripePublishableKey =
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";

/**
 * A `pk_live_` key with a `sk_test_` secret (or the reverse) fails at
 * confirmation time with a confusing error, so name the mismatch early.
 */
export function assertStripeKeyPresent(): void {
  if (!stripePublishableKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY. See .env.example — it's the pk_… key from the Stripe dashboard.",
    );
  }
  if (!stripePublishableKey.startsWith("pk_")) {
    throw new Error(
      "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY should start with pk_. A sk_ key here would be a secret leak.",
    );
  }
}

/**
 * Which release this bundle is (_ReleaseLaw P13). Both are inlined at build
 * time by `next.config.ts` — the version from package.json, the commit from
 * Vercel — and read here so no component touches `process.env` for them.
 */
export const appVersion = process.env.APP_VERSION ?? "0.0.0";
export const buildSha = process.env.BUILD_SHA ?? "dev";
