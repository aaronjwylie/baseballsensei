/**
 * An operator who can be given work — the shape a coach and a translator both
 * are.
 *
 * A **view over two rows** since ADR 018: the `operator` that logs them in, and
 * the `operator_profile` that says what they cover. Not a record of its own,
 * which is why `id` here is the operator's id — one person, one identifier,
 * whichever way you arrived at them.
 *
 * **It was called `Coach` until 2026-08-06**, and that was a role wearing an
 * entity's name. A translator has every field on it — languages, specialties,
 * the lot — so `translatorApi` had to import `Coach` to say what it returned,
 * which is the tell `_NomenclatureLaw.md` §4 describes: a file about one role
 * reaching into its sibling for the shape they both are.
 *
 * **What separates them is `role`, which is a column** — the right home for a
 * value that varies per row. A type name can only be changed by a rename.
 *
 * The admin has no profile row at all, and that absence is load-bearing: it is
 * what distinguishes *is an admin* from *is a coach whose languages nobody has
 * filled in yet*, and it keeps the admin out of every assignment list by the
 * shape of the query rather than by a check someone has to remember.
 */
import type { Direction, Focus, LanguageChoice } from "@/domains/submission";

export interface OperatorProfile {
  /** The operator's id. They *are* an operator, so there is only the one. */
  id: string;
  /** Their login, from the operator row. */
  email: string;
  name: string;
  specialties: Focus[];
  languages: string[];
  isActive: boolean;
  /** Storage locator for their photo; absent until one is uploaded. Shown on
   *  the landing page for a coach; unused for a translator, who has no public
   *  presence — an empty column rather than a second table. */
  imageUrl?: string;
  /** A short public bio blurb. */
  bio?: string;
}

/** What the admin submits to add one, whichever role they will hold. */
export interface NewOperatorProfile {
  name: string;
  email: string;
  password: string;
  specialties: Focus[];
  languages: string[];
  bio?: string;
}

/*
 * `needsTranslation` used to live here, asking only whether *this coach* reads
 * English. It assumed the customer's side, which worked while the platform was
 * the only English speaker in the room and derived nothing useful the moment a
 * Japanese-speaking parent appeared.
 *
 * The rule is symmetric now — intersect both declared sets, empty means
 * translate — so it belongs with the submission, which is the thing that holds
 * both sides. See `domains/submission/model/submission.ts`.
 */

/**
 * Japanese, because the coaches are in Japan — the one thing about the choice
 * that is a coach fact rather than a language fact. The vocabulary itself lives
 * in `domains/submission`, beside the rule that consumes it.
 */
export const DEFAULT_LANGUAGE_CHOICE: LanguageChoice = "Japanese";

/**
 * What a translator works **between** — a direction, not a set of languages
 * (Ben, QA 5.13.4). A coach's languages answer "does this need translating";
 * a translator's answer "which leg can they take", which is a direction.
 *
 * Stored verbatim in the grant's `languages` (as a single value) and only ever
 * displayed, never intersected — translator assignment is manual, so this
 * records the direction rather than routing on it. If direction should one day
 * drive which leg a translator is offered, that is a real field and a filter on
 * the assignment select, not a reinterpretation of this string.
 */
export const TRANSLATOR_DIRECTIONS = [
  "English to Japanese",
  "Japanese to English",
  "both directions",
] as const;

export type TranslatorDirection = (typeof TRANSLATOR_DIRECTIONS)[number];

/**
 * The direction pairs a translator grant covers — the one place the stored
 * display string is turned into a capability (Ben, QA 5.9).
 *
 * The grant keeps one of the three `TRANSLATOR_DIRECTIONS` phrases in its
 * `languages`; "both directions" is the two one-way pairs, not a third kind of
 * thing. **This is the only reader of that string** — every caller asks the
 * capability here rather than parsing the phrase, so the day it becomes a stored
 * `{ from, to }[]` field only this function changes.
 */
export function directionsOf(
  translatorLanguages: readonly string[],
): Direction[] {
  const pairs: Direction[] = [];
  for (const value of translatorLanguages) {
    if (value === "English to Japanese") pairs.push({ from: "English", to: "Japanese" });
    else if (value === "Japanese to English") pairs.push({ from: "Japanese", to: "English" });
    else if (value === "both directions") {
      pairs.push({ from: "English", to: "Japanese" }, { from: "Japanese", to: "English" });
    }
  }
  return pairs;
}
