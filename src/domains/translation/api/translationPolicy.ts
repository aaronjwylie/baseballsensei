import type { Submission } from "@/domains/submission";
import { isLegOpen, legFor } from "../model/translationLeg";
import type { TranslationKind } from "../model/translationLeg";

/**
 * Whether a translator may act on this leg *right now* — the mirror of
 * `isCoachesTurn`, and the write gate for the three translation upload routes.
 *
 * They asked `isAssignedTo` alone, which is true from `*_translator_assigned` —
 * the rung the admin lands on when they *pick* a translator, before they send
 * anything. The hand-back was already guarded on `isLegOpen`, so a translator
 * could do the whole job on a leg that had never been sent and then be refused
 * at the last step (Ben, QA 6.18).
 *
 * `isLegOpen` is the existing home for "is this leg live" and this only adds
 * the lookup from the kind the route was given, so the two cannot drift.
 */
export function isTranslatorsTurn(
  submission: Pick<Submission, "status">,
  produces: TranslationKind,
): boolean {
  const leg = legFor(produces);
  return !!leg && isLegOpen(leg, submission.status);
}

/** Said at every door, so a translator meets the same sentence wherever they push. */
export const LEG_NOT_SENT =
  "The admin hasn't sent this leg over yet, so it can't take a translation.";
