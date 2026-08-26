import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/shared/db";
import { operatorTable } from "@/domains/operator/model/operatorTable";
import { createOperator } from "@/domains/account/api/loginApi";
import { grantRole } from "@/domains/operator/api/operatorRoleApi";
import {
  listOperators,
  getOperatorProfile,
  updateProfiledOperator,
  createProfiledOperator,
} from "@/domains/operator/api/operatorProfileApi";

/**
 * Phase 3 layer 2 — the regressions that actually reached production this week.
 *
 * These need a real database because the bugs lived in the *queries*: an
 * inner-join dropped a profile-less admin from the roster and from the edit
 * page, and a save read an absent form field as "deactivate". Pure functions
 * can't see any of that. Runs against the CI Postgres in the `db` job; locally,
 * point DATABASE_URL at a migrated dev database.
 *
 * Data is created with unique emails and torn down after, so a repeat run — or a
 * run against a shared dev DB — leaves nothing behind.
 */
const stamp = `${process.hrtime.bigint()}`;
const adminEmail = `qa-admin-${stamp}@integration.test`;
const coachEmail = `qa-coach-${stamp}@integration.test`;
const created: string[] = [];

async function accountIsActive(id: string): Promise<boolean> {
  const [row] = await db
    .select({ isActive: operatorTable.isActive })
    .from(operatorTable)
    .where(eq(operatorTable.id, id))
    .limit(1);
  return !!row?.isActive;
}

beforeAll(async () => {
  // A pure admin — a login and an `admin` grant, and deliberately no profile.
  const admin = await createOperator(adminEmail, "password-123", "QA Admin");
  await grantRole(admin.id, "admin", null);
  created.push(admin.id);

  // A coach — the profiled path, to prove the left-join didn't break it.
  const coach = await createProfiledOperator("coach", {
    name: "QA Coach",
    email: coachEmail,
    password: "password-123",
    specialties: ["Hitting"],
    languages: ["English"],
  });
  created.push(coach.id);
});

afterAll(async () => {
  if (created.length) {
    await db.delete(operatorTable).where(inArray(operatorTable.id, created));
  }
  // Close the pool so the run exits instead of hanging on an open handle.
  await db.$client.end();
});

describe("a profile-less admin is visible and editable", () => {
  it("appears in the admin roster (the inner-join regression)", async () => {
    const admins = await listOperators("admin");
    expect(admins.some((o) => o.email === adminEmail)).toBe(true);
  });

  it("loads on the edit page instead of 404ing", async () => {
    const admin = await getOperatorProfile(created[0]);
    expect(admin).not.toBeNull();
    expect(admin?.email).toBe(adminEmail);
    // No profile row reads as empty fields, not a crash.
    expect(admin?.languages).toEqual([]);
    expect(admin?.specialties).toEqual([]);
  });

  it("saves without throwing, and does NOT deactivate the account", async () => {
    expect(await accountIsActive(created[0])).toBe(true);

    // A patch that omits `isActive` (as the edit form does) must leave the
    // account active — this is the contract the action's fix relies on, and the
    // opposite of it locked operators out.
    const updated = await updateProfiledOperator(created[0], "admin", {
      name: "QA Admin Renamed",
    });
    expect(updated.name).toBe("QA Admin Renamed");
    expect(await accountIsActive(created[0])).toBe(true);
  });
});

describe("the profiled (coach) path still works", () => {
  it("loads with its profile fields intact", async () => {
    const coach = await getOperatorProfile(created[1]);
    expect(coach?.email).toBe(coachEmail);
    expect(coach?.languages).toEqual(["English"]);
    expect(coach?.specialties).toEqual(["Hitting"]);
  });
});
