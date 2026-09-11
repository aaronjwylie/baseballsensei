import { isHandedToCoach, isWithCoach, type Submission } from "@/domains/submission";

/**
 * Whether a coach may act on a submission *right now* — the write gate for
 * every door that attaches a response.
 *
 * **Ownership is not a turn**, and until 2026-09-11 all three feedback upload
 * routes conflated them: each asked `isAssignedTo`, which is true from the
 * moment the admin picks a coach, and none asked whether the admin had actually
 * sent it. So a coach could attach a response to a submission that was still
 * being translated, or that the admin hadn't chosen a file set for. Only
 * `sendFeedbackForApproval` guarded the rung, so the work could be done but not
 * delivered — the worst of both (Ben, QA 6.18).
 *
 * Both halves, deliberately. `isWithCoach` closes it once they have delivered,
 * so a stale tab can't add a file to something the admin is already reviewing;
 * `isHandedToCoach` opens it only at the hand-off. Read access is the other
 * question and stays open either side of the turn — see `isHandedOverFor`.
 *
 * One home, because three routes need exactly the same answer and a check that
 * exists in three copies is a check that will eventually differ in three ways.
 */
export function isCoachesTurn(submission: Pick<Submission, "status">): boolean {
  return isWithCoach(submission) && isHandedToCoach(submission);
}

/** Said at every door, so a coach meets the same sentence wherever they push. */
export const NOT_SENT_TO_COACH =
  "The admin hasn't sent this submission over yet, so it can't take a response.";
