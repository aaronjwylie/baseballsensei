import type { Metadata } from "next";
import { PageColumn } from "@/shared/ui";
import { PortalEmptyState } from "../_portal/PortalEmptyState";
import { ReviewCard, type ReviewState } from "./ReviewCard";
import { storage } from "@/shared/storage";
import { requireRole } from "@/domains/account";
import { getCoachByOperatorId } from "@/domains/operator";
import {
  findByCoach,
  listFeedbackFiles,
  filesAsSent,
  listIntakeFilesForSubmissions,
  listEventsForSubmissions,
  listFoldersForSubmissions,
  reachedAt,
  type FileKind,
  type SubmissionFile,
  hasResponse,
  isHandedToCoach,
  isWithCoach,
} from "@/domains/submission";
import type { UploadMode } from "@/shared/upload";
import { getSettings } from "@/domains/settings";

export const metadata: Metadata = {
  title: "Coach portal",
  robots: { index: false },
};

/** The shape `listFoldersForSubmissions` returns, for a submission it didn't. */
const EMPTY_FOLDERS: Record<FileKind, SubmissionFile[]> = {
  intake: [],
  intake_translation: [],
  feedback: [],
  feedback_translation: [],
};

/**
 * The coach's queue — **one card per submission, newest first.**
 *
 * It was two lists, "To review" above "Submitted", and a coach looking for a
 * particular review had to know which half it had fallen into before they could
 * start scanning. One submission was never in both, so the split bought nothing
 * a badge on the card doesn't say more directly, and it cost the one ordering a
 * person actually holds in their head: when it came in (Ben, 2026-09-10).
 *
 * `findByCoach` already returns `submittedAt` descending, so the order here is
 * the query's — not a sort layered on top of it that could disagree.
 *
 * **Three states, because assignment and hand-off are different acts.**
 * `isWithCoach` says the row is theirs, from `assigned`. `isHandedToCoach` says
 * the work has actually been handed over, from `sent_to_coach`. Between those
 * two the admin is still choosing a file set, or the intake translation is
 * still out — so the card names the submission and says whose move it is, and
 * shows no files and no hand-back form. It used to show both, offering work
 * `sendFeedbackForApproval` would then refuse (Ben, QA 6.18, 2026-09-11).
 *
 * A submission on neither predicate is not the coach's at all and never
 * appears.
 */
export default async function CoachHomePage() {
  const session = await requireRole("coach");
  const coach = await getCoachByOperatorId(session.operatorId);
  const submissions = coach ? await findByCoach(coach.id) : [];

  // Prod uploads straight to Blob; dev proxies to disk. Same seam the customer
  // flow reads.
  const uploadMode: UploadMode = storage.supportsDirectUpload ? "blob" : "proxy";
  // The same limit the customer's panel enforces, so an operator is refused
  // in the browser rather than after the upload (Ben, QA 6.6.1).
  const settings = await getSettings();

  // Theirs, and of those the ones actually handed over. Everything past the
  // hand-back is `done`; the three sets partition the queue.
  const mine = submissions.filter(isWithCoach);
  const open = mine.filter(isHandedToCoach);
  const done = submissions.filter(hasResponse);
  const onDesk = new Set(open.map((s) => s.id));
  const queue = submissions.filter((s) => isWithCoach(s) || hasResponse(s));

  /*
    One query per set for the page, rather than one per card — and **only for
    the cards that render them**. A waiting card shows no files, so loading
    them would be fetching the admin's un-curated originals to throw away.
  */
  const filesBySubmission = await listIntakeFilesForSubmissions(
    open.map((s) => s.id),
  );
  // Feedback files a coach has already attached but not yet sent, so the card
  // can show what's staged.
  const feedbackByOpen = new Map(
    await Promise.all(
      open.map(async (s) => [s.id, await listFeedbackFiles(s.id)] as const),
    ),
  );
  // The trail is the only place that knows *when* a hand-back happened.
  const eventsBySubmission = await listEventsForSubmissions(done.map((s) => s.id));
  // All four folders, so a finished card agrees with the admin's panel about
  // what this submission actually holds.
  const foldersBySubmission = await listFoldersForSubmissions(done.map((s) => s.id));

  // A linked coach with nothing on their desk gets the calm centered panel, not a
  // page of empty "(0)" headings bunched under the bar (Ben, QA 4.6). The
  // not-yet-linked case still falls through to the queue, where its amber notice
  // explains the one thing they need an admin to do.
  if (coach && queue.length === 0) {
    return (
      <PortalEmptyState title={`${coach.name}'s reviews`}>
        <p>Nothing is assigned to you right now.</p>
        <p>When the admin assigns you a submission, it will appear here to review.</p>
      </PortalEmptyState>
    );
  }

  return (
    <PageColumn>
      <h1 className="font-display text-2xl font-medium uppercase tracking-[-0.01em] text-ink">
        {coach ? `${coach.name}'s reviews` : "Your reviews"}
      </h1>

      {!coach && (
        <p className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          Your login isn&apos;t linked to a coach profile yet. Ask the admin to set it up.
        </p>
      )}

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-ink-muted">
        {`Reviews (${queue.length})`}
      </h2>
      <ul className="mt-3 space-y-3">
        {queue.length === 0 && (
          <li className="rounded-2xl border border-line bg-white p-5 text-sm text-ink-muted">
            Nothing assigned to you right now.
          </li>
        )}
        {queue.map((s) => {
          const state: ReviewState = onDesk.has(s.id)
            ? "review"
            : hasResponse(s)
              ? "done"
              : "waiting";
          return (
            <ReviewCard
              key={s.id}
              submission={s}
              state={state}
              /* Only what the admin chose to send them (Ben, QA e2j). The
                 hand-off email has always been curated; this page was not, so
                 "The translation" still put both folders on the card. */
              files={filesAsSent(
                filesBySubmission.get(s.id) ?? [],
                "intake",
                s.coachFileSet,
              )}
              uploadMode={uploadMode}
              maxFileSizeMb={settings.maxFileSizeMb}
              feedbackFiles={feedbackByOpen.get(s.id) ?? []}
              folders={foldersBySubmission.get(s.id) ?? EMPTY_FOLDERS}
              handedBack={reachedAt(eventsBySubmission.get(s.id), "awaiting_approval")}
            />
          );
        })}
      </ul>
    </PageColumn>
  );
}
