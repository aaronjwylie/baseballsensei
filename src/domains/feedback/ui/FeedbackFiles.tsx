"use client";

import {
  FILE_KINDS,
  type FileKind,
} from "@/domains/submission/model/submissionFile";
import { FeedbackDownloadRow } from "./FeedbackDownloadRow";
import type { FeedbackGroup } from "../api/feedbackViewCode";

/**
 * Which folder a file came from, **in the customer's words**.
 *
 * The hand-off email does this already and says "The client's originals" —
 * right for a coach, wrong here. The reader of this page is the parent, so the
 * same two folders are named from where they sit: the coach's own file came
 * *from* their coach, and the other one was made *for* them.
 *
 * Never a language. Nothing records what language a file is actually in, which
 * is the same reason the send radio and the folder hints stopped claiming one.
 */
const KIND_LABELS: Partial<Record<FileKind, string>> = {
  feedback: "From your coach",
  feedback_translation: "Translated for you",
};

/**
 * One finished review's files — **just the files.**
 *
 * No card, no heading, no player name. It renders *inside* the submission's own
 * card on the status page, which already says whose review this is and when it
 * landed (Ben, 2026-09-03).
 *
 * It used to bring its own card and its own copy of the summary, which is how
 * the page ended up listing every finished review twice: once in a green panel
 * with its download and again in the list below with its status. Two cards for
 * one submission, each carrying half of what a reader wanted. Splitting the
 * files out of that panel is what let the two halves become one card.
 *
 * Labelled when a release covers both folders, flat when it covers one — the
 * same two rules the hand-off email follows, and for the same reason: a parent
 * sent "both" otherwise gets two links distinguished only by whatever the coach
 * happened to name them. A heading over a list that could not be anything else
 * costs the reader a line, so the ordinary single-folder release stays plain.
 *
 * Ordered by `FILE_KINDS`, not upload order, so the coach's own file always
 * precedes its translation rather than following it whenever the translator
 * happened to finish first.
 */
/*
  Takes the files, not the whole group (Ben, QA 8.9.3, 2026-09-08).

  It only ever read `group.files`, and asking for a `FeedbackGroup` meant the
  one page that has files but no group — `/feedback/[token]`, the link inside
  the ⑥ email — could not use it, and hand-rolled a flat list instead. So a
  submission released with **both** folders showed its two files there
  distinguished only by whatever the coach happened to name them: the exact
  failure 8.9.25 records, fixed on `/status` and not here, which is the exact
  failure 8.9.3 exists to catch.

  A prop that asks for more than the component reads is how one of two callers
  gets locked out.
*/
export function FeedbackFiles({ files }: { files: FeedbackGroup["files"] }) {
  if (files.length === 0) return null;

  const byKind = FILE_KINDS.map((kind) => ({
    kind,
    files: files.filter((f) => f.kind === kind),
  })).filter((k) => k.files.length > 0);

  const list = (rows: FeedbackGroup["files"]) => (
    <ul className="mt-2 space-y-2">
      {rows.map((file) => (
        <FeedbackDownloadRow
          key={file.id}
          fileId={file.id}
          filename={file.filename}
          sizeBytes={file.sizeBytes}
        />
      ))}
    </ul>
  );

  if (byKind.length <= 1) return <div className="mt-4">{list(files)}</div>;

  return (
    <>
      {byKind.map(({ kind, files }) => (
        <div key={kind} className="mt-4">
          {/* Neutral, not green. It borrowed the green from the panel it used to
              sit in, and that panel is now only tinted while the review still
              wants collecting — so on a downloaded card the heading was the one
              green thing left (Ben, 2026-09-10). */}
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            {KIND_LABELS[kind] ?? kind}
          </div>
          {list(files)}
        </div>
      ))}
    </>
  );
}
