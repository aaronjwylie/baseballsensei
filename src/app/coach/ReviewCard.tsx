import { LocalTime } from "@/shared/ui";
import {
  SubmissionFolders,
  SubmissionFileList,
  describeFolders,
  isReleased,
  whoseCourt,
  type FileKind,
  type Submission,
  type SubmissionFile,
} from "@/domains/submission";
import { FeedbackUpload } from "@/domains/feedback";
import type { UploadMode } from "@/shared/upload";

/**
 * Where one submission sits from the coach's side.
 *
 * Three, not two. The middle one is the whole point: a submission the admin has
 * **chosen** them for but not yet **sent**. It used to render as work — the
 * customer's files and a live hand-back form — on a card whose hand-back the
 * server would refuse, because `sendFeedbackForApproval` requires `in_review`
 * (Ben, QA 6.18).
 */
export type ReviewState = "waiting" | "review" | "done";

/**
 * One submission, wherever it sits between assignment and delivery.
 *
 * **The badge is the card's state**, doing the work the two headings used to
 * before the list was merged. Four answers across three states, because a coach
 * cares about the difference between "the admin still has it" and "the customer
 * has it": not mine yet, mine, the admin's, done.
 *
 * A submission always arrives with its files already attached — they are
 * uploaded before payment now, and an unpaid submission never reaches a coach.
 * So there is no "awaiting upload" state to render; an empty list on a
 * *reviewable* card means the retention sweep has been through.
 *
 * **Its own file so the three states can be tested.** Inline in an async page
 * they could only be checked by reading the source — which is exactly how the
 * waiting state came to render as work.
 */
export function ReviewCard({
  submission,
  state,
  files,
  uploadMode,
  maxFileSizeMb,
  feedbackFiles,
  folders,
  handedBack,
}: {
  submission: Submission;
  state: ReviewState;
  /** What the admin chose to send — only read while `state` is "review". */
  files: SubmissionFile[];
  uploadMode: UploadMode;
  maxFileSizeMb: number;
  feedbackFiles: SubmissionFile[];
  /** All four folders — only read once handed back. */
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
          {/*
            Quiet for the waiting card, on purpose. Colour on this page means
            something wants you; a submission the admin hasn't sent wants
            nothing, and dressing it like work is what made it read as work.
          */}
          {state === "waiting" ? (
            <span className="font-semibold uppercase tracking-wide text-ink-muted">
              Assigned to you
            </span>
          ) : state === "review" ? (
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

      {state === "waiting" && (
        /*
          No files, no form, no button — and a sentence saying why.

          **Which sentence comes from `whoseCourt`**, not from a comparison
          here. "Assigned but not sent" has two causes and they read completely
          differently to a coach: the admin hasn't got to it, or it is out being
          translated and nobody is late (Ben, 2026-09-11). `whoseCourt` is
          already the one home for "who is holding this up" — the admin queue
          reads the same function — and it is exhaustive over the ladder, so a
          new rung cannot quietly fall into the wrong sentence.

          The alternative to saying anything is a card that stops after the
          notes, which reads as something failing to load.
        */
        <p className="mt-3 border-t border-line pt-3 text-sm text-ink-muted">
          {whoseCourt(submission) === "translator"
            ? "This one is being translated first. The files will appear here, with somewhere to upload your response, once the translation is back and the admin sends it over."
            : "The admin hasn’t sent this one over yet. The files will appear here, with somewhere to upload your response, as soon as they do."}
        </p>
      )}

      {state === "review" && (
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
      )}

      {state === "done" && (
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
