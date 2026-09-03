/**
 * The status-page path to feedback: prove you own the inbox with a 6-digit code.
 *
 * The `/status` lookup identifies a customer by an **unverified** email, so it
 * can't hand over the feedback files on its own — anyone who guessed an address
 * would collect a stranger's review. This adds a verification step: enter your
 * email, receive a code, read it back. Only someone with the inbox open can
 * finish, which is the same guarantee the emailed capability link gives.
 *
 * It's **stateless** — no schema change. A keyed fingerprint of the code rides
 * in a short-lived signed, httpOnly cookie (`FEEDBACK_CODE_COOKIE`); the
 * plaintext exists only long enough to be emailed. This is *not* an account
 * (CLAUDE.md §2): no password, nothing to sign into, expires in minutes.
 *
 * **The fingerprint is an HMAC, not a bcrypt hash — deliberately.** The cookie
 * payload is readable by whoever made the request (httpOnly stops page scripts,
 * not the HTTP client that receives the `Set-Cookie`). A bcrypt hash of a
 * 6-digit code sitting there is an offline brute-force: a million candidates at
 * cost-10 fall in minutes on a handful of cores, well inside the cookie's life.
 * An HMAC keyed to `AUTH_SECRET` can't be brute-forced without the key, which
 * never leaves the server — so the secrecy of the code no longer rests on the
 * rate limit alone.
 */
import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import type { JWTPayload } from "jose";
import { env } from "@/shared/config/env";
import { MAX_CODE_ATTEMPTS } from "@/shared/lib";
import {
  findByCustomerEmail,
  isReleased,
  filesAsSent,
  listFeedbackFiles,
  lookupPublicSubmissions,
  toPublicSubmission,
  type FileKind,
  type PublicSubmission,
} from "@/domains/submission";
import { getSettings } from "@/domains/settings";
import { sendFeedbackViewCode } from "./feedbackEmail";

export const FEEDBACK_CODE_COOKIE = "bs_fbcode";

const CODE_LENGTH = 6;
export const FEEDBACK_CODE_TTL_S = 10 * 60;

/**
 * How many wrong guesses one issued code tolerates before it's burned.
 *
 * The HMAC fingerprint makes the code offline-brute-force-proof, but *online*
 * this stateless path leaned entirely on the per-instance rate limiter. The
 * shared code-entry cap bounds online grinding against a code guarding a
 * customer's list and a child's name, without an attempt column: the count rides
 * in the signed cookie. It is the *same* figure as the flow-verification gate —
 * one source of truth, so the two can't drift (Ben, QA 3.2).
 */
export const MAX_FEEDBACK_CODE_ATTEMPTS = MAX_CODE_ATTEMPTS;

/** What the signed pending-code cookie carries. The code is never stored raw. */
export interface PendingFeedbackCode extends JWTPayload {
  email: string;
  hash: string;
  purpose: "feedback-view";
  /** Wrong guesses so far against this code — burned at the cap. */
  attempts: number;
}

/**
 * One finished review, with the files to download it — only ever returned
 * post-verify.
 *
 * It carried a bare `playerName` until 2026-09-03, which was all the panel had
 * to tell seven reviews apart (Ben). It now carries the whole
 * `PublicSubmission`, so the download card can describe itself exactly as the
 * history card does — and, more to the point, so there is **one** projection
 * deciding what a customer may see rather than this file quietly maintaining a
 * second, narrower opinion that nobody would think to audit.
 */
export interface FeedbackGroup {
  submission: PublicSubmission;
  files: { id: string; filename: string; sizeBytes: number; kind: FileKind }[];
}

function generateCode(): string {
  // A fixed code in a Playwright run — the status lookup is code-gated now, and
  // a browser can't read the email. Hard-off in production (see env.isE2E).
  if (env.isE2E) return "0".repeat(CODE_LENGTH);
  // `randomInt` from node:crypto, not Math.random — this gates access.
  return String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, "0");
}

/**
 * The keyed fingerprint that goes in the cookie. HMAC-SHA256 under `AUTH_SECRET`
 * — an attacker who reads the cookie can't run candidates against it without the
 * key, so a 6-digit code stops being offline-brute-forceable (see file header).
 */
function fingerprint(code: string): string {
  return createHmac("sha256", env.authSecret).update(code).digest("hex");
}

/**
 * Mint a code for an email, email it when there's something to reveal, and
 * return the payload for the caller to set as the pending cookie.
 *
 * **Always returns a payload — even for an email with no feedback.** The route
 * sets the cookie unconditionally, so a `Set-Cookie` header can no longer be
 * read as "this address exists": a stranger enumerating inboxes sees the same
 * response every time. The empty case gets a decoy fingerprint no code can
 * match and sends no mail, so nothing lands in a stranger's inbox on a guess.
 */
export async function issueFeedbackViewCode(
  emailRaw: string,
): Promise<PendingFeedbackCode> {
  const email = emailRaw.trim().toLowerCase();
  const submissions = await findByCustomerEmail(email);
  /*
    Any submission earns a code, not just a released one.

    The code now gates the **status list** as well as the downloads, because a
    typed email proves nothing and the list carries a child's name. Requiring
    released feedback would have meant a customer mid-review couldn't see their
    own submission at all.
  */
  if (submissions.length === 0) {
    // A decoy: fingerprint a value no 6-digit code can produce, and send no
    // mail. The cookie is set exactly as in the real case, so the two are
    // indistinguishable from outside — but verification can never pass.
    return {
      email,
      hash: fingerprint(randomBytes(16).toString("hex")),
      purpose: "feedback-view",
      attempts: 0,
    };
  }

  const code = generateCode();
  // Best-effort transport (ADR 004); a send failure logs and never throws.
  await sendFeedbackViewCode(email, code);
  return { email, hash: fingerprint(code), purpose: "feedback-view", attempts: 0 };
}

/**
 * Check a code against the pending cookie and, on a match, return the email's
 * feedback. A mismatch (or a cookie for a different email) returns null; the
 * route maps that to a generic error and the caller can retry within the window.
 */
export interface StatusAccess {
  submissions: PublicSubmission[];
  groups: FeedbackGroup[];
}

/**
 * One code, one grant: **the customer's whole view.**
 *
 * The code proves control of the inbox, and everything behind it belongs to
 * whoever controls that inbox — the list and the downloads alike. Splitting it
 * into two grants would mean two codes for one act of proof, and a customer
 * being asked to check their email twice on the same page.
 */
export async function verifyFeedbackViewCode(
  pending: PendingFeedbackCode | null,
  emailRaw: string,
  code: string,
): Promise<StatusAccess | null> {
  const email = emailRaw.trim().toLowerCase();
  if (
    !pending ||
    pending.purpose !== "feedback-view" ||
    pending.email !== email ||
    typeof pending.hash !== "string"
  ) {
    return null;
  }

  // Constant-time compare of the HMAC — same-length hex, so `timingSafeEqual`
  // is safe to call directly, and a wrong code leaks nothing through timing.
  const expected = fingerprint(code);
  const provided = pending.hash;
  if (
    expected.length !== provided.length ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(provided))
  ) {
    return null;
  }

  const retention = await retentionWindows();
  return {
    submissions: await lookupPublicSubmissions(email, retention),
    groups: await listFeedbackForEmail(email),
  };
}

/**
 * The operator's two retention windows, in the shape the projection wants.
 *
 * Read here rather than threaded down from a page, because every caller that
 * builds a customer's view needs the same two numbers and none of them has any
 * other reason to know about settings. They are the operator's, so a default
 * baked in anywhere would be a second answer to a question the operator has
 * already answered once.
 */
async function retentionWindows() {
  const settings = await getSettings();
  return {
    collectedDays: settings.retainCollectedDays,
    deliveredDays: settings.retainDeliveredDays,
  };
}

/** Every completed review's feedback files for an email, grouped by player.
 * Sensitive — call only after the code check has passed. */
export async function listFeedbackForEmail(
  emailRaw: string,
): Promise<FeedbackGroup[]> {
  const email = emailRaw.trim().toLowerCase();
  const retention = await retentionWindows();
  const submissions = await findByCustomerEmail(email);
  const groups: FeedbackGroup[] = [];
  for (const submission of submissions) {
    if (!isReleased(submission)) continue;
    /* The set they were actually sent, not both response folders — a customer
       given only the translation must not be handed the coach's original in a
       language they may not read (Ben, QA e2j). */
    const files = filesAsSent(
      await listFeedbackFiles(submission.id),
      "feedback",
      submission.customerFileSet,
    ).filter((f) => !!f.fileUrl);
    if (files.length === 0) continue;
    groups.push({
      submission: toPublicSubmission(submission, retention),
      files: files.map((f) => ({
        id: f.id,
        filename: f.filename,
        sizeBytes: f.sizeBytes,
        // Which folder it came from, so the page can say which is which — the
        // customer's side of the grouping the hand-off email already does.
        kind: f.kind,
      })),
    });
  }
  return groups;
}
