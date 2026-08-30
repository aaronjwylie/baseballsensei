/**
 * `account` — the ability to sign in.
 *
 * An operator is a person in the business; an account is a capability granted
 * to them. This domain owns the second: one table, `operator_credential`, and
 * the operations on a secret.
 *
 * **Everything here is keyed by an operator id.** It does not know what an email
 * is or what a role is, which is what keeps the graph acyclic — `operator`
 * imports this, never the reverse.
 */
export {
  verifyPassword,
  createCredential,
  changePassword,
  setOperatorPassword,
  passwordFingerprint,
} from "./api/credentialApi";
export {
  HOME_FOR_ROLE,
  PORTAL_ORDER,
  portalsFor,
  type OperatorSession,
  type LoginState,
  type ChangePasswordState,
} from "./model/session";
export { getSession, requireSession, requireRole } from "./api/dal";
export { login, logout, changePasswordAction } from "./api/auth";
export { verifyCredentials, createOperator } from "./api/loginApi";
export { LoginForm } from "./ui/LoginForm";
export { ChangePasswordForm } from "./ui/ChangePasswordForm";
export {
  requestPasswordReset,
  resetPasswordWithToken,
  isResetTokenValid,
  type ResetOutcome,
} from "./api/passwordResetApi";
export { requestResetAction, resetPasswordAction } from "./api/passwordResetActions";
export { RequestResetForm } from "./ui/RequestResetForm";
export { ResetPasswordForm } from "./ui/ResetPasswordForm";

/*
  The forms that remain in `operator` are the ones that need a session or a
  role — the change-password form, and login. Those are operator facts. What
  moved here is the flow that only ever needed an email and a secret.

  Every password *form* needs something this domain refuses to know: the change
  form needs a session, the reset request needs an email. Their actions
  therefore live in `operator`, and a form belongs with its action. Put them
  here and `account` would import `operator`, which is the cycle this whole
  arrangement exists to avoid.

  What left `operator` is the thing that mattered: the hash, and bcrypt.
*/
