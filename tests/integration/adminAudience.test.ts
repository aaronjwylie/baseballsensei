import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * QA 1.2.22 — how every admin notice is addressed.
 *
 * One helper, because the rule was written out by hand in the contact form and
 * four other messages did not have it at all: ⑤ carried every admin's personal
 * address to the coach, and the coach's back to every admin.
 *
 * The shape is `contact@` in `to` and the people in `bcc`. Not secrecy — an
 * admin knows who the other admins are. It is that a `to` list travels: one
 * forward and the whole list goes with it, and nobody outside this group has
 * any use for it.
 */
const { db } = await import("@/shared/db");
const { operatorTable } = await import("@/domains/operator/model/operatorTable");
const { createOperator } = await import("@/domains/account/api/loginApi");
const { grantRole } = await import("@/domains/operator/api/operatorRoleApi");
const { operatorRoleGrantTable } = await import(
  "@/domains/operator/model/operatorRoleGrantTable"
);
const { and, eq } = await import("drizzle-orm");
const { adminAudience } = await import("@/domains/operator/api/operatorApi");
const { site } = await import("@/shared/config/site");
const { inArray } = await import("drizzle-orm");

const stamp = `${process.hrtime.bigint()}`;
const made: string[] = [];
const address = (n: string) => `qa-aud-${n}-${stamp}@integration.test`;

beforeAll(async () => {
  for (const n of ["one", "two"]) {
    const op = await createOperator(address(n), "password-123", `QA ${n}`);
    await grantRole(op.id, "admin", null);
    made.push(op.id);
  }
});

afterAll(async () => {
  if (made.length) await db.delete(operatorTable).where(inArray(operatorTable.id, made));
});

describe("adminAudience", () => {
  it("puts the shared inbox in `to` and the people in `bcc`", async () => {
    const { to, bcc } = await adminAudience();
    expect(to).toBe(site.email.toLowerCase());
    expect(bcc).toContain(address("one"));
    expect(bcc).toContain(address("two"));
    // The shared address is the identity, never also a hidden recipient.
    expect(bcc).not.toContain(site.email.toLowerCase());
  });

  /*
    ⑤'s case. A notice about your own work should not look like it was sent to
    somebody else, so the coach is addressed openly — and is not also bcc'd,
    which would deliver it twice.
  */
  it("addresses a second audience openly, and only once", async () => {
    const coach = "coach@example.test";
    const { to, bcc } = await adminAudience(coach);
    expect(to).toEqual([site.email.toLowerCase(), coach]);
    expect(bcc).not.toContain(coach);
    expect(bcc).toContain(address("one"));
  });

  it("keeps the record when an admin mutes their own copies", async () => {
    const mute = (notify: boolean) =>
      db
        .update(operatorRoleGrantTable)
        .set({ notify })
        .where(
          and(
            eq(operatorRoleGrantTable.operatorId, made[0]!),
            eq(operatorRoleGrantTable.role, "admin"),
          ),
        );
    await mute(false);
    const { to, bcc } = await adminAudience();
    expect(bcc).not.toContain(address("one"));
    expect(bcc).toContain(address("two"));
    expect(to).toBe(site.email.toLowerCase());
    await mute(true);
  });
});
