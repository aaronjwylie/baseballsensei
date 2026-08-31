# verification — `src/domains/verification/`

The **verification slice** — proving a customer can read the email address they
typed, before we spend anything on them.

---

## 1 · The northstar

It exists because of two things that used to be one thing.

Payment used to gate the upload: `/api/upload` verified a succeeded PaymentIntent
against Stripe, so nobody could store a file without paying. Moving payment to the
end ([ADR 009](../../../docs/decisions/009-upload-before-payment.md)) removed that
gate, and something had to replace it.

The something may as well be the check that also fixes the flow's worst failure:
**a wrong email address is the one mistake a customer cannot recover from.** There
is no account to log into by design (CLAUDE.md §2), so the address is the only
route their feedback can travel. Finding out it was wrong *after* taking the money
used to mean a bounced receipt and a support thread.

### The invariants

- **The code is never stored.** Only a bcrypt hash of it — the same treatment an
  operator password gets. A leaked snapshot hands over no live codes.
- **Verification state lives on the row, never in the cookie.** `emailVerifiedAt`
  is the single home for "has this been proven", so a stale cookie can't assert a
  verification that never happened.
- **The attempt counter increments before the comparison.** Otherwise the cap is
  bypassed by aborting each losing request.
- **This is not a login.** No password, no profile, nothing to sign into, one
  submission, hours not weeks. See
  [ADR 010](../../../docs/decisions/010-verification-gates-upload.md) for the line
  and how to tell when it's been crossed.

---

## 2 · Where we are now — 2026-08-29

- ✅ **Five wrong codes is the wall, and the customer is counted down to it**
  (QA 2.2.3). A mismatch now carries `remaining`, so the panel can say "3 attempts
  left" instead of springing the lockout; the fifth wrong guess comes back as
  `too_many_attempts`, not a pointless sixth box, and the input is *retired*
  (`VerifyPanel`'s `locked`) until a fresh code resets the count.
  `verificationFailureMessage` owns the countdown wording — the one sentence that
  changes each time, so it can't be a static `VERIFICATION_MESSAGES` entry.
- ✅ **The attempt spend is atomic.** It was a read-check-write, so a concurrent
  burst all read the same count and all wrote `read + 1` — `batch × 5` guesses
  against a single code. It's now one guarded
  `UPDATE … WHERE verificationAttempts < MAX_ATTEMPTS`: zero rows back means the
  cap is spent. The "increment before the comparison" invariant defeats the
  *abort* bypass; this closes the *concurrent* one (bug hunt, #10).
- ✅ **One attempt cap, shared** (QA 3.2). `MAX_ATTEMPTS` is `MAX_CODE_ATTEMPTS`
  from `shared/lib` now — the same five the `/status` feedback-view code uses, one
  source of truth so the two gates can't drift.

Earlier, on 2026-08-02:

- ✅ **A bounce is surfaced, not waited out.** The code's delivery is now tracked
  (`⑨`'s webhook records every outcome), and a bounce lands about **two seconds**
  after the send. The panel asks **once, five seconds in** — not a poll, because a
  two-second failure doesn't need one — and the verify and resend paths check as
  well, so the customer is never told *"that code doesn't match"* about a code
  that was never delivered.
- ✅ **The check can only move someone backwards**, so it is silent unless it is
  certain. A slow inbox is not a failure, and an absent session is not news — the
  flow already handles that wherever the customer acts.

## 2b · Where we were — 2026-08-01

- ✅ **One clock.** `CODE_TTL_MINUTES` is now the flow window, read from
  `shared/lib/flowWindow` rather than declared here. A shorter TTL was a *second*
  clock: a customer well inside their thirty minutes would find the code dead,
  having been told one number and held to another.
- ✅ **The send is confirmed before anyone advances.** `sendVerificationCode`
  returns whether the message reached Resend, and step 1 fails rather than
  parking someone on "enter the code" when no code is coming. This is a
  deliberate departure from ADR 004: best-effort is honest degradation everywhere
  the customer isn't *blocked*, and a dead end everywhere they are.
- ✅ **"Check your spam folder"** on the panel, which catches the common case for
  free.

**Why the constant lives in `shared/`:** `submission` owns the flow session,
`verification` owns the code, and neither can own a value the other needs without
inverting a dependency. A constant copied into both is how one clock quietly
becomes two (PRINCIPLES §5).


### Before 2026-08-01

- ✅ **Built and exercised** by `npm run flow`: issue, reject a wrong code, accept
  the right one, advance the status, and no-op on a replay.
- ✅ **6 digits, 10 minutes, 5 attempts, single-use.** Reissuing resets the
  counter, which is the documented way out of a lockout.
- ✅ **Rate-limited** per IP on both issue and verify.
- ✅ `randomInt` from `node:crypto`, not `Math.random()` — the value gates access
  to a submission.
- 🔶 **The flow cannot complete without a mail provider.** With `RESEND_API_KEY`
  unset, sends are skipped and logged (ADR 004) — honest degradation for a
  receipt, a hard stop here. Fine in dev (`npm run flow` bypasses email);
  **must be configured before launch.**
- 🔶 **No delivery feedback.** If Resend accepts the send but the mail bounces, the
  customer just sees "check your spam folder". Resend webhooks would close this.
- 🔶 **The rate limiter is per-instance** and honest about it
  (`shared/lib/rateLimit.ts`). The attempt cap on the row is the real defence.

---

## 3 · Where we came from

New on 2026-07-30; there was no verification of any kind before.

- **The gate could have been just a signed token.** ADR 009 originally proposed
  exactly that — "a short-lived signed upload token issued after the info step".
  The flow cookie *is* that token, but it only answers "did this browser start a
  submission", not "is this a real customer we can reach". Verification answers
  both, and the second answer is worth two extra round trips.
- **The code lives on `submission`, not its own table.** A submission has at most
  one active code and the lifecycles are 1:1; a separate table would have bought a
  join and a foreign key to hold four columns.
- **Codes are bcrypt-hashed rather than compared directly.** Slower than needed
  for a 6-digit value with a 5-attempt cap — and kept anyway, because "we store
  the secret in plaintext" is the sentence you don't want to write in a postmortem.
