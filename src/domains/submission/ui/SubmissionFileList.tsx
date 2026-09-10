import { formatFileSize } from "@/shared/lib";
import type { SubmissionFile } from "../model/submissionFile";

/**
 * The customer's uploaded files, for an operator.
 *
 * Shared by the admin queue and the coach's review list so both show the same
 * thing — one submission now carries several files, and two hand-rolled lists
 * would drift into disagreeing about what a swept file looks like.
 *
 * `/api/files/[id]` is operator-gated, so this is safe in the portal and must
 * never be rendered on a customer page.
 *
 * A file whose bytes the retention sweep removed still appears, greyed and
 * unlinked. Showing what *was* sent is the honest thing: "there were three
 * files and they've been deleted" is information, and a silently shorter list
 * looks like data loss.
 */
export function SubmissionFileList({
  files,
  emptyLabel = "No files",
}: {
  files: SubmissionFile[];
  emptyLabel?: string;
}) {
  if (files.length === 0) {
    return <span className="text-sm text-ink-muted">{emptyLabel}</span>;
  }

  return (
    <ul className="space-y-1">
      {files.map((file) => (
        <li key={file.id} className="text-sm">
          {file.fileUrl ? (
            <a
              href={`/api/files/${file.id}`}
              className="font-medium text-accent hover:underline"
            >
              {file.filename}
            </a>
          ) : (
            <span className="text-ink-muted line-through">{file.filename}</span>
          )}
          <span className="ml-2 text-xs text-ink-muted">
            {formatFileSize(file.sizeBytes)}
            {file.fileUrl ? "" : " · deleted"}
          </span>
        </li>
      ))}
    </ul>
  );
}
