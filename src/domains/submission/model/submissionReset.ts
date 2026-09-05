/**
 * What a reset undoes — the facts earned *after* the rung it lands on.
 *
 * A reset used to move `status` and nothing else. Everything downstream stayed
 * stamped, so a submission sent back to the coach still reported the file set
 * the customer was sent, the moment they collected it, and the translator who
 * had handled a leg it no longer runs — all of it present-tense, on a panel
 * describing where the submission is *now* (Ben, 2026-09-04):
 *
 * ```
 * Pipeline status     Aligned — coach handles it directly
 * Translator, in      benben (English to Japanese)
 * Customer was sent   original
 * Collected           Sep 2, 14:15
 * ```
 *
 * **The trail keeps the history; this table answers what is true.** It's the
 * same relationship `submission.status` has to `submission_event`, and the same
 * one `submission_assignment` has: a row is deleted to unassign, because the
 * question it answers is *who has it now*.
 *
 * **Only what lies beyond the target.** A reset from `purged` to `collected`
 * keeps `collectedAt` — collection is the rung it is landing on, not one it is
 * walking back past. The rule is the same in both directions, which is why it's
 * written as a rung per fact rather than a list per destination.
 *
 * Nothing here touches files. Clearing `customerFileSet` says "no set has been
 * sent"; deleting the response folder would destroy a coach's work on a status
 * correction, and both portals already carry a per-file remove for when that is
 * actually meant.
 */
import {
  SUBMISSION_STATUSES,
  type SubmissionPatch,
  type SubmissionStatus,
} from "./submission";
import type { FileKind } from "./submissionFile";

/**
 * Is `rung` at or behind `status` — has the submission got that far?
 *
 * The one ladder question that *is* a comparison, and only because the enum is
 * declared in ladder order for exactly this (CLAUDE.md §8). Every question about
 * what a rung *means* — may the customer see it, is it on a coach's desk — stays
 * an exhaustive record in `submission.ts`, which is the rule this doesn't break.
 */
export function hasReached(
  status: SubmissionStatus,
  rung: SubmissionStatus,
): boolean {
  return SUBMISSION_STATUSES.indexOf(status) >= SUBMISSION_STATUSES.indexOf(rung);
}

/** The rung that earns each fact — reset past it and the fact is no longer true. */
const FACT_EARNED_AT = {
  coachFileSet: "sent_to_coach",
  customerFileSet: "complete",
  completedAt: "complete",
  feedbackEmailedAt: "complete",
  collectedAt: "collected",
} as const satisfies Partial<Record<keyof SubmissionPatch, SubmissionStatus>>;

/**
 * The rung that earns each assignment.
 *
 * A coach survives a reset to `assigned` and is released by one to `new` — which
 * is what "resume at Pick a coach" means, and what an admin was doing by hand
 * immediately afterwards.
 */
const ASSIGNMENT_EARNED_AT = {
  feedback: "assigned",
  intake_translation: "intake_translator_assigned",
  feedback_translation: "feedback_translator_assigned",
} as const satisfies Partial<Record<FileKind, SubmissionStatus>>;

/** The facts a reset to `to` invalidates, and the assignments it releases. */
export function undoneByReset(to: SubmissionStatus): {
  patch: SubmissionPatch;
  release: FileKind[];
} {
  const patch: SubmissionPatch = {};
  const facts = Object.entries(FACT_EARNED_AT) as [
    keyof typeof FACT_EARNED_AT,
    SubmissionStatus,
  ][];
  for (const [fact, rung] of facts) {
    if (!hasReached(to, rung)) {
      // No cast: `SubmissionPatch` allows null exactly where the column is
      // nullable. The cast this used to need is what let a `new Date(null)`
      // through the mapper and stamped five columns 1970-01-01.
      patch[fact] = null;
    }
  }

  const release = (
    Object.entries(ASSIGNMENT_EARNED_AT) as [FileKind, SubmissionStatus][]
  )
    .filter(([, rung]) => !hasReached(to, rung))
    .map(([kind]) => kind);

  return { patch, release };
}
