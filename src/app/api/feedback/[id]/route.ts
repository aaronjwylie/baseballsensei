import { NextResponse } from "next/server";
import {
  getSubmission,
  getSubmissionFile,
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
 * URL-as-capability trade-off the status page makes). **Operators can download
 * at any status**, so the admin can review the coach's material while it's still
 * `awaiting_approval`, before the customer is ever emailed.
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
  const isOperator = !!(await getSession());

  /*
    Step 14, observed rather than declared — the mirror of step 9.

    Only a customer's download counts: the admin opening the file to check it is not
    the customer collecting it, and letting that start the retention clock would
    delete their feedback thirty days after *he* looked at it.

    Not awaited, for the same reason as step 9 — the notification must never be
    why a download fails.
  */
  if (!isOperator) {
    void noteCustomerCollected(file.submissionId);
  }

  if (!isOperator) {
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
