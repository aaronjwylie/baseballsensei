/**
 * App-wide brand facts. The single home for anything the client edits that
 * isn't page-specific — the name, what a review costs, how long it takes.
 *
 * Landing-page section copy lives in `domains/landing/model/copy.ts`, because
 * it's true of the landing page rather than of the app. Facts here are used by
 * the landing page AND the emails AND checkout, which is what earns them a
 * place in `shared/` (principle #5 — the highest node where it's still true).
 */
export const site = {
  name: "Baseball Sensei",
  /** The wireframe's hero headline. Doubles as the page title. */
  tagline: "Train like Japan's best players",
  /**
   * The wireframe's hero subhead, which is also the meta description. Its
   * first word reads "Seisei" in the wireframe — transcribed here as the brand
   * name, on the reading that it is a typo for Sensei.
   */
  subhead:
    "Baseball Sensei provides pitching analysis and batting analysis by a professional baseball coach from Japan.",
  /**
   * The public contact address — shown on /contact, /terms, and in the footer.
   *
   * Distinct from `EMAIL_FROM`, which is who transactional mail is *sent as*,
   * and from the operator address notifications go *to* (read from the admin
   * user's row — see docs/design/emails.md). Three different jobs; collapsing
   * them would mean a change of operator silently changing the public address.
   */
  email: "contact@baseball-sensei.com",
  /**
   * The live price is the operator setting (`settings.priceCents`, edited at
   * /admin/settings) — read by both the checkout charge and every place the
   * figure is shown, so they can't disagree. `amountCents` here is only the
   * default/last-resort fallback; `currency` and `unit` stay dev config.
   */
  price: {
    amountCents: 8000,
    currency: "cad",
    unit: "per submission",
  },
  /**
   * The customer-facing SLA, in the wireframe's words. Every promise of speed
   * — landing page, checkout, upload confirmation, emails — reads this, so
   * tightening or relaxing it is one edit, not a hunt.
   */
  /*
    "1 week", the current commitment (Aaron, 2026-09-05) — down from the design's
    "72 hours". This one value is read by the hero, the ticker, the pricing list,
    the FAQ, the confirmation email and the status page, so the promise of speed
    can't disagree with itself: change it here and every surface follows. The
    ticker shortens it with a `.replace(" hours", "h")` that is now a no-op, left
    in so it kicks back in if the value ever returns to an "N hours" form.
  */
  turnaround: "1 week",
} as const;

/**
 * Format a cents amount as the site's price label, e.g. 8000 → "$80", 7999 →
 * "$79.99". One home for how money reads, so the landing card, the checkout, and
 * the terms page all render the operator's price the same way.
 */
export function formatPrice(cents: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: site.price.currency.toUpperCase(),
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}
