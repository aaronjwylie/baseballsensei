/**
 * The QA domain — temporary instrumentation for a manual test pass.
 *
 * Server-only barrel: it reaches the database. The probe is a client component
 * and imports `model/qaEvent` directly.
 *
 * Everything here is designed to be deleted. See `_QaDocumentation.md`.
 */
export { recordEvents, readEvents, clearEvents } from "./api/qaApi";
export { QaProbe } from "./ui/QaProbe";
export {
  QA_AUTH_COOKIE,
  QA_FLAG_COOKIE,
  isSensitiveField,
  type QaEventInput,
} from "./model/qaEvent";
