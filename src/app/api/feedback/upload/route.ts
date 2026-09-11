import { NextResponse } from "next/server";
import { getSession } from "@/domains/account";
import { getSubmission, isAssignedTo } from "@/domains/submission";
import { isCoachesTurn, NOT_SENT_TO_COACH } from "@/domains/feedback";
import { saveFeedbackFile } from "@/domains/feedback";
import { getSettings, maxFileSizeBytes } from "@/domains/settings";

/**
 * The **development** feedback path: the bytes come through us onto local disk,
 * because there's no Blob store. Records one `feedback` file and returns it; it
 * does **not** advance the submission — the coach hands the set to the admin with a
 * separate "send for approval" action. A coach may only deliver for their own
 * assignments; the admin may deliver for anyone.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const submissionId = url.searchParams.get("submission")?.trim();
  const filename = url.searchParams.get("filename")?.trim() || "feedback";
  if (!submissionId) {
    return NextResponse.json({ error: "Missing submission." }, { status: 400 });
  }

  const submission = await getSubmission(submissionId);
  if (!submission) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (!session.roles.includes("admin") && !(await isAssignedTo(submissionId, session.operatorId, "feedback"))) {
    return NextResponse.json({ error: "Not your submission." }, { status: 403 });
  }

  /*
    Ownership is not a turn (Ben, QA 6.18). The admin may attach for anyone —
    they are the one who unsticks a stalled submission — but an operator may
    only work on one that has actually been handed to them.
  */
  if (!session.roles.includes("admin") && !isCoachesTurn(submission)) {
    return NextResponse.json({ error: NOT_SENT_TO_COACH }, { status: 409 });
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
    const file = await saveFeedbackFile(submissionId, filename, bytes, contentType);
    return NextResponse.json({
      file: { id: file.id, filename: file.filename, sizeBytes: file.sizeBytes },
    });
  } catch (err) {
    console.error("[feedback upload] failed:", err);
    return NextResponse.json(
      { error: "Upload failed. Please try again." },
      { status: 502 },
    );
  }
}
