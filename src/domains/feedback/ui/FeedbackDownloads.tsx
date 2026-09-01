"use client";

import { FEEDBACK_ANCHOR } from "@/shared/lib/anchors";
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
    <div
      id={FEEDBACK_ANCHOR}
      className="scroll-mt-6 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-6"
    >
      <h3 className="font-semibold text-ink">Your feedback</h3>
      <div className="mt-4 space-y-4">
        {groups.map((group, i) => (
          <div key={i}>
            <div className="text-sm font-medium text-ink">
              {group.playerName}
            </div>
            <ul className="mt-2 space-y-2">
              {group.files.map((file) => (
                <FeedbackDownloadRow
                  key={file.id}
                  fileId={file.id}
                  filename={file.filename}
                  sizeBytes={file.sizeBytes}
                />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
