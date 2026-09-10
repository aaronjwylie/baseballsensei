import { FOLDER_LABEL, type FileKind, type SubmissionFile } from "../model/submissionFile";
import { SubmissionFileList } from "./SubmissionFileList";

/**
 * Everything on a submission, grouped the way the admin's four folder boxes
 * group it — for an operator looking back at finished work.
 *
 * **Why all four and not just their own.** A coach's finished card listed
 * nothing at all, because the page loaded only the customer's side and then
 * filtered it for the coach's (Ben, 2026-09-07). Fixing the query would have
 * shown the response and stopped there, which is thinner than what the card is
 * for: the job was the files they were *given* and the files they *sent*, and
 * a receipt that omits half of it answers "what did I send" but not "what was
 * this". The admin panel shows four folders for the same submission; these
 * portals now agree with it rather than each keeping a partial view.
 *
 * An empty folder is not rendered — four headings, three of them saying
 * "nothing", is noise on a card that exists to be glanced at.
 */
export function SubmissionFolders({
  folders,
  emptyLabel = "No files on this submission.",
}: {
  folders: Record<FileKind, SubmissionFile[]>;
  emptyLabel?: string;
}) {
  const present = (Object.keys(FOLDER_LABEL) as FileKind[]).filter(
    (kind) => folders[kind].length > 0,
  );

  if (present.length === 0) {
    return <p className="text-sm text-ink-muted">{emptyLabel}</p>;
  }

  return (
    <div className="space-y-3">
      {present.map((kind) => (
        <div key={kind}>
          <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            {FOLDER_LABEL[kind]}
          </h4>
          <SubmissionFileList files={folders[kind]} />
        </div>
      ))}
    </div>
  );
}

/**
 * How many files, and how many of them the retention sweep has taken.
 *
 * The rows outlive the bytes on purpose, so a card can still say what was sent
 * after a purge — but a bare count then overstates what is actually there, and
 * "3 files" beside three struck-through names reads as a broken page rather
 * than a deliberate one.
 */
export function describeFolders(
  folders: Record<FileKind, SubmissionFile[]>,
): string {
  const files = Object.values(folders).flat();
  if (files.length === 0) return "no files";

  const gone = files.filter((f) => !f.fileUrl).length;
  const count = `${files.length} file${files.length === 1 ? "" : "s"}`;
  if (gone === 0) return count;
  if (gone === files.length) {
    return `${count}, deleted after the retention window`;
  }
  return `${count}, ${gone} deleted after the retention window`;
}
