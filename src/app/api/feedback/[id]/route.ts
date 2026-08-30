import { NextResponse } from "next/server";
import {
  getSubmission,
  getSubmissionFile,
  isAssignedToSubmission,
  isFeedback,
  isReleased,
} from "@/domains/submission";
import { noteCustomerCollected } from "@/domains/feedback";
import { storage } from "@/shared/storage";
import { getSession } from "@/domains/account";

// Private blobs stream through this route rather than redirecting, so a large
// feedback video on a slow connection needs room to finish (Hobby caps at 60s).
export const maxDuration = 60;

/**
 * Download one of a submission's feedback files, by the file's own id.
 *
 * **Public once the submission is complete** — the customer isn't logged in and
 * reaches this from their status lookup (the id is an unguessable uuid, the same
 * URL-as-capability trade-off the status page makes). **The admin and the
 * assigned coach/translator can download at any status**, so the admin can review
 * the coach's material while it's still `awaiting_approval` and the coach can pull
 * their own work — but an operator with no claim on this submission is held to the
 * same release gate as the public, mirroring `/api/files/[id]`.
 *
 * The id must name a `feedback` file — a customer upload downloaded through here
 * would sidestep the operator-only `/api/files/[id]` gate.
 */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const file = await getSubmissionFile(id);
  if (!file || !isFeedback(file) || !file.fileUrl) {
    return new Response("Not found", { status: 404 });
  }

  /*
    A *shape-checked* operator session, not a bare signature check.

    `readSession` only proves the cookie was signed by us — and the customer's
    own flow cookie (`bs_flow`) is signed by the same secret. Copied into the
    session cookie it verified fine, read as an operator, and skipped both the
    `isReleased` gate below and the retention clock. `getSession` verifies the
    payload is actually an operator session, so a flow token no longer passes.
  */
  /*
    Three kinds of caller, three rules.

    A *privileged* operator — the admin, or the coach/translator actually assigned
    to this submission — may download at any status: the admin to review the
    coach's material before release, the coach to pull their own work. That's the
    operator bypass this route has always granted, now scoped. A logged-in
    operator with no claim on *this* submission is not privileged; the intake
    route draws the same line, without which any operator who learned a file's
    uuid could pull another coach's in-progress feedback.
  */
  const session = await getSession();
  const isPrivileged =
    session !== null &&
    (session.roles.includes("admin") ||
      (await isAssignedToSubmission(file.submissionId, session.operatorId)));

  if (!isPrivileged) {
    /*
      Step 14, observed rather than declared — the mirror of step 9.

      Only a customer's download counts, and only a caller with no session at all
      is the customer: an operator opening the file to check it — assigned or not
      — is not collecting it, and letting that start the retention clock would
      delete the feedback thirty days after *staff* looked at it.

      Not awaited, for the same reason as step 9 — the notification must never be
      why a download fails.
    */
    if (session === null) void noteCustomerCollected(file.submissionId);

    const submission = await getSubmission(file.submissionId);
    if (!submission || !isReleased(submission)) {
      return new Response("Not found", { status: 404 });
    }
  }

  const opened = await storage.open(file.fileUrl);
  if (opened.redirectTo) return NextResponse.redirect(opened.redirectTo);

  return new Response(opened.stream, {
    headers: {
      "Content-Type": opened.contentType ?? "application/octet-stream",
      // Encode the customer-facing name — an unescaped `"` or control char in a
      // coach's filename would break the header (or throw on the Response). The
      // sibling /api/files/[id] does the same.
      "Content-Disposition": `attachment; filename="${encodeURIComponent(file.filename)}"`,
      ...(opened.size ? { "Content-Length": String(opened.size) } : {}),
    },
  });
}
