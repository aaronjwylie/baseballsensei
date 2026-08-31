import { NextResponse, after } from "next/server";
import { getSession } from "@/domains/account";
import {
  getSubmissionFile,
  isAssignedToSubmission,
  isIntake,
} from "@/domains/submission";
import { noteCoachCollected } from "@/domains/operator";
import { markTranslatorCollected } from "@/domains/submission";
import { storage } from "@/shared/storage";

// Private blobs stream through this route rather than redirecting, so a large
// clip on a slow connection needs room to finish (Hobby caps this at 60s).
export const maxDuration = 60;

/**
 * Download one of a customer's uploaded files. **Operator-only** — a coach or
 * the admin, checked here rather than trusting the proxy.
 *
 * Replaced `/api/video/[id]`, which was keyed on the submission because a
 * submission had exactly one video. It now has several files, so the id in the
 * path is the file's.
 *
 * Streams from local disk in dev, redirects to the Blob URL in prod. A file the
 * retention sweep has already cleared has no locator left, which reads as 410
 * rather than 404: it existed, and it's gone on purpose.
 *
 * **It is also where step 9 is observed.** A download is the only evidence we
 * ever get that the coach actually has the work — there is no "I've started"
 * button, and asking for one would be a button nobody presses. So the first time
 * the assigned coach collects an intake file, the submission moves to
 * `in_review` and the admin is told the hand-off closed.
 */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const file = await getSubmissionFile(id);
  if (!file) return new Response("Not found", { status: 404 });

  /*
    Operator *and* owner. A session proves they're staff; this proves the work
    is theirs. The admin reviews everything, so they bypass — but a coach or
    translator may only pull a submission they were actually assigned. Without
    this, any operator who knew (or guessed) a file's uuid could download any
    customer's uploads — a minor's video among them. Answered as 404, not 403,
    so the endpoint doesn't confirm an id it won't serve.
  */
  if (
    !session.roles.includes("admin") &&
    !(await isAssignedToSubmission(file.submissionId, session.operatorId))
  ) {
    return new Response("Not found", { status: 404 });
  }

  if (!file.fileUrl) {
    return new Response("This file has been deleted under the retention policy.", {
      status: 410,
    });
  }

  /*
    Steps 9 and 7, observed rather than declared — and scheduled with `after`,
    not fired and forgotten.

    These were `void`ed promises, which worked in development and could not be
    relied on in production: dev streams the bytes from disk, so the handler
    lives long enough for a stray promise to finish, while prod redirects to
    Blob and returns *immediately*. The stamp was racing a serverless function
    that had already answered. `after` is the platform's answer — it keeps the
    invocation alive for the callback and, per Next 16's docs, still runs when
    the response was a redirect, which is the only case that matters here.

    Still off the critical path: the customer of this route is someone waiting
    on bytes, and neither stamp nor its email is ever worth a failed download.

    Gated on it being *their own* work. An admin opening the same file is
    checking on it, not doing it, and letting that count would make `in_review`
    mean nothing again. Both functions re-check the assignment themselves rather
    than trusting the role in the session.

    Someone who is both a coach and a translator reaches both branches, and that
    is safe rather than lucky: each stamp only moves a submission sitting on the
    rung *it* follows, and `sent_to_coach` and `sent_to_*_translator` are
    mutually exclusive. At most one can succeed; the other is a no-op.
  */
  if (session.roles.includes("coach") && isIntake(file)) {
    after(() => noteCoachCollected(file.submissionId, session.operatorId));
  }

  /*
    The translator's equivalent, with no file-kind gate: a translator collects
    the intake on the way out and the feedback on the way back, so which folder
    they opened says nothing about whether this is a pick-up. Where the
    submission already sits does, and `markTranslatorCollected` reads that
    rather than being told.
  */
  if (session.roles.includes("translator")) {
    after(async () => {
      try {
        await markTranslatorCollected(file.submissionId, session.operatorId);
      } catch (err) {
        console.error("[files] recording a translator collection failed:", err);
      }
    });
  }

  const opened = await storage.open(file.fileUrl);
  if (opened.redirectTo) return NextResponse.redirect(opened.redirectTo);

  return new Response(opened.stream, {
    headers: {
      "Content-Type": opened.contentType ?? file.contentType,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(file.filename)}"`,
      ...(opened.size ? { "Content-Length": String(opened.size) } : {}),
    },
  });
}
