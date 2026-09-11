import { NextResponse } from "next/server";
import { getSession } from "@/domains/account";
import { getSubmission, isAssignedTo } from "@/domains/submission";
import { isTranslatorsTurn, LEG_NOT_SENT } from "@/domains/translation";
import { saveTranslationFile } from "@/domains/translation";
import { TRANSLATION_KINDS, type TranslationKind } from "@/domains/translation";
import { getSettings, maxFileSizeBytes } from "@/domains/settings";

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

  /*
    Ownership is not a turn (Ben, QA 6.18). The admin may attach for anyone;
    an operator may only work on what has been handed to them.
  */
  if (!session.roles.includes("admin") && !isTranslatorsTurn(submission, kind)) {
    return NextResponse.json({ error: LEG_NOT_SENT }, { status: 409 });
  }

  try {
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.byteLength === 0) {
      return NextResponse.json({ error: "The file was empty." }, { status: 400 });
    }
    /*
      The limit, on the dev path too (Ben, QA 6.6.1, 2026-09-06).

      The `complete` routes check it and these did not, so the same limit that
      held in production was absent locally — which is the worst place for it to
      differ, since local is where a limit gets tested. The customer's dev route
      has always checked, through `authorizeUpload`.
    */
    const settings = await getSettings();
    if (bytes.byteLength > maxFileSizeBytes(settings)) {
      return NextResponse.json(
        { error: `Files must be under ${settings.maxFileSizeMb} MB.` },
        { status: 413 },
      );
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
