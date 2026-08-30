/**
 * Which kinds an operator is, and changing them.
 *
 * The single `operator.role` column is vestigial as of 2026-08-07; these grants
 * are the record. Everything that used to ask *what role is this person* now
 * asks *which roles do they hold*, and gets a set.
 *
 * ## A set, not a rank
 *
 * Holding `admin` does not imply holding `coach`. They are independent
 * memberships, and nothing here treats one as containing another — an admin who
 * has not been made a coach cannot be assigned a submission, which is correct:
 * running the platform and reviewing footage are different jobs that happen to
 * be done by the same person here.
 *
 * The one place order matters is **which portal you land in**, and that lives
 * with the portal chooser rather than here, because it is a UI preference
 * rather than a fact about the grants.
 */
import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/shared/db";
import { operatorRoleGrantTable } from "../model/operatorRoleGrantTable";
import type { Focus } from "@/domains/submission";
import { operatorTable } from "../model/operatorTable";
import type { Role } from "../model/operatorRoleEnum";

/**
 * Can this operator actually act as an admin right now?
 *
 * "Eligible admin" is the pair the login path enforces: the account may sign in
 * (`operator.isActive`) **and** holds an active `admin` grant. Either half off
 * and they can't reach `/admin`. Used to keep the platform from being locked out
 * of its own admin portal — see [[last-admin-guard]].
 */
export async function isEligibleAdmin(operatorId: string): Promise<boolean> {
  const rows = await db
    .select({ id: operatorTable.id })
    .from(operatorTable)
    .innerJoin(
      operatorRoleGrantTable,
      eq(operatorRoleGrantTable.operatorId, operatorTable.id),
    )
    .where(
      and(
        eq(operatorTable.id, operatorId),
        eq(operatorTable.isActive, true),
        eq(operatorRoleGrantTable.role, "admin"),
        eq(operatorRoleGrantTable.isActive, true),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** Does an eligible admin *other than* this operator exist? The question a
 * change that would strip the last admin has to answer "yes" before it runs. */
export async function otherActiveAdminExists(
  excludeOperatorId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: operatorTable.id })
    .from(operatorTable)
    .innerJoin(
      operatorRoleGrantTable,
      eq(operatorRoleGrantTable.operatorId, operatorTable.id),
    )
    .where(
      and(
        ne(operatorTable.id, excludeOperatorId),
        eq(operatorTable.isActive, true),
        eq(operatorRoleGrantTable.role, "admin"),
        eq(operatorRoleGrantTable.isActive, true),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** One membership: the kind, and whether they are taking that work. */
/**
 * One role a person holds, **and everything that role carries**.
 *
 * Settings moved onto the grant on 2026-08-30. Before that a coach and a
 * translator shared one set of languages and specialties per person, so the two
 * could not disagree — and they are answers to different questions: a coach's
 * languages decide whether a submission needs translating at all, a
 * translator's decide which legs they can take.
 */
export interface RoleGrant {
  role: Role;
  isActive: boolean;
  languages: string[];
  specialties: Focus[];
  /** Coach only, in practice — the public site shows no one else. */
  bio?: string;
  imageUrl?: string;
}

/** Every kind this operator is. Empty means onboarded but given nothing yet. */
export async function rolesFor(operatorId: string): Promise<Role[]> {
  return (await grantsFor(operatorId)).map((g) => g.role);
}

/** The same, with availability — what the toggles render from. */
export async function grantsFor(operatorId: string): Promise<RoleGrant[]> {
  const rows = await db
    .select()
    .from(operatorRoleGrantTable)
    .where(eq(operatorRoleGrantTable.operatorId, operatorId));
  return rows.map((r) => ({
    role: r.role,
    isActive: r.isActive,
    languages: r.languages,
    specialties: r.specialties,
    bio: r.bio ?? undefined,
    imageUrl: r.imageUrl ?? undefined,
  }));
}

/**
 * Set the kinds **and** their availability in one go.
 *
 * Availability is part of the same submit as membership because they are edited
 * together and a half-applied change is not a state worth being able to reach.
 * A role already held keeps its `grantedAt` and `grantedBy`; only `isActive`
 * moves, so re-saving does not restate when someone became a coach.
 */
export async function setGrants(
  operatorId: string,
  /**
   * Membership and availability only. Settings are edited per role by
   * `setRoleSettings` and are deliberately **not** touched here: this function
   * exists to say which roles someone holds, and a save of that question must
   * not blank the answers to a different one.
   */
  grants: { role: Role; isActive: boolean }[],
  grantedBy: string | null,
): Promise<void> {
  const wanted = new Map(grants.map((g) => [g.role, g.isActive]));
  const held = new Map((await grantsFor(operatorId)).map((g) => [g.role, g.isActive]));

  await db.transaction(async (tx) => {
    for (const [role, isActive] of wanted) {
      if (!held.has(role)) {
        await tx
          .insert(operatorRoleGrantTable)
          .values({ operatorId, role, isActive, grantedBy })
          .onConflictDoNothing();
      } else if (held.get(role) !== isActive) {
        await tx
          .update(operatorRoleGrantTable)
          .set({ isActive })
          .where(
            and(
              eq(operatorRoleGrantTable.operatorId, operatorId),
              eq(operatorRoleGrantTable.role, role),
            ),
          );
      }
    }
    for (const role of held.keys()) {
      if (wanted.has(role)) continue;
      await tx
        .delete(operatorRoleGrantTable)
        .where(
          and(
            eq(operatorRoleGrantTable.operatorId, operatorId),
            eq(operatorRoleGrantTable.role, role),
          ),
        );
    }
  });
}

/**
 * The same question for a page full of people — one query, not one per row.
 *
 * Returns an entry for **every** id asked about, empty array included, so a
 * caller never has to tell "no roles" from "not loaded".
 */
export async function rolesForMany(
  operatorIds: string[],
): Promise<Map<string, Role[]>> {
  const byId = await grantsForMany(operatorIds);
  return new Map([...byId].map(([id, gs]) => [id, gs.map((g) => g.role)]));
}

/** The same with availability — the Operators list renders from this. */
export async function grantsForMany(
  operatorIds: string[],
): Promise<Map<string, RoleGrant[]>> {
  const byId = new Map<string, RoleGrant[]>(operatorIds.map((id) => [id, []]));
  if (!operatorIds.length) return byId;

  const rows = await db
    .select()
    .from(operatorRoleGrantTable)
    .where(inArray(operatorRoleGrantTable.operatorId, operatorIds));
  for (const row of rows) {
    byId.get(row.operatorId)?.push({
      role: row.role,
      isActive: row.isActive,
      languages: row.languages,
      specialties: row.specialties,
      bio: row.bio ?? undefined,
      imageUrl: row.imageUrl ?? undefined,
    });
  }
  return byId;
}

/**
 * Make someone a kind of operator.
 *
 * Idempotent — granting a role twice is a no-op rather than an error, because
 * the caller is a toggle and a double-click is not a mistake worth surfacing.
 * `grantedBy` is recorded on the first grant and left alone afterwards, so the
 * row keeps saying who actually made the decision.
 */
export async function grantRole(
  operatorId: string,
  role: Role,
  grantedBy: string | null,
): Promise<void> {
  await db
    .insert(operatorRoleGrantTable)
    .values({ operatorId, role, grantedBy })
    .onConflictDoNothing();
}

/**
 * Take a kind away.
 *
 * The person and their profile survive — this removes a membership, not an
 * operator. Their history on submissions survives too: `submission_assignment`
 * points at the operator, not at the role, so revoking `coach` does not erase
 * the reviews they did.
 */
export async function revokeRole(operatorId: string, role: Role): Promise<void> {
  await db
    .delete(operatorRoleGrantTable)
    .where(
      and(
        eq(operatorRoleGrantTable.operatorId, operatorId),
        eq(operatorRoleGrantTable.role, role),
      ),
    );
}

/**
 * Set the kinds, leaving availability alone — the convenience over `setGrants`.
 *
 * A kind newly granted starts active; one already held keeps whatever it had.
 * There is one implementation, not two: this only decides what `isActive`
 * should be before handing over.
 */
export async function setRoles(
  operatorId: string,
  roles: Role[],
  grantedBy: string | null,
): Promise<void> {
  const held = new Map((await grantsFor(operatorId)).map((g) => [g.role, g.isActive]));
  await setGrants(
    operatorId,
    roles.map((role) => ({ role, isActive: held.get(role) ?? true })),
    grantedBy,
  );
}

/**
 * Is this operator that kind?
 *
 * The guard behind assignment and the portals, asked one operator at a time.
 */
export async function holdsRole(operatorId: string, role: Role): Promise<boolean> {
  const [row] = await db
    .select({ role: operatorRoleGrantTable.role })
    .from(operatorRoleGrantTable)
    .where(
      and(
        eq(operatorRoleGrantTable.operatorId, operatorId),
        eq(operatorRoleGrantTable.role, role),
      ),
    )
    .limit(1);
  return !!row;
}

/** Every operator id holding a kind — the join behind "list all coaches". */
export async function operatorIdsWithRole(role: Role): Promise<string[]> {
  const rows = await db
    .select({ operatorId: operatorRoleGrantTable.operatorId })
    .from(operatorRoleGrantTable)
    .innerJoin(
      operatorTable,
      eq(operatorTable.id, operatorRoleGrantTable.operatorId),
    )
    .where(eq(operatorRoleGrantTable.role, role));
  return rows.map((r) => r.operatorId);
}

/**
 * Edit one role's settings.
 *
 * Deliberately separate from `setGrants`, which says which roles someone holds.
 * Two questions, two saves: changing a coach's languages must not be able to
 * remove their translator role by omission, and a form that could do both would
 * make that possible.
 */
export async function setRoleSettings(
  operatorId: string,
  role: Role,
  values: {
    languages?: string[];
    specialties?: Focus[];
    bio?: string | null;
    imageUrl?: string | null;
  },
): Promise<void> {
  if (Object.keys(values).length === 0) return;
  await db
    .update(operatorRoleGrantTable)
    .set(values)
    .where(
      and(
        eq(operatorRoleGrantTable.operatorId, operatorId),
        eq(operatorRoleGrantTable.role, role),
      ),
    );
}

/** Availability for one role, on its own — the pause switch. */
export async function setGrantActive(
  operatorId: string,
  role: Role,
  isActive: boolean,
): Promise<void> {
  await db
    .update(operatorRoleGrantTable)
    .set({ isActive })
    .where(
      and(
        eq(operatorRoleGrantTable.operatorId, operatorId),
        eq(operatorRoleGrantTable.role, role),
      ),
    );
}
