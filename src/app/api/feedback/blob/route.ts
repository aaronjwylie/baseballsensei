import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { env } from "@/shared/config/env";
import { getSession } from "@/domains/account";
import { getSubmission, isAssignedTo } from "@/domains/submission";
import { isCoachesTurn, NOT_SENT_TO_COACH } from "@/domains/feedback";
import { ALLOWED_MIME_TYPES, isAllowedFilename } from "@/shared/upload";
import { getSettings, maxFileSizeBytes } from "@/domains/settings";

/**
 * The coach's counterpart to `/api/upload/blob`: issue a short-lived token so a
 * coach can upload a feedback file straight to Vercel Blob.
 *
 * The gate is **operator** rather than the customer flow cookie — a coach may
 * only deliver for their own assignments, the admin for anyone. The submission
 * is named by the pathname (`submissions/<id>/feedback/…`), which the browser
 * proposes, so it's parsed and ownership re-checked before any token is minted.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request,
      token: env.blobToken,

      onBeforeGenerateToken: async (pathname) => {
        const session = await getSession();
        if (!session) throw new Error("Sign in to upload feedback.");

        const match = pathname.match(/^submissions\/([^/]+)\/feedback\//);
        if (!match) {
          throw new Error("Feedback must go in the submission's feedback folder.");
        }
        const submissionId = match[1];

        const submission = await getSubmission(submissionId);
        if (!submission) throw new Error("That submission doesn't exist.");

        if (!session.roles.includes("admin") && !(await isAssignedTo(submissionId, session.operatorId, "feedback"))) {
          throw new Error("That isn't your submission.");
        }

        /*
          Ownership is not a turn (Ben, QA 6.18). The admin may attach for
          anyone; an operator may only work on what has been handed to them.
        */
        if (!session.roles.includes("admin") && !isCoachesTurn(submission)) {
          throw new Error(NOT_SENT_TO_COACH);
        }

        if (!isAllowedFilename(pathname)) {
          throw new Error("That file type isn't supported.");
        }

        const settings = await getSettings();
        return {
          allowedContentTypes: ALLOWED_MIME_TYPES,
          maximumSizeInBytes: maxFileSizeBytes(settings),
          addRandomSuffix: true,
        };
      },
    });

    return NextResponse.json(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "We couldn't start that upload.";
    console.error("[feedback/blob] refused:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
