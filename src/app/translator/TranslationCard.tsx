import { SubmissionFileList } from "@/domains/submission";
import { TranslationUpload } from "@/domains/translation";
import type { TranslatorLeg } from "@/domains/translation";
import type { UploadMode } from "@/shared/upload";

/**
 * One leg on the desk.
 *
 * The card leads with **which direction this is**, above the player's name,
 * because that is the first thing a translator needs and the one thing the
 * coach's card never has to say. A translator can hold both legs of one
 * submission, and then the name alone identifies neither — which is exactly how
 * the finished list came to read as a duplicate entry (Ben, 2026-09-09, QA
 * 6.16). Order is the safeguard here, so it is asserted rather than assumed.
 *
 * The customer's notes are deliberately on it: they are context for the words
 * being translated, and a translator working without them is guessing at
 * register and intent.
 *
 * **Its own file so that ordering can be tested.** Inline in an async page it
 * could only be checked by reading the source.
 */
export function TranslationCard({
  work,
  uploadMode,
  maxFileSizeMb,
}: {
  work: TranslatorLeg;
  uploadMode: UploadMode;
  maxFileSizeMb: number;
}) {
  const { submission, leg, source, produced } = work;
  return (
    <li className="rounded-2xl border border-line bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-accent">
            {leg.title}
          </div>
          <div className="mt-1 font-semibold text-ink">
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
        <div className="text-right">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            {`${source.length} file${source.length === 1 ? "" : "s"} to translate`}
          </div>
          {/* Downloading one of these is what earns `*_translating` — the
              translator's equivalent of the coach's `in_review`, observed
              rather than declared. */}
          <SubmissionFileList files={source} emptyLabel="Files deleted" />
        </div>
      </div>

      <div className="mt-4 border-t border-line pt-4">
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
    </li>
  );
}
