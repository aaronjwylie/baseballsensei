import type { Metadata } from "next";
import { PageColumn } from "@/shared/ui";
import { TranslationCard } from "./TranslationCard";
import { PortalEmptyState } from "../_portal/PortalEmptyState";
import { storage } from "@/shared/storage";
import { requireRole } from "@/domains/account";
import { getOperatorProfile } from "@/domains/operator";
import {
  listEventsForSubmissions,
  reachedAt,
  type FileKind,
} from "@/domains/submission";
import { findLegsForTranslator, groupBySubmission, type TranslatorLeg } from "@/domains/translation";
import type { UploadMode } from "@/shared/upload";
import { getSettings } from "@/domains/settings";

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
 * **The unit of work is the leg; the unit of the page is the submission.** A
 * translator's queue is legs — the customer's files out, the coach's response
 * back — and the same submission can carry both, weeks apart, pointing in
 * opposite directions. `findLegsForTranslator` returns them as the separate
 * jobs they are, and this page groups them back onto one card per submission,
 * newest first, because that is the order a person holds in their head and the
 * name they scan for (Ben, 2026-09-10). Only one leg can be open at a time,
 * because a submission sits on one rung.
 *
 * **One list, not two.** "To translate" above "Handed back" meant a translator
 * had to know which half a submission had fallen into before they could scan
 * for it — and with both legs held, one submission was in *both* halves at
 * once. The badge on the card says what the headings said.
 */
export default async function TranslatorHomePage() {
  const session = await requireRole("translator");
  const profile = await getOperatorProfile(session.operatorId);
  const legs = await findLegsForTranslator(session.operatorId);

  // Prod uploads straight to Blob; dev proxies to disk. The same seam the
  // customer flow and the coach's page read.
  const uploadMode: UploadMode = storage.supportsDirectUpload ? "blob" : "proxy";
  // The same limit the customer's panel enforces, so an operator is refused
  // in the browser rather than after the upload (Ben, QA 6.6.1).
  const settings = await getSettings();

  const cards = groupBySubmission(legs);

  // The trail is the only place that knows *when* a leg was handed back — one
  // query for the page, not one per card.
  const eventsBySubmission = await listEventsForSubmissions(
    cards.map((c) => c.submission.id),
  );

  const heading = profile ? `${profile.name}'s translations` : "Your translations";

  // Nothing on the desk gets the calm centred panel rather than a page of empty
  // "(0)" headings bunched under the bar — the same call the coach's page makes
  // (Ben, QA 4.6).
  if (cards.length === 0) {
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
    <PageColumn>
      <h1 className="font-display text-2xl font-medium uppercase tracking-[-0.01em] text-ink">
        {heading}
      </h1>

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-ink-muted">
        {`Translations (${cards.length})`}
      </h2>
      <ul className="mt-3 space-y-3">
        {cards.map(({ submission, legs: own }) => (
          <TranslationCard
            key={submission.id}
            submission={submission}
            legs={own}
            uploadMode={uploadMode}
            maxFileSizeMb={settings.maxFileSizeMb}
            handedBackAt={handedBackByLeg(
              own,
              eventsBySubmission.get(submission.id),
            )}
          />
        ))}
      </ul>
    </PageColumn>
  );
}


/** When each of this submission's legs was handed back, keyed by what it produces. */
function handedBackByLeg(
  legs: TranslatorLeg[],
  events: Parameters<typeof reachedAt>[0],
): Partial<Record<FileKind, string>> {
  const at: Partial<Record<FileKind, string>> = {};
  for (const leg of legs) {
    if (leg.open) continue;
    const when = reachedAt(events, leg.leg.done);
    if (when) at[leg.leg.produces] = when;
  }
  return at;
}
