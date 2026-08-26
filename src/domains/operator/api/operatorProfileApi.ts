/**
 * The machinery shared by everyone who *does the work* — coaches and
 * translators alike.
 *
 * An operator with a profile row is someone the admin can hand a submission to.
 * The admin has no profile, which is what keeps them out of every list here.
 * Coach and translator differ by **role**, not by shape: same two rows, same
 * fields, same query. So the query lives once, here, and the two callers pass
 * their role.
 *
 * ## Why the role filter is explicit
 *
 * The join alone used to be the filter — an admin has no profile, so with two
 * roles "has a profile" and "is a coach" were the same set. **A translator
 * broke that.** They carry languages and specialties too, so `listCoaches()`
 * would have offered every translator in the coach dropdown.
 *
 * A shape that happens to filter correctly is not a filter; it is a coincidence
 * with a shelf life.
 */
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/shared/db";
import { operatorTable } from "../model/operatorTable";
import { operatorProfileTable } from "../model/operatorProfileTable";
import { operatorRoleGrantTable } from "../model/operatorRoleGrantTable";
import { grantsForMany, type RoleGrant } from "./operatorRoleApi";
import type { OperatorProfile, NewOperatorProfile } from "../model/operatorProfile";
import type { Role } from "../model/operatorRoleEnum";
import type { Focus } from "@/domains/submission";
import { setOperatorPassword } from "@/domains/account";
import { createOperator } from "@/domains/account";
import { grantRole } from "./operatorRoleApi";

/** The one place two rows become one `OperatorProfile`. */
export function toProfile(
  operator: typeof operatorTable.$inferSelect,
  /**
   * Null for an operator with no profile row — an **admin**, who does no work
   * and so carries none. Every field a profile would hold reads as empty.
   */
  profile: typeof operatorProfileTable.$inferSelect | null,
  /**
   * Availability **for the kind that was asked about**, off the grant — not
   * `operator.isActive`, which is whether they may sign in at all. A coach who
   * is taking submissions and a translator who is not are the same person.
   */
  isActive: boolean,
): OperatorProfile {
  return {
    id: operator.id,
    email: operator.email,
    name: operator.name,
    isActive,
    specialties: profile?.specialties ?? [],
    languages: profile?.languages ?? [],
    imageUrl: profile?.imageUrl ?? undefined,
    bio: profile?.bio ?? undefined,
  };
}

/**
 * The join, kept private to this file.
 *
 * It reads two tables at once, which is why coaches and translators cannot be
 * separate domains however tempting the folder split looks: a join needs both
 * tables in one query, and a domain reading another's tables is the rule
 * `domains/coach` was dissolved for breaking.
 */
function profileQuery() {
  return db
    .select()
    .from(operatorTable)
    .innerJoin(
      operatorProfileTable,
      eq(operatorProfileTable.operatorId, operatorTable.id),
    );
}

/** The same, joined to the grants — the caller supplies the condition. */
function grantedQuery() {
  return db
    .select()
    .from(operatorTable)
    .innerJoin(
      operatorProfileTable,
      eq(operatorProfileTable.operatorId, operatorTable.id),
    )
    .innerJoin(
      operatorRoleGrantTable,
      eq(operatorRoleGrantTable.operatorId, operatorTable.id),
    );
}

/**
 * The roster variant: grants filtered, profile **optional**.
 *
 * `grantedQuery` inner-joins the profile because assignment needs someone who
 * does the work. The admin roster does not: an admin holds a grant and no
 * profile, and a `leftJoin` is the difference between listing them and dropping
 * them silently — which is exactly what an inner join did to the first
 * profile-less admin.
 */
function grantedRosterQuery() {
  return db
    .select()
    .from(operatorTable)
    .leftJoin(
      operatorProfileTable,
      eq(operatorProfileTable.operatorId, operatorTable.id),
    )
    .innerJoin(
      operatorRoleGrantTable,
      eq(operatorRoleGrantTable.operatorId, operatorTable.id),
    );
}

/**
 * Everyone who can be **given** this kind of work right now.
 *
 * Active grants only — this is the assignment dropdown, and offering a paused
 * coach there would make pausing decorative. Distinct from `listByRole`, which
 * is the admin's roster and shows the paused too, because you cannot un-pause
 * somebody you cannot see.
 */
export async function listAssignable(role: Role): Promise<OperatorProfile[]> {
  const rows = await grantedQuery()
    .where(
      and(
        eq(operatorRoleGrantTable.role, role),
        eq(operatorRoleGrantTable.isActive, true),
      ),
    )
    .orderBy(asc(operatorTable.name));
  return rows.map((r) => toProfile(r.operator, r.operator_profile, true));
}

/** Everyone holding one role, paused included — the admin's roster. */
export async function listByRole(role: Role): Promise<OperatorProfile[]> {
  const rows = await grantedQuery()
    .where(eq(operatorRoleGrantTable.role, role))
    .orderBy(asc(operatorTable.name));
  return rows.map((r) =>
    toProfile(r.operator, r.operator_profile, r.operator_role_grant.isActive),
  );
}

/** One person, if they hold this role. Null if they don't — a coach id asked for as a translator is a miss, not a match. */
export async function getByRole(id: string, role: Role): Promise<OperatorProfile | null> {
  const [row] = await grantedQuery()
    .where(and(eq(operatorTable.id, id), eq(operatorRoleGrantTable.role, role)))
    .limit(1);
  return row
    ? toProfile(row.operator, row.operator_profile, row.operator_role_grant.isActive)
    : null;
}

/**
 * One operator by id, whatever they are — what the edit page loads.
 *
 * Deliberately not by role. Fetching by role was right when three lists meant
 * three kinds of person, and became wrong the moment one person could be
 * several: arriving from the admins tab must not hide that they are a coach.
 */
export async function getOperatorProfile(id: string): Promise<OperatorProfile | null> {
  const [row] = await profileQuery().where(eq(operatorTable.id, id)).limit(1);
  return row ? toProfile(row.operator, row.operator_profile, true) : null;
}

/**
 * One person with a profile, whatever their role.
 *
 * For the callers holding an id off `submission_assignment`, which stores who
 * owes a file without caring which kind of worker they are.
 */
export async function getAssignee(id: string): Promise<OperatorProfile | null> {
  const [row] = await profileQuery().where(eq(operatorTable.id, id)).limit(1);
  // No role in the question, so no per-kind availability to report.
  return row ? toProfile(row.operator, row.operator_profile, true) : null;
}

/**
 * Create someone who can be given work — a login **and** a profile.
 *
 * Lived in `coachApi.ts` until 2026-08-06, where it was the shared machinery
 * sitting inside one role's file: a translator needed the identical thing with
 * a different `role`, so `translatorApi` could only have been a wrapper around
 * a coach function. `_StructureLaw.md` §3b calls that the shape to refuse — the
 * third file, not the thin wrapper.
 *
 * **Not a transaction, deliberately.** `createOperator` may fail on a duplicate
 * email, which is the common case and must surface to the form as a caught
 * error; if it succeeds, the profile insert has nothing left to violate. A
 * transaction here would buy atomicity against a failure mode that does not
 * exist and cost the error message that does.
 */
export async function createProfiledOperator(
  role: Role,
  input: NewOperatorProfile,
  grantedBy?: string | null,
): Promise<OperatorProfile> {
  const operator = await createOperator(input.email, input.password, input.name);
  // The login exists; now say what kind of person it belongs to.
  await grantRole(operator.id, role, grantedBy ?? null);
  const [profile] = await db
    .insert(operatorProfileTable)
    .values({
      operatorId: operator.id,
      specialties: input.specialties,
      languages: input.languages,
      bio: input.bio,
    })
    .returning();
  const [row] = await db
    .select()
    .from(operatorTable)
    .where(eq(operatorTable.id, operator.id))
    .limit(1);
  return toProfile(row, profile, true);
}

/** What may be changed about someone, across both of their rows. */
export interface OperatorProfilePatch {
  name?: string;
  /** The login email, on the operator row. */
  email?: string;
  /** A new login password. Omit to leave it unchanged. */
  password?: string;
  /** Storage locator for their photo. */
  imageUrl?: string;
  /** Public bio blurb. */
  bio?: string;
  specialties?: Focus[];
  languages?: string[];
  isActive?: boolean;
}

/**
 * Patch someone, across both rows.
 *
 * Split by *which of the two facts* it changes: who they are (name, email,
 * whether they may sign in) against what they cover (languages, specialties,
 * and the public page). The caller says which role it expects back, so asking
 * for a coach by a translator's id is a miss rather than a surprise.
 */
export async function updateProfiledOperator(
  id: string,
  role: Role,
  patch: OperatorProfilePatch,
): Promise<OperatorProfile> {
  const { email, password, name, isActive, ...profile } = patch;

  const operatorPatch = {
    ...(email !== undefined ? { email: email.trim().toLowerCase() } : {}),
    ...(name !== undefined ? { name } : {}),
    ...(isActive !== undefined ? { isActive } : {}),
  };

  // A unique-constraint violation on the email surfaces to the action as a
  // caught error, which is why this is not wrapped here.
  if (Object.keys(operatorPatch).length) {
    await db.update(operatorTable).set(operatorPatch).where(eq(operatorTable.id, id));
  }
  if (Object.keys(profile).length) {
    await db
      .update(operatorProfileTable)
      .set(profile)
      .where(eq(operatorProfileTable.operatorId, id));
  }

  // An admin reset — no current-password check; the admin's authority is the guard.
  if (password) await setOperatorPassword(id, password);

  const updated = await getByRole(id, role);
  if (!updated) throw new Error(`${role} ${id} vanished mid-update`);
  return updated;
}

/**
 * One operator as the Operators page shows them — the person, plus every kind
 * they are and whether each is taking work.
 *
 * `isActive` on the base shape is per-*question*; this carries the whole set,
 * because a row on the unfiltered list has no single role to report about.
 */
export interface OperatorListing extends OperatorProfile {
  grants: RoleGrant[];
  /**
   * What this person is missing for a kind they hold.
   *
   * Onboarding an admin does not ask for specialties — an admin does not review
   * footage. Add `coach` to that same person later and the specialties nobody
   * asked for are suddenly load-bearing, with nothing prompting anyone. This is
   * that prompt, computed rather than stored so it cannot go stale.
   */
  missing: string[];
}

/**
 * The Operators list — everyone, or one kind.
 *
 * **The three tabs are filters over one list**, not three lists. A person
 * holding several kinds is one row on the unfiltered view and appears again
 * under each kind they hold; it is the same operator and the same profile
 * throughout.
 *
 * Two queries rather than one per row: the people, then their grants.
 */
export async function listOperators(role?: Role): Promise<OperatorListing[]> {
  const rows = role
    ? await grantedRosterQuery()
        .where(eq(operatorRoleGrantTable.role, role))
        .orderBy(asc(operatorTable.name))
    : await profileQuery().orderBy(asc(operatorTable.name));

  const seen = new Map<string, { operator: typeof operatorTable.$inferSelect; profile: typeof operatorProfileTable.$inferSelect | null }>();
  for (const r of rows) seen.set(r.operator.id, { operator: r.operator, profile: r.operator_profile });

  const byId = await grantsForMany([...seen.keys()]);

  return [...seen.values()].map(({ operator, profile }) => {
    const grants = byId.get(operator.id) ?? [];
    // Availability for the kind being asked about; true when asking about none.
    const forRole = role ? grants.find((g) => g.role === role)?.isActive : true;
    const base = toProfile(operator, profile, forRole ?? true);
    return { ...base, grants, missing: whatIsMissing(base, grants) };
  });
}

/**
 * What a kind needs that this person has not got.
 *
 * Deliberately not a boolean: the admin needs to know *which* field to go and
 * fill, and "incomplete" without saying what is a prompt to go hunting.
 */
function whatIsMissing(person: OperatorProfile, grants: RoleGrant[]): string[] {
  const holds = (role: Role) => grants.some((g) => g.role === role);
  // Only someone who does the work needs either field. An admin reviews nothing
  // and carries no profile, so an empty profile is complete for them, not
  // incomplete — flagging "languages" on an admin would be a gap they can't and
  // shouldn't fill.
  const doesWork = holds("coach") || holds("translator");
  const gaps: string[] = [];
  if (doesWork && !person.languages.length) gaps.push("languages");
  // Specialties are the coaching focuses. A translator needs them to know what
  // vocabulary a submission calls for; an admin does not review anything.
  if (doesWork && !person.specialties.length) gaps.push("specialties");
  return gaps;
}
