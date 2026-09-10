import { LocalTime } from "@/shared/ui";
import {
  SubmissionFileList,
  SubmissionFolders,
  describeFolders,
  type FileKind,
  type Submission,
  type SubmissionFile,
} from "@/domains/submission";
import { TranslationUpload } from "@/domains/translation";
import type { TranslatorLeg } from "@/domains/translation";
import type { UploadMode } from "@/shared/upload";

/** The shape `SubmissionFolders` takes, with nothing in it. */
const EMPTY_FOLDERS: Record<FileKind, SubmissionFile[]> = {
  intake: [],
  intake_translation: [],
  feedback: [],
  feedback_translation: [],
};

/**
 * One leg's own folders: the one it read from, and the one it delivered into.
 *
 * Two of the four, chosen by the leg rather than by the submission. A
 * translator holding both legs sees both sections on one card, and
 * submission-scope content would render identically in each — which is exactly
 * how the finished list came to read as a duplicate (Ben, 2026-09-09, QA 6.16).
 * `reads` and `produces` are what make a leg a leg rather than a submission.
 */
function legFolders(leg: TranslatorLeg): Record<FileKind, SubmissionFile[]> {
  return {
    ...EMPTY_FOLDERS,
    [leg.leg.reads]: leg.source,
    [leg.leg.produces]: leg.produced,
  };
}

/**
 * One submission, with every leg of it this translator holds.
 *
 * **The unit of the page is the submission; the unit of the work is the leg.**
 * Those are different, and the card is where they meet. A translator can hold
 * both legs of one submission — the customer's files out, the coach's response
 * back — usually weeks apart and pointing in opposite directions. Two cards for
 * that was the honest rendering of the work and the wrong rendering of the
 * page: `asdfasdf` appeared twice, and a person scanning for one submission had
 * to read both to find out which was which (Ben, 2026-09-10).
 *
 * So the submission is named once, at the top, and each leg is a titled section
 * under it. Only one leg can be open at a time, because a submission sits on one
 * rung — so there is never a question of which section wants action.
 *
 * The customer's notes are deliberately here: they are context for the words
 * being translated, and a translator working without them is guessing at
 * register and intent.
 *
 * **Its own file so that ordering and grouping can be tested.** Inline in an
 * async page it could only be checked by reading the source.
 */
export function TranslationCard({
  submission,
  legs,
  uploadMode,
  maxFileSizeMb,
  handedBackAt,
}: {
  submission: Submission;
  /** This submission's legs, in pipeline order — intake out, response back. */
  legs: TranslatorLeg[];
  uploadMode: UploadMode;
  maxFileSizeMb: number;
  /** When each leg was handed back, keyed by what it produces. */
  handedBackAt: Partial<Record<FileKind, string>>;
}) {
  const open = legs.filter((l) => l.open);

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
          {open.length > 0 ? (
            <span className="font-semibold uppercase tracking-wide text-accent">
              To translate
            </span>
          ) : (
            <span className="font-semibold text-emerald-600">Handed back ✓</span>
          )}
          {/* The date the whole list is ordered by, said on the card — an order
              nobody can see is one they have to take on trust. */}
          <div className="mt-1 text-ink-muted">
            {"Sent "}
            <LocalTime iso={submission.submittedAt} />
          </div>
        </div>
      </div>

      {legs.map((work) => (
        <LegSection
          key={work.leg.produces}
          work={work}
          uploadMode={uploadMode}
          maxFileSizeMb={maxFileSizeMb}
          handedBack={handedBackAt[work.leg.produces]}
        />
      ))}
    </li>
  );
}

/**
 * One direction of one submission.
 *
 * The title leads, because on a card that can carry both legs the player's name
 * identifies neither. It is the one thing the coach's card never has to say.
 */
function LegSection({
  work,
  uploadMode,
  maxFileSizeMb,
  handedBack,
}: {
  work: TranslatorLeg;
  uploadMode: UploadMode;
  maxFileSizeMb: number;
  handedBack?: string;
}) {
  const { submission, leg, source, produced } = work;
  const folders = legFolders(work);

  return (
    <section className="mt-4 border-t border-line pt-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-accent">
        {leg.title}
      </div>

      {work.open ? (
        <>
          <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              {`${source.length} file${source.length === 1 ? "" : "s"} to translate`}
            </div>
            {/* Downloading one of these is what earns `*_translating` — the
                translator's equivalent of the coach's `in_review`, observed
                rather than declared. */}
            <SubmissionFileList files={source} emptyLabel="Files deleted" />
          </div>
          <div className="mt-4">
            <TranslationUpload
              submissionId={submission.id}
              produces={leg.produces}
              uploadMode={uploadMode}
              maxFileSizeMb={maxFileSizeMb}
              existingFiles={produced.map((f) => ({
                id: f.id,
                filename: f.filename,
                sizeBytes: f.sizeBytes,
              }))}
              handBackLabel="Hand back"
              hint={leg.handBackHint}
            />
          </div>
        </>
      ) : (
        <>
          {/*
            A receipt, not a one-liner — the same change the coach's finished
            card got, for the same reason (Ben, 2026-09-06). A translator who
            wanted to check which files they had handed back, or when, had
            nowhere to look once the card left the top of the page.

            The leg's own `done` rung is what dates it: holding both legs of one
            submission, "handed back" means two different moments.
          */}
          <p className="mt-1 text-xs text-ink-muted">
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
          <div className="mt-3">
            <SubmissionFolders
              folders={folders}
              emptyLabel="No files on this leg."
            />
          </div>
        </>
      )}
    </section>
  );
}
