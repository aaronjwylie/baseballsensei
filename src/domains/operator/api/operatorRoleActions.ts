"use server";
/**
 * Changing which kinds someone is. Admin-only.
 *
 * The guard is re-checked here rather than trusted from the UI — a Server
 * Action is a public endpoint with a nice-looking call site, and this one grants
 * privileges.
 */
import { requireRole } from "@/domains/account";
import { revalidateOperatorPages } from "./operatorPages";
import { ROLES, type Role } from "../model/operatorRoleEnum";
import {
  grantsFor,
  isEligibleAdmin,
  otherActiveAdminExists,
  setGrants,
  type RoleGrant,
} from "./operatorRoleApi";

const isRole = (value: string): value is Role =>
  (ROLES as readonly string[]).includes(value);

/**
 * What the form gets back.
 *
 * On success it carries the grants **as they now stand, read back from the
 * database after the write** — not a promise that the write happened. The form
 * used to learn the new state by re-reading its server prop after
 * `router.refresh()`, which put a cache between the write and the thing
 * displaying it; the write was correct and the screen still showed the old
 * roles (QA 4.7). An answer that comes back with the write cannot be stale.
 */
export type SetRolesState =
  | { error: string; grants?: undefined }
  | { error?: undefined; grants: RoleGrant[] }
  | undefined;

export async function setRolesAction(
  formData: FormData,
): Promise<SetRolesState> {
  const session = await requireRole("admin");

  const operatorId = String(formData.get("operatorId") ?? "");
  if (!operatorId) return { error: "No operator was named — reload and try again." };

  /*
    Two fields, read the way HTML checkboxes actually behave.

    `held` names every role whose box is ticked; `available` names the subset
    still taking work. An unticked checkbox submits nothing at all, so absence
    is the signal — there is no third state to represent and none to get wrong.

    Availability is intersected with what is held rather than trusted on its
    own: the availability box for a role nobody holds is meaningless, and
    dropping it here means the server cannot be talked into "paused but not
    held" by a hand-made request.

    Unknown values are dropped rather than rejected. The form only ever submits
    the three, so anything else arrived by hand, and ignoring it is safer than
    trusting it into a `Role` cast.
  */
  const held = formData.getAll("held").map(String).filter(isRole);
  const available = new Set(formData.getAll("available").map(String).filter(isRole));
  const grants = held.map((role) => ({
    role,
    // `admin` has no availability box — holding it is being it.
    isActive: role === "admin" ? true : available.has(role),
  }));

  /*
    Never strip the last admin. `admin` has no pause toggle, so it's an active
    admin exactly when it's held (`active` list). If this change removes it from
    someone who is currently the only eligible admin, refuse — a zero-admin
    state has no in-app recovery, only a DB re-seed. See [[last-admin-guard]].
  */
  const keepsAdmin = held.includes("admin");
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

  await setGrants(operatorId, grants, session.operatorId);

  revalidateOperatorPages();

  // Read back rather than echo the input: this is what is actually stored, so
  // the form shows the database rather than its own hopes.
  return { grants: await grantsFor(operatorId) };
}
