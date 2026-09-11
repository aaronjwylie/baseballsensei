/**
 * The customer's handle on their own in-progress submission.
 *
 * Payment used to be the gate on uploading — the upload route verified a
 * succeeded PaymentIntent, so nobody could store a file without paying. Payment
 * is now the *last* step, so that gate is gone and this replaces it: a signed,
 * httpOnly cookie naming the one submission this browser started.
 *
 * **This is not a customer account** (CLAUDE.md §2). There is no password, no
 * profile, nothing to sign into, and it expires in hours. It is a capability
 * for one submission, and the browser cannot forge or edit it — the payload is
 * signed with AUTH_SECRET.
 *
 * It deliberately carries **only the submission id**. Whether the email has been
 * verified lives on the row (`emailVerifiedAt`), so there is one home for that
 * fact and a stale cookie can never claim a verification that didn't happen.
 *
 * **Thirty minutes, and it slides.** Every action the customer takes re-issues
 * the cookie, so the clock measures *idleness*, not total time — which matters
 * because uploading a 50 MB clip on hotel wifi can legitimately take longer than
 * the whole window. An absolute window would expire people mid-upload.
 *
 * It was six hours, then ten minutes (2026-07-30) so an abandoned half-finished
 * submission wouldn't greet the next person on a shared machine — but ten proved
 * too tight in practice: a customer verifying their email and then choosing
 * files could idle past it mid-flow. Thirty is the compromise, still short
 * enough for the shared-machine concern, and the sliding behaviour makes it
 * survivable.
 */
import { readSignedCookie, setSignedCookie, clearSignedCookie } from "@/shared/auth";
import { FLOW_WINDOW_SECONDS } from "@/shared/lib";

const FLOW_COOKIE = "bs_flow";

/**
 * Idle timeout, refreshed by `touchFlowSession` on every action.
 *
 * Read from `shared/lib/flowWindow`, not declared here: the verification code
 * expires on the same clock, and a constant copied into both domains is how one
 * clock quietly becomes two.
 */
export const FLOW_MAX_AGE_S = FLOW_WINDOW_SECONDS;

interface FlowPayload {
  submissionId: string;
}

export async function setFlowSession(submissionId: string): Promise<void> {
  return setSignedCookie(FLOW_COOKIE, { submissionId }, FLOW_MAX_AGE_S);
}

/**
 * Push the expiry back, if there's still a live session.
 *
 * Called by anything the customer actively does. Deliberately a no-op when the
 * cookie has already expired — reviving a dead session would defeat the point.
 *
 * Only usable where cookies can be written: Server Actions and Route Handlers.
 * A Server Component render cannot, which is why simply *looking* at the page
 * doesn't extend the window.
 */
export async function touchFlowSession(): Promise<void> {
  const submissionId = await readFlowSession();
  if (submissionId) await setFlowSession(submissionId);
}

/** The submission this browser is working on, or null. */
export async function readFlowSession(): Promise<string | null> {
  const payload = await readSignedCookie<FlowPayload>(FLOW_COOKIE);
  return payload?.submissionId ?? null;
}

export async function clearFlowSession(): Promise<void> {
  return clearSignedCookie(FLOW_COOKIE);
}

/**
 * Said to the tab that lost the browser's one flow.
 *
 * One home for the sentence: the actions and the upload gate both say it, and a
 * customer who meets it on step 2 and again on step 3 should meet the same words.
 */
export const FLOW_SUPERSEDED_MESSAGE =
  "Another submission was started in this browser, so this one was closed. Carry on in the other tab, or start again here.";

export type FlowClaim =
  | { ok: true; submissionId: string }
  | { ok: false; reason: "expired" | "superseded" };

/**
 * The cookie's submission, checked against the one this tab says it is on.
 *
 * **One cookie per browser — but a browser has many tabs** (Ben, QA 10.6,
 * 2026-09-10). Each tab's step is client state, so a second tab submitting
 * step 1 re-points the cookie at its own new submission, and every action the
 * first tab took after that re-derived "its" submission from the cookie and
 * landed on the second tab's row: its code was checked against the wrong
 * submission, then waved through once that one was verified; its upload was
 * refused as "session timed out"; and it would have paid for a submission whose
 * details it never entered.
 *
 * So a tab now says which submission it started, and the server refuses when
 * the cookie disagrees. The claim is **checked, never accepted**: the cookie
 * still authorises, and a claim can only narrow it — a mismatch fails, a match
 * is exactly what the cookie already said. There is nothing to tamper with,
 * because lying can only make your own request fail.
 *
 * Newest start wins, deliberately: that is how a refresh already works, and one
 * cookie cannot name two submissions. The losing tab simply learns it on its
 * next action, with the true reason, instead of acting on someone else's row.
 */
export async function claimFlowSession(claimed: string): Promise<FlowClaim> {
  const current = await readFlowSession();
  if (!current) return { ok: false, reason: "expired" };
  if (current !== claimed) return { ok: false, reason: "superseded" };
  return { ok: true, submissionId: current };
}
