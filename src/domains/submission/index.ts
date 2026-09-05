/**
 * The submission domain — one customer's request for video feedback.
 *
 * The noun every other domain orbits: the flow opens one, verification unlocks
 * it, upload attaches files to it, payment pays for it, feedback completes it.
 * This slice imports none of them.
 *
 * Server-only: the barrel re-exports database code, so a client component
 * imports `model/…` directly rather than from here (structure.md §3b).
 */
export {
  FOCUS_OPTIONS,
  PAID_STATUSES,
  SUBMISSION_STATUSES,
  TRANSLATION_RUNGS,
  RUNG_LABEL,
  numberedRungLabel,
  hasResponse,
  openTranslationLeg,
  type TranslationLegSide,
  isPaid,
  isReleased,
  deletionDueAt,
  daysUntil,
  isWithCoach,
  type AppWrittenStatus,
  type Focus,
  type NewSubmission,
  type Submission,
  type SubmissionPatch,
  type SubmissionStatus,
  whoseCourt,
  type Court,
  LANGUAGES,
  needsTranslation,
  requiredDirection,
  coversDirection,
  describeDirection,
  type Direction,
  type Language,
} from "./model/submission";

export {
  STAGE_CHAIN,
  describeStage,
  type ChainAction,
  type ChainLine,
  type ChainState,
  type ProgressFacts,
} from "./model/stageChain";

export {
  FILE_KINDS,
  INTAKE_KINDS,
  FEEDBACK_KINDS,
  formatFileSize,
  isAvailable,
  isIntake,
  isFeedback,
  type FileKind,
  type NewSubmissionFile,
  type SubmissionFile,
  FILE_SETS,
  availableSets,
  filesAsSent,
  FILE_SET_LABEL,
  kindsForSet,
  type FileSet,
} from "./model/submissionFile";

export { hasReached, undoneByReset } from "./model/submissionReset";

export {
  toPublicSubmission,
  type PublicSubmission,
} from "./model/publicSubmission";

export {
  customerEmailSchema,
  lookupSchema,
  parseLookupInput,
  parseSubmissionInput,
  submissionInputSchema,
  type LookupInput,
  type ParseResult,
  type SubmissionInput,
  type SubmissionInputDraft,
} from "./model/submissionInput";

export {
  archiveSubmission,
  assignSubmissionCoach,
  createSubmission,
  deleteSubmission,
  findByCoach,
  legsForTranslator,
  findByCustomerEmail,
  findByStripePaymentId,
  findAbandonedDue,
  findArchivedOwedDue,
  findResolvedDue,
  getSubmission,
  isAssignedToSubmission,
  listSubmissions,
  lookupPublicSubmissions,
  markCoachCollected,
  markPaidIfUnpaid,
  markTranslatorCollected,
  assignSubmissionTranslator,
  markCustomerCollected,
  markSubmissionSentToCoach,
  releaseAndRequeue,
  unarchiveSubmission,
  updateSubmission,
  findWarningDue,
} from "./api/submissionApi";

export {
  addSubmissionFile,
  addIntakeFileWithinLimit,
  clearFileLocators,
  countSubmissionFiles,
  deleteSubmissionFile,
  getSubmissionFile,
  listFeedbackFiles,
  listFeedbackFilesForSubmissions,
  listFilesForSubmissions,
  listSubmissionFiles,
  listFilesByFolder,
  listFoldersForSubmissions,
  listFilesByKinds,
  clearFileLocator,
  clearAllFileLocators,
  listAllSubmissionFiles,
} from "./api/submissionFileApi";

export { signStatusToken, verifyStatusToken } from "./api/statusToken";

export {
  listProgressFacts,
  listSubmissionEvents,
  listEventsForSubmissions,
  noteEmailSent,
  noteVerification,
  recordSubmissionEvent,
  type SubmissionEvent,
  bounceOf,
  noteEmailOutcome,
  type BounceKind,
  DECLINE_EMAIL_LABEL,
  declineEmailedFor,
} from "./api/submissionEventApi";

export {
  SUBMISSION_EVENT_KINDS,
  EMAIL_OUTCOMES,
  type SubmissionEventKind,
  type EmailOutcome,
} from "./model/submissionEvent";

export {
  FLOW_MAX_AGE_S,
  clearFlowSession,
  readFlowSession,
  setFlowSession,
  touchFlowSession,
} from "./api/flowSession";

export { StatusList } from "./ui/StatusList";

export { StatusLookup } from "./ui/StatusLookup";
export { SubmissionFileList } from "./ui/SubmissionFileList";

export {
  assignOperator,
  unassignOperator,
  releaseAssignments,
  listAssignments,
  assigneeFor,
  isAssignedTo,
  assignmentsBySubmission,
  assignmentsFor,
  type Assignment,
} from "./api/submissionAssignmentApi";
export {
  languagesForChoice,
  readLanguageChoice,
  choiceForLanguages,
  LANGUAGE_CHOICES,
  type LanguageChoice,
} from "./model/submission";
