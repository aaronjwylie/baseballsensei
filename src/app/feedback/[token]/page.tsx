import type { Metadata } from "next";
import { ButtonLink } from "@/shared/ui";
import { FeedbackDownloadRow } from "@/domains/feedback";
import {
  filesAsSent,
  getSubmission,
  isReleased,
  listFeedbackFiles,
} from "@/domains/submission";
import { verifyFeedbackToken } from "@/domains/feedback";

export const metadata: Metadata = {
  title: "Your feedback",
  // The link is a capability; keep it out of search results.
  robots: { index: false, follow: false },
};

/**
 * The customer's feedback delivery, reached only from the signed link in their
 * "feedback is ready" email.
 *
 * There is no email entry here, by design: the token *is* the identity. A
 * stranger can't guess an address and collect someone's review, because there's
 * no address to guess — only the unguessable token grants access, and it's bound
 * to one submission.
 */
export default async function FeedbackPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const submissionId = await verifyFeedbackToken(token);
  const submission = submissionId ? await getSubmission(submissionId) : null;
  const files =
    submission && isReleased(submission)
      ? filesAsSent(
          await listFeedbackFiles(submission.id),
          "feedback",
          submission.customerFileSet,
        ).filter((f) => !!f.fileUrl)
      : [];

  return (
    /*
      Fluid rather than stepped (Ben, 2026-08-31).

      This page used the site `Container`, whose padding steps at 640px and
      1024px because it is built for a 1400px layout. Capped at `max-w-xl` those
      steps invert: the box stops growing at 576px but the padding keeps
      stepping *inward*, so dragging the window wider made the text column
      narrower — 536 to 512 to 456 — twice, visibly, in the wrong direction.

      A narrow card wants constant padding and one cap. The vertical rhythm and
      the heading are `clamp()` for the same reason: they now interpolate across
      the whole range instead of snapping at a width that has nothing to do with
      this page.
    */
    <section className="py-[clamp(3.5rem,2.5rem+3vw,5rem)]">
      <div className="mx-auto w-full max-w-xl px-5">
        {files.length === 0 ? (
          <div className="rounded-2xl border border-line bg-white p-8 text-center">
            <h1 className="text-2xl font-bold tracking-tight text-ink">
              This link isn&apos;t available
            </h1>
            <p className="mt-3 text-ink-muted">
              It may have expired, or the review isn&apos;t ready yet. Check the
              latest email we sent you, or get in touch and we&apos;ll help.
            </p>
            <div className="mt-6">
              <ButtonLink href="/contact">Contact us</ButtonLink>
            </div>
          </div>
        ) : (
          <>
            <div className="text-center">
              <h1 className="text-[clamp(1.875rem,1.5rem+1.6vw,2.25rem)] font-bold tracking-tight text-ink">
                Your feedback is ready 🎬
              </h1>
              <p className="mt-4 text-ink-muted">
                Your coach has finished reviewing{" "}
                {submission?.playerName
                  ? `${submission.playerName}'s`
                  : "your"}{" "}
                video. Download the full breakdown below.
              </p>
            </div>

            <ul className="mt-10 space-y-3">
              {files.map((file) => (
                <FeedbackDownloadRow
                  key={file.id}
                  fileId={file.id}
                  filename={file.filename}
                  sizeBytes={file.sizeBytes}
                  padding="p-5"
                />
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
