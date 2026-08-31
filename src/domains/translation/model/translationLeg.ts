/*
  Type-only, and from the barrel rather than the declaration files behind it.
  `import type` is erased at compile time, so a `"use client"` component can
  import this model without the barrel's Postgres code following it into the
  browser bundle — the same route `operator/model/operatorProfile.ts` takes to
  the same vocabulary.
*/
import type { FileKind, SubmissionStatus } from "@/domains/submission";

/**
 * A **leg** — the translator's unit of work, and the one place this domain
 * refuses to mirror the coach's.
 *
 * A coach owns a *submission*: one person, one job, start to finish. A
 * translator owns a *leg* — the customer's files on the way out, or the coach's
 * response on the way back — and the same translator can hold both legs of the
 * same submission at different times, weeks apart, in opposite directions. So
 * the queue is keyed on `produces`, not on the submission, and one submission
 * can legitimately appear twice.
 *
 * Every fact that differs between the two legs is in this table and nowhere
 * else. The alternative is a ternary at each of a dozen call sites, each of
 * which is a chance to get the direction backwards — and getting it backwards
 * means handing a translator the wrong folder, which reads to them as our
 * mistake rather than a bug they could report.
 */
/**
 * The two folders a translator may write to — narrower than `FileKind` on
 * purpose. `intake` and `feedback` are the customer's and the coach's own
 * uploads, and nothing in this domain may name them as an output.
 */
export const TRANSLATION_KINDS = [
  "intake_translation",
  "feedback_translation",
] as const;

export type TranslationKind = (typeof TRANSLATION_KINDS)[number];

export interface LegShape {
  /** What the translator owes. The assignment table's key. */
  produces: TranslationKind;
  /** What they work *from* — the originals of this side. */
  reads: FileKind;
  /** Emailed, not yet opened. */
  sent: SubmissionStatus;
  /** They have it: earned by their own first download, never declared. */
  working: SubmissionStatus;
  /** Handed back. */
  done: SubmissionStatus;
  /**
   * Has this leg been handed back?
   *
   * An exhaustive `Record`, not `status === leg.done` and not an index
   * comparison against the ladder — CLAUDE.md §8 is explicit that a question
   * about the ladder is a predicate. Equality would go false the instant the
   * submission moved on, so a finished leg would drop out of "Handed back" the
   * moment the admin acted on it; a comparison would compile forever while
   * quietly meaning something new. This way a new rung is a compile error in
   * the file that has to answer for it.
   */
  handedBack: Record<SubmissionStatus, boolean>;
  /** For the portal heading — what this leg *is*, in a translator's terms. */
  title: string;
  /** What handing it back sets in motion, so the button is not a mystery. */
  handBackHint: string;
}

/*
  Read down the column: `false` until the leg's own `*_translated` rung, then
  `true` for every rung after it. The two differ only in where they flip, and
  writing them out is what makes that visible — the intake leg is finished long
  before the submission is, and the response leg is finished a rung before
  delivery.
*/
const INTAKE_HANDED_BACK: Record<SubmissionStatus, boolean> = {
  draft: false,
  awaiting_payment: false,
  new: false,
  assigned: false,
  intake_translator_assigned: false,
  sent_to_intake_translator: false,
  intake_translating: false,
  intake_translated: true,
  sent_to_coach: true,
  in_review: true,
  awaiting_approval: true,
  feedback_translator_assigned: true,
  sent_to_feedback_translator: true,
  feedback_translating: true,
  feedback_translated: true,
  complete: true,
  collected: true,
  resolved: true,
  purge_imminent: true,
  purged: true,
};

const FEEDBACK_HANDED_BACK: Record<SubmissionStatus, boolean> = {
  draft: false,
  awaiting_payment: false,
  new: false,
  assigned: false,
  intake_translator_assigned: false,
  sent_to_intake_translator: false,
  intake_translating: false,
  intake_translated: false,
  sent_to_coach: false,
  in_review: false,
  awaiting_approval: false,
  feedback_translator_assigned: false,
  sent_to_feedback_translator: false,
  feedback_translating: false,
  feedback_translated: true,
  complete: true,
  collected: true,
  resolved: true,
  purge_imminent: true,
  purged: true,
};

export const LEGS: readonly LegShape[] = [
  {
    produces: "intake_translation",
    reads: "intake",
    sent: "sent_to_intake_translator",
    working: "intake_translating",
    done: "intake_translated",
    handedBack: INTAKE_HANDED_BACK,
    title: "The customer's files, for the coach",
    handBackHint: "The admin can then hand the submission to the coach.",
  },
  {
    produces: "feedback_translation",
    reads: "feedback",
    sent: "sent_to_feedback_translator",
    working: "feedback_translating",
    done: "feedback_translated",
    handedBack: FEEDBACK_HANDED_BACK,
    title: "The coach's response, for the customer",
    handBackHint: "The admin can then approve it and release it to the customer.",
  },
];

export function legFor(produces: FileKind): LegShape | null {
  return LEGS.find((leg) => leg.produces === produces) ?? null;
}

/**
 * Is this leg on the translator's desk *right now*?
 *
 * Two rungs, not one: `sent` is emailed-but-unopened and `working` is opened.
 * Both are the translator's turn — the split exists so the admin can see who
 * has gone quiet, not to divide the translator's own queue.
 */
export function isLegOpen(leg: LegShape, status: SubmissionStatus): boolean {
  return status === leg.sent || status === leg.working;
}

/** Has this leg been handed back — asked of the ladder, exhaustively. */
export function isLegDone(leg: LegShape, status: SubmissionStatus): boolean {
  return leg.handedBack[status];
}
