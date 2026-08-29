/**
 * How many wrong guesses a mailed 6-digit code tolerates before it is burned and
 * a fresh one must be requested — the one figure both code entries share.
 *
 * Two doors take a code: the submission flow's email verification (step 2),
 * counted in `submission.verificationAttempts`, and the `/status` feedback-view
 * code, counted in its signed cookie. Different stores, one rule — so the number
 * lives here rather than as a `5` in each, and the two cannot drift ("one source
 * of truth, one behavioural pattern", Ben, QA 3.2).
 *
 * Five is comfortably safe: a 6-digit code is one in a million per guess, so the
 * cap exists to make automated grinding pointless, not to guard a lucky guess.
 */
export const MAX_CODE_ATTEMPTS = 5;
