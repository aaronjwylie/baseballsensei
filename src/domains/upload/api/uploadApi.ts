/**
 * Attaching files to a submission.
 *
 * Two paths in, one record out:
 *
 * - **direct** (prod): the browser uploads straight to Blob with a short-lived
 *   token, then calls back here with the locator to register. `registerUpload`
 *   is that callback, and it re-checks that the locator really sits inside this
 *   submission's folder — the browser supplies it, so it cannot be trusted.
 * - **proxied** (dev): the bytes come through our own route and
 *   `storeUploadedFile` saves them via the storage seam.
 *
 * Both end at `addSubmissionFile`, so the row is written in one place whichever
 * way the bytes arrived.
 */
import { storage, submissionFileKey, submissionFolder } from "@/shared/storage";
import {
  addIntakeFileWithinLimit,
  addSubmissionFile,
  type SubmissionFile,
} from "@/domains/submission";
import { resolveContentType } from "../model/fileTypes";

/** What registering a direct upload can come to. */
export type RegisterResult =
  | { ok: true; file: SubmissionFile }
  | { ok: false; status: number; error: string };

/** The proxied path: we hold the bytes, so we save them ourselves. */
export async function storeUploadedFile(
  submissionId: string,
  filename: string,
  bytes: Uint8Array,
  browserContentType: string | undefined,
): Promise<SubmissionFile> {
  const contentType = resolveContentType(filename, browserContentType);
  const key = submissionFileKey(submissionId, filename);
  const fileUrl = await storage.save(key, bytes, contentType);

  return addSubmissionFile({
    submissionId,
    filename,
    contentType,
    sizeBytes: bytes.byteLength,
    fileUrl,
  });
}

/**
 * The direct path: the bytes are already in Blob, we record where.
 *
 * Two guards, both because the browser supplies every value here. First, the
 * locator must belong to this submission's folder — without it a caller holding
 * a valid flow cookie could register *any* URL, another customer's object
 * included. Second, the insert goes through `addIntakeFileWithinLimit`, which
 * counts and inserts under a row lock: `authorizeUpload`'s count-then-insert
 * could be raced by concurrent `/complete` calls past `maxFilesPerSubmission`,
 * and this is where that's actually enforced.
 */
export async function registerUpload(
  submissionId: string,
  input: {
    fileUrl: string;
    pathname: string;
    filename: string;
    contentType?: string;
    sizeBytes: number;
  },
  maxFiles: number,
): Promise<RegisterResult> {
  const folder = submissionFolder(submissionId);
  if (!input.pathname.startsWith(`${folder}/`) || !isUnderOurStore(input.fileUrl, input.pathname)) {
    return { ok: false, status: 403, error: "That upload doesn't belong to this submission." };
  }

  const file = await addIntakeFileWithinLimit(
    {
      submissionId,
      filename: input.filename,
      contentType: resolveContentType(input.filename, input.contentType),
      sizeBytes: input.sizeBytes,
      fileUrl: input.fileUrl,
    },
    maxFiles,
  );
  if (!file) {
    return { ok: false, status: 409, error: `You can attach up to ${maxFiles} files.` };
  }
  return { ok: true, file };
}

/**
 * The locator must be an https Blob URL whose path ends in the pathname we just
 * authorized. Blob may append a random suffix, so this is a prefix match on the
 * final segment rather than an equality check.
 *
 * Exported so the feedback direct-upload path (`/api/feedback/complete`) can tie
 * its browser-supplied `fileUrl` to the pathname it validated, the same way this
 * path does — otherwise it would store whatever URL the browser named.
 */
export function isUnderOurStore(fileUrl: string, pathname: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(fileUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  if (!parsed.hostname.endsWith(".blob.vercel-storage.com")) return false;

  const folder = pathname.slice(0, pathname.lastIndexOf("/"));
  return parsed.pathname.startsWith(`/${folder}/`);
}
