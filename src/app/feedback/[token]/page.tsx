import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink, NarrowPage, pageTitleClass } from "@/shared/ui";
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
    <NarrowPage>
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
              <h1 className={pageTitleClass}>
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

            {/*
              This page deliberately shows **one** submission (Ben, 2026-09-03).

              The link's token carries `sub: submissionId` — it grants that
              review, not the address. `/status` grants everything sent from an
              email address, which is why it asks for a code first.

              Widening this page to the full history would widen the token with
              it, and this is the link people forward: to the other parent, to a
              coach, into a group chat. One forward would then hand over every
              review the family has ever had. The sibling `/status/[token]` page
              carries the warning that says so out loud.

              So the narrow grant stays narrow and the page stops being a dead
              end instead — the wider view is one link away, behind its own gate.
            */}
            <p className="mt-10 text-center text-sm text-ink-muted">
              {"Looking for an earlier review? "}
              <Link
                href="/status"
                className="font-medium text-accent underline underline-offset-2 hover:text-ink"
              >
                See all your submissions
              </Link>
              {" — we'll email you a code."}
            </p>
          </>
        )}
    </NarrowPage>
  );
}
