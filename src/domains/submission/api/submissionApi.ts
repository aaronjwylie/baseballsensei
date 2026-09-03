/**
 * Submission queries — everything the app does to the `submissionTable` table.
 *
 * Callers get a domain `Submission`; nobody outside this file (and its row
 * mapper) sees a Drizzle row or a column name. The customer's uploaded files
 * are a separate table with its own module, `submissionFileApi.ts`.
 */
import {
  and,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  notInArray,
  or,
} from "drizzle-orm";
import { db } from "@/shared/db";
import { submissionTable } from "../model/submissionTable";
import { submissionAssignmentTable } from "../model/submissionAssignmentTable";
import {
  SUBMISSION_STATUSES,
  isPaid,
  isReleased,
  type NewSubmission,
  type Submission,
  type SubmissionPatch,
  type SubmissionStatus,
} from "../model/submission";
import type { FileKind } from "../model/submissionFile";
import type { Role } from "@/domains/operator/model/operatorRoleEnum";
import {
  toPublicSubmission,
  type PublicSubmission,
} from "../model/publicSubmission";
import { fromRow } from "./submissionRow";
import {
  assignOperator,
  isAssignedTo,
  releaseAssignments,
} from "./submissionAssignmentApi";
import { recordSubmissionEvent } from "./submissionEventApi";

/**
 * Domain patch → Drizzle update values.
 *
 * Explicit rather than a spread because the domain carries ISO-string timestamps
 * while the columns are `Date`, and only set keys are included so a partial
 * update never nulls a column by accident.
 */
function toUpdateValues(
  patch: SubmissionPatch,
): Partial<typeof submissionTable.$inferInsert> {
  const v: Partial<typeof submissionTable.$inferInsert> = {};
  if (patch.customerEmail !== undefined) v.customerEmail = patch.customerEmail.trim().toLowerCase();
  if (patch.playerName !== undefined) v.playerName = patch.playerName;
  if (patch.playerAge !== undefined) v.playerAge = patch.playerAge;
  if (patch.focus !== undefined) v.focus = patch.focus;
  if (patch.customerNotes !== undefined) v.customerNotes = patch.customerNotes;
  if (patch.languages !== undefined) v.languages = patch.languages;
  if (patch.internalNotes !== undefined) v.internalNotes = patch.internalNotes;
  if (patch.status !== undefined) v.status = patch.status;
  if (patch.stripePaymentId !== undefined) v.stripePaymentId = patch.stripePaymentId;
  if (patch.stripeAmount !== undefined) v.stripeAmount = patch.stripeAmount;
  if (patch.feedbackUrl !== undefined) v.feedbackUrl = patch.feedbackUrl;
  if (patch.coachFileSet !== undefined) v.coachFileSet = patch.coachFileSet;
  if (patch.customerFileSet !== undefined) v.customerFileSet = patch.customerFileSet;
  if (patch.emailVerifiedAt !== undefined) v.emailVerifiedAt = new Date(patch.emailVerifiedAt);
  if (patch.paidAt !== undefined) v.paidAt = new Date(patch.paidAt);
  if (patch.completedAt !== undefined) v.completedAt = new Date(patch.completedAt);
  if (patch.filesPurgedAt !== undefined) v.filesPurgedAt = new Date(patch.filesPurgedAt);
  if (patch.feedbackEmailedAt !== undefined) {
    v.feedbackEmailedAt = new Date(patch.feedbackEmailedAt);
  }
  if (patch.collectedAt !== undefined) v.collectedAt = new Date(patch.collectedAt);
  if (patch.deletionWarnedAt !== undefined) {
    v.deletionWarnedAt = new Date(patch.deletionWarnedAt);
  }
  return v;
}

/**
 * Create a submission, and open its trail.
 *
 * The first rung is an event like any other: a history that begins at the second
 * transition can't answer "when did this start", which is the question most often
 * asked of a stalled submission.
 */
export async function createSubmission(
  input: NewSubmission,
): Promise<Submission> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(submissionTable)
      .values({
        customerEmail: input.customerEmail.trim().toLowerCase(),
        playerName: input.playerName,
        playerAge: input.playerAge,
        focus: input.focus,
        customerNotes: input.customerNotes,
        languages: input.languages ?? [],
        status: input.status ?? "draft",
        stripePaymentId: input.stripePaymentId,
        stripeAmount: input.stripeAmount,
      })
      .returning();

    await recordSubmissionEvent(row.id, row.status, undefined, tx);
    return fromRow(row);
  });
}

/**
 * The one write path — and therefore the one place a transition is stamped.
 *
 * Every status change in the app funnels through here, so the trail is written
 * *here* rather than at each caller. A caller that forgets to log would leave a
 * status nobody can account for, and there is no way to notice that later.
 *
 * The read-before-write costs one extra query, and only when the patch carries a
 * status. It buys the difference between "this transition happened" and "someone
 * asked for this status again" — a redelivered webhook, or a double-clicked
 * button, sets the same value and must not appear in the history as a second
 * event.
 *
 * Both statements share a transaction: `submissionTable.status` and its trail cannot
 * disagree, even if the process dies between them.
 *
 * `note` is carried for the operator overrides, which owe an explanation.
 */
export async function updateSubmission(
  id: string,
  patch: SubmissionPatch,
  note?: string,
): Promise<Submission> {
  return db.transaction(async (tx) => {
    const previous =
      patch.status === undefined
        ? undefined
        : (
            await tx
              .select({ status: submissionTable.status })
              .from(submissionTable)
              .where(eq(submissionTable.id, id))
              .limit(1)
          )[0]?.status;

    const [row] = await tx
      .update(submissionTable)
      .set({ ...toUpdateValues(patch), updatedAt: new Date() })
      .where(eq(submissionTable.id, id))
      .returning();

    if (patch.status !== undefined && patch.status !== previous) {
      await recordSubmissionEvent(id, patch.status, note, tx);
    }

    return fromRow(row);
  });
}

/** The rungs that mean "money has changed hands", derived from `isPaid` so the
 * list can't stop matching when the ladder grows — the same discipline
 * `RELEASED_STATUSES` uses. */
const PAID_STATUSES = SUBMISSION_STATUSES.filter((status) => isPaid({ status }));

/**
 * Flip a submission to `new` (paid) **only if it isn't already paid** — in one
 * atomic statement.
 *
 * This is the idempotency guard for fulfillment (ADR 003), and it has to be
 * race-proof: the Stripe webhook and the browser confirming its own intent can
 * arrive in the same instant. A read-then-write (`getSubmission` → `if paid` →
 * `update`) let both see an unpaid row and both flip it, so both sent a receipt.
 *
 * The conditional `UPDATE … WHERE status NOT IN (paid)` closes that: Postgres
 * takes a row lock, so the two updates serialise, and the second finds the row
 * already `new` and matches nothing. Exactly one caller gets a row back — the
 * one that owes the receipt (`justPaid: true`). The event is stamped inside the
 * same transaction, and only on the winning flip, so the trail never doubles.
 *
 * Returns `null` only when no such submission exists at all.
 */
export async function markPaidIfUnpaid(
  id: string,
  paid: { stripePaymentId: string; stripeAmount: number; paidAt: string },
): Promise<{ submission: Submission; justPaid: boolean } | null> {
  return db.transaction(async (tx) => {
    const [flipped] = await tx
      .update(submissionTable)
      .set({
        status: "new",
        stripePaymentId: paid.stripePaymentId,
        stripeAmount: paid.stripeAmount,
        paidAt: new Date(paid.paidAt),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(submissionTable.id, id),
          notInArray(submissionTable.status, PAID_STATUSES),
        ),
      )
      .returning();

    if (flipped) {
      await recordSubmissionEvent(id, "new", undefined, tx);
      return { submission: fromRow(flipped), justPaid: true };
    }

    // Nothing flipped: either already paid (the common race) or unknown. Read
    // the current row so the caller still has a submission to work with.
    const [current] = await tx
      .select()
      .from(submissionTable)
      .where(eq(submissionTable.id, id))
      .limit(1);
    return current ? { submission: fromRow(current), justPaid: false } : null;
  });
}

/**
 * Is this operator assigned to this submission, in any capacity?
 *
 * The ownership half of the `/api/files/[id]` gate: an operator session proves
 * they're staff, this proves the work is *theirs*. Admins bypass it (they
 * review everything); a coach or translator passes only for a submission they
 * were actually put on. Any `produces` role counts — a translator carrying the
 * intake leg still needs the intake bytes.
 */
export async function isAssignedToSubmission(
  submissionId: string,
  operatorId: string,
): Promise<boolean> {
  const rows = await db
    .select({ submissionId: submissionAssignmentTable.submissionId })
    .from(submissionAssignmentTable)
    .where(
      and(
        eq(submissionAssignmentTable.submissionId, submissionId),
        eq(submissionAssignmentTable.operatorId, operatorId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * Delete a submission outright. `submissionFileTable` rows cascade with it.
 *
 * Only for submissions that were never paid for — the guard lives in
 * `discardUnpaidSubmission`, which is the only thing that should call this.
 */
export async function deleteSubmission(id: string): Promise<void> {
  await db.delete(submissionTable).where(eq(submissionTable.id, id));
}

/** Assign a coach and move the submission to `assigned`. Admin action. */
/*
  Where a submission belongs when the role that owed a leg is taken off it — and
  the rungs during which that is still true (Ben, QA 5.13.8.1).

  Keyed by what the assignment *produces*. `target` is the rung the leg is
  (re)assigned from; `whileAt` is the span where the leg is still outstanding, so
  a person leaving mid-work sends it back but a person leaving after the leg is
  delivered, or once the submission has moved on to another role's phase, changes
  nothing — their departure must not undo finished work. `intake` files are
  produced by nobody, so it is absent and requeues to nothing.
*/
const REQUEUE: Partial<
  Record<
    FileKind,
    { target: SubmissionStatus; whileAt: SubmissionStatus[]; who: string }
  >
> = {
  feedback: {
    target: "new",
    whileAt: ["assigned", "sent_to_coach", "in_review"],
    who: "The coach",
  },
  intake_translation: {
    target: "assigned",
    whileAt: [
      "intake_translator_assigned",
      "sent_to_intake_translator",
      "intake_translating",
    ],
    who: "The intake translator",
  },
  feedback_translation: {
    target: "awaiting_approval",
    whileAt: [
      "feedback_translator_assigned",
      "sent_to_feedback_translator",
      "feedback_translating",
    ],
    who: "The feedback translator",
  },
};

/**
 * Put one freed submission back on the rung its now-vacant leg is assigned from —
 * but only while that leg is still outstanding.
 */
async function requeueAfterRelease(
  submissionId: string,
  produces: FileKind,
): Promise<void> {
  const rule = REQUEUE[produces];
  if (!rule) return;
  const submission = await getSubmission(submissionId);
  if (!submission || !rule.whileAt.includes(submission.status)) return;
  await updateSubmission(
    submissionId,
    { status: rule.target },
    `${rule.who} was unassigned — returned for reassignment`,
  );
}

/**
 * Release an operator's assignments **and** put the affected submissions back in
 * the assignment queue (Ben, QA 5.13.8.1).
 *
 * `releaseAssignments` only clears the join, which left a revoked or paused
 * coach's submission sitting in `in_review` with nobody in review. This is the
 * whole gesture the callers want: the files leave their hands, and the
 * submission drops back to where the next person is chosen. The requeue runs
 * after the release transaction because `updateSubmission` opens its own.
 */
export async function releaseAndRequeue(
  operatorId: string,
  forRoles?: Role[],
): Promise<void> {
  const released = await releaseAssignments(operatorId, forRoles);
  for (const { submissionId, produces } of released) {
    await requeueAfterRelease(submissionId, produces);
  }
}

export async function assignSubmissionCoach(
  submissionId: string,
  coachId: string,
): Promise<Submission> {
  // A coach owes the feedback — that is what an assignment names now (ADR 018).
  // `assignOperator` writes the join and its trail rows in one transaction; the
  // rung is recorded separately below, because the ladder moving and the work
  // landing on a named desk are different facts.
  await assignOperator(submissionId, coachId, "feedback");
  return updateSubmission(submissionId, { status: "assigned" });
}

/**
 * Hand the work to the coach: `assigned` → `sent_to_coach`. Admin action.
 *
 * **Not `in_review`.** The coach has been emailed, not started — and the gap
 * between those two is the one the admin needs to see, because it's the only place a
 * submission stalls on a person rather than on the system. `in_review` is now
 * earned by the coach actually collecting the files.
 */
export async function markSubmissionSentToCoach(
  id: string,
): Promise<Submission> {
  return updateSubmission(id, { status: "sent_to_coach" });
}

/**
 * The coach has the files — `sent_to_coach` → `in_review`.
 *
 * **Idempotent, and deliberately narrow.** Only a submission we actually sent
 * can be picked up; a re-download changes nothing, and an admin opening the same
 * file doesn't count as the coach starting work. Returns the submission when
 * this was the *first* collection, null otherwise, so the caller knows whether
 * to notify — the same `justPaid` shape the payment path uses, and for the same
 * reason: two callers race, one of them should send the email.
 */
export async function markCoachCollected(
  id: string,
): Promise<Submission | null> {
  const submission = await getSubmission(id);
  if (!submission || submission.status !== "sent_to_coach") return null;
  return updateSubmission(id, { status: "in_review" });
}

/**
 * Give a leg of the translation to a translator — the mirror of
 * `assignSubmissionCoach`.
 *
 * **Picking is its own rung**, because for a translator as for a coach it is a
 * separate act from sending: the admin chooses who, and sends when they are
 * ready. Collapsing the two would have made "chosen but not sent" invisible on
 * exactly one of the two roles, which is the asymmetry ADR 018 Q3 set out to
 * remove.
 *
 * The leg is named by the caller here, unlike `markTranslatorCollected` which
 * derives it — because at this point the submission is sitting on a rung that
 * precedes *both* legs' work, so where it is cannot say which one is meant.
 */
export async function assignSubmissionTranslator(
  submissionId: string,
  operatorId: string,
  leg: "intake_translation" | "feedback_translation",
): Promise<Submission> {
  await assignOperator(submissionId, operatorId, leg);
  return updateSubmission(submissionId, {
    status:
      leg === "intake_translation"
        ? "intake_translator_assigned"
        : "feedback_translator_assigned",
  });
}

/**
 * A translator has collected their side — `sent_to_*_translator` → `*_translating`.
 *
 * The translator's half of `markCoachCollected`, and it exists for the same
 * reason: a hand-off is the one place a submission stalls on a *person*, and
 * until this ran the queue could not tell "emailed to a translator yesterday"
 * from "the translator is halfway through". Both looked like `translating`.
 *
 * **Which leg is derived from where it already is**, not passed in. A caller
 * that had to say which leg would be a caller that could say the wrong one, and
 * the two legs are never both outstanding — the ladder is one path.
 *
 * Idempotent by the same trick as the others: it only moves a submission
 * sitting on the rung that precedes it, so a re-download is a no-op.
 */
export async function markTranslatorCollected(
  id: string,
  operatorId: string,
): Promise<Submission | null> {
  const submission = await getSubmission(id);
  if (!submission) return null;

  /*
    Which leg is this? Read from the rung the submission is on, not from the
    folder they opened — a translator collects the intake on the way out and the
    feedback on the way back, so the file's kind says nothing about whether this
    is a pick-up. Any other rung is not a collection at all.
  */
  const leg =
    submission.status === "sent_to_intake_translator"
      ? ({ produces: "intake_translation", next: "intake_translating" } as const)
      : submission.status === "sent_to_feedback_translator"
        ? ({ produces: "feedback_translation", next: "feedback_translating" } as const)
        : null;
  if (!leg) return null;

  /*
    **This translator's leg, not merely a translator's.** The download route can
    only see that *a* translator is signed in; someone opening a colleague's
    work must not close a hand-off they are not part of. The coach's
    `noteCoachCollected` has always checked this and this had not — an
    asymmetry, not a decision (Ben, 2026-08-31).
  */
  if (!(await isAssignedTo(id, operatorId, leg.produces))) return null;

  return updateSubmission(id, { status: leg.next });
}

/**
 * The customer has their feedback — `complete` → `collected`.
 *
 * **This is what starts the retention clock**, which is why it can only happen
 * once and only from `complete`. A customer who downloads again a week later
 * must not push the deletion date out, or nothing is ever swept.
 *
 * Returns the submission on the first collection, null afterwards.
 */
export async function markCustomerCollected(
  id: string,
): Promise<Submission | null> {
  const submission = await getSubmission(id);
  if (!submission || submission.status !== "complete") return null;
  return updateSubmission(id, {
    status: "collected",
    // The clock's anchor. Set with the status so the two can never disagree
    // about when the countdown began.
    collectedAt: new Date().toISOString(),
  });
}

/**
 * File a completed submission out of the active queue, or bring it back.
 *
 * `archivedAt` is its own dimension, not a status — the submission stays
 * `complete`; the timestamp just moves it to the Archived view. Direct writes
 * because a patch can't express "set back to null" (unarchive).
 */
export async function archiveSubmission(id: string): Promise<Submission> {
  const [row] = await db
    .update(submissionTable)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(submissionTable.id, id))
    .returning();
  return fromRow(row);
}

export async function unarchiveSubmission(id: string): Promise<Submission> {
  const [row] = await db
    .update(submissionTable)
    .set({ archivedAt: null, updatedAt: new Date() })
    .where(eq(submissionTable.id, id))
    .returning();
  return fromRow(row);
}

export async function getSubmission(id: string): Promise<Submission | null> {
  const [row] = await db
    .select()
    .from(submissionTable)
    .where(eq(submissionTable.id, id))
    .limit(1);
  return row ? fromRow(row) : null;
}

export async function findByStripePaymentId(
  paymentId: string,
): Promise<Submission | null> {
  const [row] = await db
    .select()
    .from(submissionTable)
    .where(eq(submissionTable.stripePaymentId, paymentId))
    .limit(1);
  return row ? fromRow(row) : null;
}

/**
 * A customer's submissions (their email is stored lowercased).
 *
 * `draft` rows are excluded: an abandoned first step is not something a customer
 * should see listed as a submission, and it carries no useful status.
 */
export async function findByCustomerEmail(
  email: string,
): Promise<Submission[]> {
  const rows = await db
    .select()
    .from(submissionTable)
    .where(eq(submissionTable.customerEmail, email.trim().toLowerCase()))
    .orderBy(desc(submissionTable.submittedAt));
  return rows.filter((row) => row.status !== "draft").map(fromRow);
}

/**
 * The queue, newest first — the admin portal's read.
 *
 * Drafts are left out. A row that never got past step 1 is noise in a work
 * queue, and the retention sweep will clear it.
 */
export async function listSubmissions(): Promise<Submission[]> {
  const rows = await db
    .select()
    .from(submissionTable)
    /*
      **Everything, including the scratch pads.**

      This filtered to paid submissions on the reasoning that an unfinished
      attempt isn't work. True, but it isn't the same as "not worth seeing": a
      row sitting at `draft` is someone filling in the form *right now*, and at
      this volume that's the most interesting thing on the page. Hiding it also
      made the queue silent during a QA run, which is when you least want it to
      be.

      They age out on their own — the abandonment sweep deletes them outright,
      row and files — so nothing accumulates. The queue's tabs separate them from
      the paid work rather than a query doing it invisibly.

      It was also a hardcoded list of five statuses, written when the ladder had
      seven rungs, which silently stopped matching when it grew to sixteen and
      hid everything from `sent_to_coach` onward. Whatever this returns should be
      derived or unfiltered — never a list someone has to remember to update.
    */
    .orderBy(desc(submissionTable.submittedAt));
  return rows.map(fromRow);
}

/**
 * Submissions assigned to one coach, newest first — the coach portal's read.
 *
 * An inner join against the assignment table rather than a column comparison.
 * It reads the same for a coach today and answers correctly for a translator
 * tomorrow, which the scalar column could not: it held one operator, and a
 * submission in translation has two or three.
 */
export async function findByCoach(coachId: string): Promise<Submission[]> {
  const rows = await db
    .select({ submission: submissionTable })
    .from(submissionTable)
    .innerJoin(
      submissionAssignmentTable,
      eq(submissionAssignmentTable.submissionId, submissionTable.id),
    )
    .where(
      and(
        eq(submissionAssignmentTable.operatorId, coachId),
        eq(submissionAssignmentTable.produces, "feedback"),
      ),
    )
    .orderBy(desc(submissionTable.submittedAt));
  return rows.map((r) => fromRow(r.submission));
}

/**
 * A translator's queue — **legs**, not submissions.
 *
 * The near-mirror of `findByCoach`, and the one place it deliberately differs:
 * a coach is joined on the single `feedback` kind and gets submissions back, so
 * one row per submission. A translator holds either translation kind and can
 * hold *both* on the same submission — the customer's files out, the coach's
 * response back — so the row carries `produces` and one submission may appear
 * twice. Collapsing to submissions here would silently drop one of a
 * translator's two jobs, and it would be the second one, weeks later.
 */
export async function legsForTranslator(
  operatorId: string,
): Promise<{ submission: Submission; produces: FileKind }[]> {
  const rows = await db
    .select({
      submission: submissionTable,
      produces: submissionAssignmentTable.produces,
    })
    .from(submissionTable)
    .innerJoin(
      submissionAssignmentTable,
      eq(submissionAssignmentTable.submissionId, submissionTable.id),
    )
    .where(
      and(
        eq(submissionAssignmentTable.operatorId, operatorId),
        inArray(submissionAssignmentTable.produces, [
          "intake_translation",
          "feedback_translation",
        ]),
      ),
    )
    .orderBy(desc(submissionTable.submittedAt));
  return rows.map((r) => ({
    submission: fromRow(r.submission),
    produces: r.produces,
  }));
}

/** The status-lookup read: a customer's submissions, trimmed to what's safe.
 * Feedback files are deliberately not exposed here — delivery rides on the
 * signed link in the customer's email, not on this email lookup. */
/**
 * A customer's submissions, sanitised for their own eyes.
 *
 * ⚠️ **Sensitive — call only behind proof of the inbox.** It carries a child's
 * first name, a focus and a date, keyed on an email address that is trivially
 * guessable. There used to be an open `POST /api/status` in front of this; it
 * was removed on 2026-08-01, because gating the *page* while leaving the
 * *endpoint* open would have been theatre.
 *
 * The two callers that may use it: the capability link (the link itself is the
 * proof) and the code-verified lookup.
 */
export async function lookupPublicSubmissions(
  email: string,
  /** Passed through so each card can count down to its own deletion date. */
  retention?: { collectedDays: number; deliveredDays: number },
): Promise<PublicSubmission[]> {
  const submissionsForEmail = await findByCustomerEmail(email);
  // Not `.map(toPublicSubmission)` — `map` hands the index as the second
  // argument, which would arrive where `retention` is expected.
  return submissionsForEmail.map((s) => toPublicSubmission(s, retention));
}

/**
 * Completed submissions whose uploads are due for deletion.
 *
 * The customer has their feedback and the coach is done, so the *files* go while
 * the *record* stays — the receipt and the portal still need to say what was
 * sent. `filesPurgedAt` excludes rows already handled, so the sweep is
 * idempotent and a second run in the same window is a no-op.
 */
export async function findResolvedDue(
  collectedBefore: Date,
  deliveredBefore: Date,
  warnedBefore: Date | null = null,
): Promise<Submission[]> {
  const rows = await db
    .select()
    .from(submissionTable)
    .where(
      and(
        isNull(submissionTable.filesPurgedAt),
        inArray(submissionTable.status, RELEASED_STATUSES),
        /*
          Never purge something that wasn't warned, and wasn't warned long
          enough ago. When warnings are on the caller passes
          `warnedBefore = now - warnBeforeDeletionDays`, so a submission is
          deleted only once its warning has had the full notice period to land —
          which holds even when a cron gap makes warn and purge come due in the
          same run (the just-stamped warning is `now`, not `< warnedBefore`).
          A never-warned row (`deletionWarnedAt` null) is excluded outright, so
          the never-collected backstop can't delete files no one was told about.
        */
        ...(warnedBefore
          ? [
              isNotNull(submissionTable.deletionWarnedAt),
              lt(submissionTable.deletionWarnedAt, warnedBefore),
            ]
          : []),
        /*
          Two clocks, and the later one wins.

          Nothing is due until the delivery backstop has elapsed —
          `retainDeliveredDays` from delivery — and, for a submission the customer
          collected, until their own collection clock (`retainCollectedDays` from
          the fetch) has elapsed too. Requiring *both* is what "whichever is
          later" means: a customer who collects the day after delivery is still
          kept the full delivery window rather than deleted `retainCollectedDays`
          after they fetched it; one who collects on day 80 is kept past the
          backstop to their own clock; one who never collected rests on the
          backstop alone (`collectedAt` null passes the inner `or`).

          The earlier form checked *only* the collection clock once collected —
          "collected and old enough, OR never collected and delivered long enough
          ago" — which is not whichever-is-later at all: it deleted a prompt
          collector's paid feedback `retainDeliveredDays − retainCollectedDays`
          days early (≈60 on the defaults).
        */
        and(
          isNotNull(submissionTable.completedAt),
          lt(submissionTable.completedAt, deliveredBefore),
          or(
            isNull(submissionTable.collectedAt),
            lt(submissionTable.collectedAt, collectedBefore),
          ),
        ),
      ),
    );
  return rows.map(fromRow);
}

/**
 * Released submissions approaching deletion that haven't been warned yet.
 *
 * The one genuinely *scheduled* effect in the system. Everything else the sweep
 * does is derivable from state — "delete what's due" needs no memory — but "warn
 * a week out" is a one-off that must fire exactly once, which is what
 * `deletionWarnedAt` is for. Without it this would send every night for seven
 * nights.
 *
 * **Both clocks are warned, mirroring `findResolvedDue`.** A collected
 * submission is warned before its collection deadline; a never-collected one is
 * warned before the delivery backstop deletes it. The backstop used to be
 * silent — never-collected files were purged at `retainDeliveredDays` with no
 * warning ever sent, because this query required a collection timestamp. That
 * destroyed feedback a customer had paid for and never downloaded, with no
 * notice. Warning the backstop too is the fix: nothing is deleted unwarned.
 */
export async function findWarningDue(
  collectedBefore: Date,
  deliveredBefore: Date,
): Promise<Submission[]> {
  const rows = await db
    .select()
    .from(submissionTable)
    .where(
      and(
        isNull(submissionTable.filesPurgedAt),
        isNull(submissionTable.deletionWarnedAt),
        inArray(submissionTable.status, RELEASED_STATUSES),
        // Whichever clock is later — the same condition `findResolvedDue` purges
        // on, so a submission is warned before the deadline that will actually
        // delete it: the delivery backstop must have elapsed, and the collection
        // clock too if the customer ever collected.
        and(
          isNotNull(submissionTable.completedAt),
          lt(submissionTable.completedAt, deliveredBefore),
          or(
            isNull(submissionTable.collectedAt),
            lt(submissionTable.collectedAt, collectedBefore),
          ),
        ),
      ),
    );
  return rows.map(fromRow);
}

/**
 * The rungs a submission can be sitting on once it has reached the customer.
 *
 * Derived from the same `isReleased` predicate the rest of the app uses, rather
 * than listed here — a literal list is exactly what went stale when `collected`
 * was added, and a sweep that quietly stops matching is a sweep nobody notices
 * has stopped.
 */
const RELEASED_STATUSES = SUBMISSION_STATUSES.filter((status) =>
  isReleased({ status }),
);

/** Paid, but the feedback hasn't reached the customer yet — the rungs where
 *  work is still owed. */
const PAID_UNRELEASED_STATUSES = SUBMISSION_STATUSES.filter(
  (status) => isPaid({ status }) && !isReleased({ status }),
);

/**
 * Archived submissions whose feedback was never delivered, past due for a purge
 * (Ben, QA 5.6).
 *
 * Archiving a live submission takes it off the queue, but it is a **paid
 * customer's video** that no clock was watching: `findResolvedDue` can't reach
 * it — its status isn't released and it has no `completedAt` — so without this
 * its files would live forever, which is how a "temporary" archive becomes
 * permanent storage. It rides the **same window a completed submission's files
 * do** — the delivery backstop, `retainDeliveredDays` — only measured from when
 * it was **archived** rather than delivered, and with **no warning email**,
 * because the customer was never given a link to expect one against. The record
 * is kept and the bytes go, like every other paid purge.
 */
export async function findArchivedOwedDue(before: Date): Promise<Submission[]> {
  const rows = await db
    .select()
    .from(submissionTable)
    .where(
      and(
        isNotNull(submissionTable.archivedAt),
        lt(submissionTable.archivedAt, before),
        inArray(submissionTable.status, PAID_UNRELEASED_STATUSES),
      ),
    );
  return rows.map(fromRow);
}

/**
 * Submissions that were never paid for and have gone quiet.
 *
 * **These are deleted outright, not purged** — nothing was ever bought, so there
 * is no history worth keeping and a kept row is just noise in the queue. That's
 * the difference from `findResolvedDue`, and it's why they're separate reads
 * rather than one query with a flag.
 *
 * `limit` exists because the caller may be a customer request rather than a cron
 * job: cleaning up is worth a few milliseconds of someone's page load, but not
 * an unbounded one.
 *
 * **Measured from `updatedAt`, not `submittedAt`** — "gone quiet" is about the
 * last sign of life, not about when they started. Verifying an email or having a
 * card declined both touch the row, so a customer who goes to find another card
 * doesn't come back to a deleted upload. Against `submittedAt` the clock ran
 * from creation regardless, which reaped people who were still working.
 */
export async function findAbandonedDue(
  before: Date,
  limit = 25,
): Promise<Submission[]> {
  const rows = await db
    .select()
    .from(submissionTable)
    .where(
      and(
        inArray(submissionTable.status, ["draft", "awaiting_payment"]),
        lt(submissionTable.updatedAt, before),
      ),
    )
    .orderBy(submissionTable.updatedAt)
    .limit(limit);
  return rows.map(fromRow);
}
