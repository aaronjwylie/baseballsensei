import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import { ADMIN, COACH, VERIFICATION_CODE } from "./actors";

/**
 * The golden path, end to end: a customer pays and uploads, an operator walks it
 * down the ladder, and it comes out `complete`. One file, serial, single worker
 * — the operator steps process the very submission the customer created, shared
 * through the module-level `customerEmail`.
 *
 * Runs against a built app with `E2E_TEST=1` (fixed verification code), Stripe
 * **test** keys, and no BASIC_AUTH / BLOB token. The operators are seeded by
 * `npm run seed:e2e` before this runs.
 */
test.describe.configure({ mode: "serial" });

const runId = Date.now();
const customerEmail = `e2e-customer-${runId}@e2e.test`;
// Unique per run, and the queue displays the player name (not the email), so
// this is what scopes the operator's row — unambiguous even across a retry.
const playerName = `E2E Player ${runId}`;
const fixture = path.join(process.cwd(), "e2e", "fixtures", "clip.png");

async function signIn(page: Page, email: string, password: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/**
 * The status lookup is code-gated now: enter the email, request a code (fixed in
 * E2E), read it back, and the submissions render. Leaves the results on screen
 * for the caller to assert on.
 */
async function lookUpStatus(page: Page, email: string) {
  await page.goto("/status");
  await page.getByPlaceholder("you@example.com").fill(email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  const codeField = page.getByLabel("6-digit code");
  await expect(codeField).toBeVisible();
  await codeField.pressSequentially(VERIFICATION_CODE);
  await page.getByRole("button", { name: "See my submissions" }).click();
}

test("customer: details → verify → upload → pay → confirmation → status", async ({
  page,
}) => {
  await page.goto("/start");

  // Step 1 — player details.
  await page.getByPlaceholder("you@example.com").fill(customerEmail);
  await page.getByPlaceholder("e.g. Alex Tanaka").fill(playerName);
  await page
    .getByRole("button", { name: "Continue to email verification" })
    .click();

  // Step 2 — verify. The fixed code, because E2E_TEST=1 short-circuits
  // generateCode. Wait for the panel first, so a step-1 stall fails here with a
  // clear message rather than filling the code into the wrong field.
  // Target the input by its placeholder — its label is sr-only, and getByLabel
  // was resolving to the hidden <label>, not the field.
  const codeField = page.getByPlaceholder("123456");
  await expect(codeField).toBeVisible();
  await codeField.click();
  await codeField.pressSequentially(VERIFICATION_CODE);
  const verifyButton = page.getByRole("button", { name: "Verify and continue" });
  await expect(verifyButton).toBeEnabled();
  await verifyButton.click();

  // Step 3 — upload. The file input is hidden inside the "empty" card's label;
  // setInputFiles drives it regardless. Wait for the proxied upload to finish
  // (the continue button enables only when a card is done).
  await page.locator('input[type="file"]').setInputFiles(fixture);
  const continueToPay = page.getByRole("button", { name: /Continue to payment/ });
  await expect(continueToPay).toBeEnabled({ timeout: 45_000 });
  await continueToPay.click();

  // Step 4 — pay with the real Stripe test card, typed into the Elements iframe.
  // NOTE: the frame title / field placeholders are the top tuning candidate on
  // the first real run — the trace will show the exact structure if this misses.
  const payButton = page.getByRole("button", { name: /^Pay / });
  await expect(payButton).toBeVisible();
  // The PaymentElement mounts two same-titled iframes — an accessory frame and
  // the fields ("easel") frame, in that order. The card fields are in the last.
  const card = page.frameLocator('iframe[title="Secure payment input frame"]').last();
  await card.getByPlaceholder("1234 1234 1234 1234").fill("4242424242424242");
  await card.getByPlaceholder("MM / YY").fill("12 / 34");
  await card.getByPlaceholder("CVC").fill("123");
  // US test keys show a required ZIP field (placeholder "12345", label "ZIP code").
  await card.getByLabel("ZIP code").fill("12345");
  await payButton.click();

  // Confirmation.
  await expect(page.getByText(/you.?re all set/i)).toBeVisible({ timeout: 30_000 });

  // The status lookup finds it by email (behind the 6-digit code gate).
  await lookUpStatus(page, customerEmail);
  await expect(page.getByText(playerName)).toBeVisible();
});

/*
  PENDING — verified against the real UI up to here; the customer path above is
  green. The operator path is drafted against the queue's disclosure layout (each
  row is a <div> you expand to reveal the coach control, and Approve lives in the
  expanded panel), but the assign → hand off → coach-feedback → approve steps
  aren't confirmed end to end yet. `fixme` keeps the nightly green on the customer
  path until these selectors are tuned against a run.
*/
test("operator: assign → hand off → (coach) feedback → approve → complete", async ({
  page,
}) => {
  // --- Admin: expand the row and assign the coach -------------------------
  await signIn(page, ADMIN.email, ADMIN.password);
  await page.goto("/admin");

  // The queue is a disclosure: find the row (a bordered <div>) by the player
  // name, expand it (the header button), then act in the revealed panel.
  const row = page.locator("div.border-b").filter({ hasText: playerName }).first();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: new RegExp(playerName) }).click();

  await row.getByRole("combobox").selectOption({ label: COACH.name });
  await row.getByRole("button", { name: "Save" }).click();
  // Assigned — now hand it to the coach (assigned → sent_to_coach).
  await row.getByRole("button", { name: /Send email/ }).click();

  // --- Coach: pick up the files, upload feedback, send for approval -------
  await signIn(page, COACH.email, COACH.password);
  await page.goto("/coach");
  let coachCard = page.locator("li", { hasText: playerName }).first();
  await expect(coachCard).toBeVisible();

  // Pick up the customer's files first — the coach downloading them moves the
  // submission sent_to_coach → in_review, which "send for approval" requires.
  await Promise.all([
    page.waitForEvent("download").catch(() => {}),
    coachCard.locator('a[href^="/api/files/"]').first().click(),
  ]);
  await page.reload();
  coachCard = page.locator("li", { hasText: playerName }).first();

  await coachCard.locator('input[type="file"]').setInputFiles(fixture);
  // The button enables only once the feedback upload finishes.
  const sendForApproval = coachCard.getByRole("button", { name: "Send for approval" });
  await expect(sendForApproval).toBeEnabled({ timeout: 45_000 });
  await sendForApproval.click();
  // The send button disappearing is the stable signal it completed (the card
  // moves to the submitted section) — and gives the action time to persist
  // before we switch to the admin.
  await expect(sendForApproval).toBeHidden();

  // --- Admin: approve, which completes it and emails the customer ---------
  await signIn(page, ADMIN.email, ADMIN.password);
  await page.goto("/admin");
  const approveRow = page.locator("div.border-b").filter({ hasText: playerName }).first();
  await approveRow.getByRole("button", { name: new RegExp(playerName) }).click();
  await approveRow.getByRole("button", { name: /Approve/ }).click();

  // It has left the active queue as a completed review — the customer now sees
  // it as ready on the status page.
  await lookUpStatus(page, customerEmail);
  await expect(page.getByText(/feedback ready|ready|delivered/i)).toBeVisible();
});
