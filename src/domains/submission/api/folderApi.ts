/**
 * The admin writing into any of the four folders.
 *
 * **Why this exists at all.** Adding a file is not overwriting one — nothing
 * here replaces or removes anything, every upload is its own row, and the
 * folder keeps what was already in it. The cases are ordinary: a customer whose
 * upload failed emails the clip instead, a coach sends their response by reply
 * rather than through the portal. Refusing those means the admin does the work
 * outside the system and the folder is a lie either way.
 *
 * **Why it is not the Server Action it used to be.** The action took the bytes
 * through us, and on Vercel a serverless request body is capped near 4.5 MB
 * ([ADR 011]) — so an admin could not attach a real video at all, and an
 * oversize one blew the body limit and got Next's own error page instead of
 * ours (Ben, QA 6.6.1/6.6.5). It was the last upload path still routed through
 * the server; now all four go straight to storage, and the pair of functions
 * below is what the two routes share.
 *
 * **The trail is what the old rule was really protecting.** An admin writing
 * into a folder that is somebody else's earns a row naming the file, because
 * once they are both rows a file the admin added and a file the customer
 * uploaded look identical.
 */
import { storage, folderFileKey } from "@/shared/storage";
import { addSubmissionFile } from "./submissionFileApi";
import { getSubmission } from "./submissionApi";
import { recordSubmissionEvent } from "./submissionEventApi";
import type { FileKind, SubmissionFile } from "../model/submissionFile";

/** `intake` and `feedback` belong to the customer and the coach, not to us. */
function isSomeoneElses(kind: FileKind): boolean {
  return kind === "intake" || kind === "feedback";
}

async function noteIfSomeoneElses(
  submissionId: string,
  kind: FileKind,
  filename: string,
): Promise<void> {
  if (!isSomeoneElses(kind)) return;
  const submission = await getSubmission(submissionId);
  if (!submission) return;
  await recordSubmissionEvent(
    submissionId,
    submission.status,
    `Admin uploaded "${filename}" into the ${kind} folder`,
  );
}

/** The **development** path: bytes through us onto local disk, no Blob store. */
export async function saveFolderFile(
  submissionId: string,
  kind: FileKind,
  filename: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<SubmissionFile> {
  const fileUrl = await storage.save(
    folderFileKey(submissionId, kind, filename),
    bytes,
    contentType,
  );
  const file = await addSubmissionFile(
    { submissionId, filename, contentType, sizeBytes: bytes.byteLength, fileUrl },
    kind,
  );
  await noteIfSomeoneElses(submissionId, kind, filename);
  return file;
}

/** The **production** path: the object already landed, record the row. */
export async function recordFolderFile(
  submissionId: string,
  kind: FileKind,
  input: {
    filename: string;
    contentType: string;
    sizeBytes: number;
    fileUrl: string;
  },
): Promise<SubmissionFile> {
  const file = await addSubmissionFile({ submissionId, ...input }, kind);
  await noteIfSomeoneElses(submissionId, kind, input.filename);
  return file;
}
