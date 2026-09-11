import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { submissionFolder, submissionIdFromPath } from "@/shared/storage";
import { env } from "@/shared/config/env";
import { authorizeUpload } from "@/domains/upload";
import { ALLOWED_MIME_TYPES, isAllowedFilename } from "@/shared/upload";
import { maxFileSizeBytes } from "@/domains/settings";

/**
 * The **production** upload path: issue a short-lived token so the browser can
 * upload straight to Vercel Blob.
 *
 * This route never sees the file. It sees a request for permission, and answers
 * it — which is the whole point, because the file is far larger than a
 * serverless function is allowed to receive.
 *
 * Everything the token allows is decided here, from the server's own state:
 *
 * - the **path** must sit inside the folder of the submission named by the flow
 *   cookie. The browser proposes a pathname, so without this check a caller
 *   could write into someone else's folder.
 * - the **size** ceiling and **content types** come from the operator's settings
 *   and the allowlist, so the token can't be used to park a 2 GB archive.
 *
 * Throwing from `onBeforeGenerateToken` is how the SDK is told to refuse; the
 * message reaches the browser.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request,
      token: env.blobToken,

      onBeforeGenerateToken: async (pathname) => {
        // The pathname names the submission the tab thinks it is on. The gate
        // compares it to the cookie and says *why* when they differ — though
        // the Blob client flattens any refusal here into "failed to retrieve
        // the client token", so the panel's wording has to cover both causes.
        const decision = await authorizeUpload(submissionIdFromPath(pathname));
        if (!decision.ok) throw new Error(decision.refusal.error);

        const { permit } = decision;
        const folder = submissionFolder(permit.submission.id);

        if (!pathname.startsWith(`${folder}/`)) {
          throw new Error("That upload isn't for this submission.");
        }
        if (!isAllowedFilename(pathname)) {
          throw new Error("That file type isn't supported.");
        }

        return {
          allowedContentTypes: ALLOWED_MIME_TYPES,
          maximumSizeInBytes: maxFileSizeBytes(permit.settings),
          // Blob's own suffix keeps two files of the same name apart; the row
          // holds the name the customer actually sees.
          addRandomSuffix: true,
        };
      },

      // Intentionally absent: Vercel calls `onUploadCompleted` from its own
      // network, which cannot reach a developer's laptop, so recording the file
      // there would work in production and silently fail in dev. The browser
      // calls `/api/upload/complete` instead, and that route re-checks the
      // locator rather than trusting it.
    });

    return NextResponse.json(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "We couldn't start that upload.";
    console.error("[upload/blob] refused:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
