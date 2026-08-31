/**
 * Who owes what on a submission.
 *
 * An assignment is a **promise to produce a file** (ADR 018): a coach owes the
 * `feedback`, a translator owes an `intake_translation` or a
 * `feedback_translation`. Nobody is assigned to produce the `intake` — the
 * customer supplies that.
 *
 * ## This table is the only record — 2026-08-06
 *
 * `submission.assignedOperatorId` is **gone** (migration `0008`). It was kept as
 * a cache through the expand step so the thirteen read sites could be moved one
 * at a time; contracting it was the point of the exercise, not an afterthought.
 *
 * The column could not have survived translation anyway. It held one operator,
 * and a submission being translated owes three files to as many as three
 * people — so "the assigned operator" would have quietly come to mean "the
 * coach one", a column whose meaning depends on who is reading it.
 *
 * ## No trail row here, yet
 *
 * The northstar wants `assigned — {operatorId}` and `unassigned — {operatorId}`
 * in the trail, one row each, so "who has had this" survives a reassignment.
 * That is **not** the `assigned` rung — the ladder moving is a different fact,
 * and writing both put the rung in twice, which `npm run simulate` caught
 * immediately and nothing else would have.
 *
 * A proper assignment event needs a fourth `submission_event_kind` beside
 * `status`, `email` and `verification`. That is a migration and its own change,
 * so for now the status transition is the only row written.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db, type Db } from "@/shared/db";
import { noteAssignment } from "./submissionEventApi";
import { submissionAssignmentTable } from "../model/submissionAssignmentTable";
import { submissionTable } from "../model/submissionTable";
import type { FileKind } from "../model/submissionFile";
import type { Role } from "@/domains/operator/model/operatorRoleEnum";

/**
 * What each kind of operator is on the hook to produce — `ASSIGNEE_ROLE` read by
 * role rather than by file. Exhaustive over `Role` so adding a kind of operator
 * is a compile error here until someone says what, if anything, it owes. `admin`
 * owes no files.
 */
const PRODUCES_BY_ROLE: Record<Role, FileKind[]> = {
  admin: [],
  coach: ["feedback"],
  translator: ["intake_translation", "feedback_translation"],
};

export interface Assignment {
  operatorId: string;
  produces: FileKind;
  assignedAt: string;
}

/**
 * Give a piece of work to an operator, replacing whoever held it.
 *
 * Reassignment rather than refusal: the table allows one person per kind, and an
 * admin changing their mind is ordinary. The previous holder's row is deleted,
 * so this table only ever says who has it *now* — see the note above on the
 * trail row that will eventually preserve who had it before.
 */
export async function assignOperator(
  submissionId: string,
  operatorId: string,
  produces: FileKind,
): Promise<void> {
  await db.transaction(async (tx) => {
    // Who held it, read before the delete — a reassignment owes the trail two
    // rows, and after the delete there is nothing left to name the first one.
    const previous = await assigneeFor(submissionId, produces, tx);

    await tx
      .delete(submissionAssignmentTable)
      .where(
        and(
          eq(submissionAssignmentTable.submissionId, submissionId),
          eq(submissionAssignmentTable.produces, produces),
        ),
      );
    await tx
      .insert(submissionAssignmentTable)
      .values({ submissionId, operatorId, produces });

    if (previous && previous !== operatorId) {
      await noteAssignment(submissionId, previous, produces, false, tx);
    }
    if (previous !== operatorId) {
      await noteAssignment(submissionId, operatorId, produces, true, tx);
    }

    // Assignment is a write on the submission too — the abandonment sweep
    // measures from `updatedAt`, and work landing on someone's desk is a sign
    // of life.
    await tx
      .update(submissionTable)
      .set({ updatedAt: new Date() })
      .where(eq(submissionTable.id, submissionId));
  });
}

/** Take it back. The person still exists; they are off this piece of work. */
export async function unassignOperator(
  submissionId: string,
  produces: FileKind,
): Promise<void> {
  await db.transaction(async (tx) => {
    const previous = await assigneeFor(submissionId, produces, tx);

    await tx
      .delete(submissionAssignmentTable)
      .where(
        and(
          eq(submissionAssignmentTable.submissionId, submissionId),
          eq(submissionAssignmentTable.produces, produces),
        ),
      );
    if (previous) {
      await noteAssignment(submissionId, previous, produces, false, tx);
    }

    await tx
      .update(submissionTable)
      .set({ updatedAt: new Date() })
      .where(eq(submissionTable.id, submissionId));
  });
}

/**
 * Take an operator off work they can no longer do — a role revoked, or the
 * account suspended.
 *
 * Their assignment rows are deleted (only the kinds owed by `forRoles`, or every
 * kind when it's omitted), each with an `unassigned` trail row, and the work
 * returns to the admin's queue to be reassigned like any other. The operator is
 * not deleted and their remaining roles are untouched; they simply owe nothing
 * *here* any more. "Who takes over" is the admin's call at reassignment, exactly
 * as on a first assignment — not a decision this has to make.
 *
 * Reassignment is where the guarantee behind the 7-day session lives on the data
 * side: once the row is gone, `isAssignedToSubmission` is false, so a removed
 * operator who kept another active role can't pull the files either.
 */
export async function releaseAssignments(
  operatorId: string,
  forRoles?: Role[],
): Promise<{ submissionId: string; produces: FileKind }[]> {
  const kinds = forRoles
    ? new Set(forRoles.flatMap((r) => PRODUCES_BY_ROLE[r]))
    : null; // null → every kind
  if (kinds && kinds.size === 0) return [];

  // What came loose, so a caller can put those submissions back on the rung
  // where the freed role is reassigned (QA 5.13.8.1) — see `releaseAndRequeue`.
  const released: { submissionId: string; produces: FileKind }[] = [];

  await db.transaction(async (tx) => {
    const rows = await tx
      .select({
        submissionId: submissionAssignmentTable.submissionId,
        produces: submissionAssignmentTable.produces,
      })
      .from(submissionAssignmentTable)
      .where(eq(submissionAssignmentTable.operatorId, operatorId));

    for (const row of rows) {
      if (kinds && !kinds.has(row.produces)) continue;

      await tx
        .delete(submissionAssignmentTable)
        .where(
          and(
            eq(submissionAssignmentTable.submissionId, row.submissionId),
            eq(submissionAssignmentTable.produces, row.produces),
            eq(submissionAssignmentTable.operatorId, operatorId),
          ),
        );
      await noteAssignment(row.submissionId, operatorId, row.produces, false, tx);
      await tx
        .update(submissionTable)
        .set({ updatedAt: new Date() })
        .where(eq(submissionTable.id, row.submissionId));
      released.push({ submissionId: row.submissionId, produces: row.produces });
    }
  });

  return released;
}

/** Everyone on this submission, and what each of them owes. */
export async function listAssignments(submissionId: string): Promise<Assignment[]> {
  const rows = await db
    .select()
    .from(submissionAssignmentTable)
    .where(eq(submissionAssignmentTable.submissionId, submissionId));
  return rows.map((r) => ({
    operatorId: r.operatorId,
    produces: r.produces,
    assignedAt: r.assignedAt.toISOString(),
  }));
}

/**
 * Is this operator the one who owes us this file?
 *
 * **The guard, in one place.** Five call sites asked it by hand against
 * the old scalar column — three upload routes, the feedback action,
 * and the coach's download. Five copies of a question is five chances for one of
 * them to keep matching a column that stopped meaning what it used to, which is
 * the failure this codebase has already had once.
 *
 * False when nobody is assigned, so a missing assignment can never read as a
 * pass.
 */
export async function isAssignedTo(
  submissionId: string,
  operatorId: string,
  produces: FileKind,
): Promise<boolean> {
  return (await assigneeFor(submissionId, produces)) === operatorId;
}

/**
 * Everyone owing anything across a set of submissions — the queue's read.
 *
 * One query for the whole page rather than one per row. The admin queue renders
 * every open submission, so the per-row version of this was the difference
 * between two round trips and forty.
 */
export async function assignmentsBySubmission(
  submissionIds: string[],
): Promise<Map<string, Partial<Record<FileKind, string>>>> {
  const byId = new Map<string, Partial<Record<FileKind, string>>>();
  if (!submissionIds.length) return byId;

  const rows = await db
    .select()
    .from(submissionAssignmentTable)
    .where(inArray(submissionAssignmentTable.submissionId, submissionIds));

  for (const row of rows) {
    const entry = byId.get(row.submissionId) ?? {};
    entry[row.produces] = row.operatorId;
    byId.set(row.submissionId, entry);
  }
  return byId;
}

/** Who owes us this particular file, if anyone. */
export async function assigneeFor(
  submissionId: string,
  produces: FileKind,
  tx: Db = db,
): Promise<string | null> {
  const [row] = await tx
    .select({ operatorId: submissionAssignmentTable.operatorId })
    .from(submissionAssignmentTable)
    .where(
      and(
        eq(submissionAssignmentTable.submissionId, submissionId),
        eq(submissionAssignmentTable.produces, produces),
      ),
    )
    .limit(1);
  return row?.operatorId ?? null;
}

/** What this operator currently owes, across every submission — their queue. */
export async function assignmentsFor(operatorId: string): Promise<Assignment[]> {
  const rows = await db
    .select()
    .from(submissionAssignmentTable)
    .where(eq(submissionAssignmentTable.operatorId, operatorId));
  return rows.map((r) => ({
    operatorId: r.operatorId,
    produces: r.produces,
    assignedAt: r.assignedAt.toISOString(),
  }));
}
