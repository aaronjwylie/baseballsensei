import { NextResponse } from "next/server";
import { getSession } from "@/domains/account";
import {
  getSubmission,
  isPaid,
  saveFolderFile,
  FILE_KINDS,
  type FileKind,
} from "@/domains/submission";
import { getSettings, maxFileSizeBytes } from "@/domains/settings";

/**
 * The **development** folder path: bytes through us onto local disk, because
 * there is no Blob store. Records one file in the named folder and returns it.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.roles.includes("admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const submissionId = url.searchParams.get("submission")?.trim();
  const kind = url.searchParams.get("kind")?.trim() as FileKind | undefined;
  const filename = url.searchParams.get("filename")?.trim() || "upload";
  if (!submissionId) {
    return NextResponse.json({ error: "Missing submission." }, { status: 400 });
  }
  if (!kind || !FILE_KINDS.includes(kind)) {
    return NextResponse.json(
      { error: "That isn't one of the four folders." },
      { status: 400 },
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
    const file = await saveFolderFile(
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
    console.error("[folder upload] failed:", err);
    return NextResponse.json(
      { error: "Upload failed. Please try again." },
      { status: 502 },
    );
  }
}
