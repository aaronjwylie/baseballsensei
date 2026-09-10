import type { Metadata } from "next";
import { LocalTime, PageColumn } from "@/shared/ui";
import { PortalEmptyState } from "../_portal/PortalEmptyState";
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
  SubmissionFolders,
  describeFolders,
  type FileKind,
  SubmissionFileList,
  type Submission,
  type SubmissionFile,
  hasResponse,
  isReleased,
  isWithCoach,
} from "@/domains/submission";
import { FeedbackUpload } from "@/domains/feedback";
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
 * **What the two lists did carry, the card now says.** A submission on the desk
 * leads with its files and the hand-back form; one already handed back leads
 * with when, and with every folder the submission holds. The state is on the
 * card because that is where a person is already looking.
 *
 * A submission assigned but not yet *sent* appears on neither — unchanged. The
 * coach's turn starts when the admin hands it over, and a card for work they
 * cannot begin is a card they would have to learn to ignore.
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

  // A coach's work is "open" until they hand it to the admin; once sent it's
  // awaiting approval (or delivered), and out of their hands. Both belong on
  // this page; anything on neither rung is not yet their turn.
  const open = submissions.filter(isWithCoach);
  const done = submissions.filter(hasResponse);
  const onDesk = new Set(open.map((s) => s.id));
  const queue = submissions.filter((s) => onDesk.has(s.id) || hasResponse(s));

  // One query per set for the page, rather than one per card.
  const filesBySubmission = await listIntakeFilesForSubmissions(
    open.map((s) => s.id),
  );
  // Feedback files a coach has already attached to an open submission but not
  // yet sent — so the card can show what's staged.
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
        {queue.map((s) => (
          <ReviewCard
            key={s.id}
            submission={s}
            onDesk={onDesk.has(s.id)}
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
        ))}
      </ul>
    </PageColumn>
  );
}

/**
 * One submission, whichever side of the hand-back it is on.
 *
 * A submission always arrives with its files already attached — they are
 * uploaded before payment now, and an unpaid submission never reaches a coach.
 * So there is no "awaiting upload" state to render here; an empty list means
 * the retention sweep has been through.
 *
 * **The badge is the card's state**, and it does the work the two headings used
 * to. Three answers, because a coach cares about the difference between "the
 * admin still has it" and "the customer has it": theirs, the admin's, done.
 */
function ReviewCard({
  submission,
  onDesk,
  files,
  uploadMode,
  maxFileSizeMb,
  feedbackFiles,
  folders,
  handedBack,
}: {
  submission: Submission;
  /** Their turn — as against handed back and out of their hands. */
  onDesk: boolean;
  files: SubmissionFile[];
  uploadMode: UploadMode;
  maxFileSizeMb: number;
  feedbackFiles: SubmissionFile[];
  folders: Record<FileKind, SubmissionFile[]>;
  handedBack?: string;
}) {
  return (
    <li className="rounded-2xl border border-line bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold text-ink">
            {submission.playerName}
            {submission.playerAge ? (
              <span className="text-ink-muted">{` · ${submission.playerAge}`}</span>
            ) : null}
          </div>
          <div className="mt-0.5 text-sm text-ink-muted">
            {submission.focus ? `${submission.focus} · ` : ""}
            {submission.customerNotes ? submission.customerNotes : "No notes"}
          </div>
        </div>
        <div className="shrink-0 text-right text-xs">
          {onDesk ? (
            <span className="font-semibold uppercase tracking-wide text-accent">
              To review
            </span>
          ) : isReleased(submission) ? (
            <span className="font-semibold text-emerald-600">Delivered ✓</span>
          ) : (
            <span className="font-semibold text-purple-600">Awaiting review</span>
          )}
          {/* The date the whole list is ordered by, said on the card — an order
              nobody can see is one they have to take on trust. */}
          <div className="mt-1 text-ink-muted">
            {"Sent "}
            <LocalTime iso={submission.submittedAt} />
          </div>
        </div>
      </div>

      {onDesk ? (
        <>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              {`${files.length} file${files.length === 1 ? "" : "s"} to review`}
            </div>
            <SubmissionFileList files={files} emptyLabel="Files deleted" />
          </div>
          <div className="mt-4 border-t border-line pt-4">
            <FeedbackUpload
              submissionId={submission.id}
              uploadMode={uploadMode}
              maxFileSizeMb={maxFileSizeMb}
              existingFiles={feedbackFiles.map((f) => ({
                id: f.id,
                filename: f.filename,
                sizeBytes: f.sizeBytes,
              }))}
            />
          </div>
        </>
      ) : (
        <>
          {/*
            A receipt, not a one-liner (Ben, 2026-09-06). This said the player's
            name and a status and nothing else, so a coach who wanted to check
            what they had actually sent — or when — had nowhere to look. The
            files are the work; leaving them off the only card that survives the
            hand-back made the portal forget the job the moment it was done.
          */}
          <p className="mt-2 text-xs text-ink-muted">
            {handedBack ? (
              <>
                {"Handed back "}
                <LocalTime iso={handedBack} />
              </>
            ) : (
              "Handed back"
            )}
            {` · ${describeFolders(folders)}`}
          </p>
          <div className="mt-3 border-t border-line pt-3">
            <SubmissionFolders folders={folders} />
          </div>
        </>
      )}
    </li>
  );
}
