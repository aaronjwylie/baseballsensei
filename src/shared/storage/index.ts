/**
 * The `shared/storage` barrel — pick the driver by environment.
 *
 * Blob when a token is configured (prod), local disk otherwise (dev). Callers
 * import `storage` and never touch a driver directly.
 */
import { randomUUID } from "node:crypto";
import { env } from "@/shared/config/env";
import type { StorageDriver } from "./types";
import { localDriver } from "./localDriver";
import { blobDriver } from "./blobDriver";

export const storage: StorageDriver = env.blobToken ? blobDriver : localDriver;

/**
 * The folder every file for one submission lives under.
 *
 * Exported because the upload routes verify that a locator handed back by the
 * browser actually sits inside the submission it claims to belong to — without
 * that check, a caller could register someone else's object against their own
 * submission.
 */
export function submissionFolder(submissionId: string): string {
  return `submissions/${submissionId}`;
}

/**
 * Build the storage key for one of a submission's uploaded files.
 *
 * The random prefix keeps two files of the same name from colliding — a
 * customer sending `IMG_0001.mov` twice is ordinary, not an error. The original
 * name is preserved on the row for display; what lands in storage is sanitized,
 * because this string becomes a path.
 */
export function submissionFileKey(
  submissionId: string,
  filename: string,
): string {
  return `${submissionFolder(submissionId)}/${randomUUID().slice(0, 8)}-${safeName(filename)}`;
}

/**
 * Build the storage key for one of a coach's feedback files. Lives in a
 * `feedback/` subfolder so a submission's own uploads and the coach's response
 * never share a name, and carries a random prefix so multiple feedback files of
 * the same name don't collide.
 */
export function feedbackFileKey(submissionId: string, filename: string): string {
  return `${submissionFolder(submissionId)}/feedback/${randomUUID().slice(0, 8)}-${safeName(filename)}`;
}

/**
 * Build the storage key for a file filed into one of the four folders.
 *
 * Its own subfolder per kind, so the four folders are visible in the object
 * store as well as in the database — which matters the one time someone has to
 * look at raw storage to work out what a submission actually contains.
 */
export function folderFileKey(
  submissionId: string,
  kind: "intake" | "intake_translation" | "feedback" | "feedback_translation",
  filename: string,
): string {
  return `${submissionFolder(submissionId)}/${kind}/${randomUUID().slice(0, 8)}-${safeName(filename)}`;
}

/**
 * Build the storage key for a coach's profile photo. The random prefix gives a
 * replaced photo a fresh locator (no stale cache), and the old object is removed
 * on replace.
 */
export function coachImageKey(coachId: string, filename: string): string {
  return `coaches/${coachId}/${randomUUID().slice(0, 8)}-${safeName(filename)}`;
}

/**
 * A filename safe to use as a path segment: no separators, no traversal, no
 * control characters, and bounded in length.
 */
function safeName(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? "file";
  const cleaned = base
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/^\.+/, "")
    .slice(0, 80);
  return cleaned || "file";
}

export type { StorageDriver, OpenResult } from "./types";
