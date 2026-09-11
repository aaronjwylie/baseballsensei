/**
 * The gate every upload route passes through.
 *
 * Payment used to be this gate: the route verified a succeeded PaymentIntent, so
 * an unpaid caller could never store a file. Payment is now the last step, so
 * the gate is rebuilt from three checks instead, and **all three are re-made on
 * every request** — the browser is told the limits so it can be helpful, but it
 * is never trusted to enforce them.
 *
 * 1. The flow cookie names a submission this browser actually started — and,
 *    when the request says which submission *it* is for, the two agree. A
 *    browser has one cookie and many tabs; a tab whose submission was replaced
 *    by a newer start is refused with that reason, not with a folder error the
 *    Blob client swallows into "session timed out" (Ben, QA 10.6).
 * 2. That submission's email has been verified.
 * 3. It isn't already paid for, and isn't already at the file limit.
 *
 * Written once, here, because three routes need exactly the same answer and a
 * check that exists in three copies is a check that will eventually differ in
 * three ways.
 */
import {
  countSubmissionFiles,
  getSubmission,
  readFlowSession,
  isPaid,
  FLOW_SUPERSEDED_MESSAGE,
} from "@/domains/submission";
import type { Submission } from "@/domains/submission";
import { getSettings, maxFileSizeBytes, type PlatformSettings } from "@/domains/settings";
import { isAllowedFilename } from "@/shared/upload";

export interface UploadPermit {
  submission: Submission;
  settings: PlatformSettings;
  /** How many more files this submission may take. */
  remaining: number;
}

export interface UploadRefusal {
  status: number;
  error: string;
}

export type UploadDecision =
  | { ok: true; permit: UploadPermit }
  | { ok: false; refusal: UploadRefusal };

/**
 * Resolve the current browser's right to upload.
 *
 * `claimedSubmissionId` is which submission the request says it is for — read
 * off the pathname or the query, so never trusted, only compared. Null when the
 * route couldn't tell, in which case the cookie alone decides as it always did.
 *
 * Status codes are chosen so the client can tell the three failures apart
 * without parsing prose: 401 means "start again", 403 means "verify first",
 * 409 means "you're done uploading".
 */
export async function authorizeUpload(
  claimedSubmissionId: string | null,
): Promise<UploadDecision> {
  const submissionId = await readFlowSession();
  if (!submissionId) {
    return {
      ok: false,
      refusal: { status: 401, error: "Your session has expired. Please start again." },
    };
  }
  if (claimedSubmissionId && claimedSubmissionId !== submissionId) {
    return {
      ok: false,
      refusal: { status: 401, error: FLOW_SUPERSEDED_MESSAGE },
    };
  }

  const submission = await getSubmission(submissionId);
  if (!submission) {
    return {
      ok: false,
      refusal: { status: 401, error: "We couldn't find that submission. Please start again." },
    };
  }

  if (!submission.emailVerifiedAt) {
    return {
      ok: false,
      refusal: { status: 403, error: "Please verify your email address first." },
    };
  }

  // Once it's paid the customer is out of the flow; further files would arrive
  // after the coach may already have started.
  if (isPaid(submission)) {
    return {
      ok: false,
      refusal: { status: 409, error: "This submission is already complete." },
    };
  }

  const settings = await getSettings();
  const used = await countSubmissionFiles(submission.id);
  const remaining = settings.maxFilesPerSubmission - used;

  if (remaining <= 0) {
    return {
      ok: false,
      refusal: {
        status: 409,
        error: `You can attach up to ${settings.maxFilesPerSubmission} files.`,
      },
    };
  }

  return { ok: true, permit: { submission, settings, remaining } };
}

/**
 * Check one file's name and size against the permit.
 *
 * Size is checked server-side even though the Blob token also carries a
 * `maximumSizeInBytes`: the token protects storage, this protects the record,
 * and the dev path has no token at all.
 */
export function checkFile(
  permit: UploadPermit,
  filename: string,
  sizeBytes: number,
): UploadRefusal | null {
  if (!isAllowedFilename(filename)) {
    return { status: 415, error: "That file type isn't supported." };
  }
  if (sizeBytes <= 0) {
    return { status: 400, error: "That file is empty." };
  }
  if (sizeBytes > maxFileSizeBytes(permit.settings)) {
    return {
      status: 413,
      error: `Files must be under ${permit.settings.maxFileSizeMb} MB.`,
    };
  }
  return null;
}
