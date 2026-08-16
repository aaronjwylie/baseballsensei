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
    72, not 48. Audrey's signed-off design promises "within 72 hours" in the
    hero, the ticker and the pricing list; this value had said 48. It is read by
    the confirmation email and the status page as well as the landing copy, so
    the two could not both stay — a customer told 48 here and 72 there is a
    complaint either way. Changed 2026-08-15 to match the design; if 48 was the
    real commitment, change it here and the design has to follow.
  */
  turnaround: "72 hours",
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
