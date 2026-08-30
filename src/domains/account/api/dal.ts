/**
 * The Data Access Layer for auth — the secure session check, done close to the
 * data (Next.js authentication guide). Pages and actions call these; the proxy
 * only does the optimistic cookie check.
 *
 * `getSession` is memoized per render pass so multiple components can call it
 * without re-verifying the token.
 */
import { cache } from "react";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/shared/db";
import { readSession } from "@/shared/auth";
import { HOME_FOR_ROLE, portalsFor, isOperatorSession } from "../model/session";
import type { OperatorSession } from "../model/session";
import { operatorTable } from "@/domains/operator/model/operatorTable";
import { operatorRoleGrantTable } from "@/domains/operator/model/operatorRoleGrantTable";
import type { Role } from "@/domains/operator/model/operatorRoleEnum";

/**
 * The operator's live authority, re-read from the database.
 *
 * Returns `null` once the account is gone or deactivated — the session is spent —
 * and otherwise the roles whose grant is still active (an empty array is a live
 * account authorised for nothing yet). Reached at the declaration plane, like
 * everything else `account` reads about an operator, so the dependency graph
 * stays one-way (`check:structure`).
 */
async function liveRolesFor(operatorId: string): Promise<Role[] | null> {
  const [operator] = await db
    .select({ isActive: operatorTable.isActive })
    .from(operatorTable)
    .where(eq(operatorTable.id, operatorId))
    .limit(1);
  if (!operator || !operator.isActive) return null;

  const grants = await db
    .select({ role: operatorRoleGrantTable.role })
    .from(operatorRoleGrantTable)
    .where(
      and(
        eq(operatorRoleGrantTable.operatorId, operatorId),
        eq(operatorRoleGrantTable.isActive, true),
      ),
    );
  return grants.map((g) => g.role);
}

/** The verified session, or null if unauthenticated. */
export const getSession = cache(async (): Promise<OperatorSession | null> => {
  const session = await readSession<unknown>();
  // Shape-checked, not just signature-checked — see `isOperatorSession`.
  if (!isOperatorSession(session)) return null;

  /*
    Re-validate against the database, not just the signed cookie.

    The session is a seven-day token with its roles baked in at login. Trusting
    that alone means deactivating an operator, or revoking a role, doesn't take
    hold until the token expires — up to a week in which a removed coach still
    downloads assigned files (a minor's video among them) and delivers feedback.
    `liveRolesFor` re-reads the account each request: null once it's gone or
    suspended (the session is spent), otherwise the roles still granted, which
    *replace* the token's baked-in set so every `requireRole` below decides on
    current truth rather than a login-time snapshot. Memoized per render, so it's
    one read a request however many components ask.
  */
  const roles = await liveRolesFor(session.operatorId);
  if (roles === null) return null;
  return { ...session, roles };
});

/** Require any operator; redirect to /login if not signed in. */
export async function requireSession(): Promise<OperatorSession> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/**
 * Require **any one** of the given kinds.
 *
 * An operator holding several passes if any of them is allowed — the question
 * is *may this person be here*, and holding an extra kind has never been a
 * reason to say no.
 *
 * Someone signed in but not permitted is sent to a portal they *do* hold rather
 * than to `/login`: they are authenticated, just in the wrong place. If they
 * hold more than one, the chooser decides — which is why this redirects there
 * rather than guessing.
 */
export async function requireRole(...allowed: Role[]): Promise<OperatorSession> {
  const session = await requireSession();
  if (session.roles.some((role) => allowed.includes(role))) return session;

  const mine = portalsFor(session.roles);
  redirect(mine.length === 1 ? HOME_FOR_ROLE[mine[0]] : "/portal");
}
