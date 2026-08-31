import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/domains/account";
import { getSubmission, isAssignedTo } from "@/domains/submission";
import { recordTranslationFile } from "@/domains/translation";
import { TRANSLATION_KINDS, type TranslationKind } from "@/domains/translation";
import { isUnderOurStore } from "@/domains/upload";

/**
 * Record a translation the browser uploaded straight to Blob — the counterpart
 * to `/api/feedback/complete`.
 *
 * Nothing the browser says is trusted: the operator gate runs again, and both
 * the submission *and the leg* come from the pathname rather than from fields
 * that could be pointed anywhere. Ownership is re-checked for that leg
 * specifically before the row is written.
 */
const bodySchema = z.object({
  fileUrl: z.string().url().max(2048),
  pathname: z.string().min(1).max(1024),
  filename: z.string().min(1).max(255),
  contentType: z.string().max(255).optional(),
  sizeBytes: z.number().int().positive(),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid upload details." }, { status: 400 });
  }

  const match = parsed.data.pathname.match(/^submissions\/([^/]+)\/([^/]+)\//);
  const kind = match?.[2] as TranslationKind | undefined;
  if (!match || !kind || !TRANSLATION_KINDS.includes(kind)) {
    return NextResponse.json(
      { error: "That upload isn't a translation." },
      { status: 400 },
    );
  }
  const submissionId = match[1];

  // Tie the browser-supplied locator to the pathname just validated — the same
  // guard the customer and coach paths use. Without it the pathname would
  // decide ownership while an unrelated `fileUrl` got stored and served later.
  if (!isUnderOurStore(parsed.data.fileUrl, parsed.data.pathname)) {
    return NextResponse.json(
      { error: "That upload isn't a translation." },
      { status: 400 },
    );
  }

  const submission = await getSubmission(submissionId);
  if (!submission) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (
    !session.roles.includes("admin") &&
    !(await isAssignedTo(submissionId, session.operatorId, kind))
  ) {
    return NextResponse.json({ error: "Not your leg." }, { status: 403 });
  }

  try {
    const file = await recordTranslationFile(submissionId, kind, {
      filename: parsed.data.filename,
      contentType: parsed.data.contentType ?? "application/octet-stream",
      sizeBytes: parsed.data.sizeBytes,
      fileUrl: parsed.data.fileUrl,
    });
    return NextResponse.json({
      file: { id: file.id, filename: file.filename, sizeBytes: file.sizeBytes },
    });
  } catch (err) {
    console.error("[translation/complete] failed:", err);
    return NextResponse.json(
      { error: "We couldn't save that file. Please try again." },
      { status: 502 },
    );
  }
}
