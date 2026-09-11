import { NextResponse } from "next/server";
import { env } from "@/shared/config/env";
import { touchFlowSession } from "@/domains/submission";
import { authorizeUpload, checkFile, storeUploadedFile } from "@/domains/upload";

/**
 * The **development** upload path: bytes through us, onto local disk.
 *
 * Production does not use this. Vercel caps a serverless request body at about
 * 4.5 MB, so a real video cannot arrive this way — there, the browser uploads
 * straight to Blob (`/api/upload/blob` + `/api/upload/complete`). Which path the
 * browser takes is decided by `storage.supportsDirectUpload`, not by guessing.
 *
 * The gate is `authorizeUpload`: a flow cookie naming a submission, a verified
 * email, and room under the file limit. Same gate as the direct path.
 */
export async function POST(request: Request) {
  /*
    Refuse rather than degrade. Reaching this route on Vercel means no Blob
    store is configured, so the storage seam fell back to local disk — and there
    the filesystem is read-only outside /tmp, and /tmp doesn't survive between
    invocations. Worse, the platform caps a request body near 4.5 MB and rejects
    a real video with a non-JSON 413 before this code ever runs, which the
    browser can only report as a vague "we couldn't save that file".

    That is honest degradation gone wrong: it degrades into something broken
    while looking configured. Say what's actually wrong instead.
  */
  if (env.isServerless) {
    console.error(
      "[upload] proxied upload attempted on Vercel — BLOB_READ_WRITE_TOKEN is unset, so uploads cannot work. Create a Blob store and redeploy.",
    );
    return NextResponse.json(
      {
        error:
          "Uploads aren't configured on this server. This is a setup problem on our side, not yours — please let us know.",
      },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  // Which submission the tab believes it is on — checked against the cookie by
  // the gate, so a tab another tab has superseded is refused with that reason.
  const decision = await authorizeUpload(url.searchParams.get("submission"));
  if (!decision.ok) {
    return NextResponse.json(
      { error: decision.refusal.error },
      { status: decision.refusal.status },
    );
  }
  const { permit } = decision;

  const filename = url.searchParams.get("filename")?.trim();
  if (!filename) {
    return NextResponse.json({ error: "Missing filename." }, { status: 400 });
  }

  try {
    const bytes = new Uint8Array(await request.arrayBuffer());

    const refusal = checkFile(permit, filename, bytes.byteLength);
    if (refusal) {
      return NextResponse.json(
        { error: refusal.error },
        { status: refusal.status },
      );
    }

    // A landed file is activity: push the idle timeout back.
    await touchFlowSession();

    const file = await storeUploadedFile(
      permit.submission.id,
      filename,
      bytes,
      request.headers.get("content-type") ?? undefined,
    );

    return NextResponse.json({
      file: {
        id: file.id,
        filename: file.filename,
        sizeBytes: file.sizeBytes,
      },
    });
  } catch (err) {
    console.error("[upload] failed:", err);
    return NextResponse.json(
      { error: "Upload failed. Please try again." },
      { status: 502 },
    );
  }
}
