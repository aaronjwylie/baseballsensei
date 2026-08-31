/**
 * The `operator` domain barrel — operator identity: who can log in, and the
 * guards that protect the portal.
 *
 * Server-only members (dal, userApi, auth actions) and the `LoginForm` client
 * component are both re-exported here for Server Component consumers. Client
 * components must import `LoginForm` — and only `LoginForm` — so they don't pull
 * the server-only db/bcrypt code; it imports the `login` action directly.
 */
export { getOperatorById, listAdminEmails } from "./api/operatorApi";
/*
  `credentialApi` is deliberately absent.

  Its four functions were all exported here and none of them was ever imported
  from outside this domain — `auth`, `coachApi` and `passwordResetApi` reach
  them relatively, as neighbours. Leaving them on the barrel published a
  password-setting function to the whole app on the strength of nobody having
  called it yet.
*/
export type { Operator } from "./model/operator";
export { CAN_BE_ASSIGNED } from "./model/operator";
export { ROLES, type Role } from "./model/operatorRoleEnum";

/*
  The coach surface, absorbed when `domains/coach` dissolved (ADR 018 §5). A
  coach is an operator with a profile, so its queries were reading this
  domain's tables from another folder — a dependency violation that only
  existed because `coach` used to own a table.
*/
export {
  listCoaches,
  getCoachByOperatorId,
  getCoach,
  createCoach,
  updateCoach,
  noteCoachCollected,
} from "./api/coachApi";
export { listTranslators, getTranslator } from "./api/translatorApi";
export {
  assignTranslatorAction,
  createTranslatorAction,
  updateTranslatorAction,
} from "./api/translatorActions";
export {
  createProfiledOperatorAction,
  updateProfiledOperatorAction,
  updateOperatorIdentityAction,
  type OperatorProfileFormState,
} from "./api/operatorProfileActions";
export {
  getAssignee,
  getOperatorProfile,
  listByRole,
  getByRole,
  listOperators,
  type OperatorListing,
} from "./api/operatorProfileApi";
export {
  createCoachAction,
  updateCoachAction,
  assignCoachAction,
  notifyCoachAction,
} from "./api/coachActions";
export { OperatorProfileForm } from "./ui/OperatorProfileForm";
export { OperatorRoleCard } from "./ui/OperatorRoleCard";
export { OperatorIdentityForm } from "./ui/OperatorIdentityForm";
export { DeleteOperatorButton } from "./ui/DeleteOperatorButton";
export {
  rolesFor,
  rolesForMany,
  grantRole,
  revokeRole,
  setRoles,
  setGrants,
  grantsFor,
  type RoleGrant,
  holdsRole,
} from "./api/operatorRoleApi";
export { saveRoleAction, type RoleCardState } from "./api/roleCardActions";
export { OperatorList } from "./ui/OperatorList";
export { AssignCoachSelect } from "./ui/AssignCoachSelect";
export { AssignTranslatorSelect } from "./ui/AssignTranslatorSelect";
export type { OperatorProfile, NewOperatorProfile } from "./model/operatorProfile";
export { directionsOf } from "./model/operatorProfile";
export type { OperatorProfilePatch } from "./api/operatorProfileApi";
