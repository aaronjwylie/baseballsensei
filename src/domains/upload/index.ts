/**
 * The upload domain — getting the customer's files to us.
 *
 * Owns the allowlist of what may be sent, the gate deciding whether this browser
 * may send it, and the two ways bytes arrive (straight to Blob in prod, through
 * our own route in dev). It does **not** send email: with payment now last, the
 * one customer confirmation is the receipt, and that belongs to payment.
 *
 * Server-only: the barrel re-exports database code. A client component imports
 * `model/fileTypes` directly — that module has no server imports for exactly
 * this reason.
 */
export {
  registerUpload,
  storeUploadedFile,
  isUnderOurStore,
  type RegisterResult,
} from "./api/uploadApi";
export {
  runRetentionSweep,
  sweepAbandoned,
  type SweepReport,
} from "./api/retentionSweep";
export { discardUnpaidSubmission } from "./api/discardSubmission";
export {
  authorizeUpload,
  checkFile,
  type UploadDecision,
  type UploadPermit,
  type UploadRefusal,
} from "./api/uploadPolicy";
export {
  ACCEPT_ATTRIBUTE,
  ALLOWED_MIME_TYPES,
  ALLOWED_TYPES,
  describeAllowedTypes,
  extensionOf,
  isAllowedFilename,
  resolveContentType,
} from "./model/fileTypes";
export { UploadPanel } from "./ui/UploadPanel";

