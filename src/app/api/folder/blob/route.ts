import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { env } from "@/shared/config/env";
import { getSession } from "@/domains/account";
import { getSubmission, isPaid, FILE_KINDS, type FileKind } from "@/domains/submission";
import { ALLOWED_MIME_TYPES, isAllowedFilename } from "@/shared/upload";
import { getSettings, maxFileSizeBytes } from "@/domains/settings";

/**
 * A short-lived token so an admin's folder upload goes straight to Blob.
 *
 * The admin's counterpart to `/api/feedback/blob` and `/api/translation/blob`,
 * and the last of the four surfaces to get one. Until 2026-09-06 the folder
 * boxes posted to a Server Action, which meant the bytes came through us — and
 * a serverless request body is capped near 4.5 MB on Vercel, so an admin could
 * not attach a real video, and an oversize one got Next's own error page rather
 * than ours (Ben, QA 6.6.5).
 *
 * **All four folders, admin only.** The translator's route narrows the kind to
 * the two translation folders and checks the assignment for that leg; this one
 * widens the kind and narrows the caller instead, because writing into the
 * customer's or the coach's folder is exactly what no assignment should permit.
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
        if (!session?.roles.includes("admin")) {
          throw new Error("Only an admin can upload into a folder.");
        }

        const match = pathname.match(/^submissions\/([^/]+)\/([^/]+)\//);
        if (!match) throw new Error("That isn't one of the four folders.");
        const submissionId = match[1]!;
        const kind = match[2] as FileKind;
        if (!FILE_KINDS.includes(kind)) {
          throw new Error("That isn't one of the four folders.");
        }

        const submission = await getSubmission(submissionId);
        if (!submission) throw new Error("That submission doesn't exist.");
        // The same line the action drew: nothing is attached to a submission
        // the customer may still walk away from.
        if (!isPaid(submission)) {
          throw new Error("Nothing can be attached before the payment clears.");
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
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
