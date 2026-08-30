/**
 * The operator record — who exists, and which kinds they are.
 *
 * Everything about an operator **except their password**, which is not in this
 * domain at all — it lives in `account`, on its own table, behind its own
 * barrel. That started as a file boundary here and became a folder one, which
 * turns "no other file reads the stored hash" from a habit into a property you
 * can grep. A habit is what you lose first, when a function grows one
 * convenient extra field.
 *
 * Callers get an `Operator` — id, email, and every role they hold — never a
 * raw row.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/shared/db";
import { site } from "@/shared/config/site";
import { operatorTable } from "../model/operatorTable";
import { operatorRoleGrantTable } from "../model/operatorRoleGrantTable";
import { rolesFor } from "./operatorRoleApi";
import type { Operator } from "../model/operator";

/**
 * Where operator notifications go.
 *
 * Read from the table rather than an env var, deliberately: the people who
 * should hear about a payment or a stalled hand-off are exactly the people who
 * can log in and act on it, and a config value would let those two drift the
 * moment an operator changes. Distinct from `site.email` (the public address)
 * and `EMAIL_FROM` (who mail is sent *as*) — three jobs, three sources.
 *
 * Returns every admin, so a second one can be added by creating an operator
 * rather than by a deploy — **plus `site.email`**, the shared `contact@` inbox,
 * which is an admin recipient too: it's the address the team actually watches,
 * so every admin notification (and the contact form) copies it (Ben, QA 1.2.8).
 * Deduplicated and lowercased, so an admin who signs in *as* `contact@` isn't
 * mailed twice. Never empty — `site.email` is always in it — so the contact form
 * always has somewhere to land even before any operator exists.
 */
export async function listAdminEmails(): Promise<string[]> {
  const rows = await db
    .select({ email: operatorTable.email })
    .from(operatorTable)
    .innerJoin(
      operatorRoleGrantTable,
      eq(operatorRoleGrantTable.operatorId, operatorTable.id),
    )
    .where(
      and(
        eq(operatorRoleGrantTable.role, "admin"),
        // An admin who has muted their notifications drops out here (Ben, QA
        // 5.13.6.2). `site.email` is added unconditionally below, so muting every
        // admin still leaves the shared inbox on every notice.
        eq(operatorRoleGrantTable.notify, true),
      ),
    );
  const all = [...rows.map((row) => row.email), site.email];
  return [...new Set(all.map((email) => email.trim().toLowerCase()))];
}

/**
 * Look someone up by their login address.
 *
 * Callers that use this to decide whether to send something must resolve the
 * same way either way — see `requestPasswordReset`, which returns silently on a
 * miss so that the endpoint can't be used to test which addresses have logins.
 */
export async function findOperatorByEmail(
  email: string,
): Promise<Operator | null> {
  const rows = await db
    .select({
      id: operatorTable.id,
      email: operatorTable.email,
    })
    .from(operatorTable)
    .where(eq(operatorTable.email, email.trim().toLowerCase()))
    .limit(1);
  return rows[0] ? { ...rows[0], roles: await rolesFor(rows[0].id) } : null;
}

export async function getOperatorById(id: string): Promise<Operator | null> {
  const rows = await db
    .select({
      id: operatorTable.id,
      email: operatorTable.email,
    })
    .from(operatorTable)
    .where(eq(operatorTable.id, id))
    .limit(1);
  return rows[0] ? { ...rows[0], roles: await rolesFor(rows[0].id) } : null;
}
