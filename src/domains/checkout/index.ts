/**
 * The checkout domain — the four-step path a customer walks from interest to a
 * paid submission.
 *
 * It owns the **sequence**, not the steps. Each panel lives with the domain that
 * owns its subject (player details with `submission`, the code with
 * `verification`, files with `upload`, the card with `payment`); this slice puts
 * them in order, decides where a returning customer resumes, and holds the verbs
 * that move between them.
 *
 * That's why it depends on four domains and nothing depends on it — it is the
 * composition root for the customer flow, the way `app/` is for a page.
 *
 * Server-only: the barrel re-exports database code. `app/start` imports
 * `ui/CheckoutFlow` directly, since that one is a client component.
 */
export { resolveFlowState, type FlowResumeState } from "./api/resumeFlow";
export {
  confirmPaymentAction,
  reportDeclineAction,
  createIntentAction,
  listFlowFilesAction,
  resendCodeAction,
  startSubmissionAction,
  verifyCodeAction,
  type ActionResult,
} from "./api/checkoutActions";
export {
  CHECKOUT_STEPS,
  TOTAL_STEPS,
  stepLabel,
  stepNumber,
  type CheckoutStep,
} from "./model/steps";
export { confirmPaymentForFlow } from "./api/confirmPayment";
export { CheckoutFlow } from "./ui/CheckoutFlow";
