"use server";
/**
 * The customer flow's verbs.
 *
 * Server Actions rather than API routes, for the same reason the admin portal
 * uses them: the browser needs a typed answer, not an HTTP contract, and every
 * one of these reads the flow cookie, which is a server concern anyway. The only
 * things left as routes are the ones that genuinely need HTTP — raw upload
 * bodies, the Blob token handshake, and Stripe's webhook.
 *
 * **Every action re-derives the submission from the cookie.** None of them
 * accepts a submission id from the browser, so there is nothing to tamper with.
 */
import { headers } from "next/headers";
import { clientIdentifierFrom, rateLimit } from "@/shared/lib";
import {
  createSubmission,
  getSubmission,
  getSubmissionFile,
  deleteSubmissionFile,
  isPaid,
  listSubmissionFiles,
  noteEmailSent,
  parseSubmissionInput,
  readFlowSession,
  setFlowSession,
  clearFlowSession,
  touchFlowSession,
  type SubmissionFile,
  bounceOf,
  type BounceKind,
} from "@/domains/submission";
import { storage, submissionFolder } from "@/shared/storage";
import { discardUnpaidSubmission, sweepAbandoned } from "@/domains/upload";
import { getSettings } from "@/domains/settings";
import {
  codeSchema,
  issueCode,
  sendVerificationCode,
  verificationFailureMessage,
  verifyCode,
} from "@/domains/verification";
import {
  createPaymentIntent,
  getFailedPaymentIntent,
  handleFailedPayment,
  type CreatedIntent,
} from "@/domains/payment";
import { confirmPaymentForFlow } from "./confirmPayment";

/**
 * What every action returns: a discriminated union, so the caller has to look
 * at `ok` before reaching for anything else. `data` is always present on
 * success — `void` for the actions that only report whether they worked.
 */
/**
 * What every action returns: a discriminated union, so the caller has to look
 * at `ok` before reaching for anything else. `data` is always present on
 * success — `void` for the actions that only report whether they worked.
 *
 * **`gone` is the second axis, and it exists because a sentence isn't enough.**
 * "That code was wrong" and "that submission no longer exists" are both failures,
 * but only one of them should leave the customer where they are. Without a flag
 * the UI can act on, an expired window renders as an inline error next to a form
 * that will never work again — and a customer can sit on step 3 uploading into
 * something the server swept ten minutes ago.
 *
 * Every action can return it, because every action re-derives the submission
 * from the flow cookie and any of them can find it missing.
 */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; gone?: true; keepDetails?: true; locked?: true };

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

/**
 * The submission this browser was working on is no longer there — the window
 * lapsed, the guesses ran out, or it was scrubbed. The flow's only correct
 * response is to start over, which is what the flag tells it to do.
 */
function gone(
  error = "Your session timed out. We've started you fresh — sorry about that.",
): { ok: false; error: string; gone: true } {
  return { ok: false, error, gone: true };
}

/**
 * The address doesn't work — take them back to fix it.
 *
 * Reuses `gone`, so the flow resets to step 1 exactly as it does for a lapsed
 * window. The submission isn't deleted here: it can't be verified, so it can
 * never be paid for, and the abandonment sweep will collect it like any other
 * dead attempt. Deleting it immediately would buy nothing — there are no files
 * yet, because uploading requires the verification this never got.
 */
/**
 * The address didn't take our code. Say which problem it is, where we know.
 *
 * A hard bounce and a full mailbox need different advice, and giving the wrong
 * one sends somebody hunting for a typo they don't have. Where the classification
 * is missing, the wording covers both rather than guessing: "couldn't deliver" is
 * true in every case, and it offers both remedies.
 */
const BOUNCE_MESSAGE: Record<BounceKind, string> = {
  hard: "That email address doesn't exist. Please check it for a typo and try again.",
  soft: "That inbox couldn't accept our email. It may be full, so please try a different address.",
  unknown:
    "We couldn't deliver your code to that address. Check it for a typo, or try a different email.",
};

/*
  Back to step 1, but keep what they typed.

  Like `gone` it leaves the current step for step 1 — a bounced code can't be
  verified, so the customer can't stay where they are. Unlike `gone`, the
  submission's details are perfectly good: only the address bounced. So
  `keepDetails` tells the flow to hold name/age/focus/notes and just prefill the
  form, so the customer corrects the one field that was wrong rather than
  retyping everything (Ben, QA 2.1.9). The stale submission is discarded when
  they resubmit, like any other abandoned attempt.
*/
function bouncedBack(
  kind: BounceKind,
): { ok: false; error: string; gone: true; keepDetails: true } {
  return { ...gone(BOUNCE_MESSAGE[kind]), keepDetails: true };
}

const DONE: ActionResult<void> = { ok: true, data: undefined };

async function identify(): Promise<string> {
  return clientIdentifierFrom(await headers());
}

/* ---- Step 1 — player details -------------------------------------------- */

/**
 * Discard whatever came before, open a fresh submission, and send the code.
 *
 * **Always a new row, never an edit.** Until a payment clears, a submission is a
 * scratch pad; starting again throws the old one away — files and record —
 * rather than reusing it. That makes two guarantees fall out for free: a fresh
 * submission is unverified by construction, so a changed email address can never
 * inherit a verification it didn't earn; and there is no half-edited row for the
 * queue or the sweep to trip over.
 *
 * `discardUnpaidSubmission` refuses to touch anything already paid for, so a
 * customer returning to `/start` after checking out keeps their receipt.
 */
export async function startSubmissionAction(
  raw: unknown,
): Promise<ActionResult<{ email: string; uploadFolder: string }>> {
  const limit = rateLimit(`start:${await identify()}`, {
    limit: 10,
    windowSeconds: 60 * 10,
  });
  if (!limit.ok) return fail("Too many attempts. Please wait a few minutes.");

  const parsed = parseSubmissionInput(raw);
  if (!parsed.ok) return fail(parsed.error);

  const previousId = await readFlowSession();
  // Spare a *started* previous submission: it may have a payment in flight that
  // hasn't marked the row paid yet, and the opportunistic sweep below (plus the
  // cron) clears genuinely-abandoned ones once their window elapses.
  if (previousId) await discardUnpaidSubmission(previousId, { spareStarted: true });

  /*
    Tidy up after everyone else while we're here.

    Nothing unpaid should linger, and the cron can only notice an elapsed window
    when it runs — daily, on the current plan. Doing it here means the flow
    cleans up after itself under any real traffic, so "no retention of something
    that was never paid for" holds without depending on a schedule.

    Bounded and best-effort: this is a customer waiting on a page, not a batch
    job. A failure here must not stop them starting a submission.
  */
  try {
    const settings = await getSettings();
    await sweepAbandoned(settings.retainUnpaidHours, 10);
  } catch (err) {
    console.error("[checkout] opportunistic sweep failed:", err);
  }

  const submission = await createSubmission(parsed.value);
  await setFlowSession(submission.id);

  /*
    Do not advance on a send we couldn't make.

    Everywhere else in the app a failed email is honest degradation — the work
    still happened, someone just wasn't told. Here the customer is *blocked* on
    the message, so swallowing the failure turns "best-effort" into a dead end:
    they sit on step 2 waiting for a code that was never sent, with nothing on
    screen to suggest otherwise.

    The submission stays. They can correct the address and try again, and the
    scratch pad is discarded on the next attempt like any other.
  */
  const sent = await sendCode(submission.id, submission.customerEmail);
  if (!sent) {
    return fail(
      "We couldn't send your code — please check the address and try again.",
    );
  }

  return {
    ok: true,
    data: {
      email: submission.customerEmail,
      uploadFolder: submissionFolder(submission.id),
    },
  };
}

/* ---- Step 2 — email verification ---------------------------------------- */

/**
 * Mint a code and get it to the customer.
 *
 * False means **they will not receive one** — either the code couldn't be
 * issued, or the mail didn't reach Resend. Both are dead ends for someone whose
 * next screen asks them to type it in, so both are reported rather than logged.
 */
async function sendCode(submissionId: string, email: string): Promise<boolean> {
  const code = await issueCode(submissionId);
  if (!code) return false;
  const result = await sendVerificationCode(email, code);
  // Not awaited: recording the send must never be why the send appears to fail.
  void noteEmailSent(submissionId, "① code → customer", result);
  return result.ok;
}

export async function resendCodeAction(): Promise<ActionResult> {
  const limit = rateLimit(`resend:${await identify()}`, {
    limit: 5,
    windowSeconds: 60 * 10,
  });
  if (!limit.ok) {
    return fail("Too many code requests. Please wait a few minutes.");
  }

  const submissionId = await readFlowSession();
  if (!submissionId) return gone();

  const submission = await getSubmission(submissionId);
  if (!submission) return gone();
  if (isPaid(submission)) return fail("This submission is already complete.");

  // Resending to an address that already bounced sends a second message
  // nowhere. Send them back to fix it instead.
  const bounced = await undeliverable(submission.id);
  if (bounced) return bouncedBack(bounced);

  await touchFlowSession();
  const sent = await sendCode(submission.id, submission.customerEmail);
  return sent
    ? DONE
    : fail("We couldn't send your code — please try again in a moment.");
}

/**
 * Did the code we sent bounce?
 *
 * A bounce arrives by webhook *after* the customer has been moved on to "enter
 * your code", and nothing can push it to them — the page doesn't poll and
 * shouldn't. So the next thing they do is what surfaces it, which is why both
 * the verify and the resend path ask.
 *
 * Scoped to ① and to unpaid submissions on purpose. A receipt or a feedback
 * link bouncing is a real problem, but it is **the admin's** problem: those arrive
 * after money has changed hands, and nothing here may act destructively on a
 * paid submission.
 */
async function undeliverable(submissionId: string) {
  return bounceOf(submissionId, "①");
}

/**
 * Has the code we just sent bounced? Asked once, shortly after step 2 loads.
 *
 * A bounce lands about two seconds after the send — measured, not guessed — and
 * nothing pushes it to the customer, who by then is looking at a code input for
 * a message that will never arrive. Waiting for them to act meant sitting there
 * until their patience ran out and only then being told.
 *
 * **One check, not a poll.** It fires while they're still switching to their
 * mail app, which is long enough to catch a bounce that takes two seconds and
 * short enough not to be a loop. If nothing has bounced by then they're in the
 * ordinary case and nothing more happens.
 *
 * Silent on every other outcome, deliberately: this can only ever move someone
 * *backwards*, so it must be certain. A slow inbox is not a failure, and no
 * session is not news — the flow already handles that wherever the customer
 * acts, and answering `gone` from a background check would yank them out of a
 * step they were happily on.
 */
export async function checkDeliveryAction(): Promise<ActionResult> {
  const submissionId = await readFlowSession();
  if (!submissionId) return DONE;
  const bounce = await undeliverable(submissionId);
  return bounce ? bouncedBack(bounce) : DONE;
}

export async function verifyCodeAction(rawCode: string): Promise<ActionResult> {
  const limit = rateLimit(`verify:${await identify()}`, {
    limit: 20,
    windowSeconds: 60 * 10,
  });
  if (!limit.ok) return fail("Too many attempts. Please wait a few minutes.");

  const parsed = codeSchema.safeParse(rawCode);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Enter the code from your email.");
  }

  const submissionId = await readFlowSession();
  if (!submissionId) return gone();

  /*
    Say the true thing first.

    Without this the customer types a code that was never delivered and is told
    "that code doesn't match" — which is accurate about the code and a lie about
    what happened. They'd retype it, ask for another, and conclude the site is
    broken rather than that they mistyped their address.
  */
  const bounced = await undeliverable(submissionId);
  if (bounced) return bouncedBack(bounced);

  const result = await verifyCode(submissionId, parsed.data);
  if (result.ok) {
    await touchFlowSession();
    return DONE;
  }
  const error = verificationFailureMessage(result);
  // `locked` tells step 2 to retire the code input — the guesses are gone and
  // only a fresh code (which resets the count) can revive it.
  if (result.reason === "too_many_attempts") {
    return { ok: false, error, locked: true };
  }
  return fail(error);
}

/* ---- Step 3 — the file list --------------------------------------------- */

/**
 * The files currently attached, so the panel can rebuild itself after a reload
 * instead of pretending nothing was uploaded.
 */
export async function listFlowFilesAction(): Promise<
  ActionResult<SubmissionFile[]>
> {
  const submissionId = await readFlowSession();
  if (!submissionId) return gone();
  await touchFlowSession();
  return { ok: true, data: await listSubmissionFiles(submissionId) };
}

/**
 * Remove one file the customer attached, before they pay for it.
 *
 * Scoped hard: only a file this flow's own submission owns, only an `intake`
 * file (the customer's, never a translation), and never once the submission is
 * paid — a receipt has already gone out naming what was sent. The bytes go
 * first (best-effort, the driver swallows a missing object), then the row, so a
 * failed storage delete can't strand a row pointing at nothing.
 */
export async function removeFlowFileAction(fileId: string): Promise<ActionResult> {
  const submissionId = await readFlowSession();
  if (!submissionId) return gone();

  const submission = await getSubmission(submissionId);
  if (!submission) return gone();
  if (isPaid(submission)) return fail("This submission is already complete.");

  const file = await getSubmissionFile(fileId);
  if (!file || file.submissionId !== submissionId || file.kind !== "intake") {
    return fail("That file isn't part of this submission.");
  }

  await touchFlowSession();
  if (file.fileUrl) await storage.remove(file.fileUrl);
  await deleteSubmissionFile(fileId);
  return { ok: true, data: undefined };
}

/* ---- Step 4 — payment ---------------------------------------------------- */

/**
 * Mint the PaymentIntent for this submission.
 *
 * Refuses if nothing has been uploaded: paying for an empty submission is a
 * dead end for the customer and a support ticket for the admin.
 */
export async function createIntentAction(): Promise<ActionResult<CreatedIntent>> {
  const submissionId = await readFlowSession();
  if (!submissionId) return gone();

  const submission = await getSubmission(submissionId);
  if (!submission) return gone();
  if (!submission.emailVerifiedAt) return fail("Please verify your email first.");
  if (isPaid(submission)) return fail("This submission has already been paid for.");

  const files = await listSubmissionFiles(submission.id);
  if (files.length === 0) return fail("Please attach at least one file first.");

  await touchFlowSession();

  try {
    return { ok: true, data: await createPaymentIntent(submission) };
  } catch (err) {
    console.error("[checkout] intent creation failed:", err);
    return fail("We couldn't start the payment. Please try again.");
  }
}

/**
 * Close the loop after Stripe says the card cleared inline.
 *
 * The redirect path (3-D Secure, wallets) lands on `/api/payment/return`
 * instead; both call the same `confirmPaymentForFlow`.
 */
export async function confirmPaymentAction(
  paymentIntentId: string,
): Promise<ActionResult> {
  const outcome = await confirmPaymentForFlow(paymentIntentId);
  if (outcome.ok) return DONE;
  // No "start over" here any more: a lapsed window at the payment step used to
  // reset the flow, but `confirmPaymentForFlow` now confirms a cleared charge
  // from the intent's own reference rather than the cookie, so a genuine failure
  // is the only way through — show it, don't restart a paid customer.
  return fail(outcome.error);
}

/**
 * The browser reporting its own decline — the failure path's second caller.
 *
 * Success has had two callers since ADR 003 (the webhook and the browser
 * confirming inline), so a payment records even when the webhook is down.
 * Failure had only the webhook, so one disabled or misdirected endpoint silently
 * removed the entire card-declined recovery email — undetectably, because the
 * healthy success path hid it (QA 2.4.3). This gives failure the same second
 * caller: the browser already knows the card was declined, so it says so.
 *
 * Best-effort and quiet — the customer is already looking at Stripe's decline
 * message, so there is nothing here for the UI to act on. It re-derives the
 * submission from the flow cookie and re-reads the intent from Stripe (never the
 * browser's claim), so it can't be used to fire decline notices at other people,
 * and `handleFailedPayment` is idempotent with the webhook.
 */
export async function reportDeclineAction(
  paymentIntentId: string,
): Promise<void> {
  const submissionId = await readFlowSession();
  if (!submissionId) return;

  const intent = await getFailedPaymentIntent(paymentIntentId);
  if (!intent) return;
  // The intent must belong to this browser's submission — the same guard the
  // success path makes.
  if (intent.metadata?.submissionId !== submissionId) return;

  await handleFailedPayment(intent);
}

/**
 * Let go of the current submission.
 *
 * Two callers, one verb: "Start over" mid-flow, and "Send another video" from
 * the confirmation. The discard is a no-op on anything already paid for, so the
 * second case clears the cookie without touching the customer's record — and
 * `spareStarted` keeps the mid-flow case from deleting a submission whose payment
 * is still in flight, leaving it for the sweep.
 */
export async function startAnotherAction(): Promise<ActionResult> {
  const submissionId = await readFlowSession();
  if (submissionId)
    await discardUnpaidSubmission(submissionId, { spareStarted: true });
  await clearFlowSession();
  return DONE;
}
