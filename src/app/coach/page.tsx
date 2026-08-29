import type { Metadata } from "next";
import { Container } from "@/shared/ui";
import { storage } from "@/shared/storage";
import { requireRole } from "@/domains/account";
import { getCoachByOperatorId } from "@/domains/operator";
import {
  findByCoach,
  listFeedbackFiles,
  listFilesForSubmissions,
  SubmissionFileList,
  type Submission,
  type SubmissionFile,
  hasResponse,
  isReleased,
  isWithCoach,
} from "@/domains/submission";
import { FeedbackUpload } from "@/domains/feedback";
import type { UploadMode } from "@/shared/upload";

export const metadata: Metadata = {
  title: "Coach portal",
  robots: { index: false },
};

export default async function CoachHomePage() {
  const session = await requireRole("coach");
  const coach = await getCoachByOperatorId(session.operatorId);
  const submissions = coach ? await findByCoach(coach.id) : [];
  // One query for the page rather than one per card.
  const filesBySubmission = await listFilesForSubmissions(
    submissions.map((s) => s.id),
  );

  // Prod uploads straight to Blob; dev proxies to disk. Same seam the customer
  // flow reads.
  const uploadMode: UploadMode = storage.supportsDirectUpload ? "blob" : "proxy";

  // A coach's work is "open" until they hand it to the admin; once sent it's awaiting
  // approval (or delivered), and out of their hands.
  const open = submissions.filter(
    isWithCoach,
  );

  // Feedback files a coach has already attached to an open submission but not yet
  // sent — one query for the open set, so the card can show what's staged.
  const feedbackByOpen = new Map(
    await Promise.all(
      open.map(
        async (s) =>
          [s.id, await listFeedbackFiles(s.id)] as const,
      ),
    ),
  );
  const done = submissions.filter(
    hasResponse,
  );

  return (
    <Container className="max-w-3xl">
      <h1 className="font-display text-2xl font-medium uppercase tracking-[-0.01em] text-ink">
        {coach ? `${coach.name}'s reviews` : "Your reviews"}
      </h1>

      {!coach && (
          <p className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
            Your login isn&apos;t linked to a coach profile yet. Ask the admin to set it up.
          </p>
        )}

        <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-ink-muted">
          To review ({open.length})
        </h2>
        <ul className="mt-3 space-y-3">
          {open.length === 0 && (
            <li className="rounded-2xl border border-line bg-white p-5 text-sm text-ink-muted">
              Nothing assigned to you right now.
            </li>
          )}
          {open.map((s) => (
            <ReviewCard
              key={s.id}
              submission={s}
              files={filesBySubmission.get(s.id) ?? []}
              uploadMode={uploadMode}
              feedbackFiles={feedbackByOpen.get(s.id) ?? []}
            />
          ))}
        </ul>

        {done.length > 0 && (
          <>
            <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide text-ink-muted">
              Submitted ({done.length})
            </h2>
            <ul className="mt-3 space-y-3">
              {done.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between rounded-2xl border border-line bg-white p-5 text-sm"
                >
                  <span className="font-medium text-ink">
                    {s.playerName}
                    {s.focus ? <span className="text-ink-muted"> · {s.focus}</span> : null}
                  </span>
                  {isReleased(s) ? (
                    <span className="font-semibold text-emerald-600">Delivered ✓</span>
                  ) : (
                    <span className="font-semibold text-purple-600">Awaiting review</span>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
    </Container>
  );
}

/**
 * A submission always arrives with its files already attached — they are
 * uploaded before payment now, and an unpaid submission never reaches a coach.
 * So there is no "awaiting upload" state to render here any more; an empty list
 * means the retention sweep has been through.
 */
function ReviewCard({
  submission,
  files,
  uploadMode,
  feedbackFiles,
}: {
  submission: Submission;
  files: SubmissionFile[];
  uploadMode: UploadMode;
  feedbackFiles: SubmissionFile[];
}) {
  return (
    <li className="rounded-2xl border border-line bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-ink">
            {submission.playerName}
            {submission.playerAge ? (
              <span className="text-ink-muted"> · {submission.playerAge}</span>
            ) : null}
          </div>
          <div className="mt-0.5 text-sm text-ink-muted">
            {submission.focus ? `${submission.focus} · ` : ""}
            {submission.customerNotes ? submission.customerNotes : "No notes"}
          </div>
        </div>
        <div className="text-right">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            {files.length} file{files.length === 1 ? "" : "s"}
          </div>
          <SubmissionFileList files={files} emptyLabel="Files deleted" />
        </div>
      </div>

      <div className="mt-4 border-t border-line pt-4">
        <FeedbackUpload
          submissionId={submission.id}
          uploadMode={uploadMode}
          existingFiles={feedbackFiles.map((f) => ({
            id: f.id,
            filename: f.filename,
            sizeBytes: f.sizeBytes,
          }))}
        />
      </div>
    </li>
  );
}
