/**
 * The verification domain — proving a customer can read the email they typed.
 *
 * Depends on `submission` (it verifies one) and on nothing else. Nothing
 * depends on it except the flow's step 2 and the upload gate.
 *
 * Server-only: the barrel re-exports database code, so a client component
 * imports `model/verification` directly rather than from here.
 */
export {
  issueCode,
  isEmailVerified,
  verifyCode,
} from "./api/verificationApi";
export { sendVerificationCode } from "./api/verificationEmail";
export {
  CODE_LENGTH,
  CODE_TTL_MINUTES,
  MAX_ATTEMPTS,
  VERIFICATION_MESSAGES,
  codeSchema,
  verificationFailureMessage,
  type VerificationFailure,
  type VerificationResult,
} from "./model/verification";
