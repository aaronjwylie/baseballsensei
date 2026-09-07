import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * QA 6.11 and 6.12 — the two removes the coach's portal will never ask for.
 *
 * Both checks are marked ⚠️ in the itinerary because there is no button for
 * them. After a hand-back the card moves under "Submitted" and stops listing
 * files at all, and a coach is only ever shown their own (Ben, 2026-09-06 —
 * "I'm just not sure how to run these two tests"). That is the UI behaving
 * correctly, and it is exactly why the guards underneath it need their own
 * test: a Server Action is a public endpoint, so "the page never asks" is not
 * an answer to "what happens when someone asks anyway".
 *
 * So the request is made here directly, with a forged session, against a real
 * database. Three refusals, each for a different reason:
 *
 * - **6.11** the file is past `in_review` — the admin is reviewing it now
 * - **6.12a** the file belongs to another coach's submission
 * - **6.12b** the file is the customer's `intake`, not a response
 *
 * The session is mocked rather than minted, because what is under test is the
 * action's own reasoning about a session it has been handed. Whether the cookie
 * is genuine is `dal.ts`'s job and has its own coverage.
 */
const session = { operatorId: "", roles: ["coach"] as string[] };
vi.mock("@/domains/account", () => ({
  getSession: async () => (session.operatorId ? session : null),
}));
// The action revalidates two paths; outside a request there is nothing to
// revalidate and Next throws rather than no-oping.
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { db } = await import("@/shared/db");
const { operatorTable } = await import("@/domains/operator/model/operatorTable");
const { createOperator } = await import("@/domains/account/api/loginApi");
const { grantRole } = await import("@/domains/operator/api/operatorRoleApi");
const { createSubmission, deleteSubmission, updateSubmission, addSubmissionFile, assignOperator } =
  await import("@/domains/submission");
const { removeFeedbackFileAction } = await import(
  "@/domains/feedback/api/feedbackActions"
);
const { eq, inArray } = await import("drizzle-orm");

const stamp = `${process.hrtime.bigint()}`;
const operators: string[] = [];
const submissions: string[] = [];

/** Mine, at `in_review` — the one state a coach may remove in. */
let mineId = "";
let myFileId = "";
/** Another coach's, same state. */
let theirsFileId = "";
/** The customer's own upload, on my submission. */
let intakeFileId = "";

async function makeCoach(label: string): Promise<string> {
  const op = await createOperator(
    `qa-${label}-${stamp}@integration.test`,
    "password-123",
    `QA ${label}`,
  );
  await grantRole(op.id, "coach", null);
  operators.push(op.id);
  return op.id;
}

async function makeSubmission(coachId: string): Promise<string> {
  const s = await createSubmission({
    customerEmail: `qa-${stamp}-${coachId.slice(0, 8)}@integration.test`,
    playerName: "QA Player",
    playerAge: 12,
    focus: "Hitting",
    customerNotes: "",
    languages: ["English"],
  });
  submissions.push(s.id);
  await assignOperator(s.id, coachId, "feedback");
  await updateSubmission(s.id, { status: "in_review" });
  return s.id;
}

beforeAll(async () => {
  const me = await makeCoach("coach-a");
  const them = await makeCoach("coach-b");
  session.operatorId = me;

  mineId = await makeSubmission(me);
  const theirsId = await makeSubmission(them);

  const mine = await addSubmissionFile(
    {
      submissionId: mineId,
      filename: "mine.mp4",
      contentType: "video/mp4",
      sizeBytes: 1024,
      fileUrl: null,
    },
    "feedback",
  );
  myFileId = mine.id;

  const theirs = await addSubmissionFile(
    {
      submissionId: theirsId,
      filename: "theirs.mp4",
      contentType: "video/mp4",
      sizeBytes: 1024,
      fileUrl: null,
    },
    "feedback",
  );
  theirsFileId = theirs.id;

  const intake = await addSubmissionFile(
    {
      submissionId: mineId,
      filename: "the-customer-clip.mp4",
      contentType: "video/mp4",
      sizeBytes: 1024,
      fileUrl: null,
    },
    "intake",
  );
  intakeFileId = intake.id;
});

afterAll(async () => {
  for (const id of submissions) await deleteSubmission(id);
  if (operators.length) {
    await db.delete(operatorTable).where(inArray(operatorTable.id, operators));
  }
  void eq;
});

describe("the removes a coach's portal will never ask for", () => {
  it("removes my own file while it is still mine to remove", async () => {
    const result = await removeFeedbackFileAction(myFileId);
    expect(result.ok).toBe(true);
  });

  /*
    6.11 — the stale tab. The card is gone from the portal after a hand-back,
    but a tab opened before it still has the button, and a Server Action is
    reachable from anywhere. Pulling the file out here would leave the admin
    approving a submission with nothing in it.
  */
  it("6.11 refuses a remove once the admin has it", async () => {
    const file = await addSubmissionFile(
      {
        submissionId: mineId,
        filename: "sent.mp4",
        contentType: "video/mp4",
        sizeBytes: 1024,
        fileUrl: null,
      },
      "feedback",
    );
    await updateSubmission(mineId, { status: "awaiting_approval" });

    const result = await removeFeedbackFileAction(file.id);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("already gone to the admin");

    await updateSubmission(mineId, { status: "in_review" });
  });

  /* 6.12a — a submission that isn't mine. Ownership is the assignment, not the
     role: being a coach is not being *this* coach. */
  it("6.12 refuses another coach's file", async () => {
    const result = await removeFeedbackFileAction(theirsFileId);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("isn't your submission");
  });

  /* 6.12b — the customer's own upload, on a submission that IS mine. The kind
     is checked before ownership, so this refuses even where the coach belongs. */
  it("6.12 refuses the customer's intake file", async () => {
    const result = await removeFeedbackFileAction(intakeFileId);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("can't be removed here");
  });

  it("refuses when nobody is signed in", async () => {
    const held = session.operatorId;
    session.operatorId = "";
    const result = await removeFeedbackFileAction(myFileId);
    session.operatorId = held;
    expect(result.ok).toBe(false);
    expect(result.error).toContain("sign in");
  });
});
