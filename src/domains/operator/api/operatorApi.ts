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
 * How to address the admins: **the shared inbox visibly, the people blind.**
 *
 * Every notice used to put all four admins in `to`, which gave nothing and
 * risked something. It gave nothing because an admin who wants to know who was
 * told can read the notify flags in the portal, where they are actually true —
 * a header is a stale copy of that at best. It risked something because a `to`
 * list travels: forward the mail once and every admin's personal address goes
 * with it, and ⑤ already carried them all to the coach (Ben, 2026-09-09).
 *
 * `site.email` takes the `to` slot, so there is always a real recipient and the
 * shared inbox stays the record. `alsoTo` is for the message with a second
 * audience — ⑤ tells the coach their work arrived as much as it tells us — and
 * that person is addressed openly, because a notice about your own work should
 * not look like it was sent to somebody else.
 *
 * Bcc is not secrecy here; it is that nobody outside this group has any use for
 * the list, and one forward is all it takes to hand it over.
 */
export interface AdminAudience {
  to: string | string[];
  /**
   * **Required, not optional.** A message addressed to more than one person is
   * a message that can expose a list, so the type refuses to describe one
   * without saying where the people went. `bcc: []` is a legitimate answer —
   * everyone muted — and it is an answer, which is the point.
   */
  bcc: string[];
}

export async function adminAudience(alsoTo?: string): Promise<AdminAudience> {
  const everyone = await listAdminEmails();
  const shared = site.email.trim().toLowerCase();
  const also = alsoTo?.trim().toLowerCase();
  return {
    to: also && also !== shared ? [shared, also] : shared,
    bcc: everyone.filter((address) => address !== shared && address !== also),
  };
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
