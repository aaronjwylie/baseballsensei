/**
 * The flow window — **the only clock in the customer flow**.
 *
 * Thirty minutes, sliding. Every action the customer takes re-issues it, so it
 * measures *idleness* rather than total time: a slow upload on bad wifi isn't
 * cut off mid-transfer, and the window only runs out when someone genuinely
 * walked away.
 *
 * It governs everything before payment — the session that says which submission
 * a request may touch, **and the verification code's validity**. There is
 * deliberately no second, shorter clock on the code: a customer well inside
 * their window who finds the code already dead has been told one number and
 * held to another. A resent code inherits whatever time is left rather than
 * starting a fresh thirty, so the promise stays true.
 *
 * **It lives in `shared/` because two domains depend on it** — `submission`
 * owns the flow session, `verification` owns the code — and a constant copied
 * into both is how one clock quietly becomes two. Neither domain may own it
 * without the other importing it, so it belongs at the node above them
 * (PRINCIPLES §5).
 *
 * Running out is not an error but a **scrub**: the unfinished submission is
 * discarded exactly as a refresh discards it, and the customer is returned to
 * step 1. See `_SubmissionDocumentation.md` §2.
 *
 * It was six hours, then ten minutes (2026-07-30) so an abandoned attempt
 * wouldn't greet the next person on a shared machine — but ten proved too tight
 * to verify an email and then choose files. Thirty is the compromise, and the
 * sliding behaviour is what makes a window this short survivable.
 */

export const FLOW_WINDOW_MINUTES = 30;

export const FLOW_WINDOW_SECONDS = FLOW_WINDOW_MINUTES * 60;