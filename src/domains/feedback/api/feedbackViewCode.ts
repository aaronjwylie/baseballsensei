/**
 * The status-page path to feedback: prove you own the inbox with a 6-digit code.
 *
 * The `/status` lookup identifies a customer by an **unverified** email, so it
 * can't hand over the feedback files on its own — anyone who guessed an address
 * would collect a stranger's review. This adds a verification step: enter your
 * email, receive a code, read it back. Only someone with the inbox open can
 * finish, which is the same guarantee the emailed capability link gives.
 *
 * It's **stateless** — no schema change. The code's bcrypt hash rides in a
 * short-lived signed, httpOnly cookie (`FEEDBACK_CODE_COOKIE`); the plaintext
 * exists only long enough to be emailed. This is *not* an account (CLAUDE.md
 * §2): no password, nothing to sign into, expires in minutes.
 */
import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";
import type { JWTPayload } from "jose";
import { env } from "@/shared/config/env";
import {
  findByCustomerEmail,
  isReleased,
  listFeedbackFiles,
  lookupPublicSubmissions,
  type PublicSubmission,
} from "@/domains/submission";
import { sendFeedbackViewCode } from "./feedbackEmail";

export const FEEDBACK_CODE_COOKIE = "bs_fbcode";

const CODE_LENGTH = 6;
export const FEEDBACK_CODE_TTL_S = 10 * 60;

/** What the signed pending-code cookie carries. The code is never stored raw. */
export interface PendingFeedbackCode extends JWTPayload {
  email: string;
  hash: string;
  purpose: "feedback-view";
}

/** One customer's feedback, grouped by player — only ever returned post-verify. */
export interface FeedbackGroup {
  playerName: string;
  files: { id: string; filename: string; sizeBytes: number }[];
}

function generateCode(): string {
  // A fixed code in a Playwright run — the status lookup is code-gated now, and
  // a browser can't read the email. Hard-off in production (see env.isE2E).
  if (env.isE2E) return "0".repeat(CODE_LENGTH);
  // `randomInt` from node:crypto, not Math.random — this gates access.
  return String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, "0");
}

/**
 * Mint a code for an email that actually has feedback, email it, and return the
 * payload for the caller to set as the pending cookie.
 *
 * Returns null when the email has no completed review — the route still answers
 * "ok" so the endpoint never confirms which addresses exist, and no code lands
 * in a stranger's inbox on a guess.
 */
export async function issueFeedbackViewCode(
  emailRaw: string,
): Promise<PendingFeedbackCode | null> {
  const email = emailRaw.trim().toLowerCase();
  const submissions = await findByCustomerEmail(email);
  /*
    Any submission earns a code, not just a released one.

    The code now gates the **status list** as well as the downloads, because a
    typed email proves nothing and the list carries a child's name. Requiring
    released feedback would have meant a customer mid-review couldn't see their
    own submission at all.
  */
  if (submissions.length === 0) return null;

  const code = generateCode();
  const hash = await bcrypt.hash(code, 10);
  // Best-effort transport (ADR 004); a send failure logs and never throws.
  await sendFeedbackViewCode(email, code);
  return { email, hash, purpose: "feedback-view" };
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

  const matches = await bcrypt.compare(code, pending.hash);
  if (!matches) return null;

  return {
    submissions: await lookupPublicSubmissions(email),
    groups: await listFeedbackForEmail(email),
  };
}

/** Every completed review's feedback files for an email, grouped by player.
 * Sensitive — call only after the code check has passed. */
export async function listFeedbackForEmail(
  emailRaw: string,
): Promise<FeedbackGroup[]> {
  const email = emailRaw.trim().toLowerCase();
  const submissions = await findByCustomerEmail(email);
  const groups: FeedbackGroup[] = [];
  for (const submission of submissions) {
    if (!isReleased(submission)) continue;
    const files = (await listFeedbackFiles(submission.id)).filter(
      (f) => !!f.fileUrl,
    );
    if (files.length === 0) continue;
    groups.push({
      playerName: submission.playerName || "Player",
      files: files.map((f) => ({
        id: f.id,
        filename: f.filename,
        sizeBytes: f.sizeBytes,
      })),
    });
  }
  return groups;
}
