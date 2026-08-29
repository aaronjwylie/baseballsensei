"use server";
/**
 * Changing which kinds someone is. Admin-only.
 *
 * The guard is re-checked here rather than trusted from the UI — a Server
 * Action is a public endpoint with a nice-looking call site, and this one grants
 * privileges.
 */
import { revalidatePath } from "next/cache";
import { requireRole } from "@/domains/account";
import { releaseAssignments } from "@/domains/submission";
import { ROLES, type Role } from "../model/operatorRoleEnum";
import {
  isEligibleAdmin,
  otherActiveAdminExists,
  setGrants,
} from "./operatorRoleApi";

const isRole = (value: string): value is Role =>
  (ROLES as readonly string[]).includes(value);

export type SetRolesState = { error: string } | undefined;

export async function setRolesAction(
  formData: FormData,
): Promise<SetRolesState> {
  const session = await requireRole("admin");

  const operatorId = String(formData.get("operatorId") ?? "");
  if (!operatorId) return;

  /*
    Two fields, so holding and being available arrive together and are applied
    together — a half-saved change between "is a coach" and "is taking work" is
    not a state worth being able to reach.

    Unknown values are dropped rather than rejected. The form only ever submits
    the three, so anything else arrived by hand, and ignoring it is safer than
    trusting it into a `Role` cast.
  */
  const active = formData.getAll("active").map(String).filter(isRole);
  const paused = formData.getAll("paused").map(String).filter(isRole);
  const grants = [
    ...active.map((role) => ({ role, isActive: true })),
    ...paused.map((role) => ({ role, isActive: false })),
  ];

  /*
    Never strip the last admin. `admin` has no pause toggle, so it's an active
    admin exactly when it's held (`active` list). If this change removes it from
    someone who is currently the only eligible admin, refuse — a zero-admin
    state has no in-app recovery, only a DB re-seed. See [[last-admin-guard]].
  */
  const keepsAdmin = active.includes("admin");
  if (
    !keepsAdmin &&
    (await isEligibleAdmin(operatorId)) &&
    !(await otherActiveAdminExists(operatorId))
  ) {
    return {
      error:
        "This is the only active admin — grant admin to someone else before removing it, or the portal locks everyone out.",
    };
  }

  const revoked = await setGrants(operatorId, grants, session.operatorId);

  // A revoked role takes its holder off the work it owed — the submissions
  // return to the queue for the admin to reassign. Without this the assignment
  // outlives the role, and an operator who kept another role could still pull
  // the files (`isAssignedToSubmission` doesn't re-check the role).
  if (revoked.length) await releaseAssignments(operatorId, revoked);

  for (const kind of ["all", "admins", "coaches", "translators"]) {
    revalidatePath(`/admin/operators/${kind}`);
    revalidatePath(`/admin/operators/${kind}/${operatorId}`);
  }
}
