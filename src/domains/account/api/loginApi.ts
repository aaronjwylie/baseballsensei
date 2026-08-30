/**
 * The two acts that need a person **and** a secret: signing in, and minting a
 * login.
 *
 * They compose here because this domain can reach both — the credential is its
 * own, and the operator row is reached at the **declaration plane**, which is
 * how a table is reached uniformly whoever is asking (`_StructureLaw` §5.7).
 *
 * That is what keeps the graph one-way. Going through `operator`'s barrel
 * instead would make `account` depend on it, and `operator` already depends on
 * this — for `requireRole`, and for the password it sets when an admin adds a
 * coach.
 */
import { createCredential, verifyPassword } from "./credentialApi";
import { and, eq } from "drizzle-orm";
import { db } from "@/shared/db";
import { operatorTable } from "@/domains/operator/model/operatorTable";
import { operatorRoleGrantTable } from "@/domains/operator/model/operatorRoleGrantTable";

import type { Role } from "@/domains/operator/model/operatorRoleEnum";

/**
 * Who just authenticated — **this domain's own shape, not `operator`'s.**
 *
 * It is the same three fields as an `Operator`, and importing that type is what
 * `check:structure` caught: it would have made `account` depend on `operator`,
 * which already depends on this, and closed a cycle nothing else would have
 * seen.
 *
 * They are not the same concept anyway. `Operator` is the record — the row an
 * admin edits. This is the answer to *did this secret belong to somebody*, and
 * the two happening to line up today is not a reason to bind them together.
 */
export interface Authenticated {
  id: string;
  email: string;
  /** Every kind they hold — see `operator_role_grant`. */
  roles: Role[];
}

/**
 * Verify an email + password.
 *
 * Returns the operator, or null if **either** is wrong — deliberately one
 * answer for both, so a caller cannot turn this into a test for which addresses
 * have logins.
 */
export async function verifyCredentials(
  email: string,
  password: string,
): Promise<Authenticated | null> {
  const [operator] = await db
    .select({
      id: operatorTable.id,
      email: operatorTable.email,
      isActive: operatorTable.isActive,
    })
    .from(operatorTable)
    .where(eq(operatorTable.email, email.trim().toLowerCase()))
    .limit(1);
  if (!operator) return null;
  if (!(await verifyPassword(operator.id, password))) return null;

  /*
    A suspended account cannot sign in — and until 2026-08-07 it could.
    `operator.isActive` was shown in the portal and edited on the form and read
    by nothing at all, so "Inactive" was a label the software did not honour.
    Same answer as a wrong password, so the flag cannot be probed.
  */
  if (!operator.isActive) return null;

  /*
    The grants, read at the declaration plane like the operator row above.

    Only *active* grants become session roles: a paused grant authorises nothing,
    so baking it into the token would let the optimistic proxy wave through a
    route the DAL then refuses. (The DAL re-derives active roles each request too,
    so a pause mid-session takes hold on the next one either way.)

    Someone with a login and no active grants can still authenticate and enter
    nothing — the right answer for an operator onboarded but not yet given a kind,
    rather than an error the person cannot act on.
  */
  const grants = await db
    .select({ role: operatorRoleGrantTable.role })
    .from(operatorRoleGrantTable)
    .where(
      and(
        eq(operatorRoleGrantTable.operatorId, operator.id),
        eq(operatorRoleGrantTable.isActive, true),
      ),
    );

  return { id: operator.id, email: operator.email, roles: grants.map((g) => g.role) };
}

/**
 * Mint a login: the operator row, then the credential.
 *
 * Two rows, two domains, in that order — the credential references the
 * operator, so it cannot exist first. A failure between them leaves an operator
 * who cannot sign in, which is a **recoverable and visible** state (the admin
 * sets a password) rather than a credential pointing at nobody.
 */
export async function createOperator(
  email: string,
  password: string,
  name: string,
): Promise<Authenticated> {
  const [row] = await db
    .insert(operatorTable)
    .values({ email: email.trim().toLowerCase(), name })
    .returning({ id: operatorTable.id, email: operatorTable.email });
  await createCredential(row.id, password);

  /*
    No kinds yet, deliberately. Creating a login and deciding what someone is
    are separate acts on separate tables, and the caller in `operator` grants
    the roles — which is also what keeps this domain from having to know what a
    coach is.
  */
  return { ...row, roles: [] };
}
