import { defineConfig, devices } from "@playwright/test";

/**
 * Phase 4 — the golden-path E2E. Runs nightly (and on demand), never on the
 * merge gate, against a built `next start` with the test env: `E2E_TEST=1` (the
 * fixed verification code), Stripe **test** keys, and no BASIC_AUTH / BLOB token
 * (so the site gate is off and uploads go to local disk).
 *
 * The customer and operator paths share state — the operator processes the very
 * submission the customer created — so this runs single-file, single-worker, in
 * order. The operators the operator path signs in as are seeded by
 * `npm run seed:e2e` (a tsx script that can reach the app's `@/` imports, which
 * Playwright's own transpiler can't); the workflow runs it before the tests, and
 * a local run does the same once.
 */
const PORT = Number(process.env.E2E_PORT ?? 3000);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  // No retries: the golden path shares state across its serial steps, so a retry
  // re-runs the customer path against a submission the first run already
  // processed. A deterministic single pass is the honest signal.
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never" }]]
    : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Start the app ourselves for local runs; in CI the workflow has already built
  // it and this just launches `next start`, inheriting the test env.
  webServer: {
    command: "npm run start",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
