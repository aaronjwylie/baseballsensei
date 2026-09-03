import type { Metadata } from "next";
import Link from "next/link";
import { NarrowPage, pageTitleClass } from "@/shared/ui";
import {
  lookupPublicSubmissions,
  verifyStatusToken,
} from "@/domains/submission";
import { StatusList } from "@/domains/submission";
import { FeedbackDownloads, listFeedbackForEmail } from "@/domains/feedback";
import { getSettings } from "@/domains/settings";

export const metadata: Metadata = {
  title: "Your submissions",
  // A capability link. Keep it out of search results.
  robots: { index: false, follow: false },
};

/**
 * The status page reached from a link in an email — **no code required.**
 *
 * The asymmetry with `/status` is the whole design, and it isn't a shortcut:
 *
 * - **This link is proof.** It was mailed to an address that verified itself at
 *   step 2 and paid at step 4. Holding it is stronger evidence of ownership than
 *   anything a form could ask for afterwards.
 * - **A typed email is not proof.** Anyone can type anyone's address, so that
 *   door sends a 6-digit code and waits.
 *
 * Asking someone who followed a link from their own receipt to prove themselves
 * again would be friction that buys nothing — they already did, twice.
 */
export default async function StatusByTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const email = await verifyStatusToken(token);

  if (!email) {
    return (
      <NarrowPage>
        <div className="text-center">
          <h1 className={pageTitleClass}>
            That link didn&rsquo;t work
          </h1>
          <p className="mt-4 text-ink-soft">
            It may have been mistyped or cut short by an email client. You can
            still look your submissions up by email — we&rsquo;ll send a code to
            confirm it&rsquo;s you.
          </p>
          <p className="mt-8">
            <Link
              href="/status"
              className="font-semibold text-accent underline underline-offset-4"
            >
              Check by email instead
            </Link>
          </p>
        </div>
      </NarrowPage>
    );
  }

  // The retention windows travel with the list so each card can count down to
  // its own deletion date, rather than naming a date the reader has to subtract.
  const settings = await getSettings();
  const submissions = await lookupPublicSubmissions(email, {
    collectedDays: settings.retainCollectedDays,
    deliveredDays: settings.retainDeliveredDays,
  });
  // Read once and used twice — as the panel's contents and as the list of what
  // that panel is already showing, so the two cannot disagree.
  const ready = await listFeedbackForEmail(email);

  return (
    <NarrowPage>
        <div className="text-center">
          <h1 className={pageTitleClass}>
            Your submissions
          </h1>
          <p className="mt-4 text-ink-soft">
            Everything sent from <strong className="text-ink">{email}</strong>.
          </p>
        </div>

        <div className="mt-10">
          <StatusList
            submissions={submissions}
            email={email}
            feedbackAccess={<FeedbackDownloads groups={ready} />}
            // What the panel above is already showing, so nothing is listed twice.
            readyIds={ready.map((g) => g.submission.id)}
          />
        </div>

        <p className="mt-8 text-center text-xs text-ink-muted">
          This link is private to you — anyone you forward it to can see this
          page.
        </p>
    </NarrowPage>
  );
}
