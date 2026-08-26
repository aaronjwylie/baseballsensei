/**
 * The people the golden path signs in as, and the fixed test data.
 *
 * Plain constants — **no app imports** — so both the tsx seed script (which runs
 * with the `@/` aliases) and the Playwright specs (which cannot) can share them.
 * The seed script creates these operators; the specs sign in as them.
 */
export const ADMIN = {
  email: "e2e-admin@e2e.test",
  password: "e2e-password-1",
  name: "E2E Admin",
} as const;

export const COACH = {
  // Reads English, so the customer's English submission takes the direct path
  // (no translation rungs) — the golden path.
  email: "e2e-coach@e2e.test",
  password: "e2e-password-1",
  name: "E2E Coach",
} as const;

/** The fixed verification code the app returns when E2E_TEST=1 (see env.isE2E). */
export const VERIFICATION_CODE = "000000";
