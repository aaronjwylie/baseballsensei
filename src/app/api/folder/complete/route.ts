import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/domains/account";
import { getSettings, maxFileSizeBytes } from "@/domains/settings";
import {
  getSubmission,
  isPaid,
  recordFolderFile,
  FILE_KINDS,
  type FileKind,
} from "@/domains/submission";
import { isUnderOurStore } from "@/domains/upload";
import { resolveContentType } from "@/shared/upload";

/**
 * Record a file the admin's browser uploaded straight to Blob.
 *
 * Nothing the browser says is trusted: the admin gate runs again, and both the
 * submission and the folder come from the pathname rather than from fields that
 * could be pointed anywhere.
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
  if (!session?.roles.includes("admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid upload details." }, { status: 400 });
  }

  const match = parsed.data.pathname.match(/^submissions\/([^/]+)\/([^/]+)\//);
  const kind = match?.[2] as FileKind | undefined;
  if (!match || !kind || !FILE_KINDS.includes(kind)) {
    return NextResponse.json(
      { error: "That isn't one of the four folders." },
      { status: 400 },
    );
  }
  const submissionId = match[1]!;

  // Tie the browser-supplied locator to the pathname just validated — without
  // it the pathname decides which folder while an unrelated `fileUrl` gets
  // stored and served later.
  if (!isUnderOurStore(parsed.data.fileUrl, parsed.data.pathname)) {
    return NextResponse.json(
      { error: "That upload isn't in this submission's folder." },
      { status: 400 },
    );
  }

  // Size, here as well as on the token: `maximumSizeInBytes` on a client token
  // is not the enforcement it looks like — a 21 MB file landed against a 10 MB
  // limit on 2026-09-04 (QA 6.6).
  const settings = await getSettings();
  if (parsed.data.sizeBytes > maxFileSizeBytes(settings)) {
    return NextResponse.json(
      { error: `Files must be under ${settings.maxFileSizeMb} MB.` },
      { status: 413 },
    );
  }

  const submission = await getSubmission(submissionId);
  if (!submission) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (!isPaid(submission)) {
    return NextResponse.json(
      { error: "Nothing can be attached before the payment clears." },
      { status: 409 },
    );
  }

  try {
    const file = await recordFolderFile(submissionId, kind, {
      filename: parsed.data.filename,
      contentType: resolveContentType(parsed.data.filename, parsed.data.contentType),
      sizeBytes: parsed.data.sizeBytes,
      fileUrl: parsed.data.fileUrl,
    });
    return NextResponse.json({
      file: { id: file.id, filename: file.filename, sizeBytes: file.sizeBytes },
    });
  } catch (err) {
    console.error("[folder/complete] failed:", err);
    return NextResponse.json(
      { error: "We couldn't save that file. Please try again." },
      { status: 502 },
    );
  }
}
