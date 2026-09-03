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
export function FeedbackFiles({ group }: { group: FeedbackGroup }) {
  if (group.files.length === 0) return null;

  const byKind = FILE_KINDS.map((kind) => ({
    kind,
    files: group.files.filter((f) => f.kind === kind),
  })).filter((k) => k.files.length > 0);

  const list = (files: FeedbackGroup["files"]) => (
    <ul className="mt-2 space-y-2">
      {files.map((file) => (
        <FeedbackDownloadRow
          key={file.id}
          fileId={file.id}
          filename={file.filename}
          sizeBytes={file.sizeBytes}
        />
      ))}
    </ul>
  );

  if (byKind.length <= 1) return <div className="mt-4">{list(group.files)}</div>;

  return (
    <>
      {byKind.map(({ kind, files }) => (
        <div key={kind} className="mt-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
            {KIND_LABELS[kind] ?? kind}
          </div>
          {list(files)}
        </div>
      ))}
    </>
  );
}
