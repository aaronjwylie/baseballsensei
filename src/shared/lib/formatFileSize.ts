/**
 * Bytes, as a person reads them.
 *
 * Lived in `domains/submission/model/submissionFile.ts` until 2026-09-06,
 * where five other domains had to reach across for it — and where
 * `domains/upload` could not reach at all, because a deep cross-domain import
 * is legal only from a client file and the barrel would have pulled Postgres
 * into the browser. Nothing about counting bytes is a fact about submissions.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}
