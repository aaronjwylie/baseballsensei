/**
 * The payment domain — paying for a review, as the last step of the flow.
 *
 * All verb: there is no Payment record of our own. Stripe holds the money and
 * the truth about it; what we persist is a submission carrying the payment's id.
 *
 * Server-only: the barrel re-exports database and Stripe code. The flow's client
 * components import `ui/` modules directly.
 */
export {
  createPaymentIntent,
  getSucceededPaymentIntent,
  getFailedPaymentIntent,
  type CreatedIntent,
} from "./api/paymentApi";
export {
  sendSubmissionReceipt,
  type ReceiptDetails,
} from "./api/paymentEmail";
export { completePayment } from "./api/paymentCompletion";
export { handleFailedPayment } from "./api/paymentCompletion";
export {
  HANDLED_STRIPE_EVENTS,
  handleStripeEvent,
  verifyStripeWebhook,
} from "./api/paymentWebhook";
export {
  markSubmissionPaid,
  submissionIdFromIntent,
  type PaidResult,
} from "./model/fulfillment";
