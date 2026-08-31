import {
  addSubmissionFile,
  getSubmission,
  listFilesByKinds,
  legsForTranslator,
  updateSubmission,
  type Submission,
  type SubmissionFile,
} from "@/domains/submission";
import { storage, folderFileKey } from "@/shared/storage";
import {
  legFor,
  isLegDone,
  isLegOpen,
  type LegShape,
  type TranslationKind,
} from "../model/translationLeg";

/**
 * The translator's own work — the mirror of `feedbackApi`, one artifact over.
 *
 * `domains/feedback` owns what the coach produces; this owns what the
 * translator produces. Neither lives in `domains/operator`, because both are
 * about the thing made rather than the person who made it — the same reason a
 * coach's response was never a property of the coach.
 */

/** One row of the translator's queue: the job, and everything it needs. */
export interface TranslatorLeg {
  submission: Submission;
  leg: LegShape;
  /** What they translate *from*. */
  source: SubmissionFile[];
  /** What they have handed over so far. */
  produced: SubmissionFile[];
  /** On their desk now, as against already handed back. */
  open: boolean;
}

/**
 * Everything assigned to this translator, both legs, newest first.
 *
 * A submission may appear **twice** — once per leg — and that is correct rather
 * than a duplicate: the two are separate jobs in opposite directions, usually
 * weeks apart. Only one of them can be open at a time, because a submission
 * sits on one rung.
 */
export async function findLegsForTranslator(
  operatorId: string,
): Promise<TranslatorLeg[]> {
  const rows = await legsForTranslator(operatorId);

  const legs = rows.flatMap((row) => {
    const leg = legFor(row.produces);
    // A grant whose `produces` isn't a translation kind isn't this queue's —
    // skipped rather than thrown, so one odd row can't blank the whole page.
    return leg ? [{ submission: row.submission, leg }] : [];
  });

  return Promise.all(
    legs.map(async ({ submission, leg }) => ({
      submission,
      leg,
      source: await listFilesByKinds(submission.id, [leg.reads]),
      produced: await listFilesByKinds(submission.id, [leg.produces]),
      open: isLegOpen(leg, submission.status),
    })),
  );
}

/** Save an uploaded translation to storage and file it — the dev/proxy path. */
export async function saveTranslationFile(
  submissionId: string,
  produces: TranslationKind,
  filename: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<SubmissionFile> {
  const key = folderFileKey(submissionId, produces, filename);
  const fileUrl = await storage.save(key, bytes, contentType);
  return addSubmissionFile(
    { submissionId, filename, contentType, sizeBytes: bytes.byteLength, fileUrl },
    produces,
  );
}

/**
 * Record a translation the browser uploaded straight to Blob — the prod path.
 * The object already landed; this only writes the row.
 */
export async function recordTranslationFile(
  submissionId: string,
  produces: TranslationKind,
  input: {
    filename: string;
    contentType: string;
    sizeBytes: number;
    fileUrl: string;
  },
): Promise<SubmissionFile> {
  return addSubmissionFile({ submissionId, ...input }, produces);
}

/**
 * The translator hands the leg back — the mirror of `sendFeedbackForApproval`,
 * and it refuses on the same two grounds for the same two reasons.
 *
 * **At least one file**, so a stray click can't hand back an empty leg and
 * leave the admin to discover the folder is empty at the moment they try to
 * pass it on.
 *
 * **And the rung**, which is the guard a caller cannot supply. Ownership was
 * checked by the action; the status was not, so a stale tab could hand back
 * twice, or hand back a leg the admin had already moved past — walking a
 * released submission backwards over its own completion. Unreachable by
 * clicking, which is exactly why it is worth closing.
 *
 * Returns null on refusal, the updated submission on success.
 */
export async function handBackTranslation(
  submissionId: string,
  produces: TranslationKind,
): Promise<Submission | null> {
  const leg = legFor(produces);
  if (!leg) return null;

  const files = await listFilesByKinds(submissionId, [leg.produces]);
  if (files.length === 0) return null;

  const current = await getSubmission(submissionId);
  if (!current || !isLegOpen(leg, current.status)) return null;

  return updateSubmission(submissionId, { status: leg.done });
}

export { isLegDone };
