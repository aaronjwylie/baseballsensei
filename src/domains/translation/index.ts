/**
 * The translation domain — the translator's output, coming back.
 *
 * The mirror of `domains/feedback`, one artifact over: that owns what the coach
 * produces, this owns what the translator produces. Neither belongs in
 * `domains/operator`, because both are about the thing made rather than the
 * person who made it.
 *
 * The one place the mirror is deliberately imperfect is the unit of work. A
 * coach owns a submission; a translator owns a **leg** — see
 * `model/translationLeg.ts`, which is where every difference between the two
 * directions lives.
 */
export {
  findLegsForTranslator,
  saveTranslationFile,
  recordTranslationFile,
  handBackTranslation,
  type TranslatorLeg,
} from "./api/translationApi";
export { handBackTranslationAction } from "./api/translationActions";
export {
  LEGS,
  TRANSLATION_KINDS,
  legFor,
  isLegOpen,
  isLegDone,
  type LegShape,
  type TranslationKind,
} from "./model/translationLeg";
export { TranslationUpload } from "./ui/TranslationUpload";
