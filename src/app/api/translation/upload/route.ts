import { NextResponse } from "next/server";
import { getSession } from "@/domains/account";
import { getSubmission, isAssignedTo } from "@/domains/submission";
import { saveTranslationFile } from "@/domains/translation";
import { TRANSLATION_KINDS, type TranslationKind } from "@/domains/translation";

/**
 * The **development** translation path: bytes through us onto local disk,
 * because there's no Blob store. Records one file in the leg's folder and
 * returns it; it does **not** advance the submission — the translator hands the
 * leg back with a separate action, exactly as the coach sends for approval.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const submissionId = url.searchParams.get("submission")?.trim();
  const kind = url.searchParams.get("kind")?.trim() as TranslationKind | undefined;
  const filename = url.searchParams.get("filename")?.trim() || "translation";
  if (!submissionId) {
    return NextResponse.json({ error: "Missing submission." }, { status: 400 });
  }
  if (!kind || !TRANSLATION_KINDS.includes(kind)) {
    return NextResponse.json({ error: "Missing translation leg." }, { status: 400 });
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
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.byteLength === 0) {
      return NextResponse.json({ error: "The file was empty." }, { status: 400 });
    }
    const contentType =
      request.headers.get("content-type") || "application/octet-stream";
    const file = await saveTranslationFile(
      submissionId,
      kind,
      filename,
      bytes,
      contentType,
    );
    return NextResponse.json({
      file: { id: file.id, filename: file.filename, sizeBytes: file.sizeBytes },
    });
  } catch (err) {
    console.error("[translation upload] failed:", err);
    return NextResponse.json(
      { error: "Upload failed. Please try again." },
      { status: 502 },
    );
  }
}
