import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { env } from "@/shared/config/env";
import { getSession } from "@/domains/account";
import { getSubmission, isAssignedTo } from "@/domains/submission";
import { ALLOWED_MIME_TYPES, isAllowedFilename } from "@/domains/upload";
import { getSettings, maxFileSizeBytes } from "@/domains/settings";
import { TRANSLATION_KINDS, type TranslationKind } from "@/domains/translation";

/**
 * The translator's counterpart to `/api/feedback/blob` — a short-lived token so
 * a translation goes straight to Blob rather than through a 4.5 MB request body.
 *
 * **The pathname carries the leg**, which the feedback route never had to do:
 * a coach writes to one folder, a translator writes to either. So the kind is
 * parsed out and checked against the assignment for *that leg* — holding the
 * intake leg does not authorise writing to the response folder, even on a
 * submission you are genuinely working on.
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
        if (!session) throw new Error("Sign in to upload a translation.");

        const match = pathname.match(/^submissions\/([^/]+)\/([^/]+)\//);
        if (!match) {
          throw new Error("A translation must go in one of the two translation folders.");
        }
        const submissionId = match[1];
        const kind = match[2] as TranslationKind;
        if (!TRANSLATION_KINDS.includes(kind)) {
          throw new Error("A translation must go in one of the two translation folders.");
        }

        const submission = await getSubmission(submissionId);
        if (!submission) throw new Error("That submission doesn't exist.");

        if (
          !session.roles.includes("admin") &&
          !(await isAssignedTo(submissionId, session.operatorId, kind))
        ) {
          throw new Error("That leg isn't assigned to you.");
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
