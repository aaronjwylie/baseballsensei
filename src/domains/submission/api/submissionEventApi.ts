/**
 * The trail — one row per status transition.
 *
 * Chosen over sixteen nullable `*At` columns on `submissionTable`, and it answers
 * strictly more. A column remembers one moment; this remembers every one, in
 * order, with who caused it. That matters because a status can be reached twice:
 * the admin resets a submission from `awaiting_approval` back to `in_review`, the
 * coach redelivers, and it arrives at `awaiting_approval` again. A column would
 * silently overwrite the first visit.
 *
 * **The actor is read from the session, not passed in.** Every caller would have
 * to remember a parameter, and the one that forgets produces an anonymous event
 * that looks exactly like a legitimate one — a customer's own transition. Reading
 * it here makes the right answer the default: whoever was logged in when the
 * status moved. Null is meaningful, not missing — it means nobody was, which is
 * true of the customer's four steps and of the scheduled sweep.
 *
 * Writes are **best-effort in spirit but transactional in fact**: `record` runs
 * inside the same transaction as the update that caused it, so the trail cannot
 * disagree with `submissionTable.status`. If the insert fails, the transition fails
 * with it — a status change nobody can account for is worse than no change.
 */
import { and, asc, desc, eq, inArray, like } from "drizzle-orm";
import { db, type Db } from "@/shared/db";
import { assignmentsBySubmission } from "./submissionAssignmentApi";
import { ASSIGNEE_ROLE, type FileKind } from "../model/submissionFile";
import { submissionEventTable } from "../model/submissionEventTable";
import { readSession } from "@/shared/auth";
import type { SubmissionStatus } from "../model/submission";
import type {
  SubmissionEventKind,
  EmailOutcome,
} from "../model/submissionEvent";

export interface SubmissionEvent {
  id: string;
  submissionId: string;
  kind: SubmissionEventKind;
  /** The rung it moved to. Absent on an email event — a message isn't a rung. */
  status?: SubmissionStatus;
  /** Which message, on an email event — the ①–⑨ handle and its recipient. */
  label?: string;
  /** Did the send work? Only meaningful on an email event. */
  ok?: boolean;
  /** How far it got — `sent` at first, then whatever the webhook reports. */
  outcome?: EmailOutcome;
  /** Resend's message id, on an email event. */
  messageId?: string;
  at: string;
  /** The operator who caused it, or null for the customer and the cron. */
  actorId?: string;
  /** Why — set by the operator overrides that need a reason. */
  note?: string;
}

/**
 * Who is doing this, if anyone.
 *
 * Never throws: an event is a record of something that already happened, so a
 * broken or absent session must not turn a successful transition into a failure.
 * It just means we don't know, which is what null says.
 */
async function currentActorId(): Promise<string | null> {
  try {
    const session = await readSession<{ operatorId?: string }>();
    return session?.operatorId ?? null;
  } catch {
    return null;
  }
}

/**
 * Stamp a transition. Call inside the transaction that performed it.
 *
 * `note` is for the operator overrides — a submission that moved backwards
 * without an explanation is worse than one that didn't move.
 */
export async function recordSubmissionEvent(
  submissionId: string,
  status: SubmissionStatus,
  note?: string,
  tx: Db = db,
): Promise<void> {
  await tx.insert(submissionEventTable).values({
    submissionId,
    kind: "status",
    status,
    actorId: await currentActorId(),
    note: note ?? null,
  });
}

/**
 * Record that we tried to send something, **and whether it worked.**
 *
 * The one class of event that fails silently. Sends are best-effort (ADR 004):
 * a failure logs and is swallowed so it can't take down a webhook, which is
 * right — and leaves nobody able to tell "the customer has their receipt" from
 * "we attempted a receipt". The status implies the attempt; only this records
 * the outcome.
 *
 * **Never throws, and never awaited on a critical path.** A failure to record a
 * failure must not become the thing that breaks. Wrap the send, don't gate on
 * it:
 *
 * ```ts
 * const ok = await sendSomething(...);
 * void noteEmailSent(id, "② receipt → customer", ok);
 * ```
 */
export async function noteEmailSent(
  submissionId: string,
  label: string,
  result: { ok: boolean; id?: string; error?: string },
  note?: string,
): Promise<void> {
  try {
    await db.insert(submissionEventTable).values({
      submissionId,
      kind: "email",
      // No rung: a message isn't a place on the ladder, and giving it one would
      // corrupt every read that uses the trail to work out where a submission is.
      status: null,
      label,
      ok: result.ok,
      outcome: result.ok ? "sent" : "failed",
      // Without the id, a bounce arriving thirty seconds from now belongs to
      // nobody. This is the whole reason the send path returns it.
      messageId: result.id ?? null,
      actorId: await currentActorId(),
      // A failure records why on the row itself, so the trail is self-explaining
      // and doesn't lean on server logs that expire (QA 2.5.5). An explicit note
      // still wins.
      note: note ?? result.error ?? null,
    });
  } catch (err) {
    console.error(`[trail] recording "${label}" failed:`, err);
  }
}

/**
 * The customer entered a code — and whether it worked.
 *
 * The one thing they *do* between a send and a status move. Success was already
 * visible as its side effect, the rung advancing; failure left no trace at all,
 * and failure is the half worth having. **Four wrong guesses and a customer who
 * never received the code look identical from the outside**, yet one wants the
 * code read back to them and the other wants it resent.
 *
 * Best-effort like the email notes, and for a stronger reason: a trail write
 * must never be what stops someone verifying their own email. The success case
 * passes its transaction so the breadcrumb and the rung move together; the
 * failures have no transaction to join, because nothing else about them is
 * written down.
 *
 * `note` carries *why* — the same reason string the customer's message is
 * chosen from — because "rejected" alone doesn't distinguish a typo from an
 * expired window, and those are different conversations.
 */
export async function noteVerification(
  submissionId: string,
  accepted: boolean,
  detail?: string,
  tx?: Db,
): Promise<void> {
  try {
    await (tx ?? db).insert(submissionEventTable).values({
      submissionId,
      kind: "verification",
      // No rung, for the same reason a send has none: the trail is read to work
      // out where a submission is, and a check isn't a place on the ladder.
      status: null,
      label: accepted ? "code accepted" : "code rejected",
      ok: accepted,
      // The customer has no session — this is the anonymous actor the column
      // was made nullable for.
      actorId: null,
      note: detail ?? null,
    });
  } catch (err) {
    console.error(`[trail] recording a verification failed:`, err);
  }
}

/**
 * Work landed on someone's desk, or came off it.
 *
 * **The row the join can't hold.** `submission_assignment` answers *who has
 * this now* and nothing else — unassigning deletes the row, reassigning
 * replaces it — so without this, changing coaches erased the fact that the
 * first one ever had it. That is exactly the history worth having when a
 * submission has been sitting for a week.
 *
 * One row per assignment and one per removal, each carrying the operator's id
 * rather than a position. "assigned — 1, 2, 3" answers *how many* and nothing
 * else; the id answers *who*, and a fourth assignment needs no new row shape.
 *
 * **Not the `assigned` rung.** The ladder moving is a different fact, recorded
 * separately by the caller — writing both as one put the rung in the trail
 * twice.
 *
 * Best-effort, like the other notes: it is called inside the transaction that
 * did the work, but a failure to write history must never undo the history.
 */
export async function noteAssignment(
  submissionId: string,
  operatorId: string,
  produces: FileKind,
  assigned: boolean,
  tx?: Db,
): Promise<void> {
  try {
    // `intake` is the kind nobody is assigned to produce. Reaching here with it
    // means a caller invented an assignment the model doesn't have.
    const role = ASSIGNEE_ROLE[produces];
    if (!role) return;

    await (tx ?? db).insert(submissionEventTable).values({
      submissionId,
      kind: "assignment",
      // No rung — a hand-off between people isn't a place on the ladder, the
      // same reason a send and a verification carry none.
      status: null,
      label: `${role} ${assigned ? "assigned" : "unassigned"} — ${operatorId}`,
      // The admin who did it. Read from the session, never passed in: a
      // parameter gets forgotten, and the forgotten case writes an anonymous
      // row indistinguishable from a legitimate one.
      actorId: await currentActorId(),
    });
  } catch (err) {
    console.error(`[trail] recording an assignment failed:`, err);
  }
}

/**
 * A delivery notice from Resend — what actually became of a message.
 *
 * **Appends rather than updates.** The trail is a history: overwriting "we sent
 * it" with "it bounced" loses the fact that both were true, and when. Two rows
 * also make the gap visible — a delivery three seconds later reads differently
 * from one three minutes later.
 *
 * Returns the submission it belonged to, so the caller can act on a bounce.
 * Null when the id is unknown, which is the ordinary case for anything sent
 * before this existed, and for Resend's own test deliveries.
 */
export async function noteEmailOutcome(
  messageId: string,
  outcome: EmailOutcome,
  note?: string,
): Promise<{ submissionId: string; label: string } | null> {
  const [origin] = await db
    .select({
      submissionId: submissionEventTable.submissionId,
      label: submissionEventTable.label,
    })
    .from(submissionEventTable)
    .where(eq(submissionEventTable.messageId, messageId))
    .orderBy(asc(submissionEventTable.at))
    .limit(1);

  if (!origin) return null;

  await db.insert(submissionEventTable).values({
    submissionId: origin.submissionId,
    kind: "email",
    status: null,
    label: origin.label,
    // `ok` narrows to "did it reach the customer", which is the question the
    // progress view asks. A bounce is not ok however cleanly it was accepted.
    ok: outcome === "delivered" || outcome === "sent",
    outcome,
    messageId,
    actorId: null,
    note: note ?? null,
  });

  return { submissionId: origin.submissionId, label: origin.label ?? "" };
}

/**
 * Did a given message fail to reach this submission's customer?
 *
 * Asked by the flow when a customer acts, because the bad news arrives *after*
 * they have been moved on to "enter your code" and nothing can push it to them.
 * The next thing they do is what surfaces it.
 *
 * **Both `bounced` and `failed` count.** A `bounced` is the receiving server
 * rejecting the message; a `failed` is Resend never getting it out the door —
 * and a send to a domain that doesn't resolve comes back as one or the other
 * depending on where it broke, not on anything the customer can tell apart. For
 * the one question here — *will they ever see this code?* — the answer is no
 * either way, and treating only `bounced` as fatal let a dead-domain `failed`
 * leave the customer waiting for a code that was never going anywhere. A
 * `failed` carries no hard/soft note, so it classifies as `unknown`, whose
 * wording already covers both remedies.
 */
export type BounceKind = "hard" | "soft" | "unknown";

export async function bounceOf(
  submissionId: string,
  labelPrefix: string,
): Promise<BounceKind | null> {
  /*
    Scope to the code the customer is *holding*, not the submission's whole
    history.

    Outcomes only ever append (§8), so a bounce from a superseded code — a first
    code that soft-bounced or transiently `failed` before the customer asked for
    a fresh one, which then delivered — stays on the trail forever. Matching any
    historical `①` bounce let that stale row strand a customer who is holding a
    code that arrived perfectly well: verify, resend, and the background delivery
    check would all read the old bounce and send them back to step 1.

    So find the message id of the *latest* `①` send — the code they actually have
    — and ask only whether that one bounced. A message id is the delivery
    webhook's handle on a send (§8), so the bounce it wrote carries the same id.
  */
  const [current] = await db
    .select({ messageId: submissionEventTable.messageId })
    .from(submissionEventTable)
    .where(
      and(
        eq(submissionEventTable.submissionId, submissionId),
        eq(submissionEventTable.kind, "email"),
        eq(submissionEventTable.outcome, "sent"),
        like(submissionEventTable.label, `${labelPrefix}%`),
      ),
    )
    .orderBy(desc(submissionEventTable.at))
    .limit(1);

  // No id to correlate on (no send recorded, or one that never got a Resend id)
  // — nothing to prove undeliverable, so let the customer proceed.
  if (!current?.messageId) return null;

  const [hit] = await db
    .select({ note: submissionEventTable.note })
    .from(submissionEventTable)
    .where(
      and(
        eq(submissionEventTable.submissionId, submissionId),
        eq(submissionEventTable.messageId, current.messageId),
        inArray(submissionEventTable.outcome, ["bounced", "failed"]),
      ),
    )
    .limit(1);

  if (!hit) return null;
  /*
    Unknown is a real answer, not a fallback to `hard`.

    Resend has moved where it puts the classification before, and guessing wrong
    would tell a customer with a full mailbox that their address does not exist.
    The caller has wording that covers both.
  */
  return hit.note === "hard" || hit.note === "soft" ? hit.note : "unknown";
}

/**
 * The trail for a whole page of submissions, in one read.
 *
 * The progress view needs two things per row — which rungs it has passed
 * through, and which messages landed — and both live in the same table. One
 * query for the page rather than two per row, because the queue renders
 * twenty-odd rows and a per-row read turns a page load into forty round trips.
 *
 * Returns a map keyed by submission id, with **every** id present even when it
 * has no events, so callers never have to distinguish "no trail" from "not
 * loaded".
 */
/** The mutable half of `ProgressFacts` — built here, read as readonly. */
interface ProgressFactsFor {
  reached: Set<SubmissionStatus>;
  emails: Map<string, boolean>;
  assignees: Partial<Record<FileKind, string>>;
}

export async function listProgressFacts(
  submissionIds: string[],
): Promise<Map<string, ProgressFactsFor>> {
  const facts = new Map<string, ProgressFactsFor>();
  for (const id of submissionIds) {
    facts.set(id, { reached: new Set(), emails: new Map(), assignees: {} });
  }
  if (submissionIds.length === 0) return facts;

  // Who owes what, for the whole page in one query — same reason the events
  // below are batched rather than read per row.
  const assignees = await assignmentsBySubmission(submissionIds);
  for (const [id, owed] of assignees) {
    const entry = facts.get(id);
    if (entry) entry.assignees = owed;
  }

  const rows = await db
    .select()
    .from(submissionEventTable)
    .where(inArray(submissionEventTable.submissionId, submissionIds))
    .orderBy(asc(submissionEventTable.at));

  for (const row of rows) {
    const entry = facts.get(row.submissionId);
    if (!entry) continue;
    if (row.kind === "status" && row.status) {
      entry.reached.add(row.status);
    }
    if (row.kind === "email" && row.label) {
      /*
        Last write wins, deliberately.

        A message can be attempted more than once — a redelivered webhook, a
        retried action — and what the operator needs to know is whether it
        landed *in the end*, not whether an earlier try failed. The full history
        is still in the trail for anyone reading the row itself.
      */
      entry.emails.set(row.label, row.ok === true);
    }
  }
  return facts;
}

/** One submission's history, oldest first. */
export async function listSubmissionEvents(
  submissionId: string,
): Promise<SubmissionEvent[]> {
  const rows = await db
    .select()
    .from(submissionEventTable)
    .where(eq(submissionEventTable.submissionId, submissionId))
    .orderBy(asc(submissionEventTable.at));

  return rows.map((row) => ({
    id: row.id,
    submissionId: row.submissionId,
    kind: row.kind,
    status: row.status ?? undefined,
    label: row.label ?? undefined,
    ok: row.ok ?? undefined,
    outcome: row.outcome ?? undefined,
    messageId: row.messageId ?? undefined,
    at: row.at.toISOString(),
    actorId: row.actorId ?? undefined,
    note: row.note ?? undefined,
  }));
}
