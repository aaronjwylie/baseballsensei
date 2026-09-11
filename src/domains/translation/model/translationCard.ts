/**
 * One card per submission, the legs inside it in pipeline order.
 *
 * A translator holding both of a submission's legs must be able to tell them
 * apart, and only the leg matching the current rung is actionable — so the
 * grouping is asserted *within* a card rather than between two of them
 * (QA 7.6/7.7, rewritten 2026-09-10). Pure: it lived in the translator route
 * file until the same day, where a unit test had to import a page to reach it.
 */
import type { Submission } from "@/domains/submission";
import { LEGS } from "./translationLeg";
import type { TranslatorLeg } from "../api/translationApi";

export type TranslationCardGroup = { submission: Submission; legs: TranslatorLeg[] };

export function groupBySubmission(
  legs: TranslatorLeg[],
): TranslationCardGroup[] {
  const byId = new Map<string, TranslationCardGroup>();
  for (const leg of legs) {
    const card = byId.get(leg.submission.id);
    if (card) card.legs.push(leg);
    else byId.set(leg.submission.id, { submission: leg.submission, legs: [leg] });
  }
  const order = (leg: TranslatorLeg) =>
    LEGS.findIndex((l) => l.produces === leg.leg.produces);
  for (const card of byId.values()) card.legs.sort((a, b) => order(a) - order(b));
  return [...byId.values()];
}
