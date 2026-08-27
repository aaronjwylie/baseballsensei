/**
 * The QA domain — temporary instrumentation for a manual test pass.
 *
 * Server-only barrel: it reaches the database. The probe is a client component
 * and imports `model/qaEvent` directly.
 *
 * Everything here is designed to be deleted. See `_QaDocumentation.md`.
 */
export { recordEvents, readEvents, clearEvents } from "./api/qaApi";
export { readMarks, setMark } from "./api/qaMarkApi";
export { readNotes, addNote, setNoteStatus } from "./api/qaNoteApi";
export { readFieldChecks, addFieldCheck, nextIdAfter } from "./api/qaCheckApi";
export { qaAccess, type QaAccess } from "./api/qaAccess";
export { setMarkAction } from "./api/qaMarkActions";
export {
  addNoteAction,
  setNoteStatusAction,
  addFieldCheckAction,
} from "./api/qaNoteActions";
export { itinerary, itineraryMeta } from "./model/itinerary";
export {
  MARK_VALUES,
  NOTE_STATUSES,
  BROWSERS,
  compareCheckIds,
  type Check,
  type FieldCheck,
  type Note,
  type NoteStatus,
  type Edit,
  type ItineraryMeta,
  type Group,
  type Mark,
  type MarkValue,
  type Phase,
} from "./model/qaMark";
export { QaProbe } from "./ui/QaProbe";
export { QaBoard } from "./ui/QaBoard";
export {
  QA_AUTH_COOKIE,
  QA_FLAG_COOKIE,
  isSensitiveField,
  type QaEventInput,
} from "./model/qaEvent";
