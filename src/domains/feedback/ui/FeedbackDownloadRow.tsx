"use client";

import { buttonClasses } from "@/shared/ui";
// A client component imports the slice model directly, never the barrel: the
// barrel re-exports Postgres code that cannot reach the browser (CLAUDE.md §12).
// This row renders inside `FeedbackAccess`, which is itself `"use client"`, so it
// ships to the browser either way.
import { formatFileSize } from "@/domains/submission/model/submissionFile";

/**
 * One downloadable feedback file, as the customer sees it.
 *
 * ── Why this is a component ─────────────────────────────────────────────────
 *
 * A customer can reach their feedback two ways — the signed link in the ⑥
 * email (`/feedback/[token]`) and the status lookup (`FeedbackAccess`) — and
 * each had built this row for itself. So each carried its own copy of the same
 * two bugs, and fixing one page left the other exactly as it was: the same
 * report came back twice, from the same person, about the same button (Ben,
 * 2026-08-31). One row, used by both, is the only version of this that stays
 * fixed.
 *
 * ── The two bugs, and why they were bugs ────────────────────────────────────
 *
 * **`flex-wrap` put the button in two different places.** A flex line wraps
 * before it shrinks, so a long filename pushed its Download onto a second row
 * while a short one left it beside the name — two files in one list looking
 * like two designs, with nothing different about them but the length of a
 * name. `flex-nowrap` and a `flex-1 min-w-0 truncate` name instead: the name is
 * the only thing that gives way, and the button never moves.
 *
 * **`target="_blank"` flashed a tab open and shut on every download.** The tab
 * had nothing to show: the route answers `Content-Disposition: attachment`, so
 * the browser downloads rather than navigating, and the window it opened was
 * empty by the time it appeared.
 *
 * ── Why a plain `<a>` ───────────────────────────────────────────────────────
 *
 * `ButtonLink` wraps `next/link`, which intercepts internal hrefs for
 * client-side navigation — and was skipping this one *only* because `target`
 * was set. Dropping the target without dropping the Link hands
 * `/api/feedback/[id]` to the router as though it were a page, so the two
 * changes are one change. `SubmissionFileList` and the admin's folders use a
 * bare anchor for the same reason.
 */
export function FeedbackDownloadRow({
  fileId,
  filename,
  sizeBytes,
  padding = "p-3",
}: {
  fileId: string;
  filename: string;
  /** Absent on the status lookup, which doesn't always carry a size. */
  sizeBytes?: number | null;
  /** The two pages sit at different scales; only the padding differs. */
  padding?: string;
}) {
  return (
    <li
      className={`flex items-center gap-3 rounded-xl border border-line bg-white ${padding}`}
    >
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
        {filename}
      </span>
      {/* Its own item rather than nested inside the truncated name, or the
          ellipsis eats the size before it touches the filename. */}
      {sizeBytes ? (
        <span className="shrink-0 text-xs text-ink-muted">
          {formatFileSize(sizeBytes)}
        </span>
      ) : null}
      <a
        href={`/api/feedback/${fileId}`}
        download={filename}
        className={buttonClasses("primary", "md", "shrink-0")}
      >
        Download
      </a>
    </li>
  );
}
