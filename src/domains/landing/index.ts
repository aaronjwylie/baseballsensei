/**
 * The landing domain — the sales pitch.
 *
 * All UI and copy. Knows nothing about submissions; it just links to /start.
 *
 * The barrel exports the page and nothing else. It used to re-export the copy
 * objects too, which nothing outside the domain ever imported — and since
 * `Pricing` now reads the `settings` row, the barrel reaches database code and
 * a client component importing it would pull Postgres into the browser bundle
 * (see the client/server note in `structure.md` §3b).
 */
export { LandingPage } from "./ui/LandingPage";
export { faqPageSchema } from "./model/schema";
