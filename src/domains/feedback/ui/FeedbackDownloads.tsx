"use client";

import { FEEDBACK_ANCHOR } from "@/shared/lib/anchors";
// Direct, not the barrel: this is a "use client" file and the barrel re-exports
// Postgres-backed code that cannot ship to the browser (CLAUDE.md §12).
import { SubmissionSummary } from "@/domains/submission/ui/SubmissionSummary";
import { FeedbackDownloadRow } from "./FeedbackDownloadRow";
import type { FeedbackGroup } from "../api/feedbackViewCode";

/* Named in `shared/lib/anchors` because the status card in `domains/submission`
   links to it and may not import this slice. */

/**
 * The customer's finished reviews, ready to download.
 *
 * **This replaced a second code prompt** (Ben, 2026-08-31). Both ways into this
 * page already prove control of the inbox — `/status` sends a code before it
 * will show anything, and `/status/[token]` arrives on a signed link we mailed
 * to that address — and `verifyFeedbackViewCode` was already returning the list
 * *and* the downloads together, under a comment saying exactly why:
 *
 *   "One code, one grant: the customer's whole view ... Splitting it into two
 *    grants would mean two codes for one act of proof, and a customer being
 *    asked to check their email twice on the same page."
 *
 * The page then dropped the downloads on the floor and asked for a second code
 * to fetch them again. Worse, codes are single-use, so it was not even the same
 * code — the customer had to go back to their inbox for a fresh one to reach
 * files the server had already handed over.
 *
 * Nothing about the guarantee changes here. The gate is the same gate; it is
 * simply not asked to open twice.
 */
export function FeedbackDownloads({ groups }: { groups: FeedbackGroup[] }) {
  if (groups.length === 0) return null;

  return (
    <div id={FEEDBACK_ANCHOR} className="scroll-mt-6">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
        {groups.length === 1 ? "Ready to download" : `Ready to download (${groups.length})`}
      </h3>

      {/*
        **A card each, not seven rows in one card** (Ben, 2026-09-03).

        Every review used to sit inside a single green panel separated by a
        player name, so a customer with seven finished reviews got one block and
        no way to tell which was which — the same failure the history list had,
        one panel over.

        The green stays on each card rather than around the set. It is what
        marks these as *ready*, and a single wrapper made it a background the
        eye stops seeing instead of a property of each thing in it.

        `SubmissionSummary` is the same component the history card uses, so the
        two lists cannot drift into describing one submission two ways again.
      */}
      <ul className="mt-3 space-y-3">
        {groups.map((group, i) => (
          <li
            key={i}
            className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5"
          >
            <SubmissionSummary
              submission={group.submission}
              dateLabel="Sent"
            />
            <ul className="mt-4 space-y-2">
              {group.files.map((file) => (
                <FeedbackDownloadRow
                  key={file.id}
                  fileId={file.id}
                  filename={file.filename}
                  sizeBytes={file.sizeBytes}
                />
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
