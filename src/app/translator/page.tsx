import type { Metadata } from "next";
import { Container } from "@/shared/ui";
import { PortalEmptyState } from "../_portal/PortalEmptyState";
import { storage } from "@/shared/storage";
import { requireRole } from "@/domains/account";
import { getOperatorProfile } from "@/domains/operator";
import { SubmissionFileList } from "@/domains/submission";
import {
  findLegsForTranslator,
  TranslationUpload,
  type TranslatorLeg,
} from "@/domains/translation";
import type { UploadMode } from "@/shared/upload";

export const metadata: Metadata = {
  title: "Translator portal",
  robots: { index: false },
};

/**
 * The translator's portal — the mirror of the coach's.
 *
 * It used to be an empty panel explaining that translation happened
 * off-platform: the admin emailed the files out and filed the returned
 * translation back on the admin side. That was a true description of the
 * workflow, and it is what this page replaces.
 *
 * **The one structural difference from the coach's page is the unit of work.**
 * A coach's queue is submissions. A translator's is *legs* — the customer's
 * files out, the coach's response back — so the same submission can appear
 * twice, weeks apart, pointing in opposite directions. Only one of the two can
 * be open at a time, because a submission sits on one rung.
 */
export default async function TranslatorHomePage() {
  const session = await requireRole("translator");
  const profile = await getOperatorProfile(session.operatorId);
  const legs = await findLegsForTranslator(session.operatorId);

  // Prod uploads straight to Blob; dev proxies to disk. The same seam the
  // customer flow and the coach's page read.
  const uploadMode: UploadMode = storage.supportsDirectUpload ? "blob" : "proxy";

  const open = legs.filter((l) => l.open);
  const done = legs.filter((l) => !l.open);

  const heading = profile ? `${profile.name}'s translations` : "Your translations";

  // Nothing on the desk gets the calm centred panel rather than a page of empty
  // "(0)" headings bunched under the bar — the same call the coach's page makes
  // (Ben, QA 4.6).
  if (open.length === 0 && done.length === 0) {
    return (
      <PortalEmptyState title={heading}>
        <p>Nothing is assigned to you right now.</p>
        <p>
          When the admin sends you a translation, it will appear here with the
          files to work from.
        </p>
      </PortalEmptyState>
    );
  }

  return (
    <Container className="max-w-3xl">
      <h1 className="font-display text-2xl font-medium uppercase tracking-[-0.01em] text-ink">
        {heading}
      </h1>

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-ink-muted">
        {`To translate (${open.length})`}
      </h2>
      <ul className="mt-3 space-y-3">
        {open.length === 0 && (
          <li className="rounded-2xl border border-line bg-white p-5 text-sm text-ink-muted">
            Nothing assigned to you right now.
          </li>
        )}
        {open.map((leg) => (
          <TranslationCard
            key={`${leg.submission.id}-${leg.leg.produces}`}
            work={leg}
            uploadMode={uploadMode}
          />
        ))}
      </ul>

      {done.length > 0 && (
        <>
          <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide text-ink-muted">
            {`Handed back (${done.length})`}
          </h2>
          <ul className="mt-3 space-y-3">
            {done.map((leg) => (
              <li
                key={`${leg.submission.id}-${leg.leg.produces}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-white p-5 text-sm"
              >
                <span className="font-medium text-ink">
                  {leg.submission.playerName}
                  <span className="text-ink-muted">{` · ${leg.leg.title}`}</span>
                </span>
                <span className="font-semibold text-emerald-600">
                  {`${leg.produced.length} file${leg.produced.length === 1 ? "" : "s"} delivered ✓`}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Container>
  );
}

/**
 * One leg on the desk.
 *
 * The card leads with **which direction this is**, because that is the first
 * thing a translator needs and the one thing the coach's card never has to say.
 * The player's name alone would be ambiguous the moment someone holds both legs
 * of the same submission.
 *
 * The customer's notes are deliberately here: they are context for the words
 * being translated, and a translator working without them is guessing at
 * register and intent.
 */
function TranslationCard({
  work,
  uploadMode,
}: {
  work: TranslatorLeg;
  uploadMode: UploadMode;
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
