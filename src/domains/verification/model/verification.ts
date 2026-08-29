/**
 * Email verification — proving the address a customer typed is one they can
 * actually read, before we let them upload anything.
 *
 * **This is not a login** (CLAUDE.md §2). It creates no account, no password
 * and nothing to sign into; it is a one-time check on one submission. The
 * capability it grants lives in the flow cookie and expires in hours.
 *
 * Why it exists at all: payment used to be the gate on uploading. With payment
 * moved last, something has to stop an anonymous visitor pushing files at us,
 * and it may as well be the thing that also guarantees we can deliver the
 * feedback — a wrong email address is the one failure the customer cannot
 * recover from on their own.
 */
import { z } from "zod";

export const CODE_LENGTH = 6;

/**
 * The code lives exactly as long as the flow window, and not a minute less.
 *
 * There is **one clock in the flow** (`shared/lib/flowWindow`). A shorter TTL
 * here would be a second one: a customer well inside their thirty minutes would
 * find the code dead, having been told one number and held to another. Re-export
 * rather than redeclare, so the two can't drift.
 */
import { FLOW_WINDOW_MINUTES, MAX_CODE_ATTEMPTS } from "@/shared/lib";

export const CODE_TTL_MINUTES = FLOW_WINDOW_MINUTES;

/**
 * Wrong guesses that burn the code and force a resend — the shared code-entry
 * cap, so this gate and the `/status` feedback code stay the same five (QA 3.2).
 */
export const MAX_ATTEMPTS = MAX_CODE_ATTEMPTS;

/** Only digits, exactly `CODE_LENGTH` of them. */
export const codeSchema = z
  .string()
  .trim()
  .regex(
    new RegExp(`^\\d{${CODE_LENGTH}}$`),
    `Enter the ${CODE_LENGTH}-digit code from your email.`,
  );

/** Why a verification attempt failed — the UI maps these to sentences. */
export type VerificationFailure =
  | "no_code"
  | "expired"
  | "too_many_attempts"
  | "mismatch";

export type VerificationResult =
  | { ok: true }
  /*
    `remaining` rides along on a mismatch: how many guesses are left after this
    one. It lets the UI count the customer down to the wall instead of springing
    it on them, and the last wrong guess never carries `mismatch` at all — it
    comes back as `too_many_attempts`, so five wrong codes is five, not six.
  */
  | { ok: false; reason: "mismatch"; remaining: number }
  | { ok: false; reason: Exclude<VerificationFailure, "mismatch"> };

/** One sentence per failure, so the wording lives in one place. */
export const VERIFICATION_MESSAGES: Record<VerificationFailure, string> = {
  no_code: "We haven't sent a code yet. Ask for a new one below.",
  expired: `That code has expired. Codes last ${CODE_TTL_MINUTES} minutes — ask for a new one below.`,
  too_many_attempts:
    "Too many incorrect attempts. Ask for a new code to try again.",
  mismatch: "That code doesn't match. Check the email and try again.",
};

/**
 * The sentence to show for a failed check. Identical to the map, except a
 * mismatch names how many attempts are left — the one message that changes each
 * time, so it can't be a static entry.
 */
export function verificationFailureMessage(
  result: Extract<VerificationResult, { ok: false }>,
): string {
  if (result.reason === "mismatch") {
    const n = result.remaining;
    return `That code doesn't match — ${n} ${n === 1 ? "attempt" : "attempts"} left.`;
  }
  return VERIFICATION_MESSAGES[result.reason];
}
